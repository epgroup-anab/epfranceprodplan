import {
  bagsPerShift, shiftsPerWeek, weekSlots, weekStartOf, addWeeks, addDays, DAY_NAMES,
} from './capacity.js';

/**
 * SKUs that are contractually tied to one machine. Carrefour France always
 * runs on MC-1. If demand exceeds what MC-1 can make, the excess spills onto
 * the SKU's other compatible machines and the plan reports it, rather than
 * silently dropping the bags.
 */
export const PINNED_MACHINES = { 35627: 'MC-1' };

/** Every changeover costs one shift, whatever changes. */
export const CHANGEOVER_SHIFTS = 1;

const MAX_HORIZON_WEEKS = 52;

/* ------------------------------------------------------------------ */
/* ranking                                                             */
/* ------------------------------------------------------------------ */

/**
 * Priority number first (1 beats 5). Within a priority, whichever SKU has the
 * fewest weeks of cover goes first — so an urgent-but-well-stocked line does
 * not jump ahead of one that is about to run dry. Biggest job breaks ties.
 */
export function rankOrders(orders) {
  return [...orders].sort((a, b) =>
    (a.priority - b.priority) ||
    (a.cover_weeks - b.cover_weeks) ||
    (b.net_bags_required - a.net_bags_required) ||
    a.sap_code.localeCompare(b.sap_code));
}

/**
 * Machines this order can run on.
 *
 * `compatible_machines` from the SKU master is authoritative — it was built
 * from what the factory actually runs. Print-colour and handle-type mismatches
 * are reported by validateOrders() as data warnings rather than used to filter
 * here, because silently removing a machine makes an order vanish from the plan
 * with no explanation. Nothing should disappear without saying so.
 */
export function eligibleMachines(order, machines) {
  const active = machines.filter((m) => m.status === 'active');
  const compatible = active.filter((m) => (order.compatible_machines || []).includes(m.id));
  if (!compatible.length) return [];

  const pinned = PINNED_MACHINES[order.sap_code];
  if (pinned) {
    const pin = active.find((m) => m.id === pinned);
    if (pin) return [pin, ...compatible.filter((m) => m.id !== pinned)];
  }
  if (order.primary_machine_only && order.primary_machine) {
    const only = compatible.filter((m) => m.id === order.primary_machine);
    if (only.length) return only;
  }
  if (order.primary_machine) {
    const primary = compatible.find((m) => m.id === order.primary_machine);
    if (primary) return [primary, ...compatible.filter((m) => m.id !== order.primary_machine)];
  }
  return compatible;
}

/**
 * Spec conflicts worth showing the planner before the meeting.
 * These do not block scheduling — they flag master data that needs a look.
 */
export function validateOrders(orders, machines) {
  const byId = new Map(machines.map((m) => [m.id, m]));
  const warnings = [];

  for (const order of orders) {
    if (order.net_bags_required <= 0) continue;

    const listed = (order.compatible_machines || []).map((id) => byId.get(id)).filter(Boolean);
    if (!listed.length) {
      warnings.push({ sap_code: order.sap_code, severity: 'error',
        message: `${order.sap_code} has no machines listed in the SKU master, so it cannot be planned.` });
      continue;
    }
    const best = Math.max(...listed.map((m) => m.max_print_colors ?? 1));
    if ((order.print_colors ?? 1) > best) {
      warnings.push({ sap_code: order.sap_code, severity: 'warning',
        message: `${order.sap_code} is specified as ${order.print_colors}-colour but the best listed machine (${listed.find((m) => (m.max_print_colors ?? 1) === best).id}) prints ${best}. Scheduled anyway — confirm the print spec.` });
    }
    if (order.handle_type && listed.every((m) => m.handle_type && m.handle_type !== order.handle_type)) {
      warnings.push({ sap_code: order.sap_code, severity: 'warning',
        message: `${order.sap_code} is a ${order.handle_type} product but its listed machines are ${[...new Set(listed.map((m) => m.handle_type))].join('/')}. Scheduled anyway — confirm the machine list.` });
    }
  }
  return warnings;
}

/* ------------------------------------------------------------------ */
/* allocation                                                          */
/* ------------------------------------------------------------------ */

/**
 * Share the order book across machines for a given horizon.
 * Returns null if it does not all fit, so the caller can widen the horizon.
 */
function allocate(ranked, machines, horizonWeeks) {
  const perShift = {}, capShifts = {}, usedShifts = {}, blocks = {};
  for (const m of machines) {
    perShift[m.id] = bagsPerShift(m);
    capShifts[m.id] = shiftsPerWeek(m) * horizonWeeks;
    usedShifts[m.id] = 0;
    blocks[m.id] = [];
  }

  const overflow = [];
  const unplaced = [];

  for (const order of ranked) {
    let remaining = order.net_bags_required;
    if (remaining <= 0) continue;

    const eligible = eligibleMachines(order, machines);
    if (!eligible.length) { unplaced.push({ order, bags: remaining, reason: 'no compatible machine' }); continue; }

    const preferred = eligible[0].id;

    for (const machine of eligible) {
      if (remaining <= 0) break;
      const rate = perShift[machine.id];
      if (!rate) continue;

      // A new SKU on this machine costs a changeover shift.
      const changeover = blocks[machine.id].length > 0 ? CHANGEOVER_SHIFTS : 0;
      const freeShifts = capShifts[machine.id] - usedShifts[machine.id] - changeover;
      if (freeShifts <= 0) continue;

      const take = Math.min(remaining, freeShifts * rate);
      if (take <= 0) continue;

      const shiftsNeeded = Math.ceil(take / rate);
      usedShifts[machine.id] += shiftsNeeded + changeover;
      blocks[machine.id].push({ order, bags: take });
      remaining -= take;

      if (machine.id !== preferred && PINNED_MACHINES[order.sap_code]) {
        overflow.push({ sap_code: order.sap_code, description: order.description,
          pinned_to: preferred, spilled_to: machine.id, bags: take });
      }
    }
    if (remaining > 0) unplaced.push({ order, bags: remaining, reason: 'capacity' });
  }
  return { blocks, unplaced, overflow, usedShifts, capShifts };
}

/* ------------------------------------------------------------------ */
/* sequencing                                                          */
/* ------------------------------------------------------------------ */

/**
 * Order a machine's work to keep changeovers cheap. Roll width first, so all
 * 990mm work runs before switching to 1030mm; then print colours; then urgency.
 * Every changeover costs the same shift, but grouping by width still means
 * fewer of them overall and a plan the shop floor recognises.
 */
function sequence(blocks) {
  return [...blocks].sort((a, b) =>
    ((a.order.roll_width_mm ?? 0) - (b.order.roll_width_mm ?? 0)) ||
    ((a.order.print_colors ?? 1) - (b.order.print_colors ?? 1)) ||
    (a.order.priority - b.order.priority) ||
    (a.order.cover_weeks - b.order.cover_weeks));
}

/* ------------------------------------------------------------------ */
/* main entry                                                          */
/* ------------------------------------------------------------------ */

/**
 * Plan the whole order book.
 * Widens the horizon until every bag is placed (or 52 weeks is reached),
 * then lays each machine's sequence onto real day/shift slots.
 */
export function generatePlan(orders, machines, options = {}) {
  const startWeek = options.weekStart || weekStartOf(new Date());
  const planable = orders.filter((o) => o.net_bags_required > 0);
  const ranked = rankOrders(planable);
  const active = machines.filter((m) => m.status === 'active');

  if (!active.length) throw new Error('No active machines — nothing can be scheduled.');
  if (!ranked.length) {
    return { slots: [], weeks: 0, startWeek, metrics: emptyMetrics(), unplaced: [], overflow: [], orderStatus: [] };
  }

  // Widen the horizon until the whole book fits.
  let horizon = Math.max(1, options.minWeeks || 9);
  let result = allocate(ranked, active, horizon);
  while (result.unplaced.some((u) => u.reason === 'capacity') && horizon < MAX_HORIZON_WEEKS) {
    horizon += 2;
    result = allocate(ranked, active, horizon);
  }

  // Lay the sequence onto slots.
  const slots = [];
  const scheduledBags = {};
  let changeovers = 0, widthChanges = 0, colourChanges = 0;

  for (const machine of active) {
    const seq = sequence(result.blocks[machine.id] || []);
    if (!seq.length) continue;

    const rate = bagsPerShift(machine);
    const perWeek = weekSlots(machine);
    let cursor = 0;                        // running slot index across all weeks
    let previous = null;

    const nextSlot = () => {
      const week = Math.floor(cursor / perWeek.length);
      const { dayIndex, shift } = perWeek[cursor % perWeek.length];
      cursor++;
      const weekStart = addWeeks(startWeek, week);
      return {
        week, weekStart, dayIndex, shift,
        day: DAY_NAMES[dayIndex],
        date: addDays(weekStart, dayIndex),
      };
    };

    for (const block of seq) {
      const o = block.order;

      if (previous) {
        const widthChange = (previous.roll_width_mm ?? 0) !== (o.roll_width_mm ?? 0);
        const colourChange = (previous.print_colors ?? 1) !== (o.print_colors ?? 1);
        for (let i = 0; i < CHANGEOVER_SHIFTS; i++) {
          const s = nextSlot();
          slots.push({
            id: `CHG_${machine.id}_${s.date}_${s.shift}`,
            type: 'changeover', machine_id: machine.id,
            sap_code: null, description: widthChange
              ? `Changeover ${previous.roll_width_mm ?? '?'}mm → ${o.roll_width_mm ?? '?'}mm`
              : `Changeover → ${o.sap_code}`,
            bags: 0, cartons: 0,
            width_change: widthChange, colour_change: colourChange,
            ...s,
          });
        }
        changeovers++;
        if (widthChange) widthChanges++; else if (colourChange) colourChanges++;
      }

      let left = block.bags;
      while (left > 0) {
        const s = nextSlot();
        const bags = Math.min(rate, left);
        slots.push({
          id: `SCH_${machine.id}_${s.date}_${s.shift}`,
          type: 'production', machine_id: machine.id,
          sap_code: o.sap_code, description: o.description,
          priority: o.priority, roll_width_mm: o.roll_width_mm, print_colors: o.print_colors,
          bags: Math.round(bags),
          cartons: Math.floor(bags / (o.bags_per_carton || 250)),
          ...s,
        });
        scheduledBags[o.sap_code] = (scheduledBags[o.sap_code] || 0) + bags;
        left -= bags;
      }
      previous = o;
    }
  }

  const weeks = slots.reduce((max, s) => Math.max(max, s.week + 1), 0);

  const orderStatus = ranked.map((o) => {
    const done = Math.round(scheduledBags[o.sap_code] || 0);
    const required = o.net_bags_required;
    return {
      sap_code: o.sap_code, description: o.description, priority: o.priority,
      required, scheduled: done,
      shortfall: Math.max(0, required - done),
      complete: done >= required - 1,
      machines: [...new Set(slots.filter((s) => s.sap_code === o.sap_code).map((s) => s.machine_id))],
    };
  });

  return {
    slots, weeks, startWeek, horizon,
    unplaced: result.unplaced, overflow: result.overflow, orderStatus,
    dataWarnings: validateOrders(planable, active),
    metrics: buildMetrics(slots, active, weeks, changeovers, widthChanges, colourChanges),
  };
}

function emptyMetrics() {
  return { totalBags: 0, totalCartons: 0, productionShifts: 0, changeoverShifts: 0,
    changeovers: 0, widthChanges: 0, colourChanges: 0, utilisation: [] };
}

function buildMetrics(slots, machines, weeks, changeovers, widthChanges, colourChanges) {
  const production = slots.filter((s) => s.type === 'production');
  const utilisation = machines.map((m) => {
    const mine = slots.filter((s) => s.machine_id === m.id);
    const prod = mine.filter((s) => s.type === 'production').length;
    const chg = mine.filter((s) => s.type === 'changeover').length;
    const available = shiftsPerWeek(m) * Math.max(weeks, 1);
    return {
      machine_id: m.id, category: m.category,
      productionShifts: prod, changeoverShifts: chg, availableShifts: available,
      bags: mine.reduce((a, s) => a + s.bags, 0),
      percent: available ? Math.round(((prod + chg) / available) * 100) : 0,
    };
  });

  return {
    totalBags: production.reduce((a, s) => a + s.bags, 0),
    totalCartons: production.reduce((a, s) => a + s.cartons, 0),
    productionShifts: production.length,
    changeoverShifts: slots.length - production.length,
    changeovers, widthChanges, colourChanges,
    utilisation,
  };
}

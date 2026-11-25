/**
 * Manual edits to a generated plan.
 *
 * The planner is a starting point, not the last word. Jobs arrive that are not
 * on any sheet — an urgent EP UK order, a customer calling on Friday — so a
 * planner can put any SAP code on a machine from one date to another. Every
 * edit goes through this module so the plan stays internally consistent: the
 * affected shifts are replaced, then every derived number is rebuilt from the
 * grid rather than patched up piecemeal.
 *
 * A machine's time is treated as one long line of working shifts. Inserting a
 * job of N shifts at a point pushes everything after it N shifts later, the
 * same way rows move down when a job is inserted on the weekly Excel plan.
 */
import { addWeeks, addDays, daysBetween, DAY_NAMES, bagsPerShift, shiftsPerDay, weekSlots } from './capacity.js';
import { recomputePlan } from './scheduler.js';
import { findSku } from '../lib/master.js';

/** Where a date sits in the plan: which week, and which day of that week. */
export function locateDate(plan, iso) {
  const offset = daysBetween(plan.startWeek, iso);
  return { week: Math.floor(offset / 7), dayIndex: ((offset % 7) + 7) % 7 };
}

/** Every slot on one machine on one date, in shift order. */
export function slotsOnDay(plan, machineId, iso) {
  return (plan.slots || [])
    .filter((s) => s.machine_id === machineId && s.date === iso)
    .sort((a, b) => a.shift - b.shift);
}

/** A machine's working shifts as a line: position ↔ (week, day, shift). */
function timeline(machine, startWeek) {
  const perWeek = weekSlots(machine);
  const width = perWeek.length;
  const position = (week, dayIndex, shift) => {
    const i = perWeek.findIndex((p) => p.dayIndex === dayIndex && p.shift === shift);
    return i === -1 ? -1 : week * width + i;
  };
  const at = (pos) => {
    const week = Math.floor(pos / width);
    const { dayIndex, shift } = perWeek[pos % width];
    const weekStart = addWeeks(startWeek, week);
    return { week, weekStart, dayIndex, shift, day: DAY_NAMES[dayIndex], date: addDays(weekStart, dayIndex) };
  };
  return { width, position, at };
}

/** The working shifts between two dates on one machine, as positions on its line. */
export function rangePositions(plan, machine, range) {
  const line = timeline(machine, plan.startWeek);
  if (!line.width) return [];
  const span = daysBetween(range.fromDate, range.toDate);
  if (span < 0) return [];
  const positions = [];
  for (let d = 0; d <= span; d++) {
    const iso = addDays(range.fromDate, d);
    const { week, dayIndex } = locateDate(plan, iso);
    if (week < 0) continue;
    for (let shift = 1; shift <= shiftsPerDay(machine, dayIndex); shift++) {
      if (d === 0 && shift < (range.fromShift || 1)) continue;
      if (d === span && shift > (range.toShift || 3)) continue;
      positions.push(line.position(week, dayIndex, shift));
    }
  }
  return positions.filter((p) => p >= 0);
}

const SLOT_PREFIX = { changeover: 'CHG', breakdown: 'BRK', production: 'SCH' };
const slotId = (type, machineId, where) =>
  `${SLOT_PREFIX[type] || 'SCH'}_${machineId}_${where.date}_${where.shift}`;

/**
 * Put a job, a changeover, or nothing on a machine between two dates.
 *
 * edit = {
 *   machine_id, fromDate, fromShift, toDate, toShift,
 *   action: 'production' | 'changeover' | 'breakdown' | 'clear',
 *   sap_code, description, bags_per_shift, note,
 *   shift_existing: true → later work moves to make room (or closes the gap on clear)
 * }
 */
export function applyRangeEdit(plan, machines, orders, edit) {
  const machine = machines.find((m) => m.id === edit.machine_id);
  if (!machine) throw new Error(`Unknown machine ${edit.machine_id}.`);

  const line = timeline(machine, plan.startWeek);
  if (!line.width) throw new Error(`${machine.id} has no working shifts. Turn some on in the Machines tab first.`);

  const targets = rangePositions(plan, machine, edit);
  if (!targets.length) throw new Error('There are no working shifts on that machine between those dates.');

  const start = targets[0];
  const count = targets.length;
  const inRange = new Set(targets);
  const insert = edit.shift_existing && edit.action !== 'clear';
  const close = edit.shift_existing && edit.action === 'clear';

  const others = [];
  const moved = [];
  for (const s of plan.slots || []) {
    if (s.machine_id !== machine.id) { others.push(s); continue; }
    const pos = line.position(s.week, s.dayIndex, s.shift);
    if (pos === -1) { moved.push(s); continue; }      // off-pattern slot, e.g. a shift since switched off

    if (insert) {
      if (pos < start) { moved.push(s); continue; }
      moved.push(relocate(s, line.at(pos + count)));
    } else if (inRange.has(pos)) {
      continue;                                       // replaced or cleared
    } else if (close && pos > start) {
      moved.push(relocate(s, line.at(pos - count)));
    } else {
      moved.push(s);
    }
  }

  const added = [];
  if (edit.action === 'production') {
    const sap = String(edit.sap_code || '').trim();
    if (!sap) throw new Error('Enter an SAP code.');
    const order = orders.find((o) => String(o.sap_code) === sap) || null;
    const master = findSku(sap);
    const bagsPerCarton = order?.bags_per_carton || master?.bags_per_carton || 250;
    const perShift = Math.max(0, Math.round(Number(edit.bags_per_shift) || bagsPerShift(machine)));
    for (const pos of targets) {
      const where = line.at(pos);
      added.push({
        id: slotId('production', machine.id, where),
        type: 'production',
        machine_id: machine.id,
        sap_code: sap,
        description: edit.description?.trim() || order?.description || master?.description || `SAP ${sap}`,
        priority: order?.priority ?? 3,
        roll_width_mm: order?.roll_width_mm ?? master?.roll_width_mm ?? null,
        print_colors: order?.print_colors ?? master?.print_colors ?? 1,
        bags: perShift,
        cartons: Math.floor(perShift / bagsPerCarton),
        bags_per_carton: bagsPerCarton,
        manual_sap: !order,
        edited: true,
        ...where,
      });
    }
  }

  if (edit.action === 'changeover') {
    for (const pos of targets) {
      const where = line.at(pos);
      added.push({
        id: slotId('changeover', machine.id, where),
        type: 'changeover',
        machine_id: machine.id,
        sap_code: null,
        description: edit.note?.trim() || 'Changeover — set by hand',
        bags: 0, cartons: 0,
        width_change: !!edit.width_change,
        colour_change: !edit.width_change,
        edited: true,
        ...where,
      });
    }
  }

  if (edit.action === 'breakdown') {
    for (const pos of targets) {
      const where = line.at(pos);
      added.push({
        id: slotId('breakdown', machine.id, where),
        type: 'breakdown',
        machine_id: machine.id,
        sap_code: null,
        description: edit.note?.trim() || 'Breakdown',
        bags: 0, cartons: 0,
        edited: true,
        ...where,
      });
    }
  }

  const slots = [...others, ...moved, ...added].sort((a, b) =>
    a.machine_id.localeCompare(b.machine_id) ||
    (a.week - b.week) || (a.dayIndex - b.dayIndex) || (a.shift - b.shift));

  return recomputePlan({ ...plan, slots, editCount: (plan.editCount || 0) + 1 }, machines, orders);
}

function relocate(slot, where) {
  return { ...slot, ...where, id: slotId(slot.type, slot.machine_id, where) };
}

/** Everything the dialog needs to describe a run in context. */
export function slotContext(plan, slot, orders) {
  if (!slot || slot.type !== 'production') return null;
  const order = orders.find((o) => String(o.sap_code) === String(slot.sap_code)) || null;
  const status = (plan.orderStatus || []).find((o) => String(o.sap_code) === String(slot.sap_code)) || null;
  const runs = (plan.slots || []).filter((s) => s.sap_code === slot.sap_code);
  return {
    order,
    status,
    shifts: runs.length,
    machines: [...new Set(runs.map((s) => s.machine_id))],
    firstDate: runs.reduce((min, s) => (s.date < min ? s.date : min), runs[0]?.date),
    lastDate: runs.reduce((max, s) => (s.date > max ? s.date : max), runs[0]?.date),
  };
}

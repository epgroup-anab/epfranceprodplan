/**
 * Manual edits to a generated plan.
 *
 * The planner is a starting point, not the last word. Anyone in the meeting can
 * click a shift on the grid and change what runs there. Every edit goes through
 * this module so the plan stays internally consistent: the slot is replaced,
 * then every derived number (bags, shifts, utilisation, completion) is rebuilt
 * from the grid rather than patched up piecemeal.
 */
import { addWeeks, addDays, DAY_NAMES, shiftsPerDay } from './capacity.js';
import { recomputePlan } from './scheduler.js';

/** One shift on one machine, in one week. Unique across the whole plan. */
export const cellId = (c) => `${c.machine_id}|${c.week}|${c.dayIndex}|${c.shift}`;

export const cellOf = (slot) => ({
  machine_id: slot.machine_id, week: slot.week, dayIndex: slot.dayIndex, shift: slot.shift,
});

/** Does this machine actually work that shift? Nothing can be placed if not. */
export function cellIsWorkable(machine, cell) {
  return cell.shift <= shiftsPerDay(machine, cell.dayIndex);
}

function placement(plan, cell) {
  const weekStart = addWeeks(plan.startWeek, cell.week);
  return {
    week: cell.week,
    weekStart,
    dayIndex: cell.dayIndex,
    shift: cell.shift,
    day: DAY_NAMES[cell.dayIndex],
    date: addDays(weekStart, cell.dayIndex),
  };
}

/**
 * Replace whatever is in one cell.
 *
 * `edit.action` is 'production', 'changeover' or 'clear'. Returns a brand new
 * plan object — nothing is mutated, so React sees the change and the previous
 * plan stays intact for anyone holding a reference to it.
 */
export function applyCellEdit(plan, machines, orders, cell, edit) {
  const keep = (plan.slots || []).filter((s) => cellId(cellOf(s)) !== cellId(cell));
  const where = placement(plan, cell);
  const next = [...keep];

  if (edit.action === 'production') {
    const order = orders.find((o) => String(o.sap_code) === String(edit.sap_code));
    const previous = (plan.slots || []).find((s) => cellId(cellOf(s)) === cellId(cell));
    const bagsPerCarton = order?.bags_per_carton || previous?.bags_per_carton || 250;
    const bags = Math.max(0, Math.round(Number(edit.bags) || 0));

    if (bags > 0) {
      next.push({
        id: `SCH_${cell.machine_id}_${where.date}_${cell.shift}`,
        type: 'production',
        machine_id: cell.machine_id,
        sap_code: String(edit.sap_code),
        description: order?.description || previous?.description || `SAP ${edit.sap_code}`,
        priority: order?.priority ?? previous?.priority ?? 3,
        roll_width_mm: order?.roll_width_mm ?? previous?.roll_width_mm ?? null,
        print_colors: order?.print_colors ?? previous?.print_colors ?? 1,
        bags,
        cartons: Math.floor(bags / bagsPerCarton),
        bags_per_carton: bagsPerCarton,
        edited: true,
        ...where,
      });
    }
  }

  if (edit.action === 'changeover') {
    next.push({
      id: `CHG_${cell.machine_id}_${where.date}_${cell.shift}`,
      type: 'changeover',
      machine_id: cell.machine_id,
      sap_code: null,
      description: edit.note?.trim() || 'Changeover — set by hand',
      bags: 0,
      cartons: 0,
      width_change: !!edit.width_change,
      colour_change: !!edit.colour_change,
      edited: true,
      ...where,
    });
  }

  next.sort((a, b) =>
    a.machine_id.localeCompare(b.machine_id) ||
    (a.week - b.week) || (a.dayIndex - b.dayIndex) || (a.shift - b.shift));

  return recomputePlan({ ...plan, slots: next, editCount: (plan.editCount || 0) + 1 }, machines, orders);
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
    firstWeek: runs.reduce((min, s) => Math.min(min, s.week), Infinity),
    lastWeek: runs.reduce((max, s) => Math.max(max, s.week), 0),
  };
}

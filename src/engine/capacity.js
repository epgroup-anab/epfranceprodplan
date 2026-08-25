/** Monday = 0 … Friday = 4. The factory does not run at weekends. */
export const WORK_DAYS = 5;
export const FRIDAY = 4;
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

/** Shifts this machine runs on this weekday, read from the machine record. */
export function shiftsPerDay(machine, dayIndex) {
  if (!machine || machine.status !== 'active') return 0;
  const monThu = Number(machine.shifts_mon_thu ?? 3);
  const fri = Number(machine.shifts_fri ?? 2);
  return dayIndex >= FRIDAY ? fri : monThu;
}

/** Effective bags produced in one shift, after the efficiency factor. */
export function bagsPerShift(machine) {
  if (!machine) return 0;
  const base = Number(machine.capacity_per_shift) || 0;
  const eff = Number(machine.efficiency);
  const factor = Number.isFinite(eff) && eff > 0 && eff <= 1 ? eff : 0.95;
  return Math.floor(base * factor);
}

export function shiftsPerWeek(machine) {
  let total = 0;
  for (let d = 0; d < WORK_DAYS; d++) total += shiftsPerDay(machine, d);
  return total;
}

export const weeklyCapacity = (machine) => bagsPerShift(machine) * shiftsPerWeek(machine);

/** Every schedulable slot for a machine in one week, in running order. */
export function weekSlots(machine) {
  const slots = [];
  for (let day = 0; day < WORK_DAYS; day++) {
    for (let shift = 1; shift <= shiftsPerDay(machine, day); shift++) {
      slots.push({ dayIndex: day, shift });
    }
  }
  return slots;
}

/** Monday of the week containing `date`, as YYYY-MM-DD. */
export function weekStartOf(date = new Date()) {
  const d = new Date(date);
  const dow = d.getDay();               // 0 = Sunday
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return toISO(d);
}

export function addWeeks(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d.toISOString().split('T')[0];
}

export function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
}

export function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const formatDate = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

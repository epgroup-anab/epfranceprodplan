/**
 * Priority is a plain number, 1 (most urgent) to 5 (least).
 * It replaces the old NO COMPROMISE / VERY HIGH / ... text tags, which were
 * hard to sort and easy to mistype.
 *
 * The planner sorts by priority first, then by weeks of cover (lowest first),
 * so a P3 that is about to run out still beats a P3 with eight weeks on hand.
 */

export const PRIORITY_LEVELS = [
  { value: 1, name: 'Critical', blurb: 'Cannot miss. Stock-out imminent or contractual.', badge: 'bg-red-600 text-white' },
  { value: 2, name: 'High',     blurb: 'Key account. Schedule ahead of standard work.',    badge: 'bg-orange-500 text-white' },
  { value: 3, name: 'Standard', blurb: 'Normal replenishment. The default.',               badge: 'bg-blue-500 text-white' },
  { value: 4, name: 'Low',      blurb: 'Can slip a week without consequence.',             badge: 'bg-slate-400 text-white' },
  { value: 5, name: 'Filler',   blurb: 'Run only when a machine would otherwise idle.',    badge: 'bg-gray-200 text-gray-700' },
];

const BY_VALUE = new Map(PRIORITY_LEVELS.map((p) => [p.value, p]));

/** Coerce anything the sheet might contain into 1-5. Defaults to 3. */
export function normalisePriority(input) {
  if (input == null || input === '') return 3;
  const n = parseInt(String(input).trim(), 10);
  if (Number.isFinite(n) && n >= 1 && n <= 5) return n;

  // Accept the legacy text tags so an old Michelle sheet still imports.
  const legacy = {
    'NO COMPROMISE': 1, NO_COMPROMISE: 1,
    'VERY HIGH': 2, VERY_HIGH: 2,
    HIGH: 3, MEDIUM: 3,
    LOW: 4,
    'VERY LOW': 5, VERY_LOW: 5,
  };
  return legacy[String(input).toUpperCase().trim()] ?? 3;
}

export const priorityMeta = (v) => BY_VALUE.get(normalisePriority(v)) ?? BY_VALUE.get(3);
export const priorityName = (v) => priorityMeta(v).name;
export const priorityBadge = (v) => priorityMeta(v).badge;

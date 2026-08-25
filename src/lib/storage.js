/**
 * Everything lives in localStorage under pps_* keys. No backend, no network,
 * so the app cannot fall into an "offline mode" — it is always local.
 */
const KEY = { orders: 'pps_orders', materials: 'pps_materials', plan: 'pps_plan', machines: 'pps_machines' };

let memory = {};
let ephemeral = false;

function store() {
  if (ephemeral) return null;
  try {
    localStorage.setItem('__probe__', '1');
    localStorage.removeItem('__probe__');
    return localStorage;
  } catch { ephemeral = true; return null; }
}

export function load(key, fallback = null) {
  const k = KEY[key] || key;
  const s = store();
  const raw = s ? s.getItem(k) : memory[k];
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

export function save(key, value) {
  const k = KEY[key] || key;
  const payload = JSON.stringify(value);
  const s = store();
  if (!s) { memory[k] = payload; return value; }
  try { s.setItem(k, payload); }
  catch { throw new Error('Browser storage is full. Clear the plan and try again.'); }
  return value;
}

export function clear(key) {
  const k = KEY[key] || key;
  const s = store();
  if (s) s.removeItem(k); else delete memory[k];
}

export function clearAll() {
  Object.values(KEY).forEach((k) => { const s = store(); if (s) s.removeItem(k); else delete memory[k]; });
  memory = {};
}

export const isEphemeral = () => ephemeral;

/** Download any JSON as a file. */
export function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  triggerDownload(blob, filename);
}

export function downloadCsv(rows, filename) {
  const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const blob = new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  triggerDownload(blob, filename);
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

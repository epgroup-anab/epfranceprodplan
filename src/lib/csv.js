/** RFC4180-ish CSV splitter. Handles quoted fields, embedded commas and "" escapes. */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ''));
}

/**
 * QuickBase exports as Windows-1252, not UTF-8 — "Intermarché" arrives as a
 * broken byte otherwise. Sniff for a UTF-8 BOM, else decode as cp1252.
 */
export function decodeBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  const hasBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  if (hasBom) return new TextDecoder('utf-8').decode(buffer);

  // Decode strictly: if the bytes are not valid UTF-8 this throws, and cp1252
  // is the only other encoding QuickBase emits.
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

/** "148,094" → 148094 ; "" → 0 ; "1.5" → 1.5 */
export function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value ?? '').replace(/[, ]/g, '').replace(/[^\d.\-]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** Build a header→index lookup that tolerates case, spacing and punctuation. */
export function headerIndex(headerRow) {
  const key = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const keys = headerRow.map(key);

  return (...candidates) => {
    for (const c of candidates) {
      const k = key(c);
      if (!k) continue;
      const exact = keys.indexOf(k);
      if (exact !== -1) return exact;
    }
    // Fall back to prefix matching so "Roll Width" still finds "Roll Width (mm)".
    for (const c of candidates) {
      const k = key(c);
      if (!k) continue;
      const partial = keys.findIndex((h) => h.startsWith(k) || k.startsWith(h));
      if (partial !== -1) return partial;
    }
    return -1;
  };
}

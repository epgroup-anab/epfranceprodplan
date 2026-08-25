import * as XLSX from 'xlsx';
import { parseCsv, decodeBuffer, toNumber, headerIndex } from './csv.js';
import { SKUS } from '../data/skus.js';

const skuCodes = new Set(SKUS.map((s) => String(s.sap_code)));

/**
 * Classify a QuickBase material row into something a planner cares about.
 * Description wins over material group, because "PURE KRAFT 90GSM 80MM HANDLE
 * PAPER" sits in the BR-KRAFT group but is a handle, not a bag reel.
 */
export function classify(description, materialGroup, sapCode) {
  const d = String(description || '').toUpperCase();
  const g = String(materialGroup || '').toUpperCase();

  if (g === 'BAGPAPER' || g === 'BAGRESALE' || skuCodes.has(String(sapCode))) return 'FINISHED';
  if (d.includes('PATCH')) return 'PATCH';
  if (d.includes('HANDLE')) return 'HANDLE';
  if (g === 'INK') return 'INK';
  if (g === 'GLUE') return 'GLUE';
  if (g.includes('CARDBD') || g.includes('CBD') || d.startsWith('BOX ') || d.includes(' BOX')) return 'CARTON';
  if (g.includes('KRAFT') || g.includes('PAPER') || g.includes('RAW')) return 'PAPER';
  return 'OTHER';
}

/** Pull a roll width in mm out of a description, when there is one. */
export function extractWidth(description) {
  const m = String(description || '').toUpperCase().match(/(\d{3,4})\s*MM/);
  if (!m) return null;
  const w = parseInt(m[1], 10);
  return w >= 400 && w <= 2000 ? w : null;
}

async function readGrid(file) {
  const buffer = await file.arrayBuffer();
  if (/\.csv$/i.test(file.name)) return parseCsv(decodeBuffer(buffer));
  const wb = XLSX.read(buffer, { type: 'array' });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false, raw: true });
}

/**
 * Parse a QuickBase "Materials Plant 9000" export.
 * FStk (free stock) is the number that matters — Stk includes blocked and
 * committed quantities that cannot actually be consumed.
 */
export async function parseMaterialsSheet(file) {
  const grid = await readGrid(file);
  if (!grid.length) throw new Error('That file has no rows in it.');

  const at = headerIndex(grid[0]);
  const cMat = at('Mat', 'SAP Code', 'Material');
  if (cMat === -1) throw new Error('No "Mat" column found. Is this a QuickBase materials export?');

  const cDes  = at('Des', 'Description');
  const cUom  = at('UoM', 'Unit');
  const cStk  = at('Stk', 'Stock');
  const cFStk = at('FStk', 'Free Stock');
  const cMgrp = at('MGrp', 'Material Group');
  const cEta  = at('ETA');
  const cSafe = at('SftyStk', 'Safety Stock', 'Min Stock');
  const cLead = at('LdTime', 'Lead Time');
  const cPlt  = at('Plt', 'Plant');

  const materials = [];
  const seen = new Set();

  for (let r = 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row) continue;
    const sap = String(row[cMat] ?? '').trim();
    if (!sap || /^mat$/i.test(sap)) continue;
    if (seen.has(sap)) continue;
    seen.add(sap);

    const description = String(row[cDes] ?? '').trim();
    const group = String(row[cMgrp] ?? '').trim();
    const eta = String(row[cEta] ?? '').trim();

    materials.push({
      sap_code: sap,
      description,
      unit: String(row[cUom] ?? '').trim() || 'KG',
      material_group: group,
      type: classify(description, group, sap),
      roll_width_mm: extractWidth(description),
      stock: toNumber(row[cStk]),
      free_stock: toNumber(row[cFStk]),
      safety_stock: cSafe === -1 ? 0 : toNumber(row[cSafe]),
      lead_time_days: cLead === -1 ? 0 : toNumber(row[cLead]),
      // QuickBase writes 00/00/0000 when nothing is inbound.
      eta: eta && !eta.startsWith('00/00') ? eta : null,
      plant: cPlt === -1 ? '' : String(row[cPlt] ?? '').trim(),
    });
  }

  if (!materials.length) throw new Error('No material rows found in that file.');

  const counts = materials.reduce((acc, m) => { acc[m.type] = (acc[m.type] || 0) + 1; return acc; }, {});
  return { materials, counts };
}

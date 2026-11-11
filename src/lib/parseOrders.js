import * as XLSX from 'xlsx';
import { parseCsv, decodeBuffer, toNumber, headerIndex } from './csv.js';
import { normalisePriority } from './priority.js';
import { SKUS } from '../data/skus.js';

const skuBy = new Map(SKUS.map((s) => [String(s.sap_code), s]));

/** Read a File (csv or xlsx) into an array-of-arrays. */
async function readGrid(file) {
  const buffer = await file.arrayBuffer();
  const isCsv = /\.csv$/i.test(file.name);
  if (isCsv) return parseCsv(decodeBuffer(buffer));

  const wb = XLSX.read(buffer, { type: 'array' });
  // Prefer a sheet actually called Orders; otherwise the first one.
  const name = wb.SheetNames.find((n) => /order/i.test(n)) || wb.SheetNames[0];
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false, raw: true });
}

/** First word of a header, accents stripped. "October 2026" → "october". */
function headerWord(cell) {
  return String(cell ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z].*$/, '');
}

const MONTH_INDEX = {
  january: 1, jan: 1, janvier: 1,
  february: 2, feb: 2, fevrier: 2,
  march: 3, mar: 3, mars: 3,
  april: 4, apr: 4, avril: 4,
  may: 5, mai: 5,
  june: 6, jun: 6, juin: 6,
  july: 7, jul: 7, juillet: 7,
  august: 8, aug: 8, aout: 8,
  september: 9, sep: 9, sept: 9, septembre: 9,
  october: 10, oct: 10, octobre: 10,
  november: 11, nov: 11, novembre: 11,
  december: 12, dec: 12, decembre: 12,
};

/** Columns named October / Nov / décembre are a demand projection, in cartons. */
function monthColumns(headerRow) {
  const cols = [];
  headerRow.forEach((cell, i) => {
    const month = MONTH_INDEX[headerWord(cell)];
    if (month) cols.push({ index: i, label: String(cell).trim() });
  });
  return cols;
}

/** Header is not always row 1 — a title row can sit above it. */
function findHeaderRow(grid) {
  const limit = Math.min(grid.length, 25);
  for (let i = 0; i < limit; i++) {
    const row = grid[i] || [];
    if (row.some((cell) => /sap|material|sku/i.test(String(cell ?? '')))) return i;
  }
  return 0;
}

/**
 * Parse an order sheet or a demand projection.
 *
 * Columns are found by name, not position. The John Poole sheet has Week 1–9
 * in bags. Abraham's demand projection has month columns (October, November,
 * December) in cartons — those are converted with bags per carton.
 * Returns { orders, warnings }.
 */
export function parseOrderGrid(grid) {
  if (!grid.length) throw new Error('That file has no rows in it.');

  const headerAt = findHeaderRow(grid);
  const headerRow = grid[headerAt] || [];
  const at = headerIndex(headerRow);
  const cSap = at('SAP Code', 'SAP CODE', 'Sap Code', 'Material', 'Mat');
  if (cSap === -1) {
    throw new Error('No "SAP Code" column found. Expected a John Poole order sheet or a demand projection.');
  }
  const cPriority = at('Priority');
  const cName     = at('Product Name', 'Name', 'Description', 'Desc', 'Des');
  const cWidth    = at('Roll Width (mm)', 'Roll Width', 'Roll width');
  const cBpc      = at('Bags Per Carton', 'No of bags in cartons', 'Bags/Carton');
  const cMonthly  = at('Monthly Requirement (Cartons)', 'Monthly requirement Cartons', 'Monthly Requirement', 'Monthly Forecast');
  const cStock    = at('Current Stock (Cartons)', 'Current Stock', 'Stock', 'FG Stock', 'Stock on hand');
  const cWeeks    = Array.from({ length: 9 }, (_, i) => at(`Week ${i + 1}`));
  const months    = monthColumns(headerRow);

  const orders = [];
  const warnings = [];
  const seen = new Set();

  for (let r = headerAt + 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row) continue;
    const sap = String(row[cSap] ?? '').trim();
    if (!sap || /^sap/i.test(sap)) continue;

    if (seen.has(sap)) { warnings.push(`Row ${r + 1}: SAP ${sap} appears more than once — the later row was ignored.`); continue; }
    seen.add(sap);

    const master = skuBy.get(sap);
    if (!master) warnings.push(`SAP ${sap} is not in the SKU master, so it has no machine compatibility and cannot be scheduled.`);

    const bagsPerCarton = toNumber(row[cBpc]) || master?.bags_per_carton || 250;
    const monthlyCartons = toNumber(row[cMonthly]);
    const stockCartons = cStock === -1 ? 0 : toNumber(row[cStock]);

    let weekBags;
    let totalBags;
    let weeklyBags;

    if (months.length) {
      // Month columns are cartons. A quarter is ~13 weeks; cover uses that pace.
      const cartons = months.reduce((sum, col) => sum + Math.max(0, toNumber(row[col.index])), 0);
      const horizonWeeks = Math.max(4, Math.round(months.length * 4.33));
      totalBags = Math.round(cartons * bagsPerCarton);
      weeklyBags = totalBags > 0 ? Math.round(totalBags / horizonWeeks) : 0;
      weekBags = Array.from({ length: horizonWeeks }, () => weeklyBags);
    } else {
      weekBags = cWeeks.map((c) => (c === -1 ? 0 : Math.max(0, Math.round(toNumber(row[c])))));
      totalBags = weekBags.reduce((a, b) => a + b, 0);
      // Weekly demand: prefer the week columns, else derive from the monthly figure.
      weeklyBags = totalBags > 0
        ? Math.round(totalBags / weekBags.filter((b) => b > 0).length || 0)
        : Math.round((monthlyCartons / 4.33) * bagsPerCarton);
    }

    orders.push({
      id: `ORD_${sap}`,
      sap_code: sap,
      description: String(row[cName] ?? master?.description ?? '').trim() || `SAP ${sap}`,
      priority: normalisePriority(row[cPriority]),
      roll_width_mm: toNumber(row[cWidth]) || master?.roll_width_mm || null,
      bags_per_carton: bagsPerCarton,
      print_colors: master?.print_colors ?? 1,
      handle_type: master?.handle_type ?? 'FLAT',
      compatible_machines: master?.compatible_machines ?? [],
      primary_machine: master?.primary_machine ?? null,
      primary_machine_only: !!master?.primary_machine_only,
      monthly_requirement_cartons: months.length
        ? Math.round(months.reduce((sum, col) => sum + Math.max(0, toNumber(row[col.index])), 0) / months.length)
        : monthlyCartons,
      stock_cartons: stockCartons,
      stock_bags: stockCartons * bagsPerCarton,
      stock_unknown: cStock === -1,
      week_bags: weekBags,
      total_bags_required: months.length ? totalBags : (totalBags || Math.round(monthlyCartons * bagsPerCarton)),
      weekly_bags: weeklyBags,
      in_master: !!master,
    });
  }

  if (!orders.length) throw new Error('No order rows found — every row was missing a SAP code.');

  if (months.length) {
    warnings.unshift(
      `${months.map((col) => col.label).join(', ')} were read as cartons and converted to bags using bags per carton.`,
    );
  }
  if (cStock === -1) {
    warnings.unshift(
      'No finished-goods stock column on this sheet. The plan makes the full forecast and does not subtract stock already on hand.',
    );
  }
  if (orders.every((o) => o.total_bags_required === 0)) {
    warnings.unshift(
      'Every line came through with 0 bags. The sheet needs Week 1–9 columns, or month columns such as October, November and December.',
    );
  }

  // Cover in weeks: how long current stock lasts at the sheet's own demand rate.
  for (const o of orders) {
    o.cover_weeks = o.weekly_bags > 0
      ? Math.round((o.stock_bags / o.weekly_bags) * 10) / 10
      : 99;
    o.net_bags_required = Math.max(0, o.total_bags_required - o.stock_bags);
  }
  return { orders, warnings };
}

export async function parseOrderSheet(file) {
  const grid = await readGrid(file);
  return parseOrderGrid(grid);
}

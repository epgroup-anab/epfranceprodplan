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

/**
 * Parse a John Poole OrderSheet.
 *
 * Columns are found by name, not position, so John can reorder or add columns
 * without breaking the import. Weeks 1-9 are demand in BAGS.
 * Returns { orders, warnings }.
 */
export async function parseOrderSheet(file) {
  const grid = await readGrid(file);
  if (!grid.length) throw new Error('That file has no rows in it.');

  const at = headerIndex(grid[0]);
  const cSap = at('SAP Code', 'SAP CODE', 'Mat', 'Code');
  if (cSap === -1) {
    throw new Error('No "SAP Code" column found. Is this a John Poole OrderSheet?');
  }
  const cPriority = at('Priority');
  const cName     = at('Product Name', 'Name', 'Description', 'Des');
  const cWidth    = at('Roll Width (mm)', 'Roll Width', 'Roll width');
  const cBpc      = at('Bags Per Carton', 'No of bags in cartons', 'Bags/Carton');
  const cMonthly  = at('Monthly Requirement (Cartons)', 'Monthly requirement Cartons', 'Monthly Requirement');
  const cStock    = at('Current Stock (Cartons)', 'Current Stock', 'Stock');
  const cWeeks    = Array.from({ length: 9 }, (_, i) => at(`Week ${i + 1}`));

  const orders = [];
  const warnings = [];
  const seen = new Set();

  for (let r = 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row) continue;
    const sap = String(row[cSap] ?? '').trim();
    if (!sap || /^sap/i.test(sap)) continue;

    if (seen.has(sap)) { warnings.push(`Row ${r + 1}: SAP ${sap} appears more than once — the later row was ignored.`); continue; }
    seen.add(sap);

    const master = skuBy.get(sap);
    if (!master) warnings.push(`SAP ${sap} is not in the SKU master, so it has no machine compatibility and cannot be scheduled.`);

    const bagsPerCarton = toNumber(row[cBpc]) || master?.bags_per_carton || 250;
    const weekBags = cWeeks.map((c) => (c === -1 ? 0 : Math.max(0, Math.round(toNumber(row[c])))));
    const totalBags = weekBags.reduce((a, b) => a + b, 0);

    const monthlyCartons = toNumber(row[cMonthly]);
    const stockCartons = toNumber(row[cStock]);
    // Weekly demand: prefer the week columns, else derive from the monthly figure.
    const weeklyBags = totalBags > 0
      ? Math.round(totalBags / weekBags.filter((b) => b > 0).length || 0)
      : Math.round((monthlyCartons / 4.33) * bagsPerCarton);

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
      monthly_requirement_cartons: monthlyCartons,
      stock_cartons: stockCartons,
      stock_bags: stockCartons * bagsPerCarton,
      week_bags: weekBags,
      total_bags_required: totalBags || Math.round(monthlyCartons * bagsPerCarton),
      weekly_bags: weeklyBags,
      in_master: !!master,
    });
  }

  if (!orders.length) throw new Error('No order rows found — every row was missing a SAP code.');

  // Cover in weeks: how long current stock lasts at the sheet's own demand rate.
  for (const o of orders) {
    o.cover_weeks = o.weekly_bags > 0
      ? Math.round((o.stock_bags / o.weekly_bags) * 10) / 10
      : 99;
    o.net_bags_required = Math.max(0, o.total_bags_required - o.stock_bags);
  }
  return { orders, warnings };
}

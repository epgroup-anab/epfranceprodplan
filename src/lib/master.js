/**
 * The built-in SKU and machine lists, plus whatever the planner has changed on
 * the Machines tab. Edits live in this browser and always win over the
 * built-in values, so a machine added to an SAP code here is what the next
 * plan uses.
 */
import { SKUS } from '../data/skus.js';
import { MACHINES } from '../data/machines.js';
import { load, save } from './storage.js';

const SKU_KEY = 'pps_sku_overrides';
const MACHINE_KEY = 'pps_machine_overrides';

export const MACHINE_EDITABLE = ['shifts_mon_thu', 'shifts_fri', 'shifts_sat', 'shifts_sun'];

export const loadSkuOverrides = () => load(SKU_KEY, {}) || {};
export const loadMachineOverrides = () => load(MACHINE_KEY, {}) || {};

export function saveSkuOverrides(overrides) { return save(SKU_KEY, overrides); }
export function saveMachineOverrides(overrides) { return save(MACHINE_KEY, overrides); }

/** Built-in SKUs with edits applied, plus any SAP codes added by hand. */
export function mergeSkus(overrides = loadSkuOverrides()) {
  const merged = SKUS.map((s) => {
    const o = overrides[String(s.sap_code)];
    return o ? { ...s, ...o, sap_code: String(s.sap_code), edited: true } : s;
  });
  const builtIn = new Set(SKUS.map((s) => String(s.sap_code)));
  for (const [sap, o] of Object.entries(overrides)) {
    if (builtIn.has(sap)) continue;
    merged.push({
      customer: '', roll_width_mm: null, gsm: null, bags_per_carton: 250, print_colors: 1,
      handle_type: 'FLAT', paper_sap_code: null, carton_sap_code: null,
      primary_machine: null, primary_machine_only: false, compatible_machines: [],
      monthly_requirement_cartons: 0, weekly_usage_cartons: 0,
      ...o, sap_code: sap, added: true, edited: true,
    });
  }
  return merged.sort((a, b) => String(a.sap_code).localeCompare(String(b.sap_code)));
}

export function findSku(sap, skus = mergeSkus()) {
  return skus.find((s) => String(s.sap_code) === String(sap)) || null;
}

export function mergeMachines(overrides = loadMachineOverrides()) {
  return MACHINES.map((m) => (overrides[m.id] ? { ...m, ...overrides[m.id], edited: true } : m));
}

/**
 * The change to save when a machine is ticked or unticked for an SAP code.
 * Machine order follows the plant list; a removed first choice falls to the
 * next machine; a product locked to one machine is unlocked once it has more.
 * `sku` can be an order row for a code that is not in the master yet.
 */
export function machineTogglePatch(sku, machineId, machines) {
  const list = sku.compatible_machines || [];
  const next = list.includes(machineId) ? list.filter((id) => id !== machineId) : [...list, machineId];
  const patch = { compatible_machines: machines.map((m) => m.id).filter((id) => next.includes(id)) };
  if (!next.includes(sku.primary_machine)) patch.primary_machine = next[0] ?? null;
  if (next.length > 1 && sku.primary_machine_only) patch.primary_machine_only = false;
  if (sku.in_master === false) {
    Object.assign(patch, {
      description: sku.description,
      roll_width_mm: sku.roll_width_mm ?? null,
      bags_per_carton: sku.bags_per_carton ?? 250,
    });
  }
  return patch;
}

/** Push the current master onto orders already loaded from a sheet. */
export function applyMasterToOrders(orders, skus = mergeSkus()) {
  const by = new Map(skus.map((s) => [String(s.sap_code), s]));
  return orders.map((o) => {
    const m = by.get(String(o.sap_code));
    if (!m) return { ...o, compatible_machines: [], primary_machine: null, primary_machine_only: false, in_master: false };
    return {
      ...o,
      compatible_machines: m.compatible_machines || [],
      primary_machine: m.primary_machine ?? null,
      primary_machine_only: !!m.primary_machine_only,
      handle_type: m.handle_type ?? o.handle_type,
      print_colors: m.print_colors ?? o.print_colors,
      roll_width_mm: o.roll_width_mm || m.roll_width_mm || null,
      assumed_from: m.edited ? null : (m.assumed_from || null),
      in_master: true,
    };
  });
}

/**
 * Fill in finished-goods stock from live QuickBase when the sheet itself has
 * no stock column (the demand projection does not). Free stock (FStk) in
 * cartons is what counts; blocked and committed cartons cannot ship.
 */
export function applyStockToOrders(orders, materials) {
  const free = new Map((materials || []).map((m) => [String(m.sap_code), m]));
  return orders.map((o) => {
    if (!o.stock_unknown) return o;
    const m = free.get(String(o.sap_code));
    const cartons = m && /^(KAR|CAR|CTN)$/i.test(m.unit || 'KAR') ? Math.max(0, m.free_stock) : 0;
    const stockBags = cartons * (o.bags_per_carton || 250);
    return {
      ...o,
      stock_cartons: cartons,
      stock_bags: stockBags,
      stock_source: m ? 'quickbase' : null,
      cover_weeks: o.weekly_bags > 0 ? Math.round((stockBags / o.weekly_bags) * 10) / 10 : 99,
      net_bags_required: Math.max(0, o.total_bags_required - stockBags),
    };
  });
}

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
      in_master: true,
    };
  });
}

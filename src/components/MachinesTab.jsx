import React, { useMemo, useState } from 'react';
import { Zap, Palette, Clock, Layers, Gauge, Lock, RotateCcw, Search, Plus } from 'lucide-react';
import { Card, Button, Field, Notice, fmt, inputClass } from './ui.jsx';
import { bagsPerShift, shiftsPerWeek, weeklyCapacity } from '../engine/capacity.js';
import { PINNED_MACHINES } from '../engine/scheduler.js';
import { machineTogglePatch } from '../lib/master.js';

function handleTone(type) {
  if (type === 'TWISTED') return 'bg-amber-100 text-amber-700';
  if (type === 'SQR BOTTOM') return 'bg-teal-100 text-teal-800';
  return 'bg-blue-100 text-blue-700';
}

const SHIFT_FIELDS = [
  { key: 'shifts_mon_thu', label: 'Mon–Thu' },
  { key: 'shifts_fri', label: 'Fri' },
  { key: 'shifts_sat', label: 'Sat' },
  { key: 'shifts_sun', label: 'Sun' },
];

export default function MachinesTab({ machines, skus, orders, onMachineChange, onSkuChange }) {
  const total = machines.reduce((a, m) => a + weeklyCapacity(m), 0);
  const pinnedTo = Object.entries(PINNED_MACHINES)
    .reduce((acc, [sap, id]) => { (acc[id] ||= []).push(sap); return acc; }, {});

  return (
    <div className="space-y-5">
      <Card
        title={`Machines — ${machines.length}`}
        subtitle={`${fmt(total)} bags per week at the facility, after efficiency. Shifts per day can be changed here — for example to staff a Garant machine at the weekend only when operators are available.`}
      >
        <div className="p-5 grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {machines.map((m) => (
            <div key={m.id} className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-800">{m.id}</div>
                  <div className="text-xs text-slate-500">{m.internal_name}</div>
                </div>
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700 capitalize">{m.status}</span>
              </div>

              <div className="px-4 py-3 space-y-3">
                <div className="flex gap-1.5 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${handleTone(m.handle_type)}`}>{m.handle_type}</span>
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">{m.category}</span>
                </div>

                <dl className="grid grid-cols-3 gap-2 text-xs">
                  <Fact icon={Zap} label="Bags / shift" value={fmt(bagsPerShift(m))} />
                  <Fact icon={Gauge} label="Efficiency" value={`${Math.round((m.efficiency ?? 0.95) * 100)}%`} />
                  <Fact icon={Palette} label="Colours" value={m.max_print_colors} />
                </dl>

                <div>
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Shifts per day</span>
                    {m.edited && (
                      <button onClick={() => onMachineChange(m.id, null)} className="flex items-center gap-1 text-blue-600 hover:underline">
                        <RotateCcw className="w-3 h-3" />default
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {SHIFT_FIELDS.map(({ key, label }) => (
                      <label key={key} className="text-[11px] text-slate-500">
                        {label}
                        <select value={Number(m[key] ?? 0)}
                                onChange={(e) => onMachineChange(m.id, { [key]: Number(e.target.value) })}
                                className="mt-0.5 w-full px-1.5 py-1 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:border-blue-500">
                          {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="text-xs text-slate-600 bg-slate-50 rounded-lg px-2.5 py-2">
                  <span className="text-slate-400">Weekly capacity</span>{' '}
                  <span className="font-semibold text-slate-800 tabular-nums">{fmt(weeklyCapacity(m))}</span> bags
                  <span className="text-slate-400"> across {shiftsPerWeek(m)} shifts</span>
                </div>

                {m.fixed_size && (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-teal-800 bg-teal-50 px-2 py-1 rounded-lg">
                    <Lock className="w-3.5 h-3.5" />
                    Fixed {m.bag_width_cm}×{m.bag_gusset_cm}×{m.bag_height_cm} cm
                    {m.roll_width_mm ? ` · ${m.roll_width_mm}mm roll` : ''}
                  </div>
                )}
                {m.double_layer_capable && (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-purple-700 bg-purple-50 px-2 py-1 rounded-lg">
                    <Layers className="w-3.5 h-3.5" />Double layer capable
                  </div>
                )}
                {pinnedTo[m.id] && (
                  <div className="text-xs font-medium text-blue-800 bg-blue-50 border border-blue-200 px-2 py-1.5 rounded-lg">
                    Reserved first for SAP {pinnedTo[m.id].join(', ')}
                  </div>
                )}
                {m.notes && <p className="text-xs text-slate-500 italic leading-snug">{m.notes}</p>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Compatibility machines={machines} skus={skus} orders={orders} onSkuChange={onSkuChange} />
    </div>
  );
}

/**
 * Which machines each SAP code may run on. This is the list the planner
 * trusts, so when a machine is proven on a new product it gets added here and
 * the next plan uses it.
 */
function Compatibility({ machines, skus, orders, onSkuChange }) {
  const [query, setQuery] = useState('');
  const [sheetOnly, setSheetOnly] = useState(orders.length > 0);
  const [adding, setAdding] = useState(false);

  const onSheet = useMemo(() => new Set(orders.map((o) => String(o.sap_code))), [orders]);
  const missing = orders.filter((o) => !skus.some((s) => String(s.sap_code) === String(o.sap_code)));

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return skus.filter((s) => {
      if (sheetOnly && !onSheet.has(String(s.sap_code))) return false;
      if (!q) return true;
      return [s.sap_code, s.description, s.customer].some((v) => String(v ?? '').toLowerCase().includes(q));
    });
  }, [skus, query, sheetOnly, onSheet]);

  const toggle = (sku, machineId) => onSkuChange(sku.sap_code, machineTogglePatch(sku, machineId, machines));

  return (
    <Card
      title="Which machines can run each SAP code"
      subtitle="Tick a machine to let the planner use it for that product. Changes are saved in this browser and apply to the next plan. Re-plan after editing."
      right={<Button variant="ghost" onClick={() => setAdding((a) => !a)}><Plus className="w-4 h-4" />Add SAP code</Button>}
    >
      <div className="p-5 pt-4 space-y-3">
        {adding && <AddSku machines={machines} skus={skus} onAdd={(sap, data) => { onSkuChange(sap, data); setAdding(false); setQuery(sap); setSheetOnly(false); }} onCancel={() => setAdding(false)} />}

        {missing.length > 0 && (
          <Notice tone="warn">
            {missing.length} SAP code{missing.length > 1 ? 's' : ''} on the demand sheet {missing.length > 1 ? 'are' : 'is'} not in the master and cannot be planned
            until {missing.length > 1 ? 'they are' : 'it is'} added: <span className="font-mono">{missing.map((o) => o.sap_code).join(', ')}</span>.
          </Notice>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[14rem]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search SAP code, product or customer"
                   className={`${inputClass} pl-9`} />
          </div>
          {orders.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={sheetOnly} onChange={(e) => setSheetOnly(e.target.checked)} />
              Only codes on the demand sheet
            </label>
          )}
          <span className="text-xs text-slate-400">{rows.length} of {skus.length}</span>
        </div>

        <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-[32rem] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr>
                <th className="text-left font-medium text-slate-500 px-3 py-2">SAP</th>
                <th className="text-left font-medium text-slate-500 px-3 py-2">Product</th>
                <th className="text-left font-medium text-slate-500 px-3 py-2">Machines</th>
                <th className="text-left font-medium text-slate-500 px-3 py-2">First choice</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const list = s.compatible_machines || [];
                return (
                  <tr key={s.sap_code} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-2 font-mono font-semibold text-slate-800 whitespace-nowrap">
                      {s.sap_code}
                      {s.added && <span className="ml-1.5 font-sans text-[10px] font-medium text-blue-600">added</span>}
                      {!s.added && s.edited && <span className="ml-1.5 font-sans text-[10px] font-medium text-amber-600">edited</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-600 min-w-[14rem]">
                      <div className="text-slate-800">{s.description}</div>
                      <div className="text-[11px] text-slate-400">
                        {[s.customer, s.roll_width_mm && `${s.roll_width_mm}mm`, `${s.print_colors ?? 1} col`, s.handle_type].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {machines.map((m) => {
                          const on = list.includes(m.id);
                          return (
                            <button key={m.id} onClick={() => toggle(s, m.id)}
                              title={on ? `Stop using ${m.id} for ${s.sap_code}` : `Allow ${m.id} to run ${s.sap_code}`}
                              className={`px-1.5 py-0.5 rounded border text-[10px] font-medium whitespace-nowrap ${on
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'bg-white border-slate-200 text-slate-400 hover:border-slate-400 hover:text-slate-700'}`}>
                              {m.id}
                            </button>
                          );
                        })}
                      </div>
                      {!list.length && <div className="text-[11px] text-red-600 mt-1">No machine — cannot be planned</div>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <select value={s.primary_machine || ''} disabled={!list.length}
                              onChange={(e) => onSkuChange(s.sap_code, { primary_machine: e.target.value || null, primary_machine_only: e.target.value ? s.primary_machine_only : false })}
                              className="px-1.5 py-1 text-xs border border-slate-200 rounded-md bg-white">
                        <option value="">Any</option>
                        {list.map((id) => <option key={id} value={id}>{id}</option>)}
                      </select>
                      {s.primary_machine && (
                        <label className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                          <input type="checkbox" checked={!!s.primary_machine_only}
                                 onChange={(e) => onSkuChange(s.sap_code, { primary_machine_only: e.target.checked })} />
                          only this one
                        </label>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {s.edited && (
                        <button onClick={() => onSkuChange(s.sap_code, null)}
                                className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-red-600"
                                title={s.added ? 'Remove this hand-added SAP code' : 'Put back the built-in machines'}>
                          <RotateCcw className="w-3 h-3" />{s.added ? 'remove' : 'reset'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">
                  Nothing matches. Use <strong>Add SAP code</strong> for a product that is not in the master yet.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

function AddSku({ machines, skus, onAdd, onCancel }) {
  const [form, setForm] = useState({
    sap: '', description: '', customer: '', roll_width_mm: '', print_colors: '1',
    bags_per_carton: '250', handle_type: 'FLAT', machines: [],
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const sap = form.sap.trim();
  const exists = sap && skus.some((s) => String(s.sap_code) === sap);
  const valid = /^\d{3,}$/.test(sap) && !exists && form.description.trim() && form.machines.length;

  const submit = () => onAdd(sap, {
    description: form.description.trim(),
    customer: form.customer.trim(),
    roll_width_mm: Number(form.roll_width_mm) || null,
    print_colors: Number(form.print_colors) || 1,
    bags_per_carton: Number(form.bags_per_carton) || 250,
    handle_type: form.handle_type,
    compatible_machines: form.machines,
    primary_machine: form.machines[0],
    primary_machine_only: false,
  });

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4 space-y-3">
      <div className="grid sm:grid-cols-4 gap-3">
        <Field label="SAP code" hint={exists ? 'Already in the master — search for it below.' : undefined}>
          <input value={form.sap} onChange={set('sap')} className={`${inputClass} font-mono`} placeholder="e.g. 38012" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Product"><input value={form.description} onChange={set('description')} className={inputClass} /></Field>
        </div>
        <Field label="Customer"><input value={form.customer} onChange={set('customer')} className={inputClass} /></Field>
        <Field label="Roll width (mm)"><input type="number" value={form.roll_width_mm} onChange={set('roll_width_mm')} className={inputClass} /></Field>
        <Field label="Print colours"><input type="number" min="0" max="8" value={form.print_colors} onChange={set('print_colors')} className={inputClass} /></Field>
        <Field label="Bags per carton"><input type="number" value={form.bags_per_carton} onChange={set('bags_per_carton')} className={inputClass} /></Field>
        <Field label="Handle">
          <select value={form.handle_type} onChange={set('handle_type')} className={inputClass}>
            {['FLAT', 'TWISTED', 'SQR BOTTOM', 'NONE'].map((h) => <option key={h}>{h}</option>)}
          </select>
        </Field>
      </div>
      <div>
        <div className="text-xs font-medium text-slate-600 mb-1">Machines that can run it (first ticked is first choice)</div>
        <div className="flex flex-wrap gap-1.5">
          {machines.map((m) => {
            const on = form.machines.includes(m.id);
            return (
              <button key={m.id} type="button"
                onClick={() => setForm((f) => ({ ...f, machines: on ? f.machines.filter((x) => x !== m.id) : [...f.machines, m.id] }))}
                className={`px-2 py-1 rounded border text-xs font-medium ${on ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'}`}>
                {m.id}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button disabled={!valid} onClick={submit}><Plus className="w-4 h-4" />Add to master</Button>
      </div>
    </div>
  );
}

const Fact = ({ icon: Icon, label, value }) => (
  <div className="bg-slate-50 rounded-lg px-2.5 py-1.5">
    <dt className="flex items-center gap-1 text-slate-400"><Icon className="w-3 h-3" />{label}</dt>
    <dd className="font-semibold text-slate-800 mt-0.5">{value}</dd>
  </div>
);

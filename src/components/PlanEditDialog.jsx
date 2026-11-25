import React, { useMemo, useState } from 'react';
import { AlertTriangle, CalendarRange, Info } from 'lucide-react';
import { Modal, Button, Fact, Field, Notice, PriorityBadge, fmt, inputClass } from './ui.jsx';
import { bagsPerShift, formatDate, shiftsPerDay, DAY_NAMES, MAX_SHIFTS_PER_DAY } from '../engine/capacity.js';
import { locateDate, rangePositions, slotContext, slotsOnDay } from '../engine/planEdit.js';

const ACTIONS = [
  { id: 'production', label: 'Run a job' },
  { id: 'changeover', label: 'Changeover' },
  { id: 'breakdown', label: 'Breakdown' },
  { id: 'clear', label: 'Clear' },
];

/**
 * One machine, one day: what is running, and the controls to change it from
 * that day through to any end date. The SAP code is free text, because the
 * jobs that most need placing by hand are the ones not on the forecast sheet.
 */
export default function PlanEditDialog({ plan, machine, orders, skus, date, onApply, onClose }) {
  const rate = bagsPerShift(machine);
  const { dayIndex } = locateDate(plan, date);
  const daySlots = slotsOnDay(plan, machine.id, date);
  const firstRun = daySlots.find((s) => s.type === 'production') || null;
  const context = useMemo(() => slotContext(plan, firstRun, orders), [plan, firstRun, orders]);

  const [action, setAction] = useState('production');
  const [sap, setSap] = useState(firstRun ? String(firstRun.sap_code) : '');
  const [description, setDescription] = useState('');
  const [fromDate, setFromDate] = useState(date);
  const [fromShift, setFromShift] = useState(1);
  const [toDate, setToDate] = useState(date);
  const [toShift, setToShift] = useState(MAX_SHIFTS_PER_DAY);
  const [perShift, setPerShift] = useState(String(rate));
  const [shiftExisting, setShiftExisting] = useState(true);
  const [note, setNote] = useState('');
  const [widthChange, setWidthChange] = useState(false);
  const [error, setError] = useState(null);

  const skuBy = useMemo(() => new Map(skus.map((s) => [String(s.sap_code), s])), [skus]);
  const code = sap.trim();
  const order = orders.find((o) => String(o.sap_code) === code) || null;
  const master = skuBy.get(code) || null;
  const known = order || master;
  const listed = (order?.compatible_machines || master?.compatible_machines || []);
  const notListed = action === 'production' && code && known && !listed.includes(machine.id);

  const positions = useMemo(
    () => rangePositions(plan, machine, { fromDate, fromShift, toDate, toShift }),
    [plan, machine, fromDate, fromShift, toDate, toShift],
  );
  const perShiftBags = Math.max(0, Math.round(Number(perShift) || 0));
  const totalBags = action === 'production' ? positions.length * perShiftBags : 0;
  const backwards = toDate < fromDate;

  const choices = useMemo(() => {
    const onSheet = [...orders].sort((a, b) => a.priority - b.priority || a.sap_code.localeCompare(b.sap_code));
    const sheetCodes = new Set(onSheet.map((o) => String(o.sap_code)));
    return [
      ...onSheet.map((o) => ({ code: o.sap_code, label: `P${o.priority} · ${o.description}` })),
      ...skus.filter((s) => !sheetCodes.has(String(s.sap_code)))
        .map((s) => ({ code: s.sap_code, label: `not on sheet · ${s.description}` })),
    ];
  }, [orders, skus]);

  const apply = () => {
    setError(null);
    try {
      onApply({
        machine_id: machine.id, fromDate, fromShift, toDate, toShift, action,
        sap_code: code, description, bags_per_shift: perShiftBags,
        note, width_change: widthChange, shift_existing: shiftExisting,
      });
    } catch (e) { setError(e.message); }
  };

  const canApply = !backwards && positions.length > 0
    && (action !== 'production' || (code && perShiftBags > 0));

  return (
    <Modal
      title={`${machine.id} — ${DAY_NAMES[dayIndex]} ${formatDate(date)}`}
      subtitle={`${machine.category} · ${fmt(rate)} bags per shift · ${shiftsPerDay(machine, dayIndex)} shift${shiftsPerDay(machine, dayIndex) === 1 ? '' : 's'} that day`}
      onClose={onClose}
      width="max-w-3xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!canApply} onClick={apply}>
            <CalendarRange className="w-4 h-4" />
            Apply to {positions.length} shift{positions.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-800">On this day</h3>
          {shiftsPerDay(machine, dayIndex) === 0
            ? <Notice tone="info">{machine.id} is not set to run on {DAY_NAMES[dayIndex]}. Change that on the Machines tab.</Notice>
            : (
              <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
                {Array.from({ length: shiftsPerDay(machine, dayIndex) }, (_, i) => {
                  const s = daySlots.find((x) => x.shift === i + 1);
                  return (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="w-14 text-xs font-medium text-slate-400">Shift {i + 1}</span>
                      {!s && <span className="text-slate-400">Free</span>}
                      {s?.type === 'changeover' && <span className="text-slate-600">{s.description}</span>}
                      {s?.type === 'breakdown' && <span className="font-medium text-red-700">Breakdown — {s.description}</span>}
                      {s?.type === 'production' && (
                        <>
                          <span className="font-mono font-semibold text-slate-800">{s.sap_code}</span>
                          <span className="truncate text-slate-600">{s.description}</span>
                          <span className="ml-auto tabular-nums text-slate-500">{fmt(s.bags)} bags</span>
                        </>
                      )}
                      {s?.edited && <span className="text-[10px] font-medium text-blue-600">by hand</span>}
                    </div>
                  );
                })}
              </div>
            )}

          {firstRun && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Fact label="Roll width" value={firstRun.roll_width_mm ? `${firstRun.roll_width_mm}mm` : '—'} />
              <Fact label="Print colours" value={firstRun.print_colors ?? 1}
                    hint={`machine prints up to ${machine.max_print_colors}`}
                    tone={(firstRun.print_colors ?? 1) > machine.max_print_colors ? 'text-red-600' : ''} />
              <Fact label="Priority" value={<PriorityBadge value={firstRun.priority} />} />
              <Fact label="Customer" value={skuBy.get(String(firstRun.sap_code))?.customer || '—'} />
            </div>
          )}
          {context?.status && (
            <p className="text-sm text-slate-600">
              {firstRun.sap_code}: {fmt(context.status.scheduled)} of {fmt(context.status.required)} bags scheduled
              on {context.machines.join(', ')}, {formatDate(context.firstDate)} to {formatDate(context.lastDate)}.
              {context.status.shortfall > 0
                ? <span className="text-amber-700 font-medium"> Still short {fmt(context.status.shortfall)} bags.</span>
                : <span className="text-emerald-700 font-medium"> Fully covered.</span>}
            </p>
          )}
        </section>

        <section className="border-t border-slate-100 pt-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-800">Change what runs</h3>

          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
            {ACTIONS.map((a) => (
              <button key={a.id} onClick={() => { setAction(a.id); setShiftExisting(a.id !== 'clear'); }}
                className={`px-3 py-1.5 text-sm rounded-md font-medium ${action === a.id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}>
                {a.label}
              </button>
            ))}
          </div>

          {action === 'production' && (
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <Field label="SAP code" hint="Pick from the list or type any SAP code — it does not need to be on the forecast sheet.">
                  <input list="plan-edit-saps" value={sap} onChange={(e) => setSap(e.target.value)}
                         className={`${inputClass} font-mono`} placeholder="e.g. 37978" />
                  <datalist id="plan-edit-saps">
                    {choices.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                  </datalist>
                </Field>
              </div>
              <Field label="Bags per shift" hint={`A full shift on ${machine.id} is ${fmt(rate)}.`}>
                <input type="number" min="0" step="500" value={perShift}
                       onChange={(e) => setPerShift(e.target.value)} className={inputClass} />
              </Field>
              {code && (
                <div className="sm:col-span-3 text-sm text-slate-600">
                  {known
                    ? <><span className="font-medium text-slate-800">{order?.description || master?.description}</span>
                        {!order && <span className="text-slate-400"> — not on the forecast sheet, will be added as a manual job</span>}</>
                    : (
                      <Field label="Product name" hint="This SAP code is not in the master. Name it so the grid is readable.">
                        <input value={description} onChange={(e) => setDescription(e.target.value)}
                               className={inputClass} placeholder="e.g. BK delivery bag — EP UK urgent" />
                      </Field>
                    )}
                </div>
              )}
            </div>
          )}

          {action === 'changeover' && (
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <Field label="Note">
                  <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass}
                         placeholder="e.g. 990mm → 1030mm roll change" />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700 pt-6">
                <input type="checkbox" checked={widthChange} onChange={(e) => setWidthChange(e.target.checked)} />
                Roll-width change
              </label>
            </div>
          )}

          {action === 'breakdown' && (
            <Field label="What happened" hint="Set the end date to your best guess. If the machine is down longer, add another breakdown from where this one ends.">
              <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass}
                     placeholder="e.g. glue unit failure, waiting for part" />
            </Field>
          )}

          <div className="grid sm:grid-cols-4 gap-3">
            <Field label="From">
              <input type="date" value={fromDate} min={plan.startWeek}
                     onChange={(e) => { setFromDate(e.target.value); if (e.target.value > toDate) setToDate(e.target.value); }}
                     className={inputClass} />
            </Field>
            <Field label="Starting shift">
              <select value={fromShift} onChange={(e) => setFromShift(Number(e.target.value))} className={inputClass}>
                {[1, 2, 3].map((n) => <option key={n} value={n}>Shift {n}</option>)}
              </select>
            </Field>
            <Field label="To">
              <input type="date" value={toDate} min={fromDate}
                     onChange={(e) => setToDate(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Ending shift">
              <select value={toShift} onChange={(e) => setToShift(Number(e.target.value))} className={inputClass}>
                {[1, 2, 3].map((n) => <option key={n} value={n}>Shift {n}</option>)}
              </select>
            </Field>
          </div>

          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5" checked={shiftExisting}
                   onChange={(e) => setShiftExisting(e.target.checked)} />
            <span>
              {action === 'clear' && <>Pull the work planned after this on {machine.id} forward to close the gap</>}
              {action === 'breakdown' && <>Move the work that was planned in these shifts to after the breakdown, so nothing is lost</>}
              {action !== 'clear' && action !== 'breakdown' && <>Move the work already planned on {machine.id} later to make room</>}
              <span className="block text-xs text-slate-400">
                {action === 'clear' && 'Unticked, the shifts are left empty.'}
                {action === 'breakdown' && 'Unticked, the bags those shifts would have made are lost, and the orders show as short below the grid.'}
                {action !== 'clear' && action !== 'breakdown' && 'Unticked, whatever is in those shifts is overwritten and lost from the plan.'}
              </span>
            </span>
          </label>

          <div className="flex items-center gap-2 text-sm rounded-lg bg-slate-50 px-3 py-2 text-slate-600">
            <Info className="w-4 h-4 text-slate-400" />
            {backwards
              ? 'The end date is before the start date.'
              : positions.length
                ? <>{positions.length} working shift{positions.length === 1 ? '' : 's'} on {machine.id}
                    {action === 'production' && <> · {fmt(totalBags)} bags</>}</>
                : `${machine.id} has no working shifts in that range.`}
          </div>

          {notListed && (
            <div className="flex gap-2 text-sm rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>{code} is not listed for {machine.id} in the machine compatibility. It will be placed anyway.
                If this machine can always run it, add {machine.id} for {code} on the Machines tab.</div>
            </div>
          )}
          {perShiftBags > rate && action === 'production' && (
            <div className="flex gap-2 text-sm rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>{fmt(perShiftBags)} bags is more than {machine.id} makes in one shift ({fmt(rate)}).</div>
            </div>
          )}
          {error && <Notice tone="error">{error}</Notice>}
        </section>
      </div>
    </Modal>
  );
}

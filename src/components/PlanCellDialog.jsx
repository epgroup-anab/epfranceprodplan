import React, { useMemo, useState } from 'react';
import { AlertTriangle, Pencil, Trash2, Wrench } from 'lucide-react';
import { Modal, Button, Fact, Field, Notice, PriorityBadge, fmt, inputClass } from './ui.jsx';
import { bagsPerShift, formatDate, addWeeks, addDays, DAY_NAMES } from '../engine/capacity.js';
import { slotContext } from '../engine/planEdit.js';
import { SKUS } from '../data/skus.js';

const skuBy = new Map(SKUS.map((s) => [String(s.sap_code), s]));

/**
 * What is running in one shift, and the controls to change it.
 *
 * The read-only half answers "what bag is this?" — product, customer, paper,
 * how it fits into the rest of the plan. The edit half writes straight back to
 * the grid, because the person in the meeting usually knows something the
 * order sheet does not.
 */
export default function PlanCellDialog({ plan, machine, orders, cell, slot, onApply, onClose }) {
  const rate = bagsPerShift(machine);
  const isProduction = slot?.type === 'production';

  const [sap, setSap] = useState(isProduction ? String(slot.sap_code) : '');
  const [bags, setBags] = useState(isProduction ? String(Math.round(slot.bags)) : String(rate));
  const [note, setNote] = useState('');

  const context = useMemo(() => slotContext(plan, slot, orders), [plan, slot, orders]);
  const sku = isProduction ? skuBy.get(String(slot.sap_code)) : null;

  const { compatible, others } = useMemo(() => {
    const withWork = [...orders].sort((a, b) => a.priority - b.priority || a.sap_code.localeCompare(b.sap_code));
    return {
      compatible: withWork.filter((o) => (o.compatible_machines || []).includes(machine.id)),
      others: withWork.filter((o) => !(o.compatible_machines || []).includes(machine.id)),
    };
  }, [orders, machine.id]);

  const chosen = orders.find((o) => String(o.sap_code) === String(sap)) || null;
  const chosenIsCompatible = chosen ? (chosen.compatible_machines || []).includes(machine.id) : true;
  const bagsNumber = Math.max(0, Math.round(Number(bags) || 0));
  const overRate = bagsNumber > rate;

  // An empty cell has no slot to read the date off, so work it out from the grid position.
  const date = slot?.date ?? addDays(addWeeks(plan.startWeek, cell.week), cell.dayIndex);
  const title = `${machine.id} — ${DAY_NAMES[cell.dayIndex]}, shift ${cell.shift}`;
  const subtitle = `Week ${cell.week + 1} of ${plan.weeks} · ${formatDate(date)} · ${machine.category}`
    + (slot ? '' : ' · nothing scheduled in this shift');

  return (
    <Modal
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {slot && (
            <Button variant="danger" onClick={() => onApply({ action: 'clear' })}>
              <Trash2 className="w-4 h-4" />Clear shift
            </Button>
          )}
          <Button variant="ghost" onClick={() => onApply({ action: 'changeover', note })}>
            <Wrench className="w-4 h-4" />Mark as changeover
          </Button>
          <Button disabled={!sap || bagsNumber <= 0}
                  onClick={() => onApply({ action: 'production', sap_code: sap, bags: bagsNumber })}>
            <Pencil className="w-4 h-4" />Save this shift
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {isProduction && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-mono font-semibold text-slate-900">{slot.sap_code}</div>
                <div className="text-sm text-slate-600">{slot.description}</div>
                {sku?.customer && <div className="text-xs text-slate-400 mt-0.5">Customer: {sku.customer}</div>}
              </div>
              <PriorityBadge value={slot.priority} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Fact label="Bags this shift" value={fmt(slot.bags)}
                    hint={`${Math.round((slot.bags / (rate || 1)) * 100)}% of a full shift`} />
              <Fact label="Cartons" value={fmt(slot.cartons)}
                    hint={`${fmt(sku?.bags_per_carton || slot.bags_per_carton || 250)} bags per carton`} />
              <Fact label="Machine rate" value={fmt(rate)} hint="bags per shift after efficiency" />
              <Fact label="Roll width" value={slot.roll_width_mm ? `${slot.roll_width_mm}mm` : '—'}
                    hint={sku?.gsm ? `${sku.gsm} gsm paper` : undefined} />
              <Fact label="Print colours" value={slot.print_colors ?? 1}
                    hint={`machine prints up to ${machine.max_print_colors}`}
                    tone={(slot.print_colors ?? 1) > machine.max_print_colors ? 'text-red-600' : ''} />
              <Fact label="Handle" value={sku?.handle_type || '—'}
                    hint={`machine runs ${machine.handle_type}`}
                    tone={sku?.handle_type && sku.handle_type !== machine.handle_type ? 'text-red-600' : ''} />
              <Fact label="Paper SAP" value={sku?.paper_sap_code || '—'} />
              <Fact label="Carton SAP" value={sku?.carton_sap_code || '—'} />
            </div>

            {context?.status && (
              <div className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-600">
                <span className="font-medium text-slate-800">Across the whole plan: </span>
                {fmt(context.status.scheduled)} of {fmt(context.status.required)} bags scheduled over{' '}
                {context.shifts} shift{context.shifts === 1 ? '' : 's'} on {context.machines.join(', ')}
                {Number.isFinite(context.firstWeek) && (context.firstWeek === context.lastWeek
                  ? <>, in week {context.firstWeek + 1}</>
                  : <>, across weeks {context.firstWeek + 1}–{context.lastWeek + 1}</>)}.
                {context.status.shortfall > 0
                  ? <span className="text-amber-700 font-medium"> Still short {fmt(context.status.shortfall)} bags.</span>
                  : <span className="text-emerald-700 font-medium"> This order is fully covered.</span>}
              </div>
            )}

            {slot.edited && <Notice tone="info">This shift was set by hand, not by the planner.</Notice>}
          </section>
        )}

        {slot?.type === 'changeover' && (
          <Notice tone="warn">
            <span className="font-medium">{slot.description}</span> — a changeover costs the whole shift,
            so nothing is produced here.
          </Notice>
        )}

        {!slot && (
          <Notice tone="info">
            This shift is free. Pick a product below to fill it, or leave it empty as slack.
          </Notice>
        )}

        <section className="border-t border-slate-100 pt-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-800">Change what runs here</h3>

          <div className="grid sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <Field label="Product" hint="Products that cannot run on this machine are listed too — pick one only if you know the machine can take it.">
                <select value={sap} onChange={(e) => {
                  setSap(e.target.value);
                  if (!bags || bagsNumber === 0) setBags(String(rate));
                }} className={inputClass}>
                  <option value="">Select a product…</option>
                  {compatible.length > 0 && (
                    <optgroup label={`Runs on ${machine.id}`}>
                      {compatible.map((o) => (
                        <option key={o.sap_code} value={o.sap_code}>
                          P{o.priority} · {o.sap_code} — {o.description}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {others.length > 0 && (
                    <optgroup label="Not listed for this machine">
                      {others.map((o) => (
                        <option key={o.sap_code} value={o.sap_code}>
                          P{o.priority} · {o.sap_code} — {o.description}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </Field>
            </div>

            <Field label="Bags this shift" hint={`Full shift on ${machine.id} is ${fmt(rate)} bags.`}>
              <input type="number" min="0" step="500" value={bags}
                     onChange={(e) => setBags(e.target.value)} className={inputClass} />
            </Field>
          </div>

          {!chosenIsCompatible && chosen && (
            <div className="flex gap-2 text-sm rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>{chosen.sap_code} is not in the SKU master's machine list for {machine.id}. It will be
                scheduled anyway and flagged on the plan, so confirm with the shop floor first.</div>
            </div>
          )}

          {overRate && (
            <div className="flex gap-2 text-sm rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>{fmt(bagsNumber)} bags is more than {machine.id} makes in one shift ({fmt(rate)}).
                The plan will accept it, but the shift will not deliver it without overtime.</div>
            </div>
          )}

          <Field label="Changeover note" hint="Only used if you press Mark as changeover.">
            <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass}
                   placeholder="e.g. 990mm → 1030mm roll change" />
          </Field>
        </section>
      </div>
    </Modal>
  );
}

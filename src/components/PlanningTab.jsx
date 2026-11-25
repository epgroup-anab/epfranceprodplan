import React, { useMemo, useState } from 'react';
import { Play, ChevronLeft, ChevronRight, Download, Trash2, BarChart3, AlertTriangle, Info, Pencil } from 'lucide-react';
import { generatePlan, planSignature } from '../engine/scheduler.js';
import { applyRangeEdit } from '../engine/planEdit.js';
import { shiftsPerDay, DAY_NAMES, SATURDAY, formatDate, addWeeks, addDays } from '../engine/capacity.js';
import { Card, Button, Stat, Empty, Notice, fmt, PriorityBadge } from './ui.jsx';
import PlanEditDialog from './PlanEditDialog.jsx';
import { downloadCsv } from '../lib/storage.js';
import { customerLogo } from '../lib/brands.js';

/**
 * One colour per SAP code in the plan. Hues are spread by the golden angle so
 * no two products share a colour, and a product keeps its colour every week.
 */
function sapColours(slots) {
  const codes = [...new Set(slots.filter((s) => s.type === 'production').map((s) => String(s.sap_code)))].sort();
  const map = new Map();
  codes.forEach((code, i) => {
    const h = Math.round((i * 137.508) % 360);
    const light = i % 2 ? 88 : 93;
    map.set(code, {
      backgroundColor: `hsl(${h} 75% ${light}%)`,
      borderColor: `hsl(${h} 50% 70%)`,
      color: `hsl(${h} 65% 20%)`,
    });
  });
  return map;
}

export default function PlanningTab({ orders, machines, skus, plan, onPlan, onClear }) {
  const [week, setWeek] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [openDay, setOpenDay] = useState(null);

  const runPlan = () => {
    setBusy(true); setError(null);
    // Yield a frame so the button paints its busy state before we block.
    setTimeout(() => {
      try {
        const result = generatePlan(orders, machines);
        onPlan(result);
        setWeek(0);
        setOpenDay(null);
      } catch (e) { setError(e.message); }
      setBusy(false);
    }, 20);
  };

  const byMachine = useMemo(() => {
    if (!plan) return {};
    const map = {};
    for (const s of plan.slots) {
      if (s.week !== week) continue;
      ((map[s.machine_id] ||= {})[s.dayIndex] ||= []).push(s);
    }
    for (const days of Object.values(map)) for (const list of Object.values(days)) list.sort((a, b) => a.shift - b.shift);
    return map;
  }, [plan, week]);

  const colours = useMemo(() => sapColours(plan?.slots || []), [plan]);
  const customerOf = useMemo(() => {
    const by = new Map(skus.map((s) => [String(s.sap_code), s.customer]));
    return (sap) => by.get(String(sap)) || null;
  }, [skus]);

  const stale = !!plan && plan.inputSignature !== planSignature(orders, machines);

  const applyEdit = (edit) => {
    const next = applyRangeEdit(plan, machines, orders, edit);
    onPlan(next);
    setOpenDay(null);
    setWeek((w) => Math.min(w, Math.max(0, next.weeks - 1)));
  };

  const exportPlan = () => {
    const rows = [['Week', 'Week Start', 'Date', 'Day', 'Shift', 'Machine', 'Type', 'SAP Code', 'Product', 'Roll Width mm', 'Bags', 'Cartons', 'Set by hand']];
    for (const s of plan.slots) {
      rows.push([s.week + 1, s.weekStart, s.date, s.day, s.shift, s.machine_id,
        s.type, s.sap_code || '', s.description || '', s.roll_width_mm || '', s.bags, s.cartons,
        s.edited ? 'yes' : '']);
    }
    downloadCsv(rows, `production-plan-${plan.startWeek}.csv`);
  };

  if (!orders.length) {
    return <Card><Empty icon={BarChart3} title="Nothing to plan yet">
      Upload the demand projection on the Import tab, then come back and press Generate Plan.
    </Empty></Card>;
  }

  const m = plan?.metrics;
  const weekStart = plan ? addWeeks(plan.startWeek, week) : null;

  return (
    <div className="space-y-5">
      <Card
        title="Production Planning"
        subtitle={plan
          ? (plan.weeks > 0
            ? `Week ${week + 1} of ${plan.weeks} — ${formatDate(weekStart)} to ${formatDate(addDays(weekStart, 6))}`
              + (plan.editCount ? ` · ${plan.editCount} manual edit${plan.editCount > 1 ? 's' : ''}` : '')
            : 'Nothing was placed on the grid.')
          : `${orders.length} orders ready. Generating plans the entire order book across as many weeks as it takes.`}
        right={
          <div className="flex items-center gap-2">
            {plan && plan.weeks > 0 && (
              <>
                <Button variant="ghost" onClick={() => setWeek((w) => Math.max(0, w - 1))} disabled={week === 0}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-slate-600 tabular-nums px-1">Week {week + 1}/{plan.weeks}</span>
                <Button variant="ghost" onClick={() => setWeek((w) => Math.min(plan.weeks - 1, w + 1))} disabled={week >= plan.weeks - 1}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button variant="ghost" onClick={exportPlan}><Download className="w-4 h-4" />Export</Button>
                <Button variant="danger" onClick={() => { onClear(); setWeek(0); }}><Trash2 className="w-4 h-4" /></Button>
              </>
            )}
            <Button onClick={runPlan} disabled={busy}>
              <Play className="w-4 h-4" />{busy ? 'Planning…' : plan ? 'Re-plan' : 'Generate Plan'}
            </Button>
          </div>
        }
      >
        {error && <div className="px-5 pb-4"><Notice tone="error">{error}</Notice></div>}

        {!plan
          ? <Empty icon={Play} title="Press Generate Plan">
              The planner sorts by priority, then by weeks of cover, pins Carrefour France to MC-1,
              and groups work by roll width so there are as few changeovers as possible.
              The full method is written out on the FAQ tab.
            </Empty>
          : (
            <div className="p-5 pt-0">
              {stale && (
                <div className="mb-4">
                  <Notice tone="warn">
                    {plan.inputSignature
                      ? 'Priorities, machine compatibility or shift patterns have changed since this plan was generated.'
                      : 'This plan was made by an earlier version of the planner, before weekend shifts.'}
                    Press <strong>Re-plan</strong> to rebuild it, or keep this one and edit it by hand.
                  </Notice>
                </div>
              )}

              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
                <Stat label="Weeks needed" value={plan.weeks} hint={`from ${formatDate(plan.startWeek)}`} />
                <Stat label="Bags scheduled" value={fmt(m.totalBags)} hint={`${fmt(m.totalCartons)} cartons`} />
                <Stat label="Production shifts" value={fmt(m.productionShifts)} />
                <Stat label="Changeovers" value={m.changeovers}
                      hint={`${m.widthChanges} roll-width, ${m.colourChanges} print`}
                      tone={m.changeovers > 40 ? 'warn' : 'good'} />
                <Stat label="Orders complete"
                      value={`${plan.orderStatus.filter((o) => o.complete).length}/${plan.orderStatus.length}`}
                      tone={plan.orderStatus.every((o) => o.complete) ? 'good' : 'warn'} />
              </div>

              <DayGrid machines={machines} byMachine={byMachine} weekStart={weekStart}
                       colours={colours} customerOf={customerOf}
                       onDayClick={(machine, dayIndex) =>
                         setOpenDay({ machine_id: machine.id, date: addDays(weekStart, dayIndex) })} />

              <div className="mt-5 grid lg:grid-cols-2 gap-5">
                <Utilisation metrics={m} />
                <Completion plan={plan} />
              </div>
            </div>
          )}
      </Card>

      {plan && <PlanNotices plan={plan} />}

      {openDay && (
        <PlanEditDialog
          key={`${openDay.machine_id}-${openDay.date}`}
          plan={plan}
          machine={machines.find((m) => m.id === openDay.machine_id)}
          orders={orders}
          skus={skus}
          date={openDay.date}
          onApply={applyEdit}
          onClose={() => setOpenDay(null)}
        />
      )}
    </div>
  );
}

/** A day's shifts in running order, with back-to-back shifts of the same thing merged. */
function summariseDay(slots) {
  const items = [];
  for (const s of slots) {
    const key = s.type === 'changeover' ? 'changeover' : String(s.sap_code);
    const last = items[items.length - 1];
    if (last && last.key === key && s.shift === last.lastShift + 1) {
      last.bags += s.bags; last.shifts += 1; last.lastShift = s.shift;
      last.edited ||= !!s.edited; last.width ||= !!s.width_change;
      continue;
    }
    items.push({
      key, type: s.type, sap_code: s.sap_code, description: s.description,
      bags: s.bags, shifts: 1, edited: !!s.edited, manual: !!s.manual_sap,
      width: !!s.width_change, firstShift: s.shift, lastShift: s.shift,
    });
  }
  return items;
}

const shiftLabel = (it) => (it.firstShift === it.lastShift ? `S${it.firstShift}` : `S${it.firstShift}–${it.lastShift}`);

function BrandIcon({ customer }) {
  const [failed, setFailed] = useState(false);
  const src = customerLogo(customer);
  if (!src || failed) return null;
  return <img src={src} alt="" title={customer} loading="lazy" onError={() => setFailed(true)}
              className="w-3.5 h-3.5 rounded-sm bg-white flex-shrink-0" />;
}

function DayGrid({ machines, byMachine, weekStart, colours, customerOf, onDayClick }) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-x-auto">
      <table className="w-full text-xs border-collapse table-fixed">
        <thead>
          <tr className="bg-slate-50">
            <th className="sticky-col bg-slate-50 text-left font-medium text-slate-500 px-3 py-2 border-b border-r border-slate-200 w-[6.5rem]">Machine</th>
            {DAY_NAMES.map((d, i) => (
              <th key={d} className={`font-medium px-2 py-2 border-b border-r border-slate-200 min-w-[7.5rem] ${i >= SATURDAY ? 'bg-slate-100 text-slate-600' : 'text-slate-500'}`}>
                {d} <span className="text-slate-400 font-normal">{formatDate(addDays(weekStart, i)).replace(/ \d{4}$/, '')}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {machines.map((machine) => (
            <tr key={machine.id}>
              <td className="sticky-col bg-white px-3 py-2 border-b border-r border-slate-200 align-top">
                <div className="font-semibold text-slate-800">{machine.id}</div>
                <div className="text-[10px] text-slate-400">{machine.category}</div>
              </td>
              {DAY_NAMES.map((_, dayIndex) => {
                const shifts = shiftsPerDay(machine, dayIndex);
                const weekend = dayIndex >= SATURDAY;
                if (!shifts) return (
                  <td key={dayIndex} onClick={() => onDayClick(machine, dayIndex)}
                      className="border-b border-r border-slate-200 bg-slate-100/70 cursor-pointer text-center text-[10px] text-slate-400"
                      title="This machine is not set to run this day — click to see or plan it">
                    off
                  </td>
                );

                const slots = byMachine[machine.id]?.[dayIndex] || [];
                const items = summariseDay(slots);
                const free = shifts - slots.filter((s) => s.shift <= shifts).length;
                const split = items.length > 1;

                return (
                  <td key={dayIndex} onClick={() => onDayClick(machine, dayIndex)}
                      className={`border-b border-r border-slate-200 p-1 align-top cursor-pointer hover:bg-blue-50/40 ${weekend ? 'bg-slate-50/60' : ''}`}>
                    <div className="space-y-1">
                      {items.map((it, i) => (it.type === 'changeover'
                        ? (
                          <div key={`chg-${i}`}
                               className="flex items-center justify-center gap-1 rounded border border-dashed border-slate-400 bg-white px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-600"
                               title={`${it.description}\n${shiftLabel(it)} — ${it.shifts} shift${it.shifts > 1 ? 's' : ''}`}>
                            {split && <span className="font-mono font-normal text-slate-400 normal-case">{shiftLabel(it)}</span>}
                            {it.width ? 'Width change' : 'Changeover'}
                            {it.edited && <Pencil className="w-2.5 h-2.5 opacity-60" />}
                          </div>
                        ) : (
                          <div key={`${it.sap_code}-${i}`}
                               style={colours.get(String(it.sap_code))}
                               className="relative rounded border px-1.5 py-1 leading-tight hover:ring-2 hover:ring-blue-400"
                               title={`${it.sap_code} — ${it.description}${customerOf(it.sap_code) ? `\n${customerOf(it.sap_code)}` : ''}\n${fmt(it.bags)} bags, ${shiftLabel(it)}${it.manual ? '\nNot on the demand sheet — added by hand' : ''}`}>
                            {it.edited && <Pencil className="w-2.5 h-2.5 absolute top-0.5 right-0.5 opacity-60" />}
                            <div className="flex items-center gap-1">
                              <BrandIcon customer={customerOf(it.sap_code)} />
                              <span className="font-semibold font-mono text-[11px]">{it.sap_code}</span>
                            </div>
                            <div className="flex justify-between gap-1 text-[10px] opacity-75 tabular-nums">
                              <span>{fmt(it.bags)}</span>
                              <span>{split ? shiftLabel(it) : `${it.shifts}/${shifts}`}</span>
                            </div>
                          </div>
                        )))}
                      {free > 0 && (
                        <div className="text-center text-[10px] text-slate-400">
                          {free === shifts ? 'free — click to plan' : `${free} shift${free > 1 ? 's' : ''} free`}
                        </div>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-3 py-2 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm border border-blue-200 bg-blue-100" />Customer · SAP code · bags · shifts used — one colour per product</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm border border-dashed border-slate-400 bg-white" />Changeover, in the shift it happens</span>
        <span className="flex items-center gap-1.5 font-mono">S1–S3</span><span className="-ml-4">which shifts, when a day is split</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-slate-200" />Machine off that day</span>
        <span className="flex items-center gap-1.5"><Pencil className="w-3 h-3" />Edited by hand</span>
        <span className="ml-auto text-slate-400">Click a day to see its shifts, or to plan a job from that day to any end date.</span>
      </div>
    </div>
  );
}

function Utilisation({ metrics }) {
  return (
    <Card title="Machine utilisation" subtitle="Share of available shifts used across the whole plan.">
      <div className="p-5 pt-4 space-y-2.5">
        {metrics.utilisation.map((u) => (
          <div key={u.machine_id} className="flex items-center gap-3">
            <span className="w-20 text-xs font-medium text-slate-700">{u.machine_id}</span>
            <div className="flex-1 h-5 bg-slate-100 rounded overflow-hidden flex">
              <div className={`h-full ${u.percent >= 95 ? 'bg-red-500' : u.percent >= 70 ? 'bg-emerald-500' : 'bg-blue-400'}`}
                   style={{ width: `${Math.min(100, u.percent)}%` }} />
            </div>
            <span className="w-11 text-right text-xs tabular-nums text-slate-600">{u.percent}%</span>
            <span className="w-24 text-right text-xs tabular-nums text-slate-400">{fmt(u.bags)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Completion({ plan }) {
  const rows = [...plan.orderStatus].sort((a, b) => a.priority - b.priority || b.required - a.required);
  return (
    <Card title="Order completion" subtitle="Every line on the sheet, and where it runs.">
      <div className="max-h-80 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 sticky top-0">
            <tr>
              <th className="text-left font-medium text-slate-500 px-3 py-2">SAP</th>
              <th className="text-left font-medium text-slate-500 px-3 py-2">P</th>
              <th className="text-left font-medium text-slate-500 px-3 py-2">Machines</th>
              <th className="text-right font-medium text-slate-500 px-3 py-2">Scheduled</th>
              <th className="text-right font-medium text-slate-500 px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.sap_code} className="border-b border-slate-100">
                <td className="px-3 py-1.5 font-mono">{o.sap_code}</td>
                <td className="px-3 py-1.5"><PriorityBadge value={o.priority} /></td>
                <td className="px-3 py-1.5 text-slate-500">{o.machines.join(', ') || '—'}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmt(o.scheduled)}</td>
                <td className="px-3 py-1.5 text-right">
                  {o.complete
                    ? <span className="text-emerald-600 font-medium">Complete</span>
                    : <span className="text-amber-600 font-medium">Short {fmt(o.shortfall)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PlanNotices({ plan }) {
  const notes = [];

  if (plan.overflow?.length) {
    for (const o of plan.overflow) {
      notes.push({
        tone: 'warn',
        text: <>
          <strong>{o.sap_code} needs more than {o.pinned_to} can make.</strong>{' '}
          {o.pinned_to} is filled to capacity and the remaining {fmt(o.bags)} bags were moved to {o.spilled_to}.
          Keeping all of it on {o.pinned_to} would push the order past the end of the plan.
        </>,
      });
    }
  }
  for (const u of plan.unplaced || []) {
    notes.push({ tone: 'error', text: <><strong>{u.order.sap_code} could not be scheduled</strong> ({u.reason}) — {fmt(u.bags)} bags left over.</> });
  }
  for (const w of plan.dataWarnings || []) {
    notes.push({ tone: w.severity === 'error' ? 'error' : 'warn', text: w.message });
  }

  if (!notes.length) {
    return <Notice tone="good">
      <span className="inline-flex items-center gap-2 font-medium"><Info className="w-4 h-4" />
        Every order on the sheet is fully scheduled with no conflicts.</span>
    </Notice>;
  }

  return (
    <Card title={`${notes.length} thing${notes.length > 1 ? 's' : ''} to be aware of`}
          subtitle="The plan is still valid — these are judgement calls worth raising in the meeting.">
      <div className="p-5 pt-4 space-y-2.5">
        {notes.map((n, i) => (
          <div key={i} className={`flex gap-2.5 text-sm rounded-lg border px-3 py-2.5 ${
            n.tone === 'error' ? 'bg-red-50 border-red-200 text-red-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>{n.text}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

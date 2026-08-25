import React, { useMemo, useState } from 'react';
import { Play, ChevronLeft, ChevronRight, Download, Trash2, BarChart3, AlertTriangle, Info, Pencil } from 'lucide-react';
import { generatePlan } from '../engine/scheduler.js';
import { applyCellEdit, cellId, cellOf } from '../engine/planEdit.js';
import { shiftsPerDay, DAY_NAMES, formatDate, addWeeks, addDays } from '../engine/capacity.js';
import { prioritySignature } from '../lib/priority.js';
import { Card, Button, Stat, Empty, Notice, fmt, PriorityBadge } from './ui.jsx';
import PlanCellDialog from './PlanCellDialog.jsx';
import { downloadCsv } from '../lib/storage.js';

const MAX_SHIFTS = 3;

/** Stable colour per SAP so the same product reads the same across the grid. */
const PALETTE = [
  'bg-blue-100 text-blue-900 border-blue-200',
  'bg-emerald-100 text-emerald-900 border-emerald-200',
  'bg-amber-100 text-amber-900 border-amber-200',
  'bg-purple-100 text-purple-900 border-purple-200',
  'bg-rose-100 text-rose-900 border-rose-200',
  'bg-cyan-100 text-cyan-900 border-cyan-200',
  'bg-lime-100 text-lime-900 border-lime-200',
  'bg-orange-100 text-orange-900 border-orange-200',
];
const colourFor = (sap) => {
  let h = 0;
  for (const c of String(sap)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

export default function PlanningTab({ orders, machines, plan, onPlan, onClear }) {
  const [week, setWeek] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [openCell, setOpenCell] = useState(null);

  const runPlan = () => {
    setBusy(true); setError(null);
    // Yield a frame so the button paints its busy state before we block.
    setTimeout(() => {
      try {
        const result = generatePlan(orders, machines);
        onPlan(result);
        setWeek(0);
        setOpenCell(null);
      } catch (e) { setError(e.message); }
      setBusy(false);
    }, 20);
  };

  const byMachine = useMemo(() => {
    if (!plan) return {};
    const map = {};
    for (const s of plan.slots) {
      if (s.week !== week) continue;
      (map[s.machine_id] ||= {})[`${s.dayIndex}-${s.shift}`] = s;
    }
    return map;
  }, [plan, week]);

  const stale = plan?.prioritySignature && plan.prioritySignature !== prioritySignature(orders);

  const openSlot = openCell
    ? plan.slots.find((s) => cellId(cellOf(s)) === cellId(openCell)) || null
    : null;

  const applyEdit = (edit) => {
    const next = applyCellEdit(plan, machines, orders, openCell, edit);
    onPlan(next);
    setOpenCell(null);
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
      Upload the John Poole Order Sheet on the Import tab, then come back and press Generate Plan.
    </Empty></Card>;
  }

  const m = plan?.metrics;
  const weekStart = plan ? addWeeks(plan.startWeek, week) : null;

  return (
    <div className="space-y-5">
      <Card
        title="Production Planning"
        subtitle={plan
          ? `Week ${week + 1} of ${plan.weeks} — ${formatDate(weekStart)} to ${formatDate(addDays(weekStart, 4))}`
            + (plan.editCount ? ` · ${plan.editCount} manual edit${plan.editCount > 1 ? 's' : ''}` : '')
          : `${orders.length} orders ready. Generating plans the entire order book across as many weeks as it takes.`}
        right={
          <div className="flex items-center gap-2">
            {plan && (
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
                    Priorities have changed on the Orders tab since this plan was generated.
                    Press <strong>Re-plan</strong> to rebuild it, or keep this one and edit shifts by hand.
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

              <ShiftGrid machines={machines} byMachine={byMachine}
                         onCellClick={(machine, dayIndex, shift) =>
                           setOpenCell({ machine_id: machine.id, week, dayIndex, shift })} />

              <div className="mt-5 grid lg:grid-cols-2 gap-5">
                <Utilisation metrics={m} />
                <Completion plan={plan} />
              </div>
            </div>
          )}
      </Card>

      {plan && <PlanNotices plan={plan} />}

      {openCell && (
        <PlanCellDialog
          plan={plan}
          machine={machines.find((m) => m.id === openCell.machine_id)}
          orders={orders}
          cell={openCell}
          slot={openSlot}
          onApply={applyEdit}
          onClose={() => setOpenCell(null)}
        />
      )}
    </div>
  );
}

function ShiftGrid({ machines, byMachine, onCellClick }) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-slate-50">
            <th className="sticky-col bg-slate-50 text-left font-medium text-slate-500 px-3 py-2 border-b border-r border-slate-200 min-w-[5.5rem] w-[5.5rem]">Machine</th>
            {DAY_NAMES.map((d) => (
              Array.from({ length: MAX_SHIFTS }, (_, i) => (
                <th key={`${d}${i}`} className={`font-medium text-slate-500 px-1 py-2 border-b border-slate-200 min-w-[4.9rem] ${i === MAX_SHIFTS - 1 ? 'border-r' : ''}`}>
                  {d} <span className="text-slate-400">S{i + 1}</span>
                </th>
              ))
            ))}
          </tr>
        </thead>
        <tbody>
          {machines.map((machine) => (
            <tr key={machine.id} className="hover:bg-slate-50/50">
              <td className="sticky-col bg-white px-3 py-2 border-b border-r border-slate-200">
                <div className="font-semibold text-slate-800">{machine.id}</div>
                <div className="text-[10px] text-slate-400">{machine.category}</div>
              </td>
              {DAY_NAMES.map((_, dayIndex) =>
                Array.from({ length: MAX_SHIFTS }, (_, i) => {
                  const shift = i + 1;
                  const runs = shift <= shiftsPerDay(machine, dayIndex);
                  const slot = byMachine[machine.id]?.[`${dayIndex}-${shift}`];
                  const edge = i === MAX_SHIFTS - 1 ? 'border-r' : '';

                  if (!runs) return <td key={`${dayIndex}-${shift}`} className={`border-b border-slate-200 bg-slate-100/70 ${edge}`}
                    title="This machine does not run this shift" />;

                  const open = () => onCellClick(machine, dayIndex, shift);

                  if (!slot) return (
                    <td key={`${dayIndex}-${shift}`} onClick={open}
                        className={`border-b border-slate-200 cursor-pointer group ${edge}`}
                        title="Free shift — click to schedule something here">
                      <div className="opacity-0 group-hover:opacity-100 text-center text-[10px] text-slate-400">+ add</div>
                    </td>
                  );

                  if (slot.type === 'changeover') return (
                    <td key={`${dayIndex}-${shift}`} onClick={open} className={`border-b border-slate-200 p-1 cursor-pointer ${edge}`}>
                      <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-0.5 py-1 text-center text-[9px] font-medium text-slate-500 leading-tight hover:border-slate-400"
                           title={`${slot.description}\nClick for details`}>
                        {slot.width_change ? 'WIDTH CHG' : 'CHANGEOVER'}
                      </div>
                    </td>
                  );

                  return (
                    <td key={`${dayIndex}-${shift}`} onClick={open} className={`border-b border-slate-200 p-1 cursor-pointer ${edge}`}>
                      <div className={`relative rounded border px-1 py-1 leading-tight text-center hover:ring-2 hover:ring-blue-400 ${colourFor(slot.sap_code)}`}
                           title={`${slot.sap_code} — ${slot.description}\n${fmt(slot.bags)} bags / ${fmt(slot.cartons)} cartons\n${slot.roll_width_mm}mm\nClick for the full run details`}>
                        {slot.edited && <Pencil className="w-2.5 h-2.5 absolute top-0.5 right-0.5 opacity-60" />}
                        <div className="font-semibold font-mono text-[11px]">{slot.sap_code}</div>
                        <div className="tabular-nums opacity-70 text-[10px]">{fmt(slot.bags)}</div>
                      </div>
                    </td>
                  );
                })
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-3 py-2 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm border border-blue-200 bg-blue-100" />Product run — SAP code and bags</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm border border-dashed border-slate-300 bg-slate-50" />Changeover — costs one shift</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-slate-200" />Machine does not run this shift</span>
        <span className="flex items-center gap-1.5"><Pencil className="w-3 h-3" />Edited by hand</span>
        <span className="ml-auto text-slate-400">Click any shift for run details, or to change what runs there.</span>
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
            <span className="w-16 text-xs font-medium text-slate-700">{u.machine_id}</span>
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

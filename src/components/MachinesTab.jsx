import React from 'react';
import { Zap, Palette, Clock, Layers, Gauge } from 'lucide-react';
import { Card, fmt } from './ui.jsx';
import { bagsPerShift, shiftsPerWeek, weeklyCapacity } from '../engine/capacity.js';
import { PINNED_MACHINES } from '../engine/scheduler.js';

export default function MachinesTab({ machines }) {
  const total = machines.reduce((a, m) => a + weeklyCapacity(m), 0);
  const pinnedTo = Object.entries(PINNED_MACHINES)
    .reduce((acc, [sap, id]) => { (acc[id] ||= []).push(sap); return acc; }, {});

  return (
    <Card
      title={`Machines — ${machines.length}`}
      subtitle={`${fmt(total)} bags per week at the facility, after efficiency. Mon–Thu and Friday shift counts come from each machine's own record.`}
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
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${m.handle_type === 'TWISTED' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{m.handle_type}</span>
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">{m.category}</span>
              </div>

              <dl className="grid grid-cols-2 gap-2 text-xs">
                <Fact icon={Zap} label="Bags / shift" value={fmt(bagsPerShift(m))} />
                <Fact icon={Gauge} label="Efficiency" value={`${Math.round((m.efficiency ?? 0.95) * 100)}%`} />
                <Fact icon={Palette} label="Max colours" value={m.max_print_colors} />
                <Fact icon={Clock} label="Shifts" value={`${m.shifts_mon_thu} Mon–Thu / ${m.shifts_fri} Fri`} />
              </dl>

              <div className="text-xs text-slate-600 bg-slate-50 rounded-lg px-2.5 py-2">
                <span className="text-slate-400">Weekly capacity</span>{' '}
                <span className="font-semibold text-slate-800 tabular-nums">{fmt(weeklyCapacity(m))}</span> bags
                <span className="text-slate-400"> across {shiftsPerWeek(m)} shifts</span>
              </div>

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
  );
}

const Fact = ({ icon: Icon, label, value }) => (
  <div className="bg-slate-50 rounded-lg px-2.5 py-1.5">
    <dt className="flex items-center gap-1 text-slate-400"><Icon className="w-3 h-3" />{label}</dt>
    <dd className="font-semibold text-slate-800 mt-0.5">{value}</dd>
  </div>
);

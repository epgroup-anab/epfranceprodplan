import React, { useMemo, useState } from 'react';
import { Search, ClipboardList, ArrowUpDown, RotateCcw } from 'lucide-react';
import { Card, Empty, TableWrap, Th, Td, Button, Notice, fmt } from './ui.jsx';
import { PRIORITY_LEVELS, priorityMeta } from '../lib/priority.js';

const coverTone = (c) =>
  c < 1 ? 'text-red-600 font-semibold'
  : c < 2 ? 'text-amber-600 font-medium'
  : 'text-slate-600';

export default function OrdersTab({ orders, sourceName, onPriority, onResetPriorities }) {
  const [query, setQuery] = useState('');
  const [priority, setPriority] = useState('all');
  const [sort, setSort] = useState({ key: 'priority', dir: 1 });

  const rows = useMemo(() => {
    let list = orders;
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((o) => o.sap_code.includes(q) || o.description.toLowerCase().includes(q));
    }
    if (priority !== 'all') list = list.filter((o) => o.priority === Number(priority));

    return [...list].sort((a, b) => {
      const { key, dir } = sort;
      const av = a[key], bv = b[key];
      if (typeof av === 'string') return dir * av.localeCompare(bv);
      return dir * ((av ?? 0) - (bv ?? 0));
    });
  }, [orders, query, priority, sort]);

  const toggle = (key) => setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }));
  const SortTh = ({ k, children, className }) => (
    <Th className={`cursor-pointer select-none hover:text-slate-800 ${className || ''}`} onClick={() => toggle(k)}>
      <span className="inline-flex items-center gap-1">{children}<ArrowUpDown className="w-3 h-3 opacity-40" /></span>
    </Th>
  );

  if (!orders.length) {
    return <Card><Empty icon={ClipboardList} title="No orders yet">
      Upload the John Poole Order Sheet on the Import tab and the extracted orders appear here.
    </Empty></Card>;
  }

  const totalBags = orders.reduce((a, o) => a + o.total_bags_required, 0);
  const netBags = orders.reduce((a, o) => a + o.net_bags_required, 0);
  const critical = orders.filter((o) => o.cover_weeks < 1).length;
  const overridden = orders.filter((o) => o.priority_source === 'manual');

  return (
    <Card
      title={`Orders — ${orders.length} lines`}
      subtitle={`${sourceName ? `From ${sourceName}. ` : ''}${fmt(totalBags)} bags demanded, ${fmt(netBags)} still to make after stock on hand.${critical ? ` ${critical} below one week of cover.` : ''}`}
      right={
        <div className="flex items-center gap-2">
          {overridden.length > 0 && (
            <Button variant="ghost" onClick={onResetPriorities} title="Put every priority back to the value on the uploaded sheet">
              <RotateCcw className="w-4 h-4" />Reset {overridden.length}
            </Button>
          )}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="SAP code or name"
              className="pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg w-56 focus:outline-none focus:border-blue-500" />
          </div>
          <select value={priority} onChange={(e) => setPriority(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-blue-500">
            <option value="all">All priorities</option>
            {[1, 2, 3, 4, 5].map((p) => <option key={p} value={p}>Priority {p}</option>)}
          </select>
        </div>
      }
    >
      {overridden.length > 0 && (
        <div className="px-5 pt-4">
          <Notice tone="info">
            {overridden.length} priorit{overridden.length === 1 ? 'y has' : 'ies have'} been changed by hand
            ({overridden.map((o) => o.sap_code).join(', ')}). Go to the Planning tab and press Re-plan
            for the schedule to follow the new order.
          </Notice>
        </div>
      )}

      <TableWrap>
        <thead className="bg-slate-50">
          <tr>
            <SortTh k="sap_code">SAP</SortTh>
            <SortTh k="priority">Priority</SortTh>
            <Th>Product</Th>
            <Th>Machines</Th>
            <SortTh k="roll_width_mm" className="text-right">Width</SortTh>
            <SortTh k="monthly_requirement_cartons" className="text-right">Monthly</SortTh>
            <SortTh k="stock_cartons" className="text-right">Stock</SortTh>
            <SortTh k="cover_weeks" className="text-right">Cover</SortTh>
            <SortTh k="total_bags_required" className="text-right">Bags needed</SortTh>
            <SortTh k="net_bags_required" className="text-right">To make</SortTh>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.sap_code} className="hover:bg-slate-50">
              <Td className="font-mono text-xs">{o.sap_code}</Td>
              <Td>
                <PriorityCell order={o} onChange={(p) => onPriority(o.sap_code, p)} />
              </Td>
              <Td className="max-w-[22rem] truncate" title={o.description}>{o.description}</Td>
              <Td className="text-xs text-slate-500">
                {o.compatible_machines.length
                  ? o.compatible_machines.join(', ')
                  : <span className="text-red-600 font-medium">none in master</span>}
              </Td>
              <Td className="text-right tabular-nums">{o.roll_width_mm ? `${o.roll_width_mm}mm` : '—'}</Td>
              <Td className="text-right tabular-nums">{fmt(o.monthly_requirement_cartons)}</Td>
              <Td className="text-right tabular-nums">{fmt(o.stock_cartons)}</Td>
              <Td className={`text-right tabular-nums ${coverTone(o.cover_weeks)}`}>
                {o.cover_weeks >= 99 ? '—' : `${o.cover_weeks}w`}
              </Td>
              <Td className="text-right tabular-nums">{fmt(o.total_bags_required)}</Td>
              <Td className="text-right tabular-nums font-medium">{fmt(o.net_bags_required)}</Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      {!rows.length && <p className="text-center text-sm text-slate-500 py-8">Nothing matches that filter.</p>}
    </Card>
  );
}

/**
 * Priority straight from the sheet, unless someone knows better. Changing it
 * here is what re-orders the queue on the next plan, so it stays visible in the
 * table rather than hidden behind a dialog.
 */
function PriorityCell({ order, onChange }) {
  const manual = order.priority_source === 'manual';
  const meta = priorityMeta(order.priority);
  return (
    <div className="flex items-center gap-1.5">
      <select
        value={order.priority}
        onChange={(e) => onChange(Number(e.target.value))}
        title={`${meta.value} — ${meta.name}: ${meta.blurb}\nChange this to move the order up or down the queue.`}
        className={`appearance-none cursor-pointer rounded pl-2 pr-2 py-0.5 text-xs font-semibold border-0 focus:outline-none focus:ring-2 focus:ring-blue-400 ${meta.badge}`}
      >
        {PRIORITY_LEVELS.map((p) => (
          <option key={p.value} value={p.value} className="bg-white text-slate-800">{p.value} {p.name}</option>
        ))}
      </select>
      {manual && (
        <span className="text-[10px] font-medium text-blue-600"
              title={`The sheet said ${order.priority_original}. Changed by hand.`}>
          edited
        </span>
      )}
    </div>
  );
}

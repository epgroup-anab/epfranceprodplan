import React, { useMemo, useState } from 'react';
import { Search, ClipboardList, ArrowUpDown } from 'lucide-react';
import { Card, Empty, TableWrap, Th, Td, PriorityBadge, fmt } from './ui.jsx';

const coverTone = (c) =>
  c < 1 ? 'text-red-600 font-semibold'
  : c < 2 ? 'text-amber-600 font-medium'
  : 'text-slate-600';

export default function OrdersTab({ orders, sourceName }) {
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

  return (
    <Card
      title={`Orders — ${orders.length} lines`}
      subtitle={`${sourceName ? `From ${sourceName}. ` : ''}${fmt(totalBags)} bags demanded, ${fmt(netBags)} still to make after stock on hand.${critical ? ` ${critical} below one week of cover.` : ''}`}
      right={
        <div className="flex items-center gap-2">
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
              <Td><PriorityBadge value={o.priority} /></Td>
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

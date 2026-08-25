import React, { useMemo, useState } from 'react';
import { Search, Package, AlertTriangle } from 'lucide-react';
import { Card, Empty, TableWrap, Th, Td, Notice, fmt } from './ui.jsx';

const TYPES = ['ALL', 'FINISHED', 'PAPER', 'HANDLE', 'PATCH', 'CARTON', 'INK', 'GLUE', 'OTHER'];

const TYPE_STYLE = {
  FINISHED: 'bg-emerald-100 text-emerald-700',
  PAPER: 'bg-blue-100 text-blue-700',
  HANDLE: 'bg-purple-100 text-purple-700',
  PATCH: 'bg-pink-100 text-pink-700',
  CARTON: 'bg-amber-100 text-amber-700',
  INK: 'bg-slate-200 text-slate-700',
  GLUE: 'bg-slate-200 text-slate-700',
  OTHER: 'bg-slate-100 text-slate-600',
};

export default function StockTab({ materials, sourceName }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('ALL');

  const rows = useMemo(() => {
    let list = materials;
    if (type !== 'ALL') list = list.filter((m) => m.type === type);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((m) => m.sap_code.includes(q) || m.description.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => b.free_stock - a.free_stock);
  }, [materials, query, type]);

  if (!materials.length) {
    return <Card><Empty icon={Package} title="No stock loaded">
      Upload the QuickBase Materials Plant 9000 export on the Import tab. Free stock (FStk) from that file is what shows here.
    </Empty></Card>;
  }

  const counts = materials.reduce((a, m) => { a[m.type] = (a[m.type] || 0) + 1; return a; }, {});
  const zeroPaper = materials.filter((m) => m.type === 'PAPER' && m.free_stock <= 0);
  const blocked = materials.filter((m) => m.stock > m.free_stock);

  return (
    <div className="space-y-5">
      {zeroPaper.length > 0 && (
        <Notice tone="warn">
          <span className="inline-flex items-center gap-2 font-semibold">
            <AlertTriangle className="w-4 h-4" />{zeroPaper.length} paper reels at zero free stock
          </span>
          <p className="mt-1">Any SKU that needs one of these cannot actually run, however the plan schedules it. Worth checking against the week&nbsp;1 plan before the meeting.</p>
        </Notice>
      )}

      <Card
        title={`Stock — ${fmt(materials.length)} materials`}
        subtitle={`${sourceName ? `From ${sourceName}. ` : ''}Free stock excludes blocked and committed quantities${blocked.length ? ` — ${blocked.length} lines have stock that is not free` : ''}.`}
        right={
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Code or description"
              className="pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg w-64 focus:outline-none focus:border-blue-500" />
          </div>
        }
      >
        <div className="px-5 pt-4 flex flex-wrap gap-2">
          {TYPES.filter((t) => t === 'ALL' || counts[t]).map((t) => (
            <button key={t} onClick={() => setType(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                ${type === t ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {t === 'ALL' ? `All ${materials.length}` : `${t} ${counts[t]}`}
            </button>
          ))}
        </div>
        <div className="mt-4">
          <TableWrap>
            <thead className="bg-slate-50">
              <tr>
                <Th>SAP</Th><Th>Description</Th><Th>Type</Th>
                <Th className="text-right">Width</Th>
                <Th className="text-right">Stock</Th>
                <Th className="text-right">Free stock</Th>
                <Th>Unit</Th><Th>Group</Th><Th>Inbound</Th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 300).map((m) => (
                <tr key={m.sap_code} className="hover:bg-slate-50">
                  <Td className="font-mono text-xs">{m.sap_code}</Td>
                  <Td className="max-w-[24rem] truncate" title={m.description}>{m.description}</Td>
                  <Td><span className={`px-2 py-0.5 rounded text-xs font-medium ${TYPE_STYLE[m.type] || TYPE_STYLE.OTHER}`}>{m.type}</span></Td>
                  <Td className="text-right tabular-nums text-slate-500">{m.roll_width_mm ? `${m.roll_width_mm}mm` : '—'}</Td>
                  <Td className="text-right tabular-nums text-slate-500">{fmt(m.stock)}</Td>
                  <Td className={`text-right tabular-nums font-semibold ${m.free_stock <= 0 ? 'text-red-600' : 'text-slate-800'}`}>{fmt(m.free_stock)}</Td>
                  <Td className="text-slate-500 text-xs">{m.unit}</Td>
                  <Td className="text-slate-500 text-xs">{m.material_group}</Td>
                  <Td className="text-slate-500 text-xs">{m.eta || '—'}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          {rows.length > 300 && (
            <p className="text-center text-xs text-slate-500 py-3">
              Showing the 300 largest of {fmt(rows.length)} — narrow it with search or a type filter.
            </p>
          )}
          {!rows.length && <p className="text-center text-sm text-slate-500 py-8">Nothing matches that filter.</p>}
        </div>
      </Card>
    </div>
  );
}

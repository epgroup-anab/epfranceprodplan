import React, { useMemo, useState } from 'react';
import { Search, Package, AlertTriangle, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { Card, Button, Empty, TableWrap, Th, Td, Notice, fmt } from './ui.jsx';

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

/** Where the numbers came from, and a way to pull them again. */
function LiveBar({ live, onRefresh }) {
  const time = live.fetchedAt
    ? new Date(live.fetchedAt).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
    : null;
  const tone = {
    live: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    error: 'bg-red-50 border-red-200 text-red-900',
  }[live.status] || 'bg-slate-50 border-slate-200 text-slate-700';

  return (
    <div className={`flex flex-wrap items-center gap-3 border rounded-lg px-4 py-2.5 text-sm ${tone}`}>
      {live.status === 'live' ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
      <div className="flex-1 min-w-[16rem]">
        {live.status === 'live' && <><strong>Live from QuickBase Plant 9000</strong> · read {time}. SAP updates QuickBase around 11:00 and again between 22:00 and 23:00.</>}
        {live.status === 'not-configured' && <>Live QuickBase stock is not connected yet, so this shows the last uploaded export. Once the QuickBase token is added to the site, stock loads here automatically.</>}
        {live.status === 'error' && <><strong>Could not read live stock.</strong> {live.error} Showing the last stock loaded.</>}
        {live.status === 'idle' && <>Checking QuickBase for live stock…</>}
      </div>
      <Button variant="ghost" onClick={onRefresh} disabled={live.loading}>
        <RefreshCw className={`w-4 h-4 ${live.loading ? 'animate-spin' : ''}`} />{live.loading ? 'Checking…' : 'Refresh'}
      </Button>
    </div>
  );
}

export default function StockTab({ materials, sourceName, live = { status: 'idle' }, onRefresh }) {
  return (
    <div className="space-y-5">
      <LiveBar live={live} onRefresh={onRefresh} />
      <StockTable materials={materials} sourceName={sourceName} />
    </div>
  );
}

function StockTable({ materials, sourceName }) {
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

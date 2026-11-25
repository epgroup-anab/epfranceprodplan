import React, { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2, Trash2, Download } from 'lucide-react';
import { parseOrderSheet } from '../lib/parseOrders.js';
import { Card, Button, Notice } from './ui.jsx';

const EXAMPLE_URL = '/examples/Demand_projection_example.xlsx';

function DropZone({ title, hint, accept, onFile, busy, done, icon: Icon }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);

  const take = (file) => { if (file) onFile(file); };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files?.[0]); }}
      className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors
        ${over ? 'border-blue-500 bg-blue-50' : done ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-300 bg-white'}`}
    >
      {done
        ? <CheckCircle2 className="w-9 h-9 mx-auto text-emerald-500" />
        : <Icon className="w-9 h-9 mx-auto text-slate-400" />}
      <h3 className="mt-3 font-semibold text-slate-800">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{done || hint}</p>
      <input ref={input} type="file" accept={accept} className="hidden"
             onChange={(e) => { take(e.target.files?.[0]); e.target.value = ''; }} />
      <Button className="mt-4" onClick={() => input.current?.click()} disabled={busy}>
        <Upload className="w-4 h-4" />{busy ? 'Reading…' : done ? 'Replace file' : 'Choose file'}
      </Button>
    </div>
  );
}

export default function ImportTab({ orders, onOrders, onClear }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [warnings, setWarnings] = useState([]);

  async function handleOrders(file) {
    setBusy(true); setError(null); setWarnings([]);
    try {
      const { orders: parsed, warnings: w } = await parseOrderSheet(file);
      onOrders(parsed, file.name);
      setWarnings(w);
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  async function loadExample() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(EXAMPLE_URL);
      if (!res.ok) throw new Error(`the example file could not be downloaded (${res.status}).`);
      const blob = await res.blob();
      await handleOrders(new File([blob], 'Demand projection (example).xlsx'));
    } catch (e) { setError(e.message); setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <Card
        title="Import"
        subtitle="Load the demand projection. It is read in the browser — nothing is uploaded anywhere. Finished-goods stock comes in live from QuickBase and is subtracted from the forecast."
        right={orders.length
          ? <Button variant="danger" onClick={onClear}><Trash2 className="w-4 h-4" />Clear all data</Button>
          : null}
      >
        <div className="p-5 space-y-3">
          <DropZone
            icon={FileSpreadsheet}
            title="Demand Projection"
            hint="Sap Code, Desc and one column per month (November, December…) in cartons. Columns are matched by name, so extra columns are fine. The older John Poole order sheet still works too."
            accept=".csv,.xlsx,.xls"
            busy={busy}
            done={orders.length ? `${orders.length} orders loaded` : null}
            onFile={handleOrders}
          />
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-slate-500">
            <span>No file to hand?</span>
            <button onClick={loadExample} disabled={busy}
              className="font-medium text-blue-600 hover:underline disabled:text-slate-400">
              Load the example demand projection
            </button>
            <span className="text-slate-400">— the November & December sheet, 43 SAP codes.</span>
            <a href={EXAMPLE_URL} download className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800">
              <Download className="w-3.5 h-3.5" />download it
            </a>
          </div>
        </div>

        {(error || warnings.length > 0) && (
          <div className="px-5 pb-5 space-y-3">
            {error && <Notice tone="error"><strong>Could not read that file.</strong> {error}</Notice>}
            {warnings.length > 0 && (
              <Notice tone="warn">
                <strong>{warnings.length} thing{warnings.length > 1 ? 's' : ''} to check:</strong>
                <ul className="mt-1.5 list-disc list-inside space-y-0.5">
                  {warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </Notice>
            )}
          </div>
        )}
      </Card>

      <Card title="How the plan is built" subtitle="Worth knowing before you read the schedule.">
        <div className="p-5 grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm text-slate-600">
          <p><strong className="text-slate-800">Priority is a number, 1 to 5.</strong> 1 is Critical, 3 is Standard, 5 is Filler. Within the same number, whichever SKU has the fewest weeks of cover runs first.</p>
          <p><strong className="text-slate-800">Carrefour France (35627) always runs on MC-1.</strong> If demand is larger than MC-1 can make, the excess spills onto its other machines and the plan says so.</p>
          <p><strong className="text-slate-800">Every changeover costs one shift.</strong> Work is grouped by roll width first, then print colours, so there are as few changeovers as possible.</p>
          <p><strong className="text-slate-800">Plan covers the whole order book.</strong> It runs as many weeks as it takes to schedule every bag on the sheet.</p>
        </div>
      </Card>
    </div>
  );
}

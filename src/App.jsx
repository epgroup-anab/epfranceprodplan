import React, { useEffect, useState } from 'react';
import { Upload, ClipboardList, Package, Settings, BarChart3, HardDrive, HelpCircle } from 'lucide-react';
import ImportTab from './components/ImportTab.jsx';
import OrdersTab from './components/OrdersTab.jsx';
import StockTab from './components/StockTab.jsx';
import MachinesTab from './components/MachinesTab.jsx';
import PlanningTab from './components/PlanningTab.jsx';
import FaqTab from './components/FaqTab.jsx';
import { MACHINES } from './data/machines.js';
import { load, save, clear, clearAll, isEphemeral } from './lib/storage.js';
import { normalisePriority } from './lib/priority.js';
import { fmt } from './components/ui.jsx';

const TABS = [
  { id: 'import',   label: 'Import',   icon: Upload },
  { id: 'orders',   label: 'Orders',   icon: ClipboardList },
  { id: 'stock',    label: 'Stock',    icon: Package },
  { id: 'machines', label: 'Machines', icon: Settings },
  { id: 'planning', label: 'Planning', icon: BarChart3 },
  { id: 'faq',      label: 'FAQ',      icon: HelpCircle },
];

export default function App() {
  const [tab, setTab] = useState('import');
  const [orders, setOrders] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [plan, setPlan] = useState(null);
  const [sources, setSources] = useState({});

  // Restore whatever was here last time.
  useEffect(() => {
    setOrders(load('orders', []) || []);
    setMaterials(load('materials', []) || []);
    setPlan(load('plan', null));
    setSources(load('pps_sources', {}) || {});
  }, []);

  const handleOrders = (parsed, filename) => {
    setOrders(parsed); save('orders', parsed);
    const s = { ...sources, orders: filename }; setSources(s); save('pps_sources', s);
    setPlan(null); clear('plan');          // old plan no longer matches the orders
    setTab('orders');
  };

  const handleMaterials = (parsed, filename) => {
    setMaterials(parsed); save('materials', parsed);
    const s = { ...sources, materials: filename }; setSources(s); save('pps_sources', s);
    setTab('stock');
  };

  const handlePlan = (result) => { setPlan(result); save('plan', result); };
  const handleClearPlan = () => { setPlan(null); clear('plan'); };

  /**
   * A priority typed on the sheet is a starting point, not a fact. The value
   * from the file is kept alongside the override so it can always be restored.
   */
  const handlePriority = (sapCode, priority) => {
    const next = orders.map((o) => {
      if (String(o.sap_code) !== String(sapCode)) return o;
      const original = o.priority_original ?? o.priority;
      const level = normalisePriority(priority);
      return level === original
        ? { ...o, priority: original, priority_original: original, priority_source: 'sheet' }
        : { ...o, priority: level, priority_original: original, priority_source: 'manual' };
    });
    setOrders(next); save('orders', next);
  };

  const handleResetPriorities = () => {
    const next = orders.map((o) => (o.priority_original == null ? o
      : { ...o, priority: o.priority_original, priority_source: 'sheet' }));
    setOrders(next); save('orders', next);
  };

  const handleClearAll = () => {
    clearAll();
    setOrders([]); setMaterials([]); setPlan(null); setSources({});
    setTab('import');
  };

  return (
    <div className="min-h-full flex flex-col">
      <header className="bg-slate-900 text-white">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-semibold leading-none">Production Planner</h1>
              <p className="text-white/50 text-xs mt-1">France — Paper Bag Manufacturing</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-white/60">
            <span className="hidden sm:inline-flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5" />
              {isEphemeral() ? 'Session only — storage unavailable' : 'Saved in this browser'}
            </span>
            <span className="tabular-nums">
              {fmt(orders.length)} orders · {fmt(materials.length)} materials · {MACHINES.length} machines
            </span>
          </div>
        </div>

        <nav className="max-w-[1600px] mx-auto px-6 flex gap-1 overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors
                ${tab === id ? 'text-white border-white' : 'text-white/55 border-transparent hover:text-white/85'}`}>
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 max-w-[1600px] w-full mx-auto px-6 py-6">
        {tab === 'import' && (
          <ImportTab orders={orders} materials={materials}
            onOrders={handleOrders} onMaterials={handleMaterials} onClear={handleClearAll} />
        )}
        {tab === 'orders'   && (
          <OrdersTab orders={orders} sourceName={sources.orders}
            onPriority={handlePriority} onResetPriorities={handleResetPriorities} />
        )}
        {tab === 'stock'    && <StockTab materials={materials} sourceName={sources.materials} />}
        {tab === 'machines' && <MachinesTab machines={MACHINES} />}
        {tab === 'planning' && (
          <PlanningTab orders={orders} machines={MACHINES} plan={plan}
            onPlan={handlePlan} onClear={handleClearPlan} />
        )}
        {tab === 'faq'      && <FaqTab machines={MACHINES} orders={orders} />}
      </main>
    </div>
  );
}

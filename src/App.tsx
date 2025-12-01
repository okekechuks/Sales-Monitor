// Lightweight error boundary to prevent chart crashes blanking the app
function ChartErrorBoundary({ children }: { children: React.ReactNode }) {
  const [error, setError] = React.useState<Error | null>(null);
  const reset = () => setError(null);
  // Minimal class-based boundary via inline component
  const Boundary = React.useMemo(() => {
    return class Boundary extends React.Component<{ onError: (e: Error)=>void; children: React.ReactNode }> {
      componentDidCatch(err: Error) { this.props.onError(err); }
      render() { return this.props.children; }
    };
  }, []);
  if (error) {
    return (
      <div className="p-6 text-center">
        <div className="inline-block rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Chart failed to render. Try again.
        </div>
        <div className="mt-3">
          <button onClick={reset} className="px-3 py-1.5 rounded-md bg-indigo-600 text-white text-sm">Reload Chart</button>
        </div>
      </div>
    );
  }
  // @ts-ignore JSX runtime class component usage
  return <Boundary onError={setError}>{children}</Boundary>;
}
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend, ResponsiveContainer } from 'recharts';
import { DollarSign, TrendingUp, BarChart as BarChartIcon, Clock, PlusSquare, Settings, Store, CreditCard, Search, ChevronDown, List, Plus, User, Trash, Pencil, CheckCircle2, XCircle } from 'lucide-react';
// (merged into single import above)
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, updateDoc, collection, onSnapshot, increment, deleteDoc, query, where, getDocs, writeBatch } from 'firebase/firestore';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Month options without year per new requirement (January ... December)
const MONTH_ONLY_OPTIONS = MONTH_NAMES.map(m => ({ value: m, label: m }));

interface MonthlySale { month: string; revenue: number; }
interface Transaction {
  id: string;
  storeId: string;
  senderName: string;
  simCardsSold: number;
  paymentAmount: number;
  status: 'Completed' | 'Pending' | 'Canceled';
  createdAt: string;
  transactionMonth: string;
  remark: string;
  receiptCollectionDate?: string; // ISO 'YYYY-MM-DD'
  clearance?: 'CLEARED' | 'NOT_CLEARED';
}
interface StoreData {
  id: string;
  name: string;
  owner: string;
  email: string;
  location: string;
  totalRevenue: number;
  entries: number;
  createdAt?: string;
}
interface KpiData {
  title: string;
  value: string;
  change: string;
  icon: React.ReactNode;
  color: string;
  trend: 'up' | 'down';
}

type View = 'stores' | 'addStore' | 'payments' | 'settings' | 'visual';

const formatNaira = (amount: number, formatType: 'full' | 'short') => {
  if (formatType === 'full') {
    return amount.toLocaleString('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 });
  }
  return `₦${(amount / 1_000_000).toFixed(1)}M`;
};

const MOCK_MONTHLY_SALES: MonthlySale[] = [
  { month: 'Jan', revenue: 12000000 },
  { month: 'Feb', revenue: 19000000 },
  { month: 'Mar', revenue: 15000000 },
  { month: 'Apr', revenue: 25000000 },
  { month: 'May', revenue: 22000000 },
  { month: 'Jun', revenue: 30000000 }
];

const KpiCard: React.FC<{ data: KpiData }> = ({ data }) => {
  const trendColor = data.trend === 'up' ? 'text-green-500' : 'text-red-500';
  const iconBg = `bg-${data.color}-100 text-${data.color}-600`;
  return (
    <div className="bg-white p-6 rounded-xl shadow-lg transition duration-300 hover:shadow-xl border border-gray-100">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">{data.title}</h3>
        <div className={`p-3 rounded-full ${iconBg}`}>{data.icon}</div>
      </div>
      <div className="mt-4">
        <p className="text-3xl font-bold text-gray-900">{data.value}</p>
        <p className={`text-sm mt-1 flex items-center ${trendColor}`}>
          <TrendingUp className={`w-4 h-4 mr-1 ${data.trend === 'down' ? 'rotate-180' : ''}`} />
          {data.change} vs last month
        </p>
      </div>
    </div>
  );
};

const SalesChart: React.FC<{ data: MonthlySale[] }> = ({ data }) => (
  <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 h-96">
    <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
      <BarChartIcon className="w-5 h-5 mr-2 text-indigo-500" />
      Monthly Revenue Trend
    </h2>
    <ResponsiveContainer width="100%" height="85%">
      <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="month" stroke="#6b7280" />
        <YAxis stroke="#6b7280" tickFormatter={(value) => formatNaira(value as number, 'short')} />
        <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '8px' }} formatter={(value: number) => [formatNaira(value, 'full'), 'Revenue']} labelStyle={{ fontWeight: 'bold', color: '#1f2937' }} />
        <Bar dataKey="revenue" fill="#4f46e5" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  </div>
);

const StoreDetailRow: React.FC<{ store: StoreData; onDelete: (store: StoreData) => void; onEditLocation: (store: StoreData) => void }> = ({ store, onDelete, onEditLocation }) => (
  <div className="flex items-center justify-between p-3 border-b border-gray-100 hover:bg-indigo-50 transition duration-100 text-sm md:text-base">
    <div className="flex items-center gap-3 w-1/3">
      <button title="Delete store" onClick={() => onDelete(store)} className="shrink-0 w-6 h-6 rounded-md bg-red-600 text-white flex items-center justify-center hover:bg-red-700">
        <Trash className="w-4 h-4" />
      </button>
      <span className="font-medium text-gray-800 truncate">{store.name}</span>
      <button title="Edit location" onClick={() => onEditLocation(store)} className="shrink-0 w-6 h-6 rounded-md bg-gray-200 text-gray-700 flex items-center justify-center hover:bg-gray-300">
        <Pencil className="w-3.5 h-3.5" />
      </button>
    </div>
    <div className="w-1/3 text-gray-600 hidden sm:block truncate">{store.owner}</div>
    <div className="w-1/3 text-right font-semibold text-green-700">{formatNaira(store.totalRevenue, 'full')}</div>
  </div>
);

const StoreAccordion: React.FC<{ store: StoreData; isExpanded: boolean; onToggle: () => void; onDelete: (store: StoreData) => void; onEditLocation: (store: StoreData) => void; transactions?: Transaction[]; db?: any; isAuthReady?: boolean; appId?: string }> = ({ store, isExpanded, onToggle, onDelete, onEditLocation, transactions = [], db, isAuthReady, appId }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [localTx, setLocalTx] = useState<Transaction[]>(transactions);
  const [editFields, setEditFields] = useState<{ senderName: string; simCardsSold: string; paymentAmount: string; clearance: 'CLEARED' | 'NOT_CLEARED' }>(
    { senderName: '', simCardsSold: '', paymentAmount: '', clearance: 'NOT_CLEARED' }
  );
  const [saving, setSaving] = useState(false);
  const savedEditsRef = React.useRef<Record<string, { senderName: string; simCardsSold: number; paymentAmount: number; clearance?: 'CLEARED' | 'NOT_CLEARED' }>>({});
  // Always derive revenue from current transaction list (includes pending & optimistic edits)
  const computedRevenue = useMemo(() => {
    return localTx.reduce((sum, t) => sum + (typeof t.paymentAmount === 'number' ? t.paymentAmount : 0), 0);
  }, [localTx]);

  const handleRenameStore = async () => {
    const newName = window.prompt('Enter new store name', store.name);
    if (!newName) return;
    const trimmed = newName.trim();
    if (!trimmed || trimmed === store.name) return;
    // Local pending store rename
    if (store.id.startsWith('local-')) {
      try {
        const raw = localStorage.getItem('pending_stores');
        const list = raw ? JSON.parse(raw) : [];
        if (Array.isArray(list)) {
          const next = list.map((s: any) => s.id === store.id ? { ...s, name: trimmed } : s);
          localStorage.setItem('pending_stores', JSON.stringify(next));
          window.dispatchEvent(new Event('pendingStoresUpdated'));
        }
      } catch (err) {
        console.error('Failed to rename local store:', err);
        alert('Could not rename local store.');
      }
      return;
    }
    // Remote rename
    try {
      if (db && isAuthReady && appId) {
        const storeRef = doc(db, 'artifacts', appId, 'public', 'data', 'stores', store.id);
        await updateDoc(storeRef, { name: trimmed });
      } else {
        alert('Database not connected yet; cannot rename store.');
      }
    } catch (err) {
      console.error('Failed to rename store:', err);
      alert('Failed to rename store.');
    }
  };

  const deleteTransaction = async (t: Transaction) => {
    const ok = window.confirm(`Delete ${t.transactionMonth} entry for this store?`);
    if (!ok) return;
    // If it's a pending local transaction (id starts with local-pay- or exists only in pending list), remove from localStorage
    try {
      const raw = localStorage.getItem('pending_payments');
      const list = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list)) {
        const existsPending = list.some((p: any) => p.id === t.id || (p.storeId === t.storeId && p.transactionMonth === t.transactionMonth));
        if (existsPending) {
          const next = list.filter((p: any) => !(p.id === t.id || (p.storeId === t.storeId && p.transactionMonth === t.transactionMonth)));
          localStorage.setItem('pending_payments', JSON.stringify(next));
          window.dispatchEvent(new Event('pendingPaymentsUpdated'));
          setLocalTx(prev => prev.filter(x => x.id !== t.id));
          return;
        }
      }
    } catch {}
    // Remote deletion
    if (!db || !isAuthReady || !appId) {
      alert('Database not connected; cannot delete remote entry.');
      return;
    }
    try {
      const txRef = doc(db, 'artifacts', appId, 'public', 'data', 'transactions', t.id);
      await deleteDoc(txRef);
      // Decrement store revenue and entries
      const storeRef = doc(db, 'artifacts', appId, 'public', 'data', 'stores', t.storeId);
      await updateDoc(storeRef, { totalRevenue: increment(-(t.paymentAmount || 0)), entries: increment(-1) });
      setLocalTx(prev => prev.filter(x => x.id !== t.id));
    } catch (err) {
      console.error('Failed to delete transaction:', err);
      alert('Failed to delete entry.');
    }
  };
  useEffect(() => {
    // Build base list with possible saved overrides (ensures immediate reflection until snapshot updates)
    if (editingId) {
      const updated = transactions.find(t => t.id === editingId);
      if (updated) {
        const override = savedEditsRef.current[editingId];
        const merged = override ? { ...updated, ...override } : updated;
        setLocalTx(prev => prev.map(p => p.id === editingId ? merged : p));
        setEditFields({ senderName: merged.senderName, simCardsSold: String(merged.simCardsSold), paymentAmount: String(merged.paymentAmount), clearance: (merged.clearance || 'NOT_CLEARED') as 'CLEARED' | 'NOT_CLEARED' });
      }
      return;
    }
    const withOverrides = transactions.map(t => {
      const ov = savedEditsRef.current[t.id];
      return ov ? { ...t, ...ov } : t;
    });
    setLocalTx(withOverrides);
    // Clean overrides that match remote snapshot
    Object.keys(savedEditsRef.current).forEach(id => {
      const remote = transactions.find(t => t.id === id);
      const ov = savedEditsRef.current[id];
      if (remote && ov && remote.senderName === ov.senderName && remote.simCardsSold === ov.simCardsSold && remote.paymentAmount === ov.paymentAmount && (ov.clearance === undefined || ov.clearance === remote.clearance)) {
        delete savedEditsRef.current[id];
      }
    });
  }, [transactions, editingId]);
  const startEdit = (t: Transaction) => { setEditingId(t.id); setEditFields({ senderName: t.senderName, simCardsSold: String(t.simCardsSold), paymentAmount: String(t.paymentAmount), clearance: (t.clearance || 'NOT_CLEARED') as 'CLEARED' | 'NOT_CLEARED' }); };
  const cancelEdit = () => { setEditingId(null); setSaving(false); };
  const saveEdit = async () => {
    if (!editingId) return;
    const tx = localTx.find(t => t.id === editingId);
    if (!tx) return;
    const senderName = editFields.senderName.trim();
    const simCardsSold = parseInt(editFields.simCardsSold, 10);
    const paymentAmount = parseFloat(editFields.paymentAmount);
    const clearance = editFields.clearance;
    if (!senderName || isNaN(simCardsSold) || simCardsSold < 0 || isNaN(paymentAmount) || paymentAmount < 0) { alert('Invalid values'); return; }
    // Offline or DB not ready: queue edit into pending_payments (will sync later)
    if (!db || !isAuthReady || !appId) {
      try {
        const raw = localStorage.getItem('pending_payments');
        const list = raw ? JSON.parse(raw) : [];
        let arr = Array.isArray(list) ? list : [];
        // Find existing pending entry by id OR by unique (storeId + transactionMonth)
        const idx = arr.findIndex((p: any) => p.id === tx.id || (p.storeId === tx.storeId && p.transactionMonth === tx.transactionMonth));
        const updated = { ...tx, senderName, simCardsSold, paymentAmount, clearance };
        if (idx >= 0) arr[idx] = { ...arr[idx], senderName, simCardsSold, paymentAmount, clearance };
        else arr.push(updated);
        localStorage.setItem('pending_payments', JSON.stringify(arr));
        // Optimistically adjust store revenue locally so UI reflects change immediately
        try {
          const delta = paymentAmount - tx.paymentAmount;
          if (delta !== 0) {
            // Mutate store object (optimistic). Parent re-render will reconcile after sync.
            (store as any).totalRevenue = (store.totalRevenue || 0) + delta;
          }
        } catch (revErr) {
          console.warn('Failed local revenue adjust (offline edit):', revErr);
        }
        // Persist override until snapshot reflects
        savedEditsRef.current[tx.id] = { senderName, simCardsSold, paymentAmount, clearance };
        const overridesRaw = localStorage.getItem('edit_overrides');
        const overrides = overridesRaw ? JSON.parse(overridesRaw) : {};
        overrides[tx.id] = { senderName, simCardsSold, paymentAmount, clearance };
        localStorage.setItem('edit_overrides', JSON.stringify(overrides));
        setLocalTx(prev => prev.map(p => p.id === tx.id ? { ...p, senderName, simCardsSold, paymentAmount, clearance } : p));
        window.dispatchEvent(new Event('pendingPaymentsUpdated'));
        cancelEdit();
      } catch (offlineErr) {
        console.error('Failed to queue edit offline:', offlineErr);
        alert('Could not save edit offline.');
      }
      return;
    }
    setSaving(true);
    try {
      const txRef = doc(db, 'artifacts', appId, 'public', 'data', 'transactions', tx.id);
      await updateDoc(txRef, { senderName, simCardsSold, paymentAmount, clearance });
      const delta = paymentAmount - tx.paymentAmount;
      if (delta !== 0) {
        const storeRef = doc(db, 'artifacts', appId, 'public', 'data', 'stores', tx.storeId);
        await updateDoc(storeRef, { totalRevenue: increment(delta) });
      }
      // Save override until snapshot reflects
      savedEditsRef.current[tx.id] = { senderName, simCardsSold, paymentAmount, clearance };
      const overridesRaw = localStorage.getItem('edit_overrides');
      const overrides = overridesRaw ? JSON.parse(overridesRaw) : {};
      overrides[tx.id] = { senderName, simCardsSold, paymentAmount, clearance };
      localStorage.setItem('edit_overrides', JSON.stringify(overrides));
      setLocalTx(prev => prev.map(p => p.id === tx.id ? { ...p, senderName, simCardsSold, paymentAmount, clearance } : p));
      // Dispatch optimistic edit event so parent can reflect immediately before snapshot returns
      window.dispatchEvent(new CustomEvent('optimisticTxEdit', { detail: { id: tx.id, storeId: tx.storeId, senderName, simCardsSold, paymentAmount, clearance } }));
      cancelEdit();
    } catch (err) {
      console.error('Failed to save edit:', err);
      alert('Failed to save changes.');
      setSaving(false);
    }
  };
  return (
    <div className="mb-2 rounded-xl border border-gray-200 overflow-hidden shadow-sm transition-shadow hover:shadow-md animate-fade-in">
      <div className="flex items-center justify-between w-full p-4 bg-white">
        <div className="flex items-center gap-3">
          <button title="Delete store" onClick={() => onDelete(store)} className="shrink-0 w-6 h-6 rounded-md bg-red-600 text-white flex items-center justify-center hover:bg-red-700">
            <Trash className="w-4 h-4" />
          </button>
          <button title="Rename store" onClick={handleRenameStore} className="shrink-0 w-6 h-6 rounded-md bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700">
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={onToggle} className="text-left">
            <span className="text-lg font-semibold text-gray-800">{store.name}</span>
          </button>
        </div>
        <button onClick={onToggle} className="p-1">
          <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform duration-300 ${isExpanded ? 'rotate-180' : 'rotate-0'}`} />
        </button>
      </div>
      {isExpanded && (
        <div className="bg-gray-50 p-4 space-y-4 animate-slide-down">
          <div className="grid grid-cols-1 gap-4 text-sm">
            <div className="text-right sm:text-left">
              <div className="text-gray-500 uppercase">Revenue</div>
              <div className="text-green-700 font-semibold">{formatNaira(computedRevenue, 'full')}</div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Payments by Month</div>
            <div className="divide-y">
              {localTx.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-500">No payments logged yet.</div>
              ) : (
                localTx.map((t) => (
                  <div key={t.id} className={`px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between text-sm gap-3 transition-colors ${t.clearance === 'CLEARED' ? 'hover:bg-green-50 hover:ring-1 hover:ring-green-200' : t.clearance === 'NOT_CLEARED' ? 'hover:bg-red-50 hover:ring-1 hover:ring-red-200' : 'hover:bg-gray-50'}`}>
                    {editingId === t.id ? (
                      <div className="w-full space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <div className="flex-1 min-w-[140px]">
                            <label className="text-[11px] uppercase tracking-wide text-gray-500">Sender</label>
                            <input value={editFields.senderName} onChange={(e) => setEditFields(f => ({ ...f, senderName: e.target.value }))} className="w-full px-2 py-1 border rounded-md text-xs" />
                          </div>
                          <div className="w-24">
                            <label className="text-[11px] uppercase tracking-wide text-gray-500">SIMs</label>
                            <input type="number" min={0} value={editFields.simCardsSold} onChange={(e) => setEditFields(f => ({ ...f, simCardsSold: e.target.value }))} className="w-full px-2 py-1 border rounded-md text-xs" />
                          </div>
                          <div className="flex-1 min-w-[120px]">
                            <label className="text-[11px] uppercase tracking-wide text-gray-500">Amount (₦)</label>
                            <input type="number" min={0} value={editFields.paymentAmount} onChange={(e) => setEditFields(f => ({ ...f, paymentAmount: e.target.value }))} className="w-full px-2 py-1 border rounded-md text-xs" />
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-4">
                            <label className="inline-flex items-center gap-2 text-[11px] text-gray-700">
                              <input type="radio" name={`clearance-${t.id}`} value="CLEARED" checked={editFields.clearance === 'CLEARED'} onChange={(e)=> setEditFields(f=> ({...f, clearance: 'CLEARED'}))} />
                              CLEARED
                            </label>
                            <label className="inline-flex items-center gap-2 text-[11px] text-gray-700">
                              <input type="radio" name={`clearance-${t.id}`} value="NOT_CLEARED" checked={editFields.clearance === 'NOT_CLEARED'} onChange={(e)=> setEditFields(f=> ({...f, clearance: 'NOT_CLEARED'}))} />
                              NOT CLEARED
                            </label>
                          </div>
                          <div className="flex items-center gap-2">
                          <button onClick={cancelEdit} type="button" className="px-2 py-1 text-xs rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300 transition">Cancel</button>
                          <button disabled={saving} onClick={saveEdit} type="button" className={`px-2 py-1 text-xs rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition ${saving ? 'opacity-70' : ''}`}>{saving ? 'Saving...' : 'Save'}</button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1">
                          <div className="font-medium text-gray-800">{t.transactionMonth}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[11px]"><User className="w-3.5 h-3.5" />{t.senderName}</span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-[11px]"><PlusSquare className="w-3.5 h-3.5" />{t.simCardsSold} SIMs</span>
                            {t.remark && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px]">{t.remark}</span>
                            )}
                            {t.receiptCollectionDate && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[11px]">Receipt: {t.receiptCollectionDate}</span>
                            )}
                            {t.clearance && (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] ${t.clearance === 'CLEARED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {t.clearance === 'CLEARED' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                                {t.clearance === 'CLEARED' ? 'CLEARED' : 'NOT CLEARED'}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className={`font-semibold text-green-700`}>{formatNaira(t.paymentAmount, 'full')}</div>
                          <button onClick={() => startEdit(t)} className="px-2 py-1 text-xs rounded-md bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition">Edit</button>
                          <button onClick={() => deleteTransaction(t)} className="px-2 py-1 text-xs rounded-md bg-red-100 text-red-700 hover:bg-red-200 transition">Delete</button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StoresListView: React.FC<{ stores: StoreData[]; db?: any; isAuthReady?: boolean; appId?: string; transactionsByStore?: Record<string, Transaction[]> }> = ({ stores, db, isAuthReady, appId, transactionsByStore = {} }) => {
  const [searchText, setSearchText] = useState('');
  const [expandedStoreId, setExpandedStoreId] = useState<string | null>(null);
  const [filterMonth, setFilterMonth] = useState('all');
  const MONTH_OPTIONS = MONTH_ONLY_OPTIONS;

  useEffect(() => {
    const toExpand = localStorage.getItem('expand_location');
    if (toExpand) {
      localStorage.removeItem('expand_location');
    }
  }, []);

  useEffect(() => {
    const storeId = localStorage.getItem('expand_store_id');
    if (storeId) {
      setExpandedStoreId(storeId);
      localStorage.removeItem('expand_store_id');
    }
  }, []);

  const filteredStores = useMemo(() => {
    return stores.filter((store) =>
      store.name.toLowerCase().includes(searchText.toLowerCase()) ||
      store.owner.toLowerCase().includes(searchText.toLowerCase()) ||
      store.email.toLowerCase().includes(searchText.toLowerCase()) ||
      store.location.toLowerCase().includes(searchText.toLowerCase())
    );
  }, [searchText, stores]);

  const monthFilteredTxByStore = useMemo(() => {
    if (!transactionsByStore) return {} as Record<string, Transaction[]>;
    if (filterMonth === 'all') return transactionsByStore;
    const mf: Record<string, Transaction[]> = {};
    Object.keys(transactionsByStore).forEach((storeId) => {
      mf[storeId] = (transactionsByStore[storeId] || []).filter((tx) => tx.transactionMonth === filterMonth);
    });
    return mf;
  }, [transactionsByStore, filterMonth]);

  const toggleStore = (id: string) => setExpandedStoreId((prev) => (prev === id ? null : id));

  const handleDeleteStore = async (store: StoreData) => {
    const ok = window.confirm(`Delete store "${store.name}"? This cannot be undone.`);
    if (!ok) return;
    try {
      const isLocal = store.id.startsWith('local-');
      if (isLocal) {
        const raw = localStorage.getItem('pending_stores');
        const list = raw ? JSON.parse(raw) : [];
        const next = Array.isArray(list) ? list.filter((s: any) => s.id !== store.id) : [];
        localStorage.setItem('pending_stores', JSON.stringify(next));
        window.dispatchEvent(new Event('pendingStoresUpdated'));
        return;
      }
      if (db && isAuthReady && appId) {
        const storeRef = doc(db, 'artifacts', appId, 'public', 'data', 'stores', store.id);
        await deleteDoc(storeRef);
      } else {
        alert('Failed to delete store. See console for details.');
      }
    } catch (err) {
      console.error('Failed to delete store:', err);
      alert('Failed to delete store. See console for details.');
    }
  };

  const handleEditLocation = async (store: StoreData) => {
    const newLoc = window.prompt('Enter store location', store.location || '');
    if (!newLoc) return;
    try {
      const trimmed = newLoc.trim();
      if (!trimmed) return;
      const isLocal = store.id.startsWith('local-');
      if (isLocal) {
        const raw = localStorage.getItem('pending_stores');
        const list = raw ? JSON.parse(raw) : [];
        const next = Array.isArray(list) ? list.map((s: any) => (s.id === store.id ? { ...s, location: trimmed } : s)) : [];
        localStorage.setItem('pending_stores', JSON.stringify(next));
        window.dispatchEvent(new Event('pendingStoresUpdated'));
        return;
      }
      if (db && isAuthReady && appId) {
        const storeRef = doc(db, 'artifacts', appId, 'public', 'data', 'stores', store.id);
        await updateDoc(storeRef, { location: trimmed });
      } else {
        alert('Database not connected. Cannot update location now.');
      }
    } catch (err) {
      console.error('Failed to update location:', err);
      alert('Failed to update location. See console for details.');
    }
  };

  return (
    <div className="p-4 sm:p-8">
      <header className="mb-6">
        <h1 className="text-3xl font-extrabold text-gray-900 border-b pb-2 border-indigo-100 flex items-center">
          <List className="w-7 h-7 mr-3 text-indigo-600" />
          Stores
        </h1>
      </header>
      <div className="bg-white p-4 rounded-xl shadow-lg border border-gray-100 mb-6 flex flex-col md:flex-row gap-4 items-center">
        <div className="relative w-full md:flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input type="text" placeholder="Search companies, owners, address, email..." value={searchText} onChange={(e) => setSearchText(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" />
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white cursor-pointer">
            <option value="all">Filter: All Months</option>
            {MONTH_OPTIONS.map((month) => (
              <option key={month.value} value={month.value}>{month.label}</option>
            ))}
          </select>
          <select className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white cursor-pointer">
            <option value="newest">Sort: Newest first</option>
            <option value="revenue">Sort: Revenue (High)</option>
          </select>
        </div>
      </div>
      <div className="space-y-3">
        {filteredStores.length > 0 ? (
          filteredStores.map((store) => (
            <StoreAccordion
              key={store.id}
              store={store}
              isExpanded={expandedStoreId === store.id}
              onToggle={() => toggleStore(store.id)}
              onDelete={handleDeleteStore}
              onEditLocation={handleEditLocation}
              transactions={monthFilteredTxByStore[store.id] || []}
              db={db}
              isAuthReady={isAuthReady}
              appId={appId}
            />
          ))
        ) : (
          <div className="text-center p-12 bg-white rounded-xl shadow-lg border border-gray-100 text-gray-500">
            {searchText ? `No stores found matching "${searchText}".` : 'No stores have been added yet.'}
          </div>
        )}
      </div>
    </div>
  );
};

const AddStoreView: React.FC<{ db: any; isAuthReady: boolean; setView: (view: View) => void }> = ({ db, isAuthReady, setView }) => {
  const [storeData, setStoreData] = useState({ name: '' });
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | ''; text: string }>({ type: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => setStoreData({ ...storeData, [e.target.name]: e.target.value });

  const handleAddStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeData.name.trim()) {
      setStatusMessage({ type: 'error', text: 'Please enter the store name.' });
      return;
    }
    setIsLoading(true);
    setStatusMessage({ type: '', text: '' });
    try {
      if (!isAuthReady || !db) {
        const pendingRaw = localStorage.getItem('pending_stores');
        const pendingList = pendingRaw ? JSON.parse(pendingRaw) : [];
        const offlineStore = {
          name: storeData.name,
          owner: 'N/A (Quick Entry)',
          email: '',
          location: 'Quick Entry',
          totalRevenue: 0,
          entries: 0,
          createdAt: new Date().toISOString(),
          id: `local-${Date.now()}`,
          offline: true
        };
        localStorage.setItem('pending_stores', JSON.stringify([...pendingList, offlineStore]));
        setStatusMessage({ type: 'success', text: `Saved locally. Will sync when connected.` });
        setStoreData({ name: '' });
        // Inform App to refresh displayed list and navigate to Stores view
        window.dispatchEvent(new Event('pendingStoresUpdated'));
        localStorage.setItem('expand_store_id', offlineStore.id);
        setTimeout(() => setView('stores'), 400);
        setIsLoading(false);
        return;
      }
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
      const storeCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'stores');
      const newStoreRef = doc(storeCollectionRef);
      await setDoc(newStoreRef, {
        name: storeData.name,
        owner: 'N/A (Quick Entry)',
        email: '',
        location: 'Quick Entry',
        totalRevenue: 0,
        entries: 0,
        createdAt: new Date().toISOString(),
        id: newStoreRef.id
      });
      setStatusMessage({ type: 'success', text: `Store "${storeData.name}" added successfully! Redirecting...` });
      setTimeout(() => {
        setStoreData({ name: '' });
        localStorage.setItem('expand_store_id', newStoreRef.id);
        setView('stores');
      }, 1500);
    } catch (error) {
      console.error('Error adding document: ', error);
      setStatusMessage({ type: 'error', text: 'Failed to add store. Check console for details.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-3xl font-extrabold text-gray-900 mb-6 border-b pb-2 border-red-100 flex items-center">
        <Plus className="w-7 h-7 mr-3 text-red-600" />
        Register New Store (Quick Entry)
      </h1>
      <form onSubmit={handleAddStore} className="bg-white p-6 md:p-8 rounded-xl shadow-lg border border-gray-100 max-w-2xl mx-auto space-y-6">
        {statusMessage.text && (
          <div className={`p-4 rounded-lg text-sm font-medium ${statusMessage.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{statusMessage.text}</div>
        )}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 flex items-center mb-1">
            <Store className="w-4 h-4 mr-2 text-indigo-500" /> Store Name
          </label>
          <input id="name" name="name" type="text" value={storeData.name} onChange={handleChange} required placeholder="e.g., Abuja Central Kiosk" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" />
        </div>
        <button type="submit" className={`w-full flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg shadow-sm text-white bg-red-600 hover:bg-red-700 transition duration-150 ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`} disabled={isLoading}>
          {isLoading ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              Saving Store...
            </>
          ) : (
            <>
              <Plus className="w-5 h-5 mr-2" />
              Register Store
            </>
          )}
        </button>
        {false && <p className="text-center text-sm text-gray-500 mt-2">Connecting to database...</p>}
      </form>
    </div>
  );
};

const StoresDashboardView: React.FC<{ stores: StoreData[]; db?: any; isAuthReady?: boolean; appId?: string; transactionsByStore?: Record<string, Transaction[]> }> = ({ stores, db, isAuthReady, appId, transactionsByStore }) => <StoresListView stores={stores} db={db} isAuthReady={isAuthReady} appId={appId} transactionsByStore={transactionsByStore} />;

const VisualView: React.FC<{ stores: StoreData[]; transactionsByStore: Record<string, Transaction[]> }> = ({ stores, transactionsByStore }) => {
  const [chartType, setChartType] = useState<'pie'|'donut'|'bar'>('pie');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [topN, setTopN] = useState<number>(10);
  const MONTH_OPTIONS = MONTH_ONLY_OPTIONS;

  const { data, leastData } = useMemo(() => {
    const out: { name: string; value: number }[] = [];
    for (const s of stores) {
      let tx = transactionsByStore[s.id] || [];
      if (monthFilter !== 'all') {
        tx = tx.filter(t => t.transactionMonth === monthFilter);
      }
      const sum = tx.reduce((acc, t) => acc + (typeof t.paymentAmount === 'number' ? t.paymentAmount : 0), 0);
      out.push({ name: s.name, value: sum });
    }
    out.sort((a,b)=> b.value - a.value);
    const top = out.slice(0, topN);
    const least = out.slice(-topN).reverse();
    return { data: top, leastData: least };
  }, [stores, transactionsByStore, monthFilter, topN]);

  const total = data.reduce((a,b)=> a + b.value, 0) || 1;

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-3xl font-extrabold text-gray-900 border-b pb-2 border-indigo-100 flex items-center">
          <BarChartIcon className="w-7 h-7 mr-3 text-indigo-600" />
          View Visual
        </h1>
        <p className="text-gray-500 mt-1">Top stores by revenue. Switch chart types.</p>
      </header>
      <div className="bg-white p-4 rounded-xl shadow-lg border border-gray-100 mb-6 flex flex-wrap items-center gap-3">
        <span className="text-sm text-gray-600">Chart type</span>
        <div className="inline-flex rounded-md shadow-sm overflow-hidden">
          <button onClick={()=>setChartType('pie')} className={`px-3 py-1 text-sm ${chartType==='pie'?'bg-indigo-600 text-white':'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>Pie</button>
          <button onClick={()=>setChartType('donut')} className={`px-3 py-1 text-sm ${chartType==='donut'?'bg-indigo-600 text-white':'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>Donut</button>
          <button onClick={()=>setChartType('bar')} className={`px-3 py-1 text-sm ${chartType==='bar'?'bg-indigo-600 text-white':'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>Bar</button>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <label className="text-sm text-gray-600">Month</label>
          <select value={monthFilter} onChange={(e)=> setMonthFilter(e.target.value)} className="px-3 py-1 border rounded-md text-sm">
            <option value="all">All</option>
            {MONTH_OPTIONS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <label className="text-sm text-gray-600">Top</label>
          <select value={topN} onChange={(e)=> setTopN(parseInt(e.target.value,10))} className="px-3 py-1 border rounded-md text-sm">
            {[5,10,15,20].map(n => (<option key={n} value={n}>{n}</option>))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-lg border border-gray-100">
          {data.length === 0 ? (
            <div className="text-center text-gray-500">No revenue data available.</div>
          ) : chartType === 'bar' ? (
            <ResponsiveContainer width="100%" height={380}>
              <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#6b7280', fontSize: 12 }}
                  interval={0}
                  angle={-20}
                  dy={24}
                  tickFormatter={(name: string) => name.length > 18 ? name.slice(0, 18) + '…' : name}
                />
                <YAxis tick={{ fill: '#6b7280' }} tickFormatter={(v)=> formatNaira(Number(v),'short')} />
                <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }} formatter={(v:any, _name:any, props:any)=> [formatNaira(Number(v),'full'), props?.payload?.name || 'Revenue'] } />
                <Legend verticalAlign="bottom" wrapperStyle={{ color: '#374151' }} />
                <Bar dataKey="value" maxBarSize={56} radius={[6,6,0,0]}>
                  <LabelList
                    dataKey="value"
                    position="top"
                    content={(props: any) => {
                      const n = typeof props.value === 'number' ? props.value : Number(props.value ?? 0);
                      if (!isFinite(n) || n <= 0) return null;
                      const x = props.x as number;
                      const y = props.y as number;
                      return (
                        <text x={x} y={y} dy={-6} textAnchor="middle" fill="#374151" fontSize={12}>
                          {formatNaira(n,'short')}
                        </text>
                      );
                    }}
                  />
                  {data.map((_d, i) => (
                    <Cell key={`bar-${i}`} fill={["#4f46e5","#22c55e","#ef4444","#f59e0b","#06b6d4","#a855f7","#64748b","#14b8a6","#f97316","#84cc16"][i % 10]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={chartType==='donut' ? 140 : 160}
                  innerRadius={chartType==='donut' ? 80 : 0}
                  paddingAngle={2}
                  labelLine
                  label={({ name, percent }: { name: string; percent: number }) => {
                    const pct = Math.round(percent * 100);
                    if (pct < 4) return '';
                    const shortName = name.length > 20 ? name.slice(0, 20) + '…' : name;
                    return `${shortName} (${pct}%)`;
                  }}
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={["#4f46e5","#22c55e","#ef4444","#f59e0b","#06b6d4","#a855f7","#64748b","#14b8a6","#f97316","#84cc16"][index % 10]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }} formatter={(v:any, _name:any, props:any)=> [formatNaira(Number(v),'full'), props?.payload?.name || 'Revenue'] } />
                <Legend verticalAlign="bottom" wrapperStyle={{ color: '#374151' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
            <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <span>Top Stores {monthFilter!=='all' ? `(${monthFilter})` : ''}</span>
              <TrendingUp className="w-4 h-4 text-green-600" />
            </h3>
            <ul className="space-y-2">
              {data.map((d, i) => (
                <li key={`top-${i}`} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 truncate max-w-[60%]">{i+1}. {d.name}</span>
                  <span className="inline-flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-xs">Revenue</span>
                    <span className="font-semibold text-green-700">{formatNaira(d.value,'full')}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
            <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <span>Least Stores {monthFilter!=='all' ? `(${monthFilter})` : ''}</span>
              <TrendingUp className="w-4 h-4 text-red-600 rotate-180" />
            </h3>
            <ul className="space-y-2">
              {leastData.map((d, i) => (
                <li key={`least-${i}`} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 truncate max-w-[60%]">{i+1}. {d.name}</span>
                  <span className="inline-flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-xs">Revenue</span>
                    <span className="font-semibold text-red-700">{formatNaira(d.value,'full')}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

const AddPaymentsView: React.FC<{ stores: StoreData[]; db: any; isAuthReady: boolean; setView: (view: View) => void }> = ({ stores, db, isAuthReady }) => {
  const currentMonthName = MONTH_NAMES[new Date().getMonth()];
  const MONTH_OPTIONS = MONTH_ONLY_OPTIONS;
  const todayIso = new Date().toISOString().slice(0,10);
  const [formData, setFormData] = useState({ storeId: '', senderName: '', simCardsSold: '', paymentAmount: '', transactionMonth: currentMonthName, remarkType: 'serial issues', remarkText: '', receiptDate: '', clearance: 'NOT_CLEARED' as 'CLEARED' | 'NOT_CLEARED' });
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | ''; text: string }>({ type: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleLogPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    // If DB not ready, queue payment offline
    if (!db) {
      const { storeId, senderName, simCardsSold, paymentAmount, transactionMonth, remarkType, remarkText, receiptDate, clearance } = formData;
      if (!storeId || !senderName.trim() || !simCardsSold || !paymentAmount || !transactionMonth) {
        setStatusMessage({ type: 'error', text: 'Fill all fields before offline upload.' });
        return;
      }
      if (remarkType === 'other' && !remarkText.trim()) {
        setStatusMessage({ type: 'error', text: 'Enter remark for Other.' });
        return;
      }
      const amount = parseFloat(paymentAmount);
      const simCards = parseInt(simCardsSold, 10);
      if (isNaN(amount) || amount <= 0 || isNaN(simCards) || simCards < 0) {
        setStatusMessage({ type: 'error', text: 'Amount must be > 0 and SIMs >= 0.' });
        return;
      }
      const remark = remarkType === 'other' ? remarkText.trim() : (remarkType === 'serial issues' ? 'Serial issues' : 'NIN/KYC issues');
      const offlinePayment = {
        id: `local-pay-${Date.now()}`,
        storeId,
        senderName: senderName.trim(),
        simCardsSold: simCards,
        paymentAmount: amount,
        status: 'Completed',
        createdAt: new Date().toISOString(),
        transactionMonth,
        remark,
        receiptCollectionDate: receiptDate || undefined,
        clearance
      } as Transaction;
      try {
        const raw = localStorage.getItem('pending_payments');
        const list = raw ? JSON.parse(raw) : [];
        localStorage.setItem('pending_payments', JSON.stringify([...(Array.isArray(list) ? list : []), offlinePayment]));
        setStatusMessage({ type: 'success', text: 'Payment queued offline. Will upload when connected.' });
        setFormData((prev) => ({ storeId: prev.storeId, senderName: '', simCardsSold: '', paymentAmount: '', transactionMonth: prev.transactionMonth, remarkType: prev.remarkType, remarkText: '', receiptDate: '', clearance: prev.clearance }));
        window.dispatchEvent(new Event('pendingPaymentsUpdated'));
      } catch (err) {
        console.error('Failed to queue payment offline:', err);
        setStatusMessage({ type: 'error', text: 'Failed to save payment offline.' });
      }
      return;
    }
    const { storeId, senderName, simCardsSold, paymentAmount, transactionMonth, remarkType, remarkText, receiptDate, clearance } = formData;
    if (!storeId || !senderName.trim() || !simCardsSold || !paymentAmount || !transactionMonth) {
      setStatusMessage({ type: 'error', text: 'Please fill out all payment fields, including the month.' });
      return;
    }
    if (remarkType === 'other' && !remarkText.trim()) {
      setStatusMessage({ type: 'error', text: 'Please enter a remark when selecting Other.' });
      return;
    }
    const amount = parseFloat(paymentAmount);
    const simCards = parseInt(simCardsSold, 10);
    if (isNaN(amount) || amount <= 0 || isNaN(simCards) || simCards < 0) {
      setStatusMessage({ type: 'error', text: 'Payment amount must be > 0 and SIM card count >= 0.' });
      return;
    }
    const remark = remarkType === 'other' ? remarkText.trim() : (remarkType === 'serial issues' ? 'Serial issues' : 'NIN/KYC issues');
    setIsLoading(true);
    setStatusMessage({ type: '', text: '' });
    try {
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
      const transactionsCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'transactions');
      // If a local pending store is selected, sync it to Firestore first
      let effectiveStoreId = storeId;
      if (storeId.startsWith('local-')) {
        const raw = localStorage.getItem('pending_stores');
        const list = raw ? JSON.parse(raw) : [];
        const localStore = Array.isArray(list) ? list.find((s: any) => s.id === storeId) : null;
        if (!localStore) {
          setStatusMessage({ type: 'error', text: 'Selected store is pending but not found locally. Please try again.' });
          setIsLoading(false);
          return;
        }
        const storesCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'stores');
        const newStoreRef = doc(storesCollectionRef);
        const { id: _localId, offline: _offline, ...rest } = localStore;
        await setDoc(newStoreRef, { ...rest, id: newStoreRef.id });
        // Remove from pending stores and notify listeners
        const next = (Array.isArray(list) ? list : []).filter((s: any) => s.id !== storeId);
        localStorage.setItem('pending_stores', JSON.stringify(next));
        window.dispatchEvent(new Event('pendingStoresUpdated'));
        effectiveStoreId = newStoreRef.id;
        // Update form selection to the new remote id for subsequent actions
        setFormData((prev) => ({ ...prev, storeId: newStoreRef.id }));
      }
      // Enforce one payment per store per month
      const q = query(transactionsCollectionRef, where('storeId', '==', effectiveStoreId), where('transactionMonth', '==', transactionMonth));
      const existingSnap = await getDocs(q);
      if (!existingSnap.empty) {
        // Edit existing
        const existing = existingSnap.docs[0];
        const prev = existing.data() as any;
        const txRef = doc(db, 'artifacts', appId, 'public', 'data', 'transactions', existing.id);
        const updatePayload: any = { senderName: senderName.trim(), simCardsSold: simCards, paymentAmount: amount, remark };
        if (receiptDate) updatePayload.receiptCollectionDate = receiptDate;
        if (clearance) updatePayload.clearance = clearance;
        await updateDoc(txRef, updatePayload);
        // Adjust store revenue by delta
        const delta = amount - (prev.paymentAmount || 0);
        if (delta !== 0) {
          const storeRef = doc(db, 'artifacts', appId, 'public', 'data', 'stores', effectiveStoreId);
          await updateDoc(storeRef, { totalRevenue: increment(delta) });
        }
        setStatusMessage({ type: 'success', text: `Updated existing ${transactionMonth} payment for this store.` });
      } else {
        // Create new
        const newTransactionRef = doc(transactionsCollectionRef);
        const newTransaction: Transaction = { id: newTransactionRef.id, storeId: effectiveStoreId, senderName: senderName.trim(), simCardsSold: simCards, paymentAmount: amount, status: 'Completed', createdAt: new Date().toISOString(), transactionMonth, remark, receiptCollectionDate: receiptDate || undefined, clearance };
        await setDoc(newTransactionRef, newTransaction);
        const storeRef = doc(db, 'artifacts', appId, 'public', 'data', 'stores', effectiveStoreId);
        await updateDoc(storeRef, { totalRevenue: increment(amount), entries: increment(1) });
        setStatusMessage({ type: 'success', text: `Payment of ${formatNaira(amount, 'full')} logged successfully!` });
      }
      setFormData((prev) => ({ storeId: prev.storeId, senderName: '', simCardsSold: '', paymentAmount: '', transactionMonth: prev.transactionMonth, remarkType: prev.remarkType, remarkText: '', receiptDate: '', clearance: prev.clearance }));
    } catch (error) {
      console.error('Error logging payment or updating store: ', error);
      setStatusMessage({ type: 'error', text: 'Failed to log payment. Check console for details.' });
    } finally {
      setIsLoading(false);
    }
  };

  const selectableStores = useMemo(() => {
    // Allow selecting local pending stores; we'll sync them on submit
    return stores;
  }, [stores]);
  const isStoreListEmpty = selectableStores.length === 0;
  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-3xl font-extrabold text-gray-900 mb-6 border-b pb-2 border-green-100 flex items-center">
        <CreditCard className="w-7 h-7 mr-3 text-green-600" />
        Log New Sales Entry
      </h1>
      <form onSubmit={handleLogPayment} className="bg-white p-6 md:p-8 rounded-xl shadow-lg border border-gray-100 max-w-2xl mx-auto space-y-6 animate-fade-in">
        {statusMessage.text && <div className={`p-4 rounded-lg text-sm font-medium ${statusMessage.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{statusMessage.text}</div>}
        {isStoreListEmpty && (
          <div className="p-4 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 rounded-lg font-medium">
            <p>No stores registered. Please register a store first.</p>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label htmlFor="storeId" className="block text-sm font-medium text-gray-700 flex items-center mb-1"><Store className="w-4 h-4 mr-2 text-green-500" /> Select Store</label>
            <select id="storeId" name="storeId" value={formData.storeId} onChange={handleChange} required className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500 bg-white disabled:bg-gray-50" disabled={isStoreListEmpty || isLoading}>
              <option value="">-- Choose a Store --</option>
              {selectableStores.map((store) => (
                <option key={store.id} value={store.id}>{store.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="transactionMonth" className="block text-sm font-medium text-gray-700 flex items-center mb-1"><Clock className="w-4 h-4 mr-2 text-green-500" /> Transaction Month</label>
            <select id="transactionMonth" name="transactionMonth" value={formData.transactionMonth} onChange={handleChange} required className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500 bg-white disabled:bg-gray-50" disabled={isLoading}>
              {MONTH_OPTIONS.map((month) => (
                <option key={month.value} value={month.value}>{month.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="receiptDate" className="block text-sm font-medium text-gray-700 mb-1">Receipt Collection</label>
          <input id="receiptDate" name="receiptDate" type="date" value={formData.receiptDate} onChange={handleChange} placeholder={todayIso} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500 bg-white disabled:bg-gray-50" disabled={isLoading} />
          <p className="text-xs text-gray-500 mt-1">Pick the day the receipt was collected.</p>
        </div>
        <div>
          <label htmlFor="senderName" className="block text-sm font-medium text-gray-700 flex items-center mb-1"><User className="w-4 h-4 mr-2 text-green-500" /> Sender's Name</label>
          <input id="senderName" name="senderName" type="text" value={formData.senderName} onChange={handleChange} required placeholder="e.g., Jane Doe" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500" disabled={isLoading} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label htmlFor="simCardsSold" className="block text-sm font-medium text-gray-700 flex items-center mb-1"><PlusSquare className="w-4 h-4 mr-2 text-green-500" /> SIM Cards Sold</label>
            <input id="simCardsSold" name="simCardsSold" type="number" min="0" step="1" value={formData.simCardsSold} onChange={handleChange} required placeholder="0" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500" disabled={isLoading} />
          </div>
          <div>
            <label htmlFor="paymentAmount" className="block text-sm font-medium text-gray-700 flex items-center mb-1"><DollarSign className="w-4 h-4 mr-2 text-green-500" /> Payment Made (₦)</label>
            <input id="paymentAmount" name="paymentAmount" type="number" min="0.01" step="0.01" value={formData.paymentAmount} onChange={handleChange} required placeholder="e.g., 50000" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500" disabled={isLoading} />
          </div>
        </div>
        <div>
          <label htmlFor="remarkType" className="block text-sm font-medium text-gray-700 flex items-center mb-1"><List className="w-4 h-4 mr-2 text-green-500" /> Remark</label>
          <select id="remarkType" name="remarkType" value={formData.remarkType} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500 bg-white disabled:bg-gray-50" disabled={isLoading}>
            <option value="serial issues">Serial issues</option>
            <option value="nin/kyc issues">NIN/KYC issues</option>
            <option value="other">Other (enter remark)</option>
          </select>
        </div>
        {formData.remarkType === 'other' && (
          <div>
            <label htmlFor="remarkText" className="block text-sm font-medium text-gray-700 mb-1">Enter Remark</label>
            <input id="remarkText" name="remarkText" type="text" value={formData.remarkText} onChange={handleChange} placeholder="Describe the issue" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500" disabled={isLoading} />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Clearance</label>
          <div className="flex items-center gap-6">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input type="radio" name="clearance" value="CLEARED" checked={formData.clearance === 'CLEARED'} onChange={handleChange} disabled={isLoading} />
              CLEARED
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input type="radio" name="clearance" value="NOT_CLEARED" checked={formData.clearance === 'NOT_CLEARED'} onChange={handleChange} disabled={isLoading} />
              NOT CLEARED
            </label>
          </div>
        </div>
        <button type="submit" className={`w-full flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg shadow-sm text-white bg-green-600 hover:bg-green-700 transition duration-150 ${isLoading || isStoreListEmpty ? 'opacity-70 cursor-not-allowed' : ''}`} disabled={isLoading || isStoreListEmpty}>
          {isLoading ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              Uploading...
            </>
          ) : (
            <>
              <CreditCard className="w-5 h-5 mr-2" />
              Upload
            </>
          )}
        </button>
      </form>
    </div>
  );
};

interface ImportedStoreRow { name: string; owner?: string; email?: string; location?: string; }
const SettingsView: React.FC<{ db?: any; isAuthReady?: boolean; appId?: string; stores?: StoreData[] }> = ({ db, isAuthReady, appId, stores = [] }) => {
  const [fileInfo, setFileInfo] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<ImportedStoreRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<{ created: number; queued: number; skipped: number; errors: string[] }>({ created: 0, queued: 0, skipped: 0, errors: [] });
  const existingNames = useMemo(() => new Set(stores.map(s => s.name.toLowerCase())), [stores]);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMonth, setExportMonth] = useState(MONTH_ONLY_OPTIONS[new Date().getMonth()]?.value || 'January');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string>('');
  const [importOpen, setImportOpen] = useState(false);

  const resetImport = () => {
    setParsedRows([]);
    setFileInfo('');
    setImportReport({ created: 0, queued: 0, skipped: 0, errors: [] });
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    resetImport();
    setFileInfo(`${file.name} (${Math.round(file.size/1024)} KB)`);
    const isXLSX = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls');
    if (!isXLSX) {
      setImportReport(r => ({ ...r, errors: [...r.errors, 'Unsupported file type. Upload an Excel file (.xlsx or .xls) with a single column of store names.'] }));
      return;
    }
    try {
      const data = await file.arrayBuffer();
      const XLSX = await import('xlsx');
      const wb = XLSX.read(data, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const json: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      processExcelNameList(json);
    } catch (err: any) {
      console.error('Import parse error:', err);
      setImportReport(r => ({ ...r, errors: [...r.errors, 'Failed to parse file.'] }));
    }
  };

  const normalizeHeader = (h: string) => h.trim().toLowerCase().replace(/\s+/g, '');

  const processExcelNameList = (rows: any[]) => {
    // rows is a 2D array from header:1 — treat first non-empty cell per row as the store name
    const out: ImportedStoreRow[] = [];
    for (const r of rows) {
      if (!Array.isArray(r)) continue;
      const first = (r[0] ?? '').toString().trim();
      if (!first || first.toLowerCase() === 'name') continue;
      out.push({ name: first });
    }
    setParsedRows(out);
  };

  // CSV import removed per requirement — only Excel name lists are allowed

  const performImport = async () => {
    if (!parsedRows.length) return;
    setImporting(true);
    const report = { created: 0, queued: 0, skipped: 0, errors: [] as string[] };
    try {
      // Filter duplicates by name (case-insensitive)
      const unique: ImportedStoreRow[] = [];
      const seenLocal = new Set<string>();
      for (const r of parsedRows) {
        const key = r.name.toLowerCase();
        if (existingNames.has(key) || seenLocal.has(key)) { report.skipped++; continue; }
        seenLocal.add(key);
        unique.push(r);
      }
      if (!db || !isAuthReady || !appId) {
        // Queue offline
        const raw = localStorage.getItem('pending_stores');
        const list = raw ? JSON.parse(raw) : [];
        const additions = unique.map(r => ({
          ...r,
          totalRevenue: 0,
            entries: 0,
            createdAt: new Date().toISOString(),
            id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            offline: true
        }));
        localStorage.setItem('pending_stores', JSON.stringify([...(Array.isArray(list)? list: []), ...additions]));
        window.dispatchEvent(new Event('pendingStoresUpdated'));
        report.queued = additions.length;
      } else {
        // Remote batch write
        const batch = writeBatch(db);
        const storesCollectionRef = collection(db, 'artifacts', appId!, 'public', 'data', 'stores');
        for (const r of unique) {
          const ref = doc(storesCollectionRef);
          batch.set(ref, { id: ref.id, name: r.name, owner: r.owner || 'N/A (Imported)', email: r.email || '', location: r.location || 'Imported', totalRevenue: 0, entries: 0, createdAt: new Date().toISOString() });
          report.created++;
        }
        await batch.commit();
      }
    } catch (err:any) {
      console.error('Import processing failed:', err);
      report.errors.push('Import failed. See console.');
    } finally {
      setImportReport(report);
      setImporting(false);
    }
  };

  const sampleCsv = '';

  const collectMonthData = async (month: string) => {
    const storeMap: Record<string, StoreData> = {};
    for (const s of stores) storeMap[s.id] = s;
    const rows: any[] = [];
    try {
      if (db && isAuthReady && appId) {
        const txRef = collection(db, 'artifacts', appId, 'public', 'data', 'transactions');
        const qMonth = query(txRef, where('transactionMonth', '==', month));
        const snap = await getDocs(qMonth);
        snap.forEach((docSnap: any) => {
          const t = docSnap.data();
          const s = storeMap[t.storeId] || {} as StoreData;
          const resolvedLocation = (s.location && !['Quick Entry','Imported'].includes(s.location)) ? s.location : (s.name || '');
          rows.push({
            storeId: t.storeId,
            storeName: s.name || '',
            location: resolvedLocation,
            transactionMonth: t.transactionMonth,
            senderName: t.senderName,
            simCardsSold: t.simCardsSold,
            paymentAmount: t.paymentAmount,
            remark: t.remark || '',
            receiptCollectionDate: t.receiptCollectionDate || '',
            createdAt: t.createdAt || '',
            status: t.status || 'Completed',
            clearance: t.clearance || ''
          });
        });
      }
      // Include offline pending payments for this month
      try {
        const raw = localStorage.getItem('pending_payments');
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            for (const p of list) {
              if (p.transactionMonth === month) {
                const s = storeMap[p.storeId] || {} as StoreData;
                const resolvedLocation = (s.location && !['Quick Entry','Imported'].includes(s.location)) ? s.location : (s.name || '');
                rows.push({
                  storeId: p.storeId,
                  storeName: s.name || '',
                  location: resolvedLocation,
                  transactionMonth: p.transactionMonth,
                  senderName: p.senderName,
                  simCardsSold: p.simCardsSold,
                  paymentAmount: p.paymentAmount,
                  remark: p.remark || '',
                  receiptCollectionDate: p.receiptCollectionDate || '',
                  createdAt: p.createdAt || '',
                  status: p.status || 'Completed (Pending Sync)',
                  clearance: p.clearance || ''
                });
              }
            }
          }
        }
      } catch {}
    } catch (err:any) {
      console.error('Failed to collect export data:', err);
      throw err;
    }
    return rows;
  };

  const handleExport = async (format: 'csv'|'xlsx') => {
    setExportError('');
    setExporting(true);
    try {
      const month = exportMonth;
      const data = await collectMonthData(month);
      if (!data.length) {
        setExportError('No transactions found for the selected month.');
        setExporting(false);
        return;
      }
      const fileBase = `sales-report-${month}-${new Date().toISOString().slice(0,10)}`;
      if (format === 'csv') {
        const headers = ['storeId','storeName','location','transactionMonth','senderName','simCardsSold','paymentAmount','remark','receiptCollectionDate','createdAt','status','clearance'];
        const csv = [headers.join(',')].concat(
          data.map(r => headers.map(h => {
            const v = r[h] ?? '';
            const sv = typeof v === 'string' ? v.replace(/"/g,'""') : v;
            return `"${sv}"`;
          }).join(','))
        ).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${fileBase}.csv`; a.click();
        URL.revokeObjectURL(url);
      } else {
        // Prefer xlsx-js-style for cell styling, fallback to xlsx if unavailable
        let styled = true;
        let mod: any;
        try {
          mod = await import('xlsx-js-style');
        } catch {
          styled = false;
          mod = await import('xlsx');
        }
        const XLSX: any = (mod as any)?.default ?? mod;
        const headers = ['storeId','storeName','location','transactionMonth','senderName','simCardsSold','paymentAmount','remark','receiptCollectionDate','createdAt','status','clearance'];
        const ws = XLSX.utils.json_to_sheet(data, { header: headers, skipHeader: false });

        // Apply red/green fill on the Store Name cell based on clearance value
        try {
          const nameColIdx = headers.indexOf('storeName');
          const encode_col = (idx: number) => {
            if (XLSX.utils?.encode_col) return XLSX.utils.encode_col(idx);
            // Fallback: convert 0-based index to Excel column name
            let n = idx + 1; let s = '';
            while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
            return s;
          };
          const nameCol = encode_col(nameColIdx);
          for (let i = 0; i < data.length; i++) {
            const rowNum = i + 2; // +2 to skip header row
            const clearance = String(data[i]?.clearance || '').toUpperCase();
            const cellRef = `${nameCol}${rowNum}`;
            const cell = ws[cellRef] || (ws[cellRef] = { t: 's', v: data[i]?.storeName ?? '' });
            if (!cell.s) cell.s = {};
            if (styled) {
              if (clearance === 'NOT_CLEARED') {
                cell.s.fill = { patternType: 'solid', fgColor: { rgb: 'FFFFC7CE' } }; // Excel light red
              } else if (clearance === 'CLEARED') {
                cell.s.fill = { patternType: 'solid', fgColor: { rgb: 'FFC6EFCE' } }; // Excel light green
              }
            }
          }
        } catch {}

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Sales');
        XLSX.writeFile(wb, `${fileBase}.xlsx`);
      }
      setExportOpen(false);
    } catch (err:any) {
      setExportError('Export failed. See console for details.');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAllStores = async () => {
    const ok = window.confirm('Are you sure you want to delete ALL stores and their payments? This cannot be undone.');
    if (!ok) return;
    // Always clear local pending items
    try {
      localStorage.removeItem('pending_stores');
      localStorage.removeItem('pending_payments');
      window.dispatchEvent(new Event('pendingStoresUpdated'));
      window.dispatchEvent(new Event('pendingPaymentsUpdated'));
    } catch {}
    if (!db || !isAuthReady || !appId) {
      alert('Offline: cleared local pending items. Remote deletion requires database connection.');
      return;
    }
    try {
      const storesRef = collection(db, 'artifacts', appId, 'public', 'data', 'stores');
      const txRef = collection(db, 'artifacts', appId, 'public', 'data', 'transactions');
      const allStores = await getDocs(storesRef);
      const allTx = await getDocs(txRef);
      // Delete transactions first, then stores; chunk into batches to respect limits
      const chunk = async (docs: any[]) => {
        let i = 0;
        while (i < docs.length) {
          const batch = writeBatch(db);
          for (let j = i; j < Math.min(i + 400, docs.length); j++) {
            batch.delete(docs[j].ref);
          }
          await batch.commit();
          i += 400;
        }
      };
      await chunk(allTx.docs);
      await chunk(allStores.docs);
      alert('All stores and payments deleted.');
    } catch (err) {
      console.error('Delete all stores failed:', err);
      alert('Failed to delete all stores. See console for details.');
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-3xl font-extrabold text-gray-900 mb-6 flex items-center">
        <Settings className="w-7 h-7 mr-3 text-purple-600" />
        Settings
      </h1>
      <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button onClick={() => { setImportOpen(true); resetImport(); }} className="w-full px-4 py-3 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 transition">Import Stores</button>
          <button onClick={() => { setExportOpen(true); setExportError(''); }} className="w-full px-4 py-3 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition">Export Sales Report</button>
          <button onClick={async () => { await handleDeleteAllStores(); }} className="w-full px-4 py-3 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 transition">Delete All Stores</button>
        </div>
      </div>

      {exportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 w-[95%] max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Export Sales for Month</h3>
            <label className="block text-sm font-medium text-gray-700 mb-1">Select Month</label>
            <select value={exportMonth} onChange={(e)=>setExportMonth(e.target.value)} className="w-full px-3 py-2 border rounded-md mb-4">
              {MONTH_ONLY_OPTIONS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            {exportError && <div className="mb-3 text-sm text-red-600">{exportError}</div>}
            <div className="flex items-center justify-end gap-3">
              <button onClick={()=> setExportOpen(false)} className="px-3 py-2 rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300">Cancel</button>
              <button disabled={exporting} onClick={async ()=>{ await handleExport('csv'); }} className={`px-3 py-2 rounded-md text-white ${exporting? 'bg-green-400':'bg-green-600 hover:bg-green-700'}`}>{exporting? 'Exporting...' : 'Export CSV'}</button>
              <button disabled={exporting} onClick={async ()=>{ await handleExport('xlsx'); }} className={`px-3 py-2 rounded-md text-white ${exporting? 'bg-indigo-400':'bg-indigo-600 hover:bg-indigo-700'}`}>{exporting? 'Exporting...' : 'Export XLSX'}</button>
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 w-[95%] max-w-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Import Stores (Excel)</h3>
            <p className="text-sm text-gray-600 mb-4">Upload an Excel sheet (.xlsx or .xls) with a single column of store names.</p>
            <input type="file" accept=".xlsx,.xls" onChange={handleFile} className="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100" />
            {fileInfo && <p className="mt-2 text-xs text-gray-500">Loaded: {fileInfo}</p>}
            {parsedRows.length > 0 && (
              <div className="mt-3 p-3 rounded-md bg-gray-50 border text-xs text-gray-700">
                <div>Total rows parsed: <span className="font-semibold">{parsedRows.length}</span></div>
                <div>Duplicates will be skipped during import.</div>
              </div>
            )}
            {(importReport.created || importReport.queued || importReport.skipped || importReport.errors.length) && (
              <div className="mt-3 p-3 rounded-md bg-indigo-50 border border-indigo-200 text-sm text-indigo-900 space-y-1">
                <div><span className="font-semibold">Created (remote):</span> {importReport.created}</div>
                <div><span className="font-semibold">Queued (offline):</span> {importReport.queued}</div>
                <div><span className="font-semibold">Skipped (duplicates):</span> {importReport.skipped}</div>
                {importReport.errors.map((er,i)=>(<div key={i} className="text-red-600">Error: {er}</div>))}
              </div>
            )}
            <div className="mt-4 flex items-center justify-end gap-3">
              <button onClick={() => setImportOpen(false)} className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300">Close</button>
              <button type="button" onClick={() => {
                // Generate a tiny Excel file client-side is complex; provide guidance instead
                alert('Prepare an Excel sheet with a single column titled "Name" and list store names under it.');
              }} className="px-4 py-2 rounded-md bg-green-600 text-white hover:bg-green-700">Excel Format Guide</button>
              <button disabled={!parsedRows.length || importing} onClick={performImport} className={`px-4 py-2 rounded-md text-white ${importing? 'bg-purple-400':'bg-purple-600 hover:bg-purple-700'} disabled:opacity-50`}>{importing? 'Importing...' : 'Import'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Sidebar: React.FC<{ currentView: View; setView: (view: View) => void }> = ({ currentView, setView }) => {
  const navItems = [
    { id: 'stores' as View, label: 'View Stores', icon: List },
    { id: 'visual' as View, label: 'View Visual', icon: BarChartIcon },
    { id: 'addStore' as View, label: 'Add Store', icon: Plus },
    { id: 'payments' as View, label: 'Add Payments', icon: CreditCard },
    { id: 'settings' as View, label: 'Settings', icon: Settings }
  ];
  const colorMap: Record<View, { hover: string; active: string }> = {
    stores:   { hover: 'hover:bg-blue-600 hover:text-white',   active: 'bg-blue-600 text-white' },
    visual:   { hover: 'hover:bg-indigo-600 hover:text-white', active: 'bg-indigo-600 text-white' },
    addStore: { hover: 'hover:bg-red-600 hover:text-white',    active: 'bg-red-600 text-white' },
    payments: { hover: 'hover:bg-green-600 hover:text-white',  active: 'bg-green-600 text-white' },
    settings: { hover: 'hover:bg-purple-600 hover:text-white', active: 'bg-purple-600 text-white' }
  } as const;

  return (
    <nav className="w-64 bg-gray-900 text-gray-100 flex-shrink-0 h-screen md:h-auto md:min-h-screen sticky top-0 md:relative p-6 hidden md:flex flex-col border-r border-gray-800 shadow-sm">
      <div className="text-2xl font-bold mb-6 flex items-center">
        <Store className="w-6 h-6 mr-2 text-gray-200" />
        Sales Monitor
      </div>
      <ul className="space-y-2">
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          const colors = colorMap[item.id];
          const base = 'text-gray-300 bg-transparent';
          const activeClass = isActive ? colors.active : `${base} ${colors.hover}`;
          const Icon = item.icon;
          return (
            <li key={item.id}>
              <button onClick={() => setView(item.id)} className={`w-full flex items-center px-3 py-2 rounded-lg transition-colors duration-150 ${activeClass}`}>
                <Icon className="w-5 h-5 mr-3" />
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('stores');
  const envAny = (import.meta as any)?.env || {};
  const appId = typeof __app_id !== 'undefined' ? __app_id : (envAny.VITE_APP_ID ?? 'default-app-id');
  const firebaseConfig = typeof __firebase_config !== 'undefined'
    ? JSON.parse(__firebase_config)
    : (envAny.VITE_FIREBASE_CONFIG ? JSON.parse(envAny.VITE_FIREBASE_CONFIG) : null);
  const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : (envAny.VITE_INITIAL_AUTH_TOKEN ?? null);
  const [db, setDb] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [stores, setStores] = useState<StoreData[]>([]);
  const [pendingVersion, setPendingVersion] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [pendingPaymentsVersion, setPendingPaymentsVersion] = useState(0);
  const [optimisticTxEdits, setOptimisticTxEdits] = useState<Record<string, Partial<Transaction>>>({});

  const getPendingStores = useCallback((): StoreData[] => {
    try {
      const raw = localStorage.getItem('pending_stores');
      if (!raw) return [];
      const list = JSON.parse(raw) as any[];
      return (Array.isArray(list) ? list : []).map((s) => ({
        id: s.id || `local-${Math.random().toString(36).slice(2)}`,
        name: s.name || 'Untitled Store',
        owner: s.owner || 'N/A',
        email: s.email || 'N/A',
        location: s.location || 'Quick Entry',
        totalRevenue: s.totalRevenue || 0,
        entries: s.entries || 0
      }));
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    const onPending = () => setPendingVersion((v) => v + 1);
    window.addEventListener('pendingStoresUpdated', onPending);
    const onPendingPayments = () => setPendingPaymentsVersion((v) => v + 1);
    window.addEventListener('pendingPaymentsUpdated', onPendingPayments);
    const onOptimisticEdit = (e: any) => {
      const d = e.detail || {};
      if (!d.id) return;
      setOptimisticTxEdits(prev => ({ ...prev, [d.id]: { senderName: d.senderName, simCardsSold: d.simCardsSold, paymentAmount: d.paymentAmount, clearance: d.clearance } }));
      // Persist overrides across refresh until snapshot matches
      try {
        const overridesRaw = localStorage.getItem('edit_overrides');
        const overrides = overridesRaw ? JSON.parse(overridesRaw) : {};
        overrides[d.id] = { senderName: d.senderName, simCardsSold: d.simCardsSold, paymentAmount: d.paymentAmount, clearance: d.clearance };
        localStorage.setItem('edit_overrides', JSON.stringify(overrides));
      } catch {}
    };
    window.addEventListener('optimisticTxEdit', onOptimisticEdit);
    return () => {
      window.removeEventListener('pendingStoresUpdated', onPending);
      window.removeEventListener('pendingPaymentsUpdated', onPendingPayments);
      window.removeEventListener('optimisticTxEdit', onOptimisticEdit);
    };
  }, []);

  useEffect(() => {
    if (!firebaseConfig) {
      console.error('Firebase config is missing.');
      return;
    }
    try {
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const firebaseAuth = getAuth(app);
      setDb(firestore);
      const unsubscribe = onAuthStateChanged(firebaseAuth, async (user: any) => {
        if (!user) {
          await signInAnonymously(firebaseAuth);
        }
        setIsAuthReady(true);
      });
      if (initialAuthToken) {
        signInWithCustomToken(firebaseAuth, initialAuthToken).catch((error: any) => {
          console.error('Custom token sign-in failed:', error);
        });
      }
      return () => unsubscribe();
    } catch (error) {
      console.error('Firebase initialization failed:', error);
    }
  }, []);

  useEffect(() => {
    if (!isAuthReady || !db) return;
    const storesCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'stores');
    const unsubscribe = onSnapshot(storesCollectionRef, (snapshot: any) => {
      const fetchedStores: StoreData[] = [];
      snapshot.forEach((docSnap: any) => {
        const data = docSnap.data();
        fetchedStores.push({
          id: docSnap.id,
          name: data.name || 'Untitled Store',
          owner: data.owner || 'N/A',
          email: data.email || 'N/A',
          location: data.location || 'Unknown',
          totalRevenue: data.totalRevenue || 0,
          entries: data.entries || 0,
          createdAt: data.createdAt
        });
      });
      fetchedStores.sort((a, b) => a.location.localeCompare(b.location));
      setStores(fetchedStores);
    }, (error: any) => {
      console.error('Error fetching stores:', error);
    });
    return () => unsubscribe();
  }, [isAuthReady, db, appId]);

  // Listen to all transactions
  useEffect(() => {
    if (!isAuthReady || !db) return;
    const txRef = collection(db, 'artifacts', appId, 'public', 'data', 'transactions');
    const unsub = onSnapshot(txRef, (snap: any) => {
      const list: Transaction[] = [];
      snap.forEach((d: any) => {
        const data = d.data();
        list.push({
          id: d.id,
          storeId: data.storeId,
          senderName: data.senderName,
          simCardsSold: data.simCardsSold,
          paymentAmount: data.paymentAmount,
          status: data.status || 'Completed',
          createdAt: data.createdAt,
          transactionMonth: data.transactionMonth,
          remark: data.remark || '',
          receiptCollectionDate: data.receiptCollectionDate,
          clearance: data.clearance
        });
      });
      setTransactions(list);
    }, (err: any) => console.error('Error fetching transactions:', err));
    return () => unsub();
  }, [isAuthReady, db, appId]);

  const transactionsByStore = useMemo(() => {
    const m: Record<string, Transaction[]> = {};
    for (const t of transactions) {
      if (!m[t.storeId]) m[t.storeId] = [];
      m[t.storeId].push(t);
    }
    // Merge / override with pending offline payments (edits take precedence)
    try {
      const raw = localStorage.getItem('pending_payments');
      const list = raw ? JSON.parse(raw) : [];
      const pendingList: Transaction[] = Array.isArray(list) ? list : [];
      for (const p of pendingList) {
        if (!m[p.storeId]) {
          m[p.storeId] = [p];
          continue;
        }
        // Exact id match override
        const idIndex = m[p.storeId].findIndex(r => r.id === p.id);
        if (idIndex >= 0) {
          m[p.storeId][idIndex] = { ...m[p.storeId][idIndex], ...p };
          continue;
        }
        // Month uniqueness override
        const monthIndex = m[p.storeId].findIndex(r => r.transactionMonth === p.transactionMonth);
        if (monthIndex >= 0) {
          const remote = m[p.storeId][monthIndex];
          m[p.storeId][monthIndex] = { ...remote, senderName: p.senderName, simCardsSold: p.simCardsSold, paymentAmount: p.paymentAmount, remark: p.remark, receiptCollectionDate: p.receiptCollectionDate ?? remote.receiptCollectionDate, clearance: p.clearance ?? remote.clearance };
        } else {
          m[p.storeId].push(p);
        }
      }
    } catch {/* ignore */}
    // Apply persisted edit overrides (survives refresh) prior to optimistic state
    try {
      const overridesRaw = localStorage.getItem('edit_overrides');
      if (overridesRaw) {
        const overrides = JSON.parse(overridesRaw) || {};
        Object.keys(overrides).forEach(id => {
          for (const key of Object.keys(m)) {
            const idx = m[key].findIndex(tx => tx.id === id);
            if (idx >= 0) {
              m[key][idx] = { ...m[key][idx], ...overrides[id] };
              break;
            }
          }
        });
      }
    } catch {/* ignore overrides parse */}
    for (const key of Object.keys(m)) {
      m[key].sort((a, b) => a.transactionMonth.localeCompare(b.transactionMonth));
      // Apply optimistic overrides
      m[key] = m[key].map(tx => optimisticTxEdits[tx.id] ? { ...tx, ...optimisticTxEdits[tx.id] } : tx);
    }
    return m;
  }, [transactions, pendingPaymentsVersion, optimisticTxEdits]);

  // Prune optimistic edits once snapshot reflects them (matching fields)
  useEffect(() => {
    if (!transactions.length || !Object.keys(optimisticTxEdits).length) return;
    setOptimisticTxEdits(prev => {
      const next = { ...prev };
      for (const t of transactions) {
        const opt = next[t.id];
        if (!opt) continue;
        if ((opt.senderName === undefined || opt.senderName === t.senderName) &&
            (opt.simCardsSold === undefined || opt.simCardsSold === t.simCardsSold) &&
            (opt.paymentAmount === undefined || opt.paymentAmount === t.paymentAmount) &&
            (opt.clearance === undefined || opt.clearance === t.clearance)) {
          delete next[t.id];
        }
      }
      return next;
    });
    // Clean persisted overrides that now match remote snapshot
    try {
      const overridesRaw = localStorage.getItem('edit_overrides');
      if (!overridesRaw) return;
      const overrides = JSON.parse(overridesRaw) || {};
      let changed = false;
      Object.keys(overrides).forEach(id => {
        const remote = transactions.find(t => t.id === id);
        const ov = overrides[id];
        if (remote && ov && remote.senderName === ov.senderName && remote.simCardsSold === ov.simCardsSold && remote.paymentAmount === ov.paymentAmount && (ov.clearance === undefined || remote.clearance === ov.clearance)) {
          delete overrides[id];
          changed = true;
        }
      });
      if (changed) localStorage.setItem('edit_overrides', JSON.stringify(overrides));
    } catch {/* ignore cleanup errors */}
  }, [transactions]);

  // Sync any locally queued stores once DB and auth are ready
  useEffect(() => {
    if (!isAuthReady || !db) return;
    try {
      const pendingRaw = localStorage.getItem('pending_stores');
      if (!pendingRaw) return;
      const pendingList = JSON.parse(pendingRaw);
      if (!Array.isArray(pendingList) || pendingList.length === 0) return;
      const storesCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'stores');
      const idMapping: Record<string, string> = {};
      (async () => {
        for (const s of pendingList) {
          const newRef = doc(storesCollectionRef);
          const { offline, id: _localId, ...rest } = s || {};
          await setDoc(newRef, { ...rest, id: newRef.id });
          if (s.id) idMapping[s.id] = newRef.id;
        }
        localStorage.removeItem('pending_stores');
        window.dispatchEvent(new Event('pendingStoresUpdated'));
        // Update pending payments storeId references using mapping
        try {
          const payRaw = localStorage.getItem('pending_payments');
          if (payRaw) {
            const payList = JSON.parse(payRaw);
            if (Array.isArray(payList)) {
              const updated = payList.map((p: any) => idMapping[p.storeId] ? { ...p, storeId: idMapping[p.storeId] } : p);
              localStorage.setItem('pending_payments', JSON.stringify(updated));
              window.dispatchEvent(new Event('pendingPaymentsUpdated'));
            }
          }
        } catch (err) { console.error('Failed to remap pending payments storeIds:', err); }
      })().catch(err => console.error('Failed syncing pending stores:', err));
    } catch (err) {
      console.error('Error reading pending stores:', err);
    }
  }, [isAuthReady, db, appId]);

  // Sync any locally queued payments once DB and auth are ready
  useEffect(() => {
    if (!isAuthReady || !db) return;
    try {
      const raw = localStorage.getItem('pending_payments');
      if (!raw) return;
      const list = JSON.parse(raw);
      if (!Array.isArray(list) || list.length === 0) return;
      const transactionsCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'transactions');
      const storesCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'stores');
      (async () => {
        const remaining: any[] = [];
        for (const p of list) {
          try {
            // Ensure store exists (if somehow still local, skip for next round)
            if (p.storeId.startsWith('local-')) { remaining.push(p); continue; }
            // Uniqueness: one payment per store per month
            const q = query(transactionsCollectionRef, where('storeId', '==', p.storeId), where('transactionMonth', '==', p.transactionMonth));
            const snap = await getDocs(q);
            if (!snap.empty) {
              // Update existing
              const existing = snap.docs[0];
              const prev = existing.data() as any;
              const txRef = doc(db, 'artifacts', appId, 'public', 'data', 'transactions', existing.id);
              const payload: any = { senderName: p.senderName, simCardsSold: p.simCardsSold, paymentAmount: p.paymentAmount, remark: p.remark };
              if (p.receiptCollectionDate) payload.receiptCollectionDate = p.receiptCollectionDate;
              if (p.clearance) payload.clearance = p.clearance;
              await updateDoc(txRef, payload);
              const delta = p.paymentAmount - (prev.paymentAmount || 0);
              if (delta !== 0) {
                const storeRef = doc(db, 'artifacts', appId, 'public', 'data', 'stores', p.storeId);
                await updateDoc(storeRef, { totalRevenue: increment(delta) });
              }
            } else {
              // Create new
              const newRef = doc(transactionsCollectionRef);
              await setDoc(newRef, { ...p, id: newRef.id });
              const storeRef = doc(db, 'artifacts', appId, 'public', 'data', 'stores', p.storeId);
              await updateDoc(storeRef, { totalRevenue: increment(p.paymentAmount), entries: increment(1) });
            }
          } catch (innerErr) {
            console.error('Failed to sync pending payment:', innerErr);
            remaining.push(p); // Keep for retry
          }
        }
        if (remaining.length > 0) {
          localStorage.setItem('pending_payments', JSON.stringify(remaining));
        } else {
          localStorage.removeItem('pending_payments');
        }
        window.dispatchEvent(new Event('pendingPaymentsUpdated'));
      })().catch(err => console.error('Pending payments sync error:', err));
    } catch (err) {
      console.error('Error reading pending payments:', err);
    }
  }, [isAuthReady, db, appId]);

  const displayStores = useMemo(() => {
    const merged = [...stores, ...getPendingStores()];
    // De-duplicate by id (favor remote stores if IDs collide)
    const seen = new Set<string>();
    const out: StoreData[] = [];
    for (const s of merged) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      out.push(s);
    }
    return out;
  }, [stores, getPendingStores, pendingVersion]);

  const renderContent = useCallback(() => {
    switch (currentView) {
      case 'stores':
        return <StoresDashboardView stores={displayStores} db={db} isAuthReady={isAuthReady} appId={appId} transactionsByStore={transactionsByStore} />;
      case 'visual':
        return <VisualView stores={displayStores} transactionsByStore={transactionsByStore} />;
      case 'addStore':
        return <AddStoreView db={db} isAuthReady={isAuthReady} setView={setCurrentView} />;
      case 'payments':
        return <AddPaymentsView stores={displayStores} db={db} isAuthReady={isAuthReady} setView={setCurrentView} />;
      case 'settings':
        return <SettingsView db={db} isAuthReady={isAuthReady} appId={appId} stores={displayStores} />;
      default:
        return <StoresDashboardView stores={displayStores} db={db} isAuthReady={isAuthReady} appId={appId} transactionsByStore={transactionsByStore} />;
    }
  }, [currentView, displayStores, stores, db, isAuthReady]);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar currentView={currentView} setView={setCurrentView} />
      <main className="flex-1 overflow-y-auto w-full">{renderContent()}</main>
    </div>
  );
};

export default App;

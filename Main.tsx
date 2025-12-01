import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { DollarSign, TrendingUp, BarChart as BarChartIcon, Clock, PlusSquare, Settings, Store, CreditCard, Search, ChevronDown, List, Plus, User } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, updateDoc, collection, onSnapshot, increment } from 'firebase/firestore';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const generateMonthOptions = (count: number) => {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthYear = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    options.push({ value: monthYear, label: monthYear });
  }
  return options;
};

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
}
interface StoreData {
  id: string;
  name: string;
  owner: string;
  email: string;
  location: string;
  totalRevenue: number;
  entries: number;
}
interface KpiData {
  title: string;
  value: string;
  change: string;
  icon: React.ReactNode;
  color: string;
  trend: 'up' | 'down';
}

type View = 'stores' | 'addStore' | 'payments' | 'settings';

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

const StoreDetailRow: React.FC<{ store: StoreData }> = ({ store }) => (
  <div className="flex items-center justify-between p-3 border-b border-gray-100 hover:bg-indigo-50 transition duration-100 cursor-pointer text-sm md:text-base">
    <div className="w-1/3 font-medium text-gray-800 truncate">{store.name}</div>
    <div className="w-1/3 text-gray-600 hidden sm:block truncate">{store.owner}</div>
    <div className="w-1/3 text-right font-semibold text-green-700">{formatNaira(store.totalRevenue, 'full')}</div>
  </div>
);

const StoreGroupAccordion: React.FC<{ location: string; stores: StoreData[]; isExpanded: boolean; onToggle: () => void }> = ({ location, stores, isExpanded, onToggle }) => {
  const totalEntries = stores.reduce((sum, store) => sum + store.entries, 0);
  return (
    <div className="mb-2 rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <button className="flex items-center justify-between w-full p-4 bg-white hover:bg-gray-50 transition duration-150" onClick={onToggle}>
        <span className="text-lg font-semibold text-gray-800">
          {location}
          <span className="ml-3 text-sm font-medium text-gray-500">({totalEntries} {totalEntries === 1 ? 'entry' : 'entries'})</span>
        </span>
        <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform duration-300 ${isExpanded ? 'rotate-180' : 'rotate-0'}`} />
      </button>
      {isExpanded && (
        <div className="bg-gray-50 p-2">
          <div className="hidden sm:flex items-center justify-between px-3 py-1 text-xs font-medium text-gray-500 uppercase">
            <div className="w-1/3">Store Name</div>
            <div className="w-1/3 text-left hidden sm:block">Owner</div>
            <div className="w-1/3 text-right">Revenue</div>
          </div>
          {stores.map((store) => (
            <StoreDetailRow key={store.id} store={store} />
          ))}
        </div>
      )}
    </div>
  );
};

const StoresListView: React.FC<{ stores: StoreData[] }> = ({ stores }) => {
  const [searchText, setSearchText] = useState('');
  const [expandedLocation, setExpandedLocation] = useState<string | null>(null);
  const [filterMonth, setFilterMonth] = useState('all');
  const MONTH_OPTIONS = useMemo(() => generateMonthOptions(6), []);

  const groupedStores = useMemo(() => {
    const filteredStores = stores.filter((store) =>
      store.name.toLowerCase().includes(searchText.toLowerCase()) ||
      store.owner.toLowerCase().includes(searchText.toLowerCase()) ||
      store.email.toLowerCase().includes(searchText.toLowerCase()) ||
      store.location.toLowerCase().includes(searchText.toLowerCase())
    );
    return filteredStores.reduce((acc, store) => {
      acc[store.location] = acc[store.location] || [];
      acc[store.location].push(store);
      return acc;
    }, {} as Record<string, StoreData[]>);
  }, [searchText, stores]);

  const locations = Object.keys(groupedStores).sort();
  const toggleLocation = (location: string) => setExpandedLocation((prev) => (prev === location ? null : location));

  return (
    <div className="p-4 sm:p-8">
      <header className="mb-6">
        <h1 className="text-3xl font-extrabold text-gray-900 border-b pb-2 border-indigo-100 flex items-center">
          <List className="w-7 h-7 mr-3 text-indigo-600" />
          Monitored Stores by Location
        </h1>
        <p className="text-gray-500 mt-1">Search, filter, and view store performance across Nigerian states.</p>
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
        {locations.length > 0 ? (
          locations.map((location) => (
            <StoreGroupAccordion key={location} location={location} stores={groupedStores[location]} isExpanded={expandedLocation === location} onToggle={() => toggleLocation(location)} />
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
    if (!isAuthReady || !db) {
      setStatusMessage({ type: 'error', text: 'Application is initializing. Please wait a moment.' });
      return;
    }
    if (!storeData.name.trim()) {
      setStatusMessage({ type: 'error', text: 'Please enter the store name.' });
      return;
    }
    setIsLoading(true);
    setStatusMessage({ type: '', text: '' });
    try {
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
        <button type="submit" className={`w-full flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg shadow-sm text-white bg-red-600 hover:bg-red-700 transition duration-150 ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`} disabled={isLoading || !isAuthReady}>
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
        {!isAuthReady && <p className="text-center text-sm text-gray-500 mt-2">Connecting to database...</p>}
      </form>
    </div>
  );
};

const StoresDashboardView: React.FC<{ stores: StoreData[] }> = ({ stores }) => <StoresListView stores={stores} />;

const AddPaymentsView: React.FC<{ stores: StoreData[]; db: any; isAuthReady: boolean; setView: (view: View) => void }> = ({ stores, db, isAuthReady }) => {
  const MONTH_OPTIONS = useMemo(() => generateMonthOptions(3), []);
  const [formData, setFormData] = useState({ storeId: '', senderName: '', simCardsSold: '', paymentAmount: '', transactionMonth: MONTH_OPTIONS[0]?.value || '' });
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | ''; text: string }>({ type: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleLogPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthReady || !db) {
      setStatusMessage({ type: 'error', text: 'Application is initializing. Please wait a moment.' });
      return;
    }
    const { storeId, senderName, simCardsSold, paymentAmount, transactionMonth } = formData;
    if (!storeId || !senderName.trim() || !simCardsSold || !paymentAmount || !transactionMonth) {
      setStatusMessage({ type: 'error', text: 'Please fill out all payment fields, including the month.' });
      return;
    }
    const amount = parseFloat(paymentAmount);
    const simCards = parseInt(simCardsSold, 10);
    if (isNaN(amount) || amount <= 0 || isNaN(simCards) || simCards < 0) {
      setStatusMessage({ type: 'error', text: 'Payment amount must be > 0 and SIM card count >= 0.' });
      return;
    }
    setIsLoading(true);
    setStatusMessage({ type: '', text: '' });
    try {
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
      const transactionsCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'transactions');
      const newTransactionRef = doc(transactionsCollectionRef);
      const newTransaction: Transaction = { id: newTransactionRef.id, storeId, senderName: senderName.trim(), simCardsSold: simCards, paymentAmount: amount, status: 'Completed', createdAt: new Date().toISOString(), transactionMonth };
      await setDoc(newTransactionRef, newTransaction);
      const storeRef = doc(db, 'artifacts', appId, 'public', 'data', 'stores', storeId);
      await updateDoc(storeRef, { totalRevenue: increment(amount), entries: increment(1) });
      setStatusMessage({ type: 'success', text: `Payment of ${formatNaira(amount, 'full')} logged successfully!` });
      setFormData((prev) => ({ storeId: prev.storeId, senderName: '', simCardsSold: '', paymentAmount: '', transactionMonth: prev.transactionMonth }));
    } catch (error) {
      console.error('Error logging payment or updating store: ', error);
      setStatusMessage({ type: 'error', text: 'Failed to log payment. Check console for details.' });
    } finally {
      setIsLoading(false);
    }
  };

  const isStoreListEmpty = stores.length === 0;
  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-3xl font-extrabold text-gray-900 mb-6 border-b pb-2 border-green-100 flex items-center">
        <CreditCard className="w-7 h-7 mr-3 text-green-600" />
        Log New Sales Entry
      </h1>
      <form onSubmit={handleLogPayment} className="bg-white p-6 md:p-8 rounded-xl shadow-lg border border-gray-100 max-w-2xl mx-auto space-y-6">
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
              {stores.map((store) => (
                <option key={store.id} value={store.id}>{store.name} ({store.location})</option>
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
        <button type="submit" className={`w-full flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg shadow-sm text-white bg-green-600 hover:bg-green-700 transition duration-150 ${isLoading || isStoreListEmpty ? 'opacity-70 cursor-not-allowed' : ''}`} disabled={isLoading || !isAuthReady || isStoreListEmpty}>
          {isLoading ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              Logging Payment...
            </>
          ) : (
            <>
              <CreditCard className="w-5 h-5 mr-2" />
              Log Payment Entry
            </>
          )}
        </button>
        {!isAuthReady && <p className="text-center text-sm text-gray-500 mt-2">Connecting to database...</p>}
      </form>
    </div>
  );
};

const SettingsView: React.FC = () => (
  <div className="p-8">
    <h1 className="text-3xl font-extrabold text-gray-900 mb-6 flex items-center">
      <Settings className="w-7 h-7 mr-3 text-purple-600" />
      Application Settings
    </h1>
    <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
      <p className="text-gray-700">This section is for managing application-wide settings, such as user accounts, store definitions, or data export options.</p>
      <p className="mt-2 text-sm text-gray-500">Current Features: Currency set to Nigerian Naira (₦).</p>
    </div>
  </div>
);

const Sidebar: React.FC<{ currentView: View; setView: (view: View) => void }> = ({ currentView, setView }) => {
  const navItems = [
    { id: 'stores' as View, label: 'View Stores', icon: List },
    { id: 'addStore' as View, label: 'Add Store', icon: Plus },
    { id: 'payments' as View, label: 'Add Payments', icon: CreditCard },
    { id: 'settings' as View, label: 'Settings', icon: Settings }
  ];
  return (
    <nav className="w-64 bg-gray-800 text-white flex-shrink-0 h-full fixed md:relative p-4 hidden md:flex flex-col rounded-xl md:rounded-r-none">
      <div className="text-2xl font-bold mb-8 flex items-center text-indigo-400">
        <Store className="w-6 h-6 mr-2" />
        Sales Monitor
      </div>
      <ul className="space-y-2">
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          const activeClass = isActive ? 'bg-indigo-600 shadow-lg text-white font-semibold' : 'text-gray-300 hover:bg-gray-700 hover:text-white';
          const Icon = item.icon;
          return (
            <li key={item.id}>
              <button onClick={() => setView(item.id)} className={`w-full flex items-center p-3 rounded-lg transition duration-150 ${activeClass}`}>
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
  const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
  const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
  const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
  const [db, setDb] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [stores, setStores] = useState<StoreData[]>([]);

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
            entries: data.entries || 0
        });
      });
      fetchedStores.sort((a, b) => a.location.localeCompare(b.location));
      setStores(fetchedStores);
    }, (error: any) => {
      console.error('Error fetching stores:', error);
    });
    return () => unsubscribe();
  }, [isAuthReady, db, appId]);

  const renderContent = useCallback(() => {
    switch (currentView) {
      case 'stores':
        return <StoresDashboardView stores={stores} />;
      case 'addStore':
        return <AddStoreView db={db} isAuthReady={isAuthReady} setView={setCurrentView} />;
      case 'payments':
        return <AddPaymentsView stores={stores} db={db} isAuthReady={isAuthReady} setView={setCurrentView} />;
      case 'settings':
        return <SettingsView />;
      default:
        return <StoresDashboardView stores={stores} />;
    }
  }, [currentView, stores, db, isAuthReady]);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar currentView={currentView} setView={setCurrentView} />
      <main className="flex-1 overflow-y-auto w-full">{renderContent()}</main>
    </div>
  );
};

export default App;

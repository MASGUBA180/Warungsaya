import {ArrowLeft, Eye, EyeOff, LogOut, RefreshCw} from 'lucide-react';
import {FormEvent, useCallback, useEffect, useState} from 'react';
import {apiFetch} from '../../lib/apiClient';
import {ROLE_LABELS} from '../../lib/storeData';
import type {
  AuthUser,
  DivisionRole,
  KasbonRecord,
  LedgerEntry,
  Order,
  Product,
  PublicStaffProfile,
  StockMovement,
  StoreSettings,
} from '../../types/store';
import {CashierPosTab} from './CashierPosTab';
import {CourierTab} from './CourierTab';
import {FinanceTab} from './FinanceTab';
import {OverviewMetrics, OwnerOverviewTab} from './OwnerOverviewTab';
import {WarehouseTab} from './WarehouseTab';

type OpsTab = 'overview' | 'kasir' | 'gudang' | 'kurir' | 'keuangan' | 'admin';

interface StaffPortalProps {
  onBackToStorefront: () => void;
  onStoreDataChanged: () => void;
}

const TAB_CONFIG: {
  id: OpsTab;
  label: string;
  roles: DivisionRole[];
}[] = [
  {id: 'overview', label: 'Ringkasan Pemilik', roles: ['PEMILIK']},
  {id: 'kasir', label: 'Kasir & POS', roles: ['PEMILIK', 'KASIR']},
  {id: 'gudang', label: 'Gudang & Stok', roles: ['PEMILIK', 'GUDANG']},
  {id: 'kurir', label: 'Kurir & Antar COD', roles: ['PEMILIK', 'KURIR', 'KASIR']},
  {id: 'keuangan', label: 'Keuangan & Kasbon', roles: ['PEMILIK', 'KEUANGAN', 'KASIR']},
  {id: 'admin', label: 'Staf & Pengaturan', roles: ['PEMILIK']},
];

export function StaffPortal({
  onBackToStorefront,
  onStoreDataChanged,
}: StaffPortalProps) {
  // In-memory auth session token (never persisted to localStorage)
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authStatus, setAuthStatus] = useState<{
    ownerClaimed: boolean;
    envPasscodeActive: boolean;
  } | null>(null);
  const [authTab, setAuthTab] = useState<'claim' | 'login'>('claim');

  // Claim / Login forms
  const [claimName, setClaimName] = useState('Dimas (Pemilik)');
  const [claimUsername, setClaimUsername] = useState('dimas');
  const [claimPasscode, setClaimPasscode] = useState('');
  const [showClaimPass, setShowClaimPass] = useState(false);

  const [loginUsername, setLoginUsername] = useState('');
  const [loginPasscode, setLoginPasscode] = useState('');
  const [showLoginPass, setShowLoginPass] = useState(false);

  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Operational state
  const [activeTab, setActiveTab] = useState<OpsTab>('overview');
  const [opsLoading, setOpsLoading] = useState(false);
  const [overview, setOverview] = useState<OverviewMetrics | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [kasbon, setKasbon] = useState<KasbonRecord[]>([]);
  const [staff, setStaff] = useState<PublicStaffProfile[]>([]);
  const [settings, setSettings] = useState<StoreSettings | null>(null);

  useEffect(() => {
    apiFetch<{ownerClaimed: boolean; envPasscodeActive: boolean}>('/api/auth/status')
      .then((res) => {
        if (!res.ok) {
          setAuthStatus({ownerClaimed: false, envPasscodeActive: false});
          setAuthTab('claim');
          return;
        }
        setAuthStatus(res.data);
        setAuthTab(res.data.ownerClaimed ? 'login' : 'claim');
      })
      .catch(() => {
        setAuthStatus({ownerClaimed: false, envPasscodeActive: false});
        setAuthTab('claim');
      });
  }, []);

  const loadOperationalData = useCallback(
    async (token: string) => {
      setOpsLoading(true);
      try {
        const res = await apiFetch<{
          user: AuthUser;
          overview: OverviewMetrics;
          products?: Product[];
          orders?: Order[];
          stockMovements?: StockMovement[];
          ledger?: LedgerEntry[];
          kasbon?: KasbonRecord[];
          staff?: PublicStaffProfile[];
          settings?: StoreSettings | null;
        }>('/api/ops/bootstrap', {
          headers: {Authorization: `Bearer ${token}`},
        });
        if (!res.ok) {
          if (res.status === 401) {
            setAuthToken(null);
            setUser(null);
          }
          return;
        }
        const data = res.data;
        setUser(data.user);
        setOverview(data.overview);
        setProducts(data.products || []);
        setOrders(data.orders || []);
        setStockMovements(data.stockMovements || []);
        setLedger(data.ledger || []);
        setKasbon(data.kasbon || []);
        setStaff(data.staff || []);
        setSettings(data.settings || null);
        onStoreDataChanged();
      } finally {
        setOpsLoading(false);
      }
    },
    [onStoreDataChanged]
  );

  const pickDefaultTabForRole = (role: DivisionRole): OpsTab => {
    const firstAllowed = TAB_CONFIG.find((t) => t.roles.includes(role));
    return firstAllowed ? firstAllowed.id : 'kasir';
  };

  const handleBootstrapOwner = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const cleanId = claimUsername
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, '');

      const res = await apiFetch<{token?: string; user?: AuthUser; error?: string}>(
        '/api/auth/bootstrap-owner',
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            displayName: claimName.trim(),
            username: cleanId,
            passcode: claimPasscode,
          }),
        }
      );
      if (!res.ok || !res.data.token || !res.data.user) {
        setAuthError(res.data.error || 'Gagal membuat akun pemilik.');
        return;
      }
      setAuthToken(res.data.token);
      setUser(res.data.user);
      setActiveTab(pickDefaultTabForRole(res.data.user.role));
      await loadOperationalData(res.data.token);
    } catch {
      setAuthError('Gagal menghubungi server Toko Dimas Jaya.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const res = await apiFetch<{token?: string; user?: AuthUser; error?: string}>(
        '/api/auth/login',
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            username: loginUsername.trim().toLowerCase(),
            passcode: loginPasscode,
          }),
        }
      );
      if (!res.ok || !res.data.token || !res.data.user) {
        setAuthError(res.data.error || 'ID/username atau kata sandi salah.');
        return;
      }
      setAuthToken(res.data.token);
      setUser(res.data.user);
      setLoginPasscode('');
      setActiveTab(pickDefaultTabForRole(res.data.user.role));
      await loadOperationalData(res.data.token);
    } catch {
      setAuthError('Gagal menghubungi server Toko Dimas Jaya.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setAuthToken(null);
    setUser(null);
    setOverview(null);
    setAuthTab(authStatus?.ownerClaimed ? 'login' : 'claim');
  };

  // Unauthenticated view: Wait for authStatus, then show Buat ID & Sandi Pemilik or Login
  if (!authToken || !user) {
    const canClaimOwner = authStatus ? !authStatus.ownerClaimed : false;

    return (
      <div className="min-h-screen bg-[#FAFAFA] flex flex-col justify-between p-4 sm:p-6">
        <div className="max-w-md w-full mx-auto my-auto space-y-6">
          <button
            type="button"
            onClick={onBackToStorefront}
            className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Kembali ke Etalase Toko</span>
          </button>

          <div className="bg-white border border-zinc-200 rounded-xl p-6 sm:p-8 space-y-6">
            <div>
              <p className="text-xs font-medium text-zinc-500">
                Toko Dimas Jaya · Gang Makam, Gunung Batin Udik
              </p>
              <h1 className="font-display text-2xl font-bold text-zinc-900 mt-1">
                Portal Pemilik & Divisi Toko
              </h1>
              <p className="text-sm text-zinc-600 mt-1.5 leading-relaxed">
                {canClaimOwner && authTab === 'claim'
                  ? 'Buat ID dan kata sandi Pemilik Anda sekarang untuk masuk dan mengatur seluruh divisi toko.'
                  : 'Masuk menggunakan ID/username dan kata sandi akun Pemilik atau staf divisi.'}
              </p>
            </div>

            {!authStatus ? (
              <div className="space-y-3 animate-pulse py-4">
                <div className="h-10 bg-zinc-100 rounded-lg" />
                <div className="h-10 bg-zinc-100 rounded-lg" />
                <div className="h-11 bg-zinc-200 rounded-lg" />
              </div>
            ) : (
              <>
                {canClaimOwner && (
                  <div className="grid grid-cols-2 gap-1 p-1 bg-zinc-100 rounded-lg">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthTab('claim');
                        setAuthError('');
                      }}
                      className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                        authTab === 'claim'
                          ? 'bg-white text-zinc-900 shadow-sm'
                          : 'text-zinc-600 hover:text-zinc-900'
                      }`}
                    >
                      Buat ID & Sandi Pemilik
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthTab('login');
                        setAuthError('');
                      }}
                      className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                        authTab === 'login'
                          ? 'bg-white text-zinc-900 shadow-sm'
                          : 'text-zinc-600 hover:text-zinc-900'
                      }`}
                    >
                      Sudah Punya Akun
                    </button>
                  </div>
                )}

                {canClaimOwner && authTab === 'claim' ? (
                  <form onSubmit={handleBootstrapOwner} className="space-y-4">
                    <div>
                      <label htmlFor="claim-name" className="block text-xs text-zinc-600 mb-1">
                        Nama Pemilik
                      </label>
                      <input
                        id="claim-name"
                        type="text"
                        required
                        value={claimName}
                        onChange={(e) => setClaimName(e.target.value)}
                        placeholder="Contoh: Dimas Jaya"
                        className="w-full px-3 py-2.5 min-h-[42px] text-sm border border-zinc-300 rounded-lg focus:outline-none focus:border-[#14532D]"
                      />
                    </div>

                    <div>
                      <label htmlFor="claim-username" className="block text-xs text-zinc-600 mb-1">
                        Buat ID / Username Pemilik
                      </label>
                      <input
                        id="claim-username"
                        type="text"
                        required
                        minLength={3}
                        value={claimUsername}
                        onChange={(e) => setClaimUsername(e.target.value)}
                        placeholder="Contoh: dimas atau pemilik"
                        className="w-full px-3 py-2.5 min-h-[42px] text-sm font-mono border border-zinc-300 rounded-lg focus:outline-none focus:border-[#14532D]"
                      />
                      <p className="text-[11px] text-zinc-500 mt-1">
                        Minimal 3 karakter (huruf kecil, angka, titik, atau garis bawah tanpa spasi).
                      </p>
                    </div>

                    <div>
                      <label htmlFor="claim-pass" className="block text-xs text-zinc-600 mb-1">
                        Buat Kata Sandi Pemilik (Minimal 6 karakter)
                      </label>
                      <div className="relative">
                        <input
                          id="claim-pass"
                          type={showClaimPass ? 'text' : 'password'}
                          required
                          minLength={6}
                          value={claimPasscode}
                          onChange={(e) => setClaimPasscode(e.target.value)}
                          placeholder="Ketik kata sandi baru Anda"
                          className="w-full px-3 pr-10 py-2.5 min-h-[42px] text-sm border border-zinc-300 rounded-lg focus:outline-none focus:border-[#14532D]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowClaimPass((v) => !v)}
                          aria-label={showClaimPass ? 'Sembunyikan sandi' : 'Lihat sandi'}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-zinc-500 hover:text-zinc-800 cursor-pointer"
                        >
                          {showClaimPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {authError && (
                      <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                        {authError}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={authLoading}
                      className="w-full py-3 px-4 min-h-[44px] rounded-lg bg-[#14532D] text-white text-sm font-semibold hover:bg-[#166534] disabled:opacity-60 cursor-pointer"
                    >
                      {authLoading ? 'Menyimpan...' : 'Buat Akun Pemilik & Masuk'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                      <label htmlFor="login-user" className="block text-xs text-zinc-600 mb-1">
                        ID / Username Pemilik atau Staf
                      </label>
                      <input
                        id="login-user"
                        type="text"
                        required
                        value={loginUsername}
                        onChange={(e) => setLoginUsername(e.target.value)}
                        placeholder="Masukkan ID / username Anda"
                        className="w-full px-3 py-2.5 min-h-[42px] text-sm font-mono border border-zinc-300 rounded-lg focus:outline-none focus:border-[#14532D]"
                      />
                    </div>

                    <div>
                      <label htmlFor="login-pass" className="block text-xs text-zinc-600 mb-1">
                        Kata Sandi
                      </label>
                      <div className="relative">
                        <input
                          id="login-pass"
                          type={showLoginPass ? 'text' : 'password'}
                          required
                          value={loginPasscode}
                          onChange={(e) => setLoginPasscode(e.target.value)}
                          placeholder="Masukkan kata sandi"
                          className="w-full px-3 pr-10 py-2.5 min-h-[42px] text-sm border border-zinc-300 rounded-lg focus:outline-none focus:border-[#14532D]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowLoginPass((v) => !v)}
                          aria-label={showLoginPass ? 'Sembunyikan sandi' : 'Lihat sandi'}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-zinc-500 hover:text-zinc-800 cursor-pointer"
                        >
                          {showLoginPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {authError && (
                      <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                        {authError}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={authLoading}
                      className="w-full py-3 px-4 min-h-[44px] rounded-lg bg-[#14532D] text-white text-sm font-semibold hover:bg-[#166534] disabled:opacity-60 cursor-pointer"
                    >
                      {authLoading ? 'Memeriksa...' : 'Masuk ke Ruang Operasional'}
                    </button>

                    {!canClaimOwner && (
                      <p className="text-xs text-zinc-500 leading-relaxed pt-1">
                        Lupa ID atau sandi staf? Minta Pemilik mereset lewat menu{' '}
                        <span className="font-medium text-zinc-700">Staf & Pengaturan</span>.
                        Pemilik juga dapat login darurat memakai username{' '}
                        <span className="font-mono text-zinc-700">pemilik</span> dengan variabel{' '}
                        <span className="font-mono text-zinc-700">OWNER_PASSCODE</span> di panel
                        Secrets.
                      </p>
                    )}
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  const allowedTabs = TAB_CONFIG.filter((t) => t.roles.includes(user.role));
  const currentTabConfig = allowedTabs.find((t) => t.id === activeTab) ?? allowedTabs[0];

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col lg:flex-row">
      {/* Sidebar navigation (240px desktop) */}
      <aside className="lg:w-60 bg-white border-b lg:border-b-0 lg:border-r border-zinc-200 flex flex-col justify-between shrink-0">
        <div>
          <div className="px-5 py-4 border-b border-zinc-200">
            <p className="font-display text-base font-bold text-zinc-900">Toko Dimas Jaya</p>
            <p className="text-xs text-zinc-500 mt-0.5">Portal Operasional</p>
          </div>

          <nav
            aria-label="Navigasi divisi toko"
            className="p-3 flex lg:flex-col gap-1 overflow-x-auto"
          >
            {allowedTabs.map((tab) => {
              const isActive = currentTabConfig?.id === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3.5 py-2.5 min-h-[40px] rounded-lg text-left text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-[#14532D] text-white'
                      : 'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="hidden lg:block p-4 border-t border-zinc-200 space-y-3">
          <div className="text-xs">
            <p className="font-semibold text-zinc-900 truncate">{user.displayName}</p>
            <p className="text-zinc-500 mt-0.5">{ROLE_LABELS[user.role]}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 min-h-[38px] rounded-lg border border-zinc-300 bg-white text-xs font-medium text-zinc-800 hover:bg-zinc-50 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Keluar Akun</span>
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-zinc-200 px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-900 truncate">
              Portal Staf <span className="text-zinc-400 mx-1">/</span> {currentTabConfig?.label}
            </p>
            <p className="text-xs text-zinc-500 lg:hidden truncate">
              {user.displayName} · {ROLE_LABELS[user.role]}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => loadOperationalData(authToken)}
              disabled={opsLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-lg border border-zinc-300 bg-white text-xs font-medium text-zinc-800 hover:bg-zinc-50 cursor-pointer whitespace-nowrap"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${opsLoading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span className="hidden sm:inline">Muat Ulang</span>
            </button>

            <button
              type="button"
              onClick={onBackToStorefront}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[38px] rounded-lg bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800 cursor-pointer whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Etalase Toko</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              aria-label="Keluar akun"
              className="lg:hidden p-2 min-h-[38px] rounded-lg border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl w-full">
          {!overview || !settings ? (
            <div className="space-y-4 animate-pulse">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                {Array.from({length: 4}).map((_, i) => (
                  <div key={i} className="h-24 bg-zinc-200 rounded-xl" />
                ))}
              </div>
              <div className="h-64 bg-zinc-200 rounded-xl" />
            </div>
          ) : (
            <>
              {(currentTabConfig?.id === 'overview' || currentTabConfig?.id === 'admin') && (
                <OwnerOverviewTab
                  mode={currentTabConfig.id === 'admin' ? 'admin' : 'overview'}
                  overview={overview}
                  orders={orders}
                  products={products}
                  staff={staff}
                  settings={settings}
                  authToken={authToken}
                  onRefresh={() => loadOperationalData(authToken)}
                  onNavigateTab={(t) => setActiveTab(t)}
                />
              )}

              {currentTabConfig?.id === 'kasir' && (
                <CashierPosTab
                  products={products}
                  orders={orders}
                  authToken={authToken}
                  onRefresh={() => loadOperationalData(authToken)}
                />
              )}

              {currentTabConfig?.id === 'gudang' && (
                <WarehouseTab
                  products={products}
                  stockMovements={stockMovements}
                  authToken={authToken}
                  onRefresh={() => loadOperationalData(authToken)}
                />
              )}

              {currentTabConfig?.id === 'kurir' && (
                <CourierTab
                  orders={orders}
                  authToken={authToken}
                  onRefresh={() => loadOperationalData(authToken)}
                />
              )}

              {currentTabConfig?.id === 'keuangan' && (
                <FinanceTab
                  role={user.role}
                  ledger={ledger}
                  kasbon={kasbon}
                  authToken={authToken}
                  onRefresh={() => loadOperationalData(authToken)}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

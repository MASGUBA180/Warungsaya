import {ArrowLeft, Eye, EyeOff, KeyRound, LogOut, RefreshCw, X} from 'lucide-react';
import {FormEvent, useCallback, useEffect, useState} from 'react';
import {apiFetch} from '../../lib/apiClient';
import {
  ROLE_HIERARCHY_LEVEL,
  ROLE_LABELS,
  ROLE_SCOPE_DESCRIPTIONS,
} from '../../lib/storeData';
import type {
  AuditLogEntry,
  AuthUser,
  CashierShift,
  ComplaintRecord,
  DivisionRole,
  KasbonRecord,
  LedgerEntry,
  Order,
  Product,
  PublicStaffProfile,
  StockMovement,
  StoreSettings,
  SupplierDelivery,
} from '../../types/store';
import {CashierPosTab} from './CashierPosTab';
import {ComplaintsTab} from './ComplaintsTab';
import {CourierTab} from './CourierTab';
import {FinanceTab} from './FinanceTab';
import {OverviewMetrics, OwnerOverviewTab} from './OwnerOverviewTab';
import {SupplierTab} from './SupplierTab';
import {WarehouseTab} from './WarehouseTab';

type OpsTab =
  | 'overview'
  | 'kasir'
  | 'gudang'
  | 'pemasok'
  | 'kurir'
  | 'keuangan'
  | 'komplain'
  | 'admin';

interface StaffPortalProps {
  onBackToStorefront: () => void;
  onStoreDataChanged: () => void;
}

const TAB_CONFIG: {
  id: OpsTab;
  label: string;
  roles: DivisionRole[];
}[] = [
  {id: 'overview', label: 'Ringkasan Pemilik', roles: ['PEMILIK', 'DIREKTUR']},
  {id: 'kasir', label: 'Kasir & POS', roles: ['PEMILIK', 'DIREKTUR', 'KASIR']},
  {id: 'gudang', label: 'Gudang & Stok', roles: ['PEMILIK', 'DIREKTUR', 'GUDANG']},
  {
    id: 'pemasok',
    label: 'Pemasok & Suplai',
    roles: ['PEMILIK', 'DIREKTUR', 'GUDANG', 'PEMASOK'],
  },
  {id: 'kurir', label: 'Kurir & Peta Antar', roles: ['PEMILIK', 'DIREKTUR', 'KURIR']},
  {
    id: 'keuangan',
    label: 'Keuangan & Kasbon',
    roles: ['PEMILIK', 'DIREKTUR', 'KEUANGAN', 'KASIR'],
  },
  {
    id: 'komplain',
    label: 'Komplain & Retur',
    roles: ['PEMILIK', 'DIREKTUR', 'KASIR', 'GUDANG'],
  },
  {id: 'admin', label: 'Staf & Pengaturan', roles: ['PEMILIK', 'DIREKTUR']},
];

function getTabLabelForRole(tab: {id: OpsTab; label: string}, role: DivisionRole): string {
  if (tab.id === 'overview' && role === 'DIREKTUR') {
    return 'Ringkasan Direktur';
  }
  if (tab.id === 'pemasok') {
    if (role === 'PEMASOK') return 'Suplai Pemasok';
    if (role === 'GUDANG') return 'Terima Pemasok';
    return 'Pemasok & Suplai';
  }
  if (tab.id === 'keuangan' && role === 'KASIR') {
    return 'Kasbon Pelanggan';
  }
  return tab.label;
}

const STAFF_TOKEN_KEY = 'tdj_staff_token_v1';

export function StaffPortal({
  onBackToStorefront,
  onStoreDataChanged,
}: StaffPortalProps) {
  // Staff session token stored in sessionStorage (tab-scoped)
  const [authToken, setAuthToken] = useState<string | null>(() => {
    try {
      return window.sessionStorage.getItem(STAFF_TOKEN_KEY);
    } catch {
      return null;
    }
  });
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
  const [supplierDeliveries, setSupplierDeliveries] = useState<SupplierDelivery[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [kasbon, setKasbon] = useState<KasbonRecord[]>([]);
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [shifts, setShifts] = useState<CashierShift[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [staff, setStaff] = useState<PublicStaffProfile[]>([]);
  const [couriers, setCouriers] = useState<PublicStaffProfile[]>([]);
  const [settings, setSettings] = useState<StoreSettings | null>(null);

  // Self-service password change modal state
  const [showChangePassModal, setShowChangePassModal] = useState(false);
  const [currentPassInput, setCurrentPassInput] = useState('');
  const [newPassInput, setNewPassInput] = useState('');
  const [showCurrentPassInput, setShowCurrentPassInput] = useState(false);
  const [showNewPassInput, setShowNewPassInput] = useState(false);
  const [passChangeError, setPassChangeError] = useState('');
  const [passChangeSuccess, setPassChangeSuccess] = useState('');
  const [savingPassChange, setSavingPassChange] = useState(false);

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
          supplierDeliveries?: SupplierDelivery[];
          ledger?: LedgerEntry[];
          kasbon?: KasbonRecord[];
          complaints?: ComplaintRecord[];
          shifts?: CashierShift[];
          auditLogs?: AuditLogEntry[];
          staff?: PublicStaffProfile[];
          couriers?: PublicStaffProfile[];
          settings?: StoreSettings | null;
        }>('/api/ops/bootstrap', {
          headers: {Authorization: `Bearer ${token}`},
        });
        if (!res.ok) {
          if (res.status === 401) {
            try {
              window.sessionStorage.removeItem(STAFF_TOKEN_KEY);
            } catch {
              // ignore storage errors
            }
            setAuthToken(null);
            setUser(null);
          }
          return;
        }
        const data = res.data;
        setUser(data.user);
        setActiveTab((prev) => {
          const allowed = TAB_CONFIG.filter((t) => t.roles.includes(data.user.role));
          return allowed.some((t) => t.id === prev) ? prev : allowed[0]?.id || 'kasir';
        });
        setOverview(data.overview);
        setProducts(data.products || []);
        setOrders(data.orders || []);
        setStockMovements(data.stockMovements || []);
        setSupplierDeliveries(data.supplierDeliveries || []);
        setLedger(data.ledger || []);
        setKasbon(data.kasbon || []);
        setComplaints(data.complaints || []);
        setShifts(data.shifts || []);
        setAuditLogs(data.auditLogs || []);
        setStaff(data.staff || []);
        setCouriers(data.couriers || []);
        setSettings(data.settings || null);
        onStoreDataChanged();
      } finally {
        setOpsLoading(false);
      }
    },
    [onStoreDataChanged]
  );

  useEffect(() => {
    if (authToken && !user) {
      loadOperationalData(authToken);
    }
  }, [authToken, user, loadOperationalData]);

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
      try {
        window.sessionStorage.setItem(STAFF_TOKEN_KEY, res.data.token);
      } catch {
        // ignore storage errors
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
      try {
        window.sessionStorage.setItem(STAFF_TOKEN_KEY, res.data.token);
      } catch {
        // ignore storage errors
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
    try {
      window.sessionStorage.removeItem(STAFF_TOKEN_KEY);
    } catch {
      // ignore storage errors
    }
    setAuthToken(null);
    setUser(null);
    setOverview(null);
    setAuthTab(authStatus?.ownerClaimed ? 'login' : 'claim');
  };

  const handleOpenChangePass = () => {
    setShowChangePassModal(true);
    setCurrentPassInput('');
    setNewPassInput('');
    setPassChangeError('');
    setPassChangeSuccess('');
  };

  const handleSubmitChangePass = async (e: FormEvent) => {
    e.preventDefault();
    if (!authToken) return;
    setPassChangeError('');
    setPassChangeSuccess('');
    setSavingPassChange(true);
    try {
      const res = await apiFetch<{updated?: boolean; error?: string}>('/api/ops/me/password', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          currentPasscode: currentPassInput,
          newPasscode: newPassInput,
        }),
      });
      if (!res.ok) {
        setPassChangeError(res.data.error || 'Gagal mengganti kata sandi.');
        return;
      }
      setPassChangeSuccess('Kata sandi akun Anda berhasil diperbarui.');
      setCurrentPassInput('');
      setNewPassInput('');
    } catch {
      setPassChangeError('Gagal menghubungi server Toko Dimas Jaya.');
    } finally {
      setSavingPassChange(false);
    }
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
                Portal Pemilik, Direktur &amp; Divisi Toko
              </h1>
              <p className="text-sm text-zinc-600 mt-1.5 leading-relaxed">
                {canClaimOwner && authTab === 'claim'
                  ? 'Buat ID dan kata sandi Pemilik Anda sekarang untuk masuk dan mengatur Direktur serta seluruh divisi toko.'
                  : 'Masuk menggunakan ID/username dan kata sandi akun Pemilik, Direktur, atau staf divisi.'}
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
                      Buat ID &amp; Sandi Pemilik
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
                        ID / Username Pemilik, Direktur, atau Staf
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
                        Lupa ID atau sandi staf? Minta Pemilik atau Direktur mereset lewat menu{' '}
                        <span className="font-medium text-zinc-700">Staf &amp; Pengaturan</span>.
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
  const openComplaintsBadge = complaints.filter(
    (c) => c.status === 'BARU' || c.status === 'DIPROSES'
  ).length;

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col lg:flex-row">
      {/* Sidebar navigation (240px desktop) */}
      <aside className="lg:w-60 bg-white border-b lg:border-b-0 lg:border-r border-zinc-200 flex flex-col justify-between shrink-0 print:hidden">
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
                  className={`px-3.5 py-2.5 min-h-[40px] rounded-lg text-left text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center justify-between gap-2 ${
                    isActive
                      ? 'bg-[#14532D] text-white'
                      : 'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900'
                  }`}
                >
                  <span>{getTabLabelForRole(tab, user.role)}</span>
                  {tab.id === 'komplain' && openComplaintsBadge > 0 && (
                    <span
                      className={`text-[11px] font-mono font-bold px-1.5 py-0.5 rounded tabular-price ${
                        isActive ? 'bg-white text-[#14532D]' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {openComplaintsBadge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="hidden lg:block p-4 border-t border-zinc-200 space-y-2.5">
          <div className="text-xs">
            <p className="font-semibold text-zinc-900 truncate">{user.displayName}</p>
            <p className="text-zinc-700 mt-0.5">{ROLE_LABELS[user.role]}</p>
            <p className="text-[11px] text-zinc-500 mt-0.5">{ROLE_HIERARCHY_LEVEL[user.role]}</p>
          </div>
          <button
            type="button"
            onClick={handleOpenChangePass}
            className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 min-h-[36px] rounded-lg border border-zinc-200 bg-zinc-50 text-xs font-medium text-zinc-800 hover:bg-zinc-100 cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5 text-[#14532D]" aria-hidden="true" />
            <span>Ganti Sandi</span>
          </button>
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
        <header className="bg-white border-b border-zinc-200 px-4 sm:px-6 h-16 flex items-center justify-between gap-4 print:hidden">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-900 truncate">
              Portal Staf <span className="text-zinc-400 mx-1">/</span>{' '}
              {currentTabConfig ? getTabLabelForRole(currentTabConfig, user.role) : ''}
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
              onClick={handleOpenChangePass}
              aria-label="Ganti sandi"
              className="lg:hidden p-2 min-h-[38px] rounded-lg border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 cursor-pointer"
            >
              <KeyRound className="w-4 h-4 text-[#14532D]" />
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
            <div className="space-y-6">
              <div className="bg-white border border-zinc-200 rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-2 print:hidden">
                <div>
                  <p className="text-xs font-semibold text-[#14532D]">
                    Hak Akses: {ROLE_LABELS[user.role]} · {ROLE_HIERARCHY_LEVEL[user.role]}
                  </p>
                  <p className="text-xs text-zinc-600 mt-0.5">
                    {ROLE_SCOPE_DESCRIPTIONS[user.role]}
                  </p>
                </div>
              </div>

              {(currentTabConfig?.id === 'overview' || currentTabConfig?.id === 'admin') && (
                <OwnerOverviewTab
                  mode={currentTabConfig.id === 'admin' ? 'admin' : 'overview'}
                  currentUserRole={user.role}
                  overview={overview}
                  orders={orders}
                  ledger={ledger}
                  products={products}
                  staff={staff}
                  shifts={shifts}
                  auditLogs={auditLogs}
                  settings={settings}
                  authToken={authToken}
                  onRefresh={() => loadOperationalData(authToken)}
                  onNavigateTab={(t) => setActiveTab(t)}
                />
              )}

              {currentTabConfig?.id === 'kasir' && (
                <CashierPosTab
                  role={user.role}
                  products={products}
                  orders={orders}
                  shifts={shifts}
                  couriers={couriers}
                  kasbon={kasbon}
                  authToken={authToken}
                  onRefresh={() => loadOperationalData(authToken)}
                />
              )}

              {currentTabConfig?.id === 'gudang' && (
                <WarehouseTab
                  products={products}
                  stockMovements={stockMovements}
                  orders={orders}
                  pendingSupplierCount={
                    supplierDeliveries.filter((d) => d.status === 'MENUNGGU_TERIMA').length
                  }
                  onOpenSupplierTab={() => setActiveTab('pemasok')}
                  authToken={authToken}
                  onRefresh={() => loadOperationalData(authToken)}
                />
              )}

              {currentTabConfig?.id === 'pemasok' && (
                <SupplierTab
                  role={user.role}
                  products={products}
                  supplierDeliveries={supplierDeliveries}
                  authToken={authToken}
                  onRefresh={() => loadOperationalData(authToken)}
                />
              )}

              {currentTabConfig?.id === 'kurir' && (
                <CourierTab
                  currentUser={user}
                  couriers={couriers}
                  orders={orders}
                  settings={settings}
                  authToken={authToken}
                  onRefresh={() => loadOperationalData(authToken)}
                />
              )}

              {currentTabConfig?.id === 'keuangan' && (
                <FinanceTab
                  role={user.role}
                  ledger={ledger}
                  kasbon={kasbon}
                  supplierDeliveries={supplierDeliveries}
                  authToken={authToken}
                  onRefresh={() => loadOperationalData(authToken)}
                />
              )}

              {currentTabConfig?.id === 'komplain' && (
                <ComplaintsTab
                  role={user.role}
                  complaints={complaints}
                  products={products}
                  orders={orders}
                  authToken={authToken}
                  onRefresh={() => loadOperationalData(authToken)}
                />
              )}
            </div>
          )}
        </main>
      </div>

      {showChangePassModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Ganti kata sandi akun"
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
        >
          <div className="bg-white border border-zinc-200 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-zinc-900">Ganti Kata Sandi Akun</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {user.displayName} ({ROLE_LABELS[user.role]})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowChangePassModal(false)}
                aria-label="Tutup"
                className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {user.id === 'env-owner' ? (
              <div className="space-y-3 text-xs text-zinc-700">
                <p className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-900">
                  Anda sedang masuk menggunakan akun darurat <span className="font-mono">OWNER_PASSCODE</span>.
                  Kata sandi darurat diatur lewat panel Secrets. Untuk mengelola sandi di sini, masuk memakai akun Pemilik terdaftar.
                </p>
                <button
                  type="button"
                  onClick={() => setShowChangePassModal(false)}
                  className="w-full py-2.5 rounded-lg bg-zinc-900 text-white font-semibold cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmitChangePass} className="space-y-3.5">
                <div>
                  <label htmlFor="me-cur-pass" className="block text-xs text-zinc-600 mb-1">
                    Kata Sandi Saat Ini
                  </label>
                  <div className="relative">
                    <input
                      id="me-cur-pass"
                      type={showCurrentPassInput ? 'text' : 'password'}
                      required
                      value={currentPassInput}
                      onChange={(e) => setCurrentPassInput(e.target.value)}
                      className="w-full px-3 pr-10 py-2 min-h-[40px] text-sm border border-zinc-300 rounded-lg focus:outline-none focus:border-[#14532D]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassInput((v) => !v)}
                      aria-label={showCurrentPassInput ? 'Sembunyikan sandi lama' : 'Lihat sandi lama'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-500 cursor-pointer"
                    >
                      {showCurrentPassInput ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="me-new-pass" className="block text-xs text-zinc-600 mb-1">
                    Kata Sandi Baru (Minimal 6 karakter)
                  </label>
                  <div className="relative">
                    <input
                      id="me-new-pass"
                      type={showNewPassInput ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={newPassInput}
                      onChange={(e) => setNewPassInput(e.target.value)}
                      className="w-full px-3 pr-10 py-2 min-h-[40px] text-sm border border-zinc-300 rounded-lg focus:outline-none focus:border-[#14532D]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassInput((v) => !v)}
                      aria-label={showNewPassInput ? 'Sembunyikan sandi baru' : 'Lihat sandi baru'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-500 cursor-pointer"
                    >
                      {showNewPassInput ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {passChangeError && (
                  <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                    {passChangeError}
                  </p>
                )}
                {passChangeSuccess && (
                  <p className="text-xs text-[#14532D] bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                    {passChangeSuccess}
                  </p>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowChangePassModal(false)}
                    className="px-3.5 py-2 rounded-lg border border-zinc-300 bg-white text-xs font-medium text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                  >
                    Tutup
                  </button>
                  <button
                    type="submit"
                    disabled={savingPassChange}
                    className="px-4 py-2 rounded-lg bg-[#14532D] text-white text-xs font-semibold hover:bg-[#166534] disabled:opacity-60 cursor-pointer"
                  >
                    {savingPassChange ? 'Menyimpan...' : 'Simpan Sandi Baru'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

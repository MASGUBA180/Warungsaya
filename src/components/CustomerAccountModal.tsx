import {
  AlertCircle,
  Camera,
  Eye,
  EyeOff,
  LogOut,
  MapPin,
  MessageSquareWarning,
  RefreshCw,
  RotateCcw,
  Trash2,
  User,
  X,
} from 'lucide-react';
import {ChangeEvent, FormEvent, useCallback, useEffect, useState} from 'react';
import {apiFetch} from '../lib/apiClient';
import {compressImageFileToDataUrl} from '../lib/imageHelpers';
import {
  COMPLAINT_CATEGORY_LABELS,
  COMPLAINT_RESOLUTION_LABELS,
  COMPLAINT_STATUS_LABELS,
  formatRupiah,
  formatShortDate,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from '../lib/storeData';
import type {
  ComplaintCategory,
  ComplaintRecord,
  ComplaintResolution,
  CustomerProfile,
  GeoPoint,
  KasbonRecord,
  Order,
} from '../types/store';

interface CustomerAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: CustomerProfile | null;
  customerToken: string | null;
  onAuthenticated: (token: string, profile: CustomerProfile) => void;
  onLogout: () => void;
  onOpenOrderTracker: (orderNumber: string) => void;
  onReorderItems: (items: Order['items']) => void;
}

export function CustomerAccountModal({
  isOpen,
  onClose,
  customer,
  customerToken,
  onAuthenticated,
  onLogout,
  onOpenOrderTracker,
  onReorderItems,
}: CustomerAccountModalProps) {
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [defaultAddress, setDefaultAddress] = useState('Gang Makam, Gunung Batin Udik');
  const [passcode, setPasscode] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Authenticated portal tabs
  const [activeTab, setActiveTab] = useState<'orders' | 'complaints' | 'profile'>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [kasbonList, setKasbonList] = useState<KasbonRecord[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // Order status filter
  const [orderFilter, setOrderFilter] = useState<'ALL' | 'ACTIVE' | 'DONE' | 'CANCELLED'>('ALL');

  // Order cancellation inline state
  const [confirmCancelOrderNo, setConfirmCancelOrderNo] = useState<string | null>(null);
  const [cancellingOrderNo, setCancellingOrderNo] = useState<string | null>(null);

  // Complaint submission state
  const [selectedOrderNo, setSelectedOrderNo] = useState('');
  const [complaintCategory, setComplaintCategory] =
    useState<ComplaintCategory>('BARANG_RUSAK');
  const [requestedResolution, setRequestedResolution] =
    useState<ComplaintResolution>('GANTI_BARANG');
  const [complaintDesc, setComplaintDesc] = useState('');
  const [evidencePhoto, setEvidencePhoto] = useState<string>('');
  const [complaintError, setComplaintError] = useState('');
  const [complaintSuccess, setComplaintSuccess] = useState('');
  const [submittingComplaint, setSubmittingComplaint] = useState(false);

  // Profile & password edit state
  const [editName, setEditName] = useState('');
  const [editAddr, setEditAddr] = useState('');
  const [editSavedCoords, setEditSavedCoords] = useState<GeoPoint | null>(
    customer?.savedCoords ?? null
  );
  const [profileGpsNotice, setProfileGpsNotice] = useState('');
  const [profileSaved, setProfileSaved] = useState('');
  const [currentPasscode, setCurrentPasscode] = useState('');
  const [newPasscode, setNewPasscode] = useState('');
  const [passMessage, setPassMessage] = useState('');
  const [passError, setPassError] = useState('');
  const [savingPass, setSavingPass] = useState(false);

  const loadCustomerPortal = useCallback(async () => {
    if (!customerToken) return;
    setLoadingData(true);
    try {
      const res = await apiFetch<{
        customer?: CustomerProfile;
        orders?: Order[];
        complaints?: ComplaintRecord[];
        kasbon?: KasbonRecord[];
      }>('/api/customer/me', {
        headers: {Authorization: `Bearer ${customerToken}`},
      });
      if (res.ok) {
        const fetchedOrders = res.data.orders || [];
        setOrders(fetchedOrders);
        setComplaints(res.data.complaints || []);
        setKasbonList(res.data.kasbon || []);
        if (fetchedOrders.length > 0) {
          setSelectedOrderNo((prev) => prev || fetchedOrders[0].orderNumber);
        }
        if (res.data.customer) {
          setEditName(res.data.customer.name);
          setEditAddr(res.data.customer.defaultAddress);
          setEditSavedCoords(res.data.customer.savedCoords ?? null);
        }
      }
    } finally {
      setLoadingData(false);
    }
  }, [customerToken]);

  useEffect(() => {
    if (!isOpen) return;
    if (customerToken) {
      loadCustomerPortal();
    }
  }, [isOpen, customerToken, loadCustomerPortal]);

  useEffect(() => {
    if (customer) {
      setEditName(customer.name);
      setEditAddr(customer.defaultAddress);
      setEditSavedCoords(customer.savedCoords ?? null);
    }
  }, [customer]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleAuthSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const endpoint =
        authMode === 'register' ? '/api/customer/register' : '/api/customer/login';
      const payload =
        authMode === 'register'
          ? {
              name: name.trim(),
              phone: phone.trim(),
              defaultAddress: defaultAddress.trim(),
              passcode,
            }
          : {phone: phone.trim(), passcode};

      const res = await apiFetch<{
        customerToken?: string;
        customer?: CustomerProfile;
        error?: string;
      }>(endpoint, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
      });

      if (!res.ok || !res.data.customerToken || !res.data.customer) {
        setAuthError(res.data.error || 'Gagal memproses akun pelanggan.');
        return;
      }

      setPasscode('');
      onAuthenticated(res.data.customerToken, res.data.customer);
    } catch {
      setAuthError('Gagal terhubung ke server Toko Dimas Jaya.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handlePhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setComplaintError('');
    try {
      const compressed = await compressImageFileToDataUrl(file);
      setEvidencePhoto(compressed);
    } catch (err) {
      setComplaintError(err instanceof Error ? err.message : 'Gagal memuat foto bukti.');
    }
    e.target.value = '';
  };

  const handleSubmitComplaint = async (e: FormEvent) => {
    e.preventDefault();
    if (!customerToken) return;
    setComplaintError('');
    setComplaintSuccess('');
    setSubmittingComplaint(true);
    try {
      const res = await apiFetch<{complaint?: ComplaintRecord; error?: string}>(
        '/api/public/complaints',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${customerToken}`,
          },
          body: JSON.stringify({
            orderNumber: selectedOrderNo,
            category: complaintCategory,
            requestedResolution,
            description: complaintDesc.trim(),
            evidencePhoto: evidencePhoto || undefined,
          }),
        }
      );
      if (!res.ok || !res.data.complaint) {
        setComplaintError(res.data.error || 'Gagal mengirim laporan komplain.');
        return;
      }
      setComplaintSuccess(
        `Laporan ${res.data.complaint.complaintNumber} tercatat dan akan segera ditinjau admin toko.`
      );
      setComplaintDesc('');
      setEvidencePhoto('');
      await loadCustomerPortal();
    } catch {
      setComplaintError('Gagal menghubungi server toko.');
    } finally {
      setSubmittingComplaint(false);
    }
  };

  const handleCancelOrder = async (orderNumber: string) => {
    if (!customerToken) return;
    setCancellingOrderNo(orderNumber);
    try {
      const res = await apiFetch<{order?: Order; error?: string}>(
        `/api/public/orders/${orderNumber}/cancel`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${customerToken}`,
          },
          body: JSON.stringify({}),
        }
      );
      if (res.ok) {
        setConfirmCancelOrderNo(null);
        await loadCustomerPortal();
      }
    } finally {
      setCancellingOrderNo(null);
    }
  };

  const handleCaptureProfileGps = () => {
    if (!navigator.geolocation) {
      setProfileGpsNotice('Browser tidak mendukung GPS.');
      return;
    }
    setProfileGpsNotice('Mengambil koordinat GPS rumah...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const pt: GeoPoint = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        };
        setEditSavedCoords(pt);
        setProfileGpsNotice(
          `Titik rumah disiapkan (${pt.lat.toFixed(4)}, ${pt.lng.toFixed(4)}). Klik Simpan Profil.`
        );
      },
      () => {
        setProfileGpsNotice('Izin GPS belum aktif.');
      },
      {enableHighAccuracy: true, timeout: 8000}
    );
  };

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!customerToken) return;
    setProfileSaved('');
    const res = await apiFetch<{customer?: CustomerProfile}>('/api/customer/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({
        name: editName.trim(),
        defaultAddress: editAddr.trim(),
        savedCoords: editSavedCoords,
      }),
    });
    if (res.ok && res.data.customer) {
      onAuthenticated(customerToken, res.data.customer);
      setProfileSaved('Profil, alamat & pin lokasi tersimpan.');
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!customerToken) return;
    setPassError('');
    setPassMessage('');
    setSavingPass(true);
    try {
      const res = await apiFetch<{updated?: boolean; error?: string}>('/api/customer/password', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerToken}`,
        },
        body: JSON.stringify({currentPasscode, newPasscode}),
      });
      if (!res.ok) {
        setPassError(res.data.error || 'Gagal mengganti kata sandi.');
        return;
      }
      setCurrentPasscode('');
      setNewPasscode('');
      setPassMessage('Kata sandi akun pelanggan berhasil diperbarui.');
    } finally {
      setSavingPass(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Akun Pelanggan Toko Dimas Jaya"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-2xl max-h-[92vh] flex flex-col rounded-xl border border-zinc-200 shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#F3F4F2] flex items-center justify-center text-[#14532D] shrink-0">
              <User className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold text-zinc-900 truncate">
                {customer ? `Halo, ${customer.name}` : 'Akun Pelanggan Warga'}
              </h2>
              <p className="text-xs text-zinc-500 truncate">
                {customer
                  ? `${customer.phone} · Riwayat pesanan otomatis tersimpan`
                  : 'Masuk untuk melihat riwayat belanja tanpa mengetik ulang kode pesanan'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup akun pelanggan"
            className="p-1.5 text-zinc-500 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!customer || !customerToken ? (
          <div className="p-6 overflow-y-auto space-y-5">
            <div className="grid grid-cols-2 gap-1 p-1 bg-zinc-100 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setAuthError('');
                }}
                className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  authMode === 'login'
                    ? 'bg-white text-zinc-900 shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Masuk Pelanggan
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setAuthError('');
                }}
                className={`py-2 px-3 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  authMode === 'register'
                    ? 'bg-white text-zinc-900 shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Daftar Akun Baru
              </button>
            </div>

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {authMode === 'register' && (
                <div>
                  <label htmlFor="cust-name" className="block text-xs text-zinc-600 mb-1">
                    Nama Lengkap
                  </label>
                  <input
                    id="cust-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Contoh: Ibu Rina"
                    className="w-full px-3 py-2.5 min-h-[42px] text-sm border border-zinc-300 rounded-lg focus:outline-none focus:border-[#14532D]"
                  />
                </div>
              )}

              <div>
                <label htmlFor="cust-phone" className="block text-xs text-zinc-600 mb-1">
                  Nomor HP / WhatsApp
                </label>
                <input
                  id="cust-phone"
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="08xx-xxxx-xxxx"
                  className="w-full px-3 py-2.5 min-h-[42px] text-sm font-mono border border-zinc-300 rounded-lg focus:outline-none focus:border-[#14532D]"
                />
              </div>

              {authMode === 'register' && (
                <div>
                  <label htmlFor="cust-addr" className="block text-xs text-zinc-600 mb-1">
                    Alamat Utama Pengantaran
                  </label>
                  <input
                    id="cust-addr"
                    type="text"
                    required
                    value={defaultAddress}
                    onChange={(e) => setDefaultAddress(e.target.value)}
                    placeholder="Gang Makam RT ..., Gunung Batin Udik"
                    className="w-full px-3 py-2.5 min-h-[42px] text-sm border border-zinc-300 rounded-lg focus:outline-none focus:border-[#14532D]"
                  />
                </div>
              )}

              <div>
                <label htmlFor="cust-pass" className="block text-xs text-zinc-600 mb-1">
                  Kata Sandi (Minimal 6 karakter)
                </label>
                <div className="relative">
                  <input
                    id="cust-pass"
                    type={showPass ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="Masukkan kata sandi"
                    className="w-full px-3 pr-10 py-2.5 min-h-[42px] text-sm border border-zinc-300 rounded-lg focus:outline-none focus:border-[#14532D]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-zinc-500 cursor-pointer"
                    aria-label={showPass ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {authError && (
                <p
                  role="alert"
                  className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3"
                >
                  {authError}
                </p>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3 px-4 min-h-[44px] rounded-lg bg-[#14532D] text-white text-sm font-semibold hover:bg-[#166534] disabled:opacity-60 cursor-pointer"
              >
                {authLoading
                  ? 'Memproses...'
                  : authMode === 'register'
                    ? 'Daftar Akun Pelanggan'
                    : 'Masuk ke Akun Saya'}
              </button>
            </form>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Subnav */}
            <div className="px-6 py-3 border-b border-zinc-200 bg-zinc-50 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveTab('orders')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                    activeTab === 'orders'
                      ? 'bg-[#14532D] text-white'
                      : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                  }`}
                >
                  Riwayat Belanja ({orders.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('complaints')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                    activeTab === 'complaints'
                      ? 'bg-[#14532D] text-white'
                      : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                  }`}
                >
                  Komplain &amp; Retur ({complaints.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                    activeTab === 'profile'
                      ? 'bg-[#14532D] text-white'
                      : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                  }`}
                >
                  Alamat &amp; Profil
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={loadCustomerPortal}
                  disabled={loadingData}
                  className="p-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:text-zinc-900 cursor-pointer"
                  aria-label="Muat ulang riwayat"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingData ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={onLogout}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-300 bg-white text-xs font-medium text-zinc-700 hover:bg-zinc-100 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Keluar</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {activeTab === 'orders' && (
                <>
                  {kasbonList.some((k) => k.amountDue - k.totalPaid > 0) && (
                    <div className="border border-amber-200 bg-amber-50/70 rounded-xl p-4 space-y-2">
                      <p className="text-xs font-bold text-amber-950">
                        Catatan Kasbon / Bon Aktif Anda
                      </p>
                      <div className="space-y-1.5">
                        {kasbonList
                          .filter((k) => k.amountDue - k.totalPaid > 0)
                          .map((k) => {
                            const remaining = Math.max(0, k.amountDue - k.totalPaid);
                            return (
                              <div
                                key={k.id}
                                className="flex flex-wrap items-center justify-between gap-2 text-xs bg-white border border-amber-200 rounded-lg px-3 py-2"
                              >
                                <div className="min-w-0">
                                  <p className="font-medium text-zinc-900">{k.note}</p>
                                  <p className="text-[11px] text-zinc-500">
                                    Terbayar {formatRupiah(k.totalPaid)} dari {formatRupiah(k.amountDue)}
                                    {k.dueDate ? ` · Jatuh tempo ${k.dueDate}` : ''}
                                  </p>
                                </div>
                                <span className="font-bold text-amber-900 tabular-price whitespace-nowrap">
                                  Sisa {formatRupiah(remaining)}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {orders.length === 0 ? (
                    <div className="p-8 text-center border border-dashed border-zinc-200 rounded-xl space-y-2">
                      <p className="text-sm font-semibold text-zinc-900">
                        Belum ada pesanan tercatat di akun ini
                      </p>
                      <p className="text-xs text-zinc-500">
                        Setiap belanja sembako memakai nomor HP {customer.phone} akan tersimpan di sini otomatis.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(
                          [
                            ['ALL', `Semua (${orders.length})`],
                            [
                              'ACTIVE',
                              `Aktif (${orders.filter((o) => ['MENUNGGU', 'DISIAPKAN', 'DIANTAR'].includes(o.status)).length})`,
                            ],
                            [
                              'DONE',
                              `Selesai (${orders.filter((o) => o.status === 'SELESAI').length})`,
                            ],
                            [
                              'CANCELLED',
                              `Batal (${orders.filter((o) => o.status === 'DIBATALKAN').length})`,
                            ],
                          ] as const
                        ).map(([id, label]) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setOrderFilter(id)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                              orderFilter === id
                                ? 'bg-[#14532D] text-white'
                                : 'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      {orders
                        .filter((o) => {
                          if (orderFilter === 'ACTIVE')
                            return ['MENUNGGU', 'DISIAPKAN', 'DIANTAR'].includes(o.status);
                          if (orderFilter === 'DONE') return o.status === 'SELESAI';
                          if (orderFilter === 'CANCELLED') return o.status === 'DIBATALKAN';
                          return true;
                        })
                        .map((ord) => {
                          const latestWa = ord.whatsappNotifications?.[0];
                          return (
                            <div
                              key={ord.id}
                              className="border border-zinc-200 rounded-xl p-4 bg-white space-y-3"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <p className="font-mono text-xs font-semibold text-[#14532D] tabular-price">
                                    {ord.orderNumber} · {formatShortDate(ord.createdAt)}
                                  </p>
                                  <p className="text-sm font-bold text-zinc-900 mt-0.5">
                                    {ORDER_STATUS_LABELS[ord.status]}
                                  </p>
                                  <p className="text-[11px] text-zinc-500 mt-0.5">
                                    {ord.paymentMethod} ·{' '}
                                    {ord.paymentStatus
                                      ? PAYMENT_STATUS_LABELS[ord.paymentStatus]
                                      : 'Tunai/COD'}
                                  </p>
                                </div>
                                <p className="text-base font-bold text-zinc-900 tabular-price">
                                  {formatRupiah(ord.total)}
                                </p>
                              </div>

                              <div className="text-xs text-zinc-600 bg-zinc-50 rounded-lg p-3 space-y-1">
                                {ord.items.map((item, idx) => (
                                  <div key={idx} className="flex justify-between gap-2">
                                    <span>
                                      {item.productName} ({item.variantLabel}) x{item.quantity}
                                    </span>
                                    <span className="tabular-price font-medium">
                                      {formatRupiah(item.unitPrice * item.quantity)}
                                    </span>
                                  </div>
                                ))}
                              </div>

                              {(ord.tracking?.proofNote || ord.tracking?.proofPhoto) && (
                                <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-3 flex items-center gap-3 text-xs">
                                  {ord.tracking?.proofPhoto && (
                                    <img
                                      src={ord.tracking.proofPhoto}
                                      alt={`Bukti serah terima ${ord.orderNumber}`}
                                      className="w-12 h-12 rounded-md object-cover border border-zinc-200 shrink-0"
                                    />
                                  )}
                                  <div>
                                    <p className="font-semibold text-zinc-800">
                                      Bukti Serah Terima Kurir
                                    </p>
                                    {ord.tracking?.proofNote && (
                                      <p className="text-zinc-600 mt-0.5">
                                        {ord.tracking.proofNote}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              )}

                              {latestWa && (
                                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-[11px] text-emerald-950 space-y-1">
                                  <p className="font-semibold">
                                    Notifikasi WhatsApp ({latestWa.trigger}) ·{' '}
                                    {formatShortDate(latestWa.sentAt)}
                                  </p>
                                  <p className="whitespace-pre-line text-emerald-900">
                                    {latestWa.message}
                                  </p>
                                </div>
                              )}

                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  onOpenOrderTracker(ord.orderNumber);
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#14532D] text-white text-xs font-semibold hover:bg-[#166534] cursor-pointer whitespace-nowrap"
                              >
                                <MapPin className="w-3.5 h-3.5" />
                                <span>Peta &amp; Detail QRIS</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  onReorderItems(ord.items);
                                  onClose();
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 bg-white text-xs font-medium text-zinc-800 hover:bg-zinc-50 cursor-pointer whitespace-nowrap"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Pesan Lagi</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedOrderNo(ord.orderNumber);
                                  setActiveTab('complaints');
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 bg-white text-xs font-medium text-zinc-700 hover:bg-zinc-50 cursor-pointer whitespace-nowrap"
                              >
                                <MessageSquareWarning className="w-3.5 h-3.5" />
                                <span>Ajukan Komplain</span>
                              </button>

                              {ord.status === 'MENUNGGU' &&
                                (confirmCancelOrderNo === ord.orderNumber ? (
                                  <span className="inline-flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1 text-[11px]">
                                    <span className="text-red-800 font-medium">Batalkan pesanan?</span>
                                    <button
                                      type="button"
                                      disabled={cancellingOrderNo === ord.orderNumber}
                                      onClick={() => handleCancelOrder(ord.orderNumber)}
                                      className="font-bold text-red-700 underline cursor-pointer"
                                    >
                                      {cancellingOrderNo === ord.orderNumber ? '...' : 'Ya, Batal'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmCancelOrderNo(null)}
                                      className="text-zinc-600 cursor-pointer"
                                    >
                                      Tidak
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmCancelOrderNo(ord.orderNumber)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 text-red-700 text-xs font-medium hover:bg-red-50 cursor-pointer whitespace-nowrap"
                                  >
                                    Batalkan Pesanan
                                  </button>
                                ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {activeTab === 'complaints' && (
                <div className="space-y-6">
                  <form
                    onSubmit={handleSubmitComplaint}
                    className="border border-zinc-200 rounded-xl p-4 bg-zinc-50 space-y-3"
                  >
                    <h3 className="text-sm font-bold text-zinc-900">
                      Ajukan Komplain / Retur Barang
                    </h3>

                    {orders.length === 0 ? (
                      <p className="text-xs text-zinc-600 flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4 text-zinc-400" />
                        <span>Anda belum memiliki pesanan untuk dikomplain.</span>
                      </p>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label htmlFor="cmp-ord" className="block text-xs text-zinc-600 mb-1">
                              Pilih Pesanan
                            </label>
                            <select
                              id="cmp-ord"
                              value={selectedOrderNo}
                              onChange={(e) => setSelectedOrderNo(e.target.value)}
                              className="w-full px-3 py-2 text-xs bg-white border border-zinc-300 rounded-lg"
                            >
                              {orders.map((o) => (
                                <option key={o.id} value={o.orderNumber}>
                                  {o.orderNumber} ({formatRupiah(o.total)})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label htmlFor="cmp-cat" className="block text-xs text-zinc-600 mb-1">
                              Kendala Barang
                            </label>
                            <select
                              id="cmp-cat"
                              value={complaintCategory}
                              onChange={(e) =>
                                setComplaintCategory(e.target.value as ComplaintCategory)
                              }
                              className="w-full px-3 py-2 text-xs bg-white border border-zinc-300 rounded-lg"
                            >
                              {Object.entries(COMPLAINT_CATEGORY_LABELS).map(([k, lbl]) => (
                                <option key={k} value={k}>
                                  {lbl}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label htmlFor="cmp-res" className="block text-xs text-zinc-600 mb-1">
                              Solusi Diinginkan
                            </label>
                            <select
                              id="cmp-res"
                              value={requestedResolution}
                              onChange={(e) =>
                                setRequestedResolution(e.target.value as ComplaintResolution)
                              }
                              className="w-full px-3 py-2 text-xs bg-white border border-zinc-300 rounded-lg"
                            >
                              {Object.entries(COMPLAINT_RESOLUTION_LABELS).map(([k, lbl]) => (
                                <option key={k} value={k}>
                                  {lbl}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div>
                          <label htmlFor="cmp-desc" className="block text-xs text-zinc-600 mb-1">
                            Penjelasan Detail (Nama barang &amp; kendala)
                          </label>
                          <textarea
                            id="cmp-desc"
                            rows={2}
                            required
                            value={complaintDesc}
                            onChange={(e) => setComplaintDesc(e.target.value)}
                            placeholder="Contoh: Telur 2 butir retak saat diterima / gula kurang 1 bungkus"
                            className="w-full px-3 py-2 text-xs bg-white border border-zinc-300 rounded-lg"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-xs text-zinc-600">
                            Foto Bukti Barang (Opsional)
                          </label>
                          <div className="flex flex-wrap items-center gap-3">
                            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 bg-white text-xs font-medium text-zinc-700 hover:bg-zinc-100 cursor-pointer">
                              <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>{evidencePhoto ? 'Ganti Foto Bukti' : 'Pilih Foto Bukti'}</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handlePhotoChange}
                                className="hidden"
                              />
                            </label>
                            {evidencePhoto && (
                              <div className="flex items-center gap-2">
                                <img
                                  src={evidencePhoto}
                                  alt="Pratinjau foto bukti komplain"
                                  className="w-12 h-12 object-cover rounded-lg border border-zinc-200"
                                />
                                <button
                                  type="button"
                                  onClick={() => setEvidencePhoto('')}
                                  className="p-1 text-red-700 hover:bg-red-50 rounded cursor-pointer"
                                  aria-label="Hapus foto bukti"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {complaintError && (
                          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                            {complaintError}
                          </p>
                        )}
                        {complaintSuccess && (
                          <p className="text-xs text-[#14532D] bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                            {complaintSuccess}
                          </p>
                        )}

                        <button
                          type="submit"
                          disabled={submittingComplaint}
                          className="px-4 py-2 rounded-lg bg-[#14532D] text-white text-xs font-semibold hover:bg-[#166534] disabled:opacity-60 cursor-pointer"
                        >
                          {submittingComplaint ? 'Mengirim...' : 'Kirim Pengajuan Komplain'}
                        </button>
                      </>
                    )}
                  </form>

                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-zinc-600">
                      Riwayat Laporan Komplain Anda
                    </h4>
                    {complaints.length === 0 ? (
                      <p className="text-xs text-zinc-500">Belum ada laporan komplain.</p>
                    ) : (
                      complaints.map((c) => (
                        <div
                          key={c.id}
                          className="border border-zinc-200 rounded-xl p-4 bg-white space-y-2 text-xs"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-mono font-semibold text-zinc-900">
                              {c.complaintNumber} · Pesanan {c.orderNumber}
                            </p>
                            <span className="px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200 font-semibold text-zinc-800">
                              {COMPLAINT_STATUS_LABELS[c.status]}
                            </span>
                          </div>
                          <p className="text-zinc-700">
                            <strong>{COMPLAINT_CATEGORY_LABELS[c.category]}</strong> —{' '}
                            {c.description}
                          </p>
                          {c.evidencePhoto && (
                            <img
                              src={c.evidencePhoto}
                              alt={`Foto bukti ${c.complaintNumber}`}
                              className="w-24 h-24 object-cover rounded-lg border border-zinc-200"
                            />
                          )}
                          <p className="text-zinc-500">
                            Permintaan: {COMPLAINT_RESOLUTION_LABELS[c.requestedResolution]}
                            {c.refundAmount ? ` · Nominal: ${formatRupiah(c.refundAmount)}` : ''}
                          </p>
                          {c.staffResponse && (
                            <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-950">
                              <strong>Tanggapan Toko ({c.handledBy || 'Admin'}):</strong>{' '}
                              {c.staffResponse}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'profile' && (
                <div className="space-y-6 max-w-md">
                  <form onSubmit={handleSaveProfile} className="space-y-4">
                    <div>
                      <label htmlFor="prof-phone" className="block text-xs text-zinc-600 mb-1">
                        Nomor HP / WhatsApp Terdaftar
                      </label>
                      <input
                        id="prof-phone"
                        type="text"
                        disabled
                        value={customer.phone}
                        className="w-full px-3 py-2 min-h-[40px] text-sm font-mono bg-zinc-100 text-zinc-600 border border-zinc-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label htmlFor="prof-name" className="block text-xs text-zinc-600 mb-1">
                        Nama Pemesan
                      </label>
                      <input
                        id="prof-name"
                        type="text"
                        required
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-3 py-2 min-h-[40px] text-sm border border-zinc-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label htmlFor="prof-addr" className="block text-xs text-zinc-600 mb-1">
                        Alamat Pengantaran Utama (Otomatis Terisi Saat Checkout)
                      </label>
                      <input
                        id="prof-addr"
                        type="text"
                        required
                        value={editAddr}
                        onChange={(e) => setEditAddr(e.target.value)}
                        className="w-full px-3 py-2 min-h-[40px] text-sm border border-zinc-300 rounded-lg"
                      />
                    </div>
                    <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                      <p className="text-xs font-medium text-zinc-800">
                        Pin Lokasi GPS Rumah (Opsional, otomatis ikut saat pesan COD)
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleCaptureProfileGps}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 bg-white text-xs font-medium text-zinc-800 hover:bg-zinc-50 cursor-pointer"
                        >
                          <MapPin className="w-3.5 h-3.5 text-[#14532D]" />
                          <span>
                            {editSavedCoords ? 'Perbarui Pin GPS Rumah' : 'Simpan Pin GPS Saat Ini'}
                          </span>
                        </button>
                        {editSavedCoords && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditSavedCoords(null);
                              setProfileGpsNotice('Pin lokasi akan dihapus setelah klik Simpan.');
                            }}
                            className="text-xs text-zinc-500 hover:text-red-700 cursor-pointer"
                          >
                            Hapus Pin
                          </button>
                        )}
                      </div>
                      {editSavedCoords && (
                        <p className="text-[11px] font-mono text-[#14532D]">
                          Tersimpan: {editSavedCoords.lat.toFixed(4)}, {editSavedCoords.lng.toFixed(4)}
                        </p>
                      )}
                      {profileGpsNotice && (
                        <p className="text-[11px] text-zinc-600">{profileGpsNotice}</p>
                      )}
                    </div>
                    {profileSaved && (
                      <p className="text-xs text-[#14532D] bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                        {profileSaved}
                      </p>
                    )}
                    <button
                      type="submit"
                      className="px-4 py-2.5 rounded-lg bg-[#14532D] text-white text-xs font-semibold hover:bg-[#166534] cursor-pointer"
                    >
                      Simpan Profil &amp; Alamat
                    </button>
                  </form>

                  <form
                    onSubmit={handleChangePassword}
                    className="pt-5 border-t border-zinc-200 space-y-3"
                  >
                    <h3 className="text-xs font-bold text-zinc-900">
                      Ubah Kata Sandi Akun
                    </h3>
                    <div>
                      <label htmlFor="cur-pass" className="block text-xs text-zinc-600 mb-1">
                        Kata Sandi Saat Ini
                      </label>
                      <input
                        id="cur-pass"
                        type="password"
                        required
                        value={currentPasscode}
                        onChange={(e) => setCurrentPasscode(e.target.value)}
                        className="w-full px-3 py-2 min-h-[40px] text-sm border border-zinc-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label htmlFor="new-pass" className="block text-xs text-zinc-600 mb-1">
                        Kata Sandi Baru (Min. 6 karakter)
                      </label>
                      <input
                        id="new-pass"
                        type="password"
                        required
                        minLength={6}
                        value={newPasscode}
                        onChange={(e) => setNewPasscode(e.target.value)}
                        className="w-full px-3 py-2 min-h-[40px] text-sm border border-zinc-300 rounded-lg"
                      />
                    </div>
                    {passError && (
                      <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                        {passError}
                      </p>
                    )}
                    {passMessage && (
                      <p className="text-xs text-[#14532D] bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                        {passMessage}
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={savingPass}
                      className="px-4 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-800 text-xs font-semibold hover:bg-zinc-50 disabled:opacity-60 cursor-pointer"
                    >
                      {savingPass ? 'Menyimpan...' : 'Perbarui Kata Sandi'}
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

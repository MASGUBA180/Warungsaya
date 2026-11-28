import {
  Download,
  Edit3,
  Eye,
  EyeOff,
  Navigation,
  Printer,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {useEffect, useMemo, useState, type FormEvent} from 'react';
import {apiFetch} from '../../lib/apiClient';
import {
  formatRupiah,
  formatShortDate,
  ORDER_STATUS_LABELS,
  ROLE_HIERARCHY_LEVEL,
  ROLE_LABELS,
} from '../../lib/storeData';
import type {
  AuditLogEntry,
  CashierShift,
  DivisionRole,
  GeoPoint,
  LedgerEntry,
  Order,
  Product,
  PublicStaffProfile,
  StoreSettings,
} from '../../types/store';
import {DeliveryMap} from '../DeliveryMap';

export interface OverviewMetrics {
  totalRevenue: number;
  totalExpense: number;
  netCash: number;
  estimatedProfit?: number;
  pendingOrdersCount: number;
  activeDeliveriesCount: number;
  lowStockCount: number;
  pendingSupplierDeliveriesCount?: number;
  pendingComplaintsCount?: number;
  openShiftsCount?: number;
  totalKasbonOutstanding: number;
  totalOrders: number;
}

interface OwnerOverviewTabProps {
  mode: 'overview' | 'admin';
  currentUserRole: DivisionRole;
  overview: OverviewMetrics;
  orders: Order[];
  ledger?: LedgerEntry[];
  products: Product[];
  staff: PublicStaffProfile[];
  shifts: CashierShift[];
  auditLogs: AuditLogEntry[];
  settings: StoreSettings;
  authToken: string;
  onRefresh: () => Promise<void>;
  onNavigateTab: (
    tab: 'kasir' | 'gudang' | 'pemasok' | 'kurir' | 'keuangan' | 'komplain'
  ) => void;
}

type OverviewPeriod = 'today' | '7d' | '30d' | 'all';

function getPeriodCutoffMs(period: OverviewPeriod): number | null {
  if (period === 'all') return null;
  const now = new Date();
  if (period === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return start.getTime();
  }
  const days = period === '7d' ? 7 : 30;
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

export function OwnerOverviewTab({
  mode,
  currentUserRole,
  overview,
  orders,
  ledger = [],
  products,
  staff,
  shifts,
  auditLogs,
  settings,
  authToken,
  onRefresh,
  onNavigateTab,
}: OwnerOverviewTabProps) {
  const isOwner = currentUserRole === 'PEMILIK';

  // Period filter state for Overview
  const [period, setPeriod] = useState<OverviewPeriod>('all');

  // Staff creation & management state
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<DivisionRole>('KASIR');
  const [passcode, setPasscode] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [staffError, setStaffError] = useState('');
  const [staffSuccess, setStaffSuccess] = useState('');
  const [savingStaff, setSavingStaff] = useState(false);
  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const [resetPassValue, setResetPassValue] = useState('');

  // Inline edit / delete staff state
  const [editStaffTarget, setEditStaffTarget] = useState<PublicStaffProfile | null>(null);
  const [editStaffName, setEditStaffName] = useState('');
  const [editStaffUsername, setEditStaffUsername] = useState('');
  const [editStaffRole, setEditStaffRole] = useState<DivisionRole>('KASIR');
  const [savingEditStaff, setSavingEditStaff] = useState(false);
  const [confirmDeleteStaffId, setConfirmDeleteStaffId] = useState<string | null>(null);

  // Settings form state
  const [hours, setHours] = useState(settings.hours);
  const [daysOpen, setDaysOpen] = useState(settings.daysOpen);
  const [deliveryArea, setDeliveryArea] = useState(settings.deliveryArea);
  const [deliveryFee, setDeliveryFee] = useState(String(settings.deliveryFee));
  const [freeDeliveryMin, setFreeDeliveryMin] = useState(String(settings.freeDeliveryMin));
  const [whatsappNumber, setWhatsappNumber] = useState(settings.whatsappNumber || '6281279008899');
  const [qrisMerchantName, setQrisMerchantName] = useState(
    settings.qrisMerchantName || 'TOKO DIMAS JAYA'
  );
  const [qrisNmid, setQrisNmid] = useState(settings.qrisNmid || 'ID1020260000188');
  const [storeCoords, setStoreCoords] = useState<GeoPoint | null>(settings.storeCoords ?? null);
  const [storeGpsNotice, setStoreGpsNotice] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSavedMsg, setSettingsSavedMsg] = useState('');

  useEffect(() => {
    setStoreCoords(settings.storeCoords ?? null);
    setWhatsappNumber(settings.whatsappNumber || '6281279008899');
    setQrisMerchantName(settings.qrisMerchantName || 'TOKO DIMAS JAYA');
    setQrisNmid(settings.qrisNmid || 'ID1020260000188');
  }, [
    settings.storeCoords,
    settings.whatsappNumber,
    settings.qrisMerchantName,
    settings.qrisNmid,
  ]);

  const lowStockVariants = products.flatMap((p) =>
    p.variants
      .filter((v) => v.stock <= v.minStock)
      .map((v) => ({
        productName: p.name,
        variantLabel: v.label,
        stock: v.stock,
        minStock: v.minStock,
      }))
  );

  // Period-filtered metrics & analytics
  const analytics = useMemo(() => {
    const cutoff = getPeriodCutoffMs(period);
    const filteredOrders =
      cutoff === null
        ? orders
        : orders.filter((o) => {
            const ts = new Date(o.createdAt).getTime();
            return Number.isFinite(ts) && ts >= cutoff;
          });
    const filteredLedger =
      cutoff === null
        ? ledger
        : ledger.filter((l) => {
            const ts = new Date(l.createdAt).getTime();
            return Number.isFinite(ts) && ts >= cutoff;
          });

    const rev =
      period === 'all'
        ? overview.totalRevenue
        : filteredLedger.filter((l) => l.type === 'MASUK').reduce((s, l) => s + l.amount, 0);
    const exp =
      period === 'all'
        ? overview.totalExpense
        : filteredLedger.filter((l) => l.type === 'KELUAR').reduce((s, l) => s + l.amount, 0);
    const profit =
      period === 'all'
        ? (overview.estimatedProfit ?? 0)
        : filteredOrders
            .filter((o) => o.status === 'SELESAI')
            .reduce((orderSum, ord) => {
              const orderGross = ord.items.reduce(
                (itemSum, i) => itemSum + (i.unitPrice - (i.costPrice || 0)) * i.quantity,
                0
              );
              return orderSum + orderGross - (ord.discountAmount || 0);
            }, 0);

    // 7-day trend buckets (last 7 calendar days up to today)
    const dayCount = period === '30d' ? 14 : 7;
    const days: {key: string; label: string; total: number; count: number}[] = [];
    for (let i = dayCount - 1; i >= 0; i -= 1) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`;
      const label = d.toLocaleDateString('id-ID', {day: '2-digit', month: 'short'});
      days.push({key, label, total: 0, count: 0});
    }
    const dayMap = new Map(days.map((d) => [d.key, d]));
    for (const ord of orders) {
      if (ord.status === 'DIBATALKAN') continue;
      const dt = new Date(ord.createdAt);
      if (Number.isNaN(dt.getTime())) continue;
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
        dt.getDate()
      ).padStart(2, '0')}`;
      const bucket = dayMap.get(key);
      if (bucket) {
        bucket.total += ord.total;
        bucket.count += 1;
      }
    }

    // Top 5 selling products in filteredOrders
    const productAgg = new Map<
      string,
      {name: string; qty: number; revenue: number}
    >();
    for (const ord of filteredOrders) {
      if (ord.status === 'DIBATALKAN') continue;
      for (const item of ord.items) {
        const cur = productAgg.get(item.productName) || {
          name: item.productName,
          qty: 0,
          revenue: 0,
        };
        cur.qty += item.quantity;
        cur.revenue += item.unitPrice * item.quantity;
        productAgg.set(item.productName, cur);
      }
    }
    const topProducts = Array.from(productAgg.values())
      .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)
      .slice(0, 5);

    return {
      filteredOrders,
      rev,
      exp,
      net: rev - exp,
      profit,
      trendDays: days,
      topProducts,
    };
  }, [period, orders, ledger, overview]);

  const handleExportReportCsv = () => {
    const header = [
      'Kode Pesanan',
      'Waktu',
      'Sumber',
      'Pelanggan',
      'Status',
      'Metode Bayar',
      'Total (Rp)',
    ];
    const rows = analytics.filteredOrders.map((o) => [
      o.orderNumber,
      o.createdAt,
      o.source,
      o.customerName.replace(/"/g, '""'),
      ORDER_STATUS_LABELS[o.status],
      o.paymentMethod,
      String(o.total),
    ]);
    const csvContent = [
      header.join(','),
      ...rows.map((r) => r.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');
    const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `laporan-penjualan-toko-dimas-jaya-${period}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCreateStaff = async (e: FormEvent) => {
    e.preventDefault();
    setStaffError('');
    setStaffSuccess('');
    setSavingStaff(true);
    try {
      const res = await apiFetch<{staff?: PublicStaffProfile; error?: string}>('/api/ops/staff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          displayName: displayName.trim(),
          username: username.trim(),
          role,
          passcode,
        }),
      });
      if (!res.ok || !res.data.staff) {
        setStaffError(res.data.error || 'Gagal menambah staf divisi.');
        return;
      }
      setStaffSuccess(
        `Akun ${res.data.staff.displayName} (${ROLE_LABELS[res.data.staff.role as DivisionRole]}) berhasil dibuat.`
      );
      setDisplayName('');
      setUsername('');
      setPasscode('');
      await onRefresh();
    } catch {
      setStaffError('Gagal menghubungi server.');
    } finally {
      setSavingStaff(false);
    }
  };

  const handleToggleStaffActive = async (member: PublicStaffProfile) => {
    setStaffError('');
    setStaffSuccess('');
    try {
      const res = await apiFetch<{error?: string}>(`/api/ops/staff/${member.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({active: !member.active}),
      });
      if (res.ok) {
        await onRefresh();
      } else {
        setStaffError(res.data.error || 'Aksi tidak diizinkan.');
      }
    } catch {
      // ignore transient
    }
  };

  const handleSaveEditStaff = async (e: FormEvent) => {
    e.preventDefault();
    if (!editStaffTarget) return;
    setStaffError('');
    setStaffSuccess('');
    setSavingEditStaff(true);
    try {
      const res = await apiFetch<{staff?: PublicStaffProfile; error?: string}>(
        `/api/ops/staff/${editStaffTarget.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            displayName: editStaffName.trim(),
            username: editStaffUsername.trim(),
            role: editStaffRole,
          }),
        }
      );
      if (!res.ok) {
        setStaffError(res.data.error || 'Gagal memperbarui data akun staf.');
        return;
      }
      setStaffSuccess(`Data akun ${editStaffName.trim()} berhasil diperbarui.`);
      setEditStaffTarget(null);
      await onRefresh();
    } finally {
      setSavingEditStaff(false);
    }
  };

  const handleDeleteStaff = async (memberId: string) => {
    setStaffError('');
    setStaffSuccess('');
    const res = await apiFetch<{error?: string}>(`/api/ops/staff/${memberId}`, {
      method: 'DELETE',
      headers: {Authorization: `Bearer ${authToken}`},
    });
    if (!res.ok) {
      setStaffError(res.data.error || 'Gagal menghapus akun staf.');
      setConfirmDeleteStaffId(null);
      return;
    }
    setConfirmDeleteStaffId(null);
    setStaffSuccess('Akun staf berhasil dihapus permanen.');
    await onRefresh();
  };

  const handleResetStaffPasscode = async (member: PublicStaffProfile) => {
    if (resetPassValue.length < 6) {
      setStaffError('Kata sandi baru minimal 6 karakter.');
      return;
    }
    setStaffError('');
    setStaffSuccess('');
    try {
      const res = await apiFetch<{error?: string}>(`/api/ops/staff/${member.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({passcode: resetPassValue}),
      });
      if (res.ok) {
        setStaffSuccess(`Kata sandi untuk ${member.displayName} (${member.username}) diperbarui.`);
        setResetTargetId(null);
        setResetPassValue('');
        await onRefresh();
      } else {
        setStaffError(res.data.error || 'Gagal memperbarui kata sandi.');
      }
    } catch {
      setStaffError('Gagal memperbarui kata sandi.');
    }
  };

  const handleCaptureStoreGps = () => {
    if (!navigator.geolocation) {
      setStoreGpsNotice('Browser tidak mendukung GPS. Klik langsung lokasi toko di peta.');
      return;
    }
    setStoreGpsNotice('Mengambil koordinat GPS toko...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const pt: GeoPoint = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        };
        setStoreCoords(pt);
        setStoreGpsNotice(
          `Pin toko diperbarui ke (${pt.lat.toFixed(4)}, ${pt.lng.toFixed(4)}). Klik Simpan Pengaturan.`
        );
      },
      () => {
        setStoreGpsNotice('Izin GPS belum aktif. Anda tetap bisa klik langsung titik toko di peta.');
      },
      {enableHighAccuracy: true, timeout: 8000}
    );
  };

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsSavedMsg('');
    try {
      const res = await apiFetch('/api/ops/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          hours,
          daysOpen,
          deliveryArea,
          deliveryFee: Number(deliveryFee),
          freeDeliveryMin: Number(freeDeliveryMin),
          whatsappNumber,
          ...(isOwner ? {qrisMerchantName, qrisNmid} : {}),
          storeCoords,
        }),
      });
      if (res.ok) {
        setSettingsSavedMsg('Pengaturan toko diperbarui.');
        await onRefresh();
      }
    } finally {
      setSavingSettings(false);
    }
  };

  const roleCount = (r: DivisionRole) =>
    staff.filter((s) => s.role === r && s.active).length;

  if (mode === 'admin') {
    return (
      <div className="space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Add staff form */}
          <form
            onSubmit={handleCreateStaff}
            className="lg:col-span-5 bg-white border border-zinc-200 rounded-xl p-6 space-y-4"
          >
            <div>
              <h3 className="text-base font-semibold text-zinc-900">
                Tambah Akun {isOwner ? 'Direktur & Staf Divisi' : 'Staf Divisi (Bawahan)'}
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                {isOwner
                  ? 'Pemilik dapat menunjuk Direktur Operasional serta seluruh akun divisi di bawahnya.'
                  : 'Sebagai Direktur Operasional, Anda dapat mengelola akun Kasir, Gudang, Pemasok, Kurir, dan Keuangan.'}
              </p>
            </div>

            <div>
              <label htmlFor="staff-name" className="block text-xs text-zinc-600 mb-1">
                Nama Lengkap Staf
              </label>
              <input
                id="staff-name"
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Contoh: Mas Andi"
                className="w-full px-3 py-2 min-h-[40px] text-sm border border-zinc-300 rounded-lg focus:outline-none focus:border-[#14532D]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="staff-username" className="block text-xs text-zinc-600 mb-1">
                  Username Login
                </label>
                <input
                  id="staff-username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="andi.kasir"
                  className="w-full px-3 py-2 min-h-[40px] text-sm font-mono border border-zinc-300 rounded-lg focus:outline-none focus:border-[#14532D]"
                />
              </div>

              <div>
                <label htmlFor="staff-role" className="block text-xs text-zinc-600 mb-1">
                  Jabatan / Divisi
                </label>
                <select
                  id="staff-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as DivisionRole)}
                  className="w-full px-3 py-2 min-h-[40px] text-sm bg-white border border-zinc-300 rounded-lg focus:outline-none focus:border-[#14532D]"
                >
                  {isOwner && <option value="DIREKTUR">Direktur Operasional (Level 2)</option>}
                  <option value="KASIR">Divisi Kasir</option>
                  <option value="GUDANG">Divisi Gudang &amp; Stok</option>
                  <option value="PEMASOK">Mitra Pemasok / Supplier</option>
                  <option value="KURIR">Divisi Kurir Antar</option>
                  <option value="KEUANGAN">Divisi Keuangan</option>
                  {isOwner && <option value="PEMILIK">Pemilik / Wakil (Level 1)</option>}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="staff-passcode" className="block text-xs text-zinc-600 mb-1">
                Kata Sandi (Minimal 6 karakter)
              </label>
              <div className="relative">
                <input
                  id="staff-passcode"
                  type={showNewPass ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className="w-full px-3 pr-10 py-2 min-h-[40px] text-sm border border-zinc-300 rounded-lg focus:outline-none focus:border-[#14532D]"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPass((v) => !v)}
                  aria-label={showNewPass ? 'Sembunyikan sandi' : 'Lihat sandi'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-800 cursor-pointer"
                >
                  {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {staffError && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                {staffError}
              </p>
            )}
            {staffSuccess && (
              <p className="text-xs text-[#14532D] bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                {staffSuccess}
              </p>
            )}

            <button
              type="submit"
              disabled={savingStaff}
              className="w-full py-2.5 px-4 min-h-[42px] rounded-lg bg-[#14532D] text-white text-sm font-semibold hover:bg-[#166534] disabled:opacity-60 transition-colors cursor-pointer"
            >
              {savingStaff ? 'Menyimpan...' : 'Buat Akun Staf'}
            </button>
          </form>

          {/* Staff directory */}
          <div className="lg:col-span-7 bg-white border border-zinc-200 rounded-xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-zinc-200">
              <h3 className="text-base font-semibold text-zinc-900">
                Struktur Akun Pemilik, Direktur &amp; Divisi
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Hierarki wewenang berjenjang: Pemilik → Direktur Operasional → Staf Divisi.
              </p>
            </div>

            {editStaffTarget && (
              <form
                onSubmit={handleSaveEditStaff}
                className="p-4 bg-zinc-50 border-b border-zinc-200 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-zinc-900">
                    Edit Akun: {editStaffTarget.displayName}
                  </p>
                  <button
                    type="button"
                    onClick={() => setEditStaffTarget(null)}
                    className="text-xs text-zinc-500 hover:text-zinc-900 cursor-pointer"
                  >
                    Batal
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={editStaffName}
                    onChange={(e) => setEditStaffName(e.target.value)}
                    placeholder="Nama Lengkap"
                    className="px-2.5 py-1.5 text-xs bg-white border border-zinc-300 rounded-lg"
                  />
                  <input
                    type="text"
                    required
                    minLength={3}
                    value={editStaffUsername}
                    onChange={(e) => setEditStaffUsername(e.target.value)}
                    placeholder="Username"
                    className="px-2.5 py-1.5 text-xs font-mono bg-white border border-zinc-300 rounded-lg"
                  />
                  <select
                    value={editStaffRole}
                    onChange={(e) => setEditStaffRole(e.target.value as DivisionRole)}
                    className="px-2.5 py-1.5 text-xs bg-white border border-zinc-300 rounded-lg"
                  >
                    {isOwner && <option value="DIREKTUR">Direktur Operasional</option>}
                    <option value="KASIR">Divisi Kasir</option>
                    <option value="GUDANG">Divisi Gudang &amp; Stok</option>
                    <option value="PEMASOK">Mitra Pemasok</option>
                    <option value="KURIR">Divisi Kurir Antar</option>
                    <option value="KEUANGAN">Divisi Keuangan</option>
                    {isOwner && <option value="PEMILIK">Pemilik / Wakil</option>}
                  </select>
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={savingEditStaff}
                    className="px-3.5 py-1.5 rounded-lg bg-[#14532D] text-white text-xs font-semibold hover:bg-[#166534] cursor-pointer"
                  >
                    {savingEditStaff ? 'Menyimpan...' : 'Simpan Profil Staf'}
                  </button>
                </div>
              </form>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                    <th className="py-3 px-4 font-medium">Nama</th>
                    <th className="py-3 px-4 font-medium">Username</th>
                    <th className="py-3 px-4 font-medium">Jabatan &amp; Level</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {staff.map((member) => {
                    const lockedForDirector =
                      !isOwner && (member.role === 'PEMILIK' || member.role === 'DIREKTUR');
                    return (
                      <tr key={member.id} className="hover:bg-zinc-50">
                        <td className="py-3 px-4 font-medium text-zinc-900">{member.displayName}</td>
                        <td className="py-3 px-4 font-mono text-xs text-zinc-600">
                          {member.username}
                        </td>
                        <td className="py-3 px-4 text-xs">
                          <p className="font-medium text-zinc-800">{ROLE_LABELS[member.role]}</p>
                          <p className="text-[11px] text-zinc-500">
                            {ROLE_HIERARCHY_LEVEL[member.role]}
                          </p>
                        </td>
                        <td className="py-3 px-4 text-xs">
                          <span
                            className={
                              member.active ? 'text-[#14532D] font-medium' : 'text-zinc-400'
                            }
                          >
                            {member.active ? 'Aktif' : 'Nonaktif'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {lockedForDirector ? (
                            <span className="text-[11px] text-zinc-400">Otoritas Pemilik</span>
                          ) : resetTargetId === member.id ? (
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <input
                                type="text"
                                minLength={6}
                                value={resetPassValue}
                                onChange={(e) => setResetPassValue(e.target.value)}
                                placeholder="Sandi baru (min 6)"
                                className="w-32 px-2 py-1 text-xs border border-zinc-300 rounded"
                              />
                              <button
                                type="button"
                                onClick={() => handleResetStaffPasscode(member)}
                                className="px-2 py-1 rounded bg-[#14532D] text-white text-xs font-medium cursor-pointer"
                              >
                                Simpan
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setResetTargetId(null);
                                  setResetPassValue('');
                                }}
                                className="px-1.5 py-1 text-xs text-zinc-500 cursor-pointer"
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-2.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditStaffTarget(member);
                                  setEditStaffName(member.displayName);
                                  setEditStaffUsername(member.username);
                                  setEditStaffRole(member.role);
                                  setStaffError('');
                                }}
                                title="Edit nama/jabatan staf"
                                className="p-1 text-zinc-500 hover:text-[#14532D] cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setResetTargetId(member.id);
                                  setResetPassValue('');
                                }}
                                className="text-xs font-medium text-[#14532D] hover:underline underline-offset-2 cursor-pointer whitespace-nowrap"
                              >
                                Sandi
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleStaffActive(member)}
                                className="text-xs font-medium text-zinc-700 hover:text-zinc-900 underline underline-offset-2 cursor-pointer whitespace-nowrap"
                              >
                                {member.active ? 'Nonaktifkan' : 'Aktifkan'}
                              </button>
                              {confirmDeleteStaffId === member.id ? (
                                <span className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteStaff(member.id)}
                                    className="px-2 py-0.5 rounded bg-red-600 text-white text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                                  >
                                    Yakin Hapus?
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteStaffId(null)}
                                    className="text-[11px] text-zinc-500 cursor-pointer"
                                  >
                                    Batal
                                  </button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  aria-label={`Hapus akun ${member.displayName}`}
                                  onClick={() => setConfirmDeleteStaffId(member.id)}
                                  className="p-1 text-zinc-400 hover:text-red-600 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Store settings */}
        <form
          onSubmit={handleSaveSettings}
          className="bg-white border border-zinc-200 rounded-xl p-6 space-y-5"
        >
          <div>
            <h3 className="text-base font-semibold text-zinc-900">
              Pengaturan Operasional, WhatsApp &amp; QRIS Merchant
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Perubahan langsung tampil di etalase pelanggan, pesan WhatsApp kurir, dan QRIS Dinamis.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label htmlFor="set-days" className="block text-xs text-zinc-600 mb-1">
                Hari Buka
              </label>
              <input
                id="set-days"
                type="text"
                value={daysOpen}
                onChange={(e) => setDaysOpen(e.target.value)}
                className="w-full px-3 py-2 min-h-[40px] text-sm border border-zinc-300 rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="set-hours" className="block text-xs text-zinc-600 mb-1">
                Jam Operasional
              </label>
              <input
                id="set-hours"
                type="text"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="w-full px-3 py-2 min-h-[40px] text-sm border border-zinc-300 rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="set-fee" className="block text-xs text-zinc-600 mb-1">
                Ongkir Lokal (Rp)
              </label>
              <input
                id="set-fee"
                type="number"
                min={0}
                value={deliveryFee}
                onChange={(e) => setDeliveryFee(e.target.value)}
                className="w-full px-3 py-2 min-h-[40px] text-sm tabular-price border border-zinc-300 rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="set-minfree" className="block text-xs text-zinc-600 mb-1">
                Min. Gratis Ongkir (Rp)
              </label>
              <input
                id="set-minfree"
                type="number"
                min={0}
                value={freeDeliveryMin}
                onChange={(e) => setFreeDeliveryMin(e.target.value)}
                className="w-full px-3 py-2 min-h-[40px] text-sm tabular-price border border-zinc-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="set-wa" className="block text-xs text-zinc-600 mb-1">
                Nomor WhatsApp Resmi Toko (628...)
              </label>
              <input
                id="set-wa"
                type="text"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                placeholder="6281279008899"
                className="w-full px-3 py-2 min-h-[40px] text-sm font-mono border border-zinc-300 rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="set-qris-name" className="block text-xs text-zinc-600 mb-1">
                Nama Merchant QRIS {!isOwner && '(Khusus Pemilik)'}
              </label>
              <input
                id="set-qris-name"
                type="text"
                disabled={!isOwner}
                value={qrisMerchantName}
                onChange={(e) => setQrisMerchantName(e.target.value)}
                className="w-full px-3 py-2 min-h-[40px] text-sm border border-zinc-300 rounded-lg disabled:bg-zinc-100 disabled:text-zinc-500"
              />
            </div>

            <div>
              <label htmlFor="set-qris-nmid" className="block text-xs text-zinc-600 mb-1">
                NMID Merchant QRIS {!isOwner && '(Khusus Pemilik)'}
              </label>
              <input
                id="set-qris-nmid"
                type="text"
                disabled={!isOwner}
                value={qrisNmid}
                onChange={(e) => setQrisNmid(e.target.value)}
                className="w-full px-3 py-2 min-h-[40px] text-sm font-mono border border-zinc-300 rounded-lg disabled:bg-zinc-100 disabled:text-zinc-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="set-area" className="block text-xs text-zinc-600 mb-1">
              Keterangan Area Pengantaran
            </label>
            <input
              id="set-area"
              type="text"
              value={deliveryArea}
              onChange={(e) => setDeliveryArea(e.target.value)}
              className="w-full px-3 py-2 min-h-[40px] text-sm border border-zinc-300 rounded-lg"
            />
          </div>

          <div className="space-y-3 pt-2 border-t border-zinc-100">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-zinc-800">
                  Pin Koordinat Toko di Peta (Titik Berangkat Kurir)
                </p>
                <p className="text-[11px] text-zinc-500">
                  Klik langsung pada peta atau gunakan GPS saat berada di toko agar rute kurir dan pelanggan akurat.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCaptureStoreGps}
                className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-lg border border-zinc-300 bg-white text-xs font-medium text-zinc-800 hover:bg-zinc-50 cursor-pointer whitespace-nowrap"
              >
                <Navigation className="w-3.5 h-3.5 text-[#14532D]" aria-hidden="true" />
                <span>Ambil GPS Toko Sekarang</span>
              </button>
            </div>

            <DeliveryMap
              mapInstanceId="owner-store-settings-map"
              storeName={settings.name}
              storeAddress={settings.fullAddress}
              storeCoords={storeCoords}
              mapsUrl={settings.mapsUrl}
              heightClass="h-56"
              interactivePickTarget="store"
              onPickCoords={(coords) => {
                setStoreCoords(coords);
                setStoreGpsNotice(
                  `Pin toko dipilih (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}). Klik Simpan Pengaturan.`
                );
              }}
            />

            {storeGpsNotice && (
              <p className="text-[11px] text-[#14532D] bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                {storeGpsNotice}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-[#14532D] font-medium">{settingsSavedMsg}</span>
            <button
              type="submit"
              disabled={savingSettings}
              className="px-5 py-2.5 min-h-[40px] rounded-lg bg-[#14532D] text-white text-sm font-semibold hover:bg-[#166534] disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap"
            >
              {savingSettings ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  const maxTrendValue = Math.max(
    1,
    ...analytics.trendDays.map((d) => d.total)
  );
  const periodLabels: {id: OverviewPeriod; label: string}[] = [
    {id: 'today', label: 'Hari Ini'},
    {id: '7d', label: '7 Hari'},
    {id: '30d', label: '30 Hari'},
    {id: 'all', label: 'Semua'},
  ];

  return (
    <div className="space-y-8">
      {/* Print header */}
      <div className="hidden print:block border-b border-zinc-300 pb-3">
        <p className="text-lg font-bold text-zinc-900">
          Laporan Kinerja &amp; Penjualan — Toko Dimas Jaya
        </p>
        <p className="text-xs text-zinc-600">
          Periode: {periodLabels.find((p) => p.id === period)?.label} · Dicetak{' '}
          {new Date().toLocaleDateString('id-ID')}
        </p>
      </div>

      {/* Period Filter & Report Export Bar */}
      <div className="bg-white border border-zinc-200 rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-zinc-500 mr-1">Periode Ringkasan:</span>
          {periodLabels.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap ${
                period === p.id
                  ? 'bg-[#14532D] text-white'
                  : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportReportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 bg-white text-xs font-semibold text-zinc-800 hover:bg-zinc-50 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-[#14532D]" aria-hidden="true" />
            <span>Unduh Laporan (CSV)</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 bg-white text-xs font-semibold text-zinc-800 hover:bg-zinc-50 cursor-pointer whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5 text-zinc-700" aria-hidden="true" />
            <span>Cetak Laporan</span>
          </button>
        </div>
      </div>

      {/* Financial & operational KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-zinc-200 rounded-xl p-5">
          <p className="text-xs text-zinc-500">Total Kas Masuk</p>
          <p className="text-xl font-bold text-zinc-900 tabular-price mt-1">
            {formatRupiah(analytics.rev)}
          </p>
        </div>

        <div className="bg-white border border-zinc-200 rounded-xl p-5">
          <p className="text-xs text-zinc-500">Total Pengeluaran</p>
          <p className="text-xl font-bold text-zinc-900 tabular-price mt-1">
            {formatRupiah(analytics.exp)}
          </p>
        </div>

        <div className="bg-white border border-zinc-200 rounded-xl p-5">
          <p className="text-xs text-zinc-500">Saldo Kas Bersih</p>
          <p className="text-xl font-bold text-[#14532D] tabular-price mt-1">
            {formatRupiah(analytics.net)}
          </p>
        </div>

        <div className="bg-white border border-zinc-200 rounded-xl p-5">
          <p className="text-xs text-zinc-500">Estimasi Laba Kotor</p>
          <p className="text-xl font-bold text-[#14532D] tabular-price mt-1">
            {formatRupiah(analytics.profit)}
          </p>
        </div>

        <div className="bg-white border border-zinc-200 rounded-xl p-5">
          <p className="text-xs text-zinc-500">Piutang Kasbon Aktif</p>
          <p className="text-xl font-bold text-amber-700 tabular-price mt-1">
            {formatRupiah(overview.totalKasbonOutstanding)}
          </p>
        </div>
      </div>

      {/* Daily Sales SVG Trend & Top 5 Products */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-zinc-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">
                Grafik Tren Penjualan Harian ({analytics.trendDays.length} Hari Terakhir)
              </h3>
              <p className="text-xs text-zinc-500">
                Akumulasi omzet transaksi masuk toko &amp; pesanan online yang tidak dibatalkan.
              </p>
            </div>
          </div>

          <div className="pt-2">
            <svg
              viewBox={`0 0 ${analytics.trendDays.length * 48} 148`}
              className="w-full h-40 overflow-visible"
              role="img"
              aria-label="Grafik batang penjualan harian"
            >
              <line x1="0" y1="116" x2={analytics.trendDays.length * 48} y2="116" stroke="#E4E4E7" strokeWidth="1" />
              <line x1="0" y1="62" x2={analytics.trendDays.length * 48} y2="62" stroke="#F4F4F5" strokeWidth="1" strokeDasharray="3 3" />
              {analytics.trendDays.map((d, idx) => {
                const barWidth = 22;
                const x = idx * 48 + 13;
                const barHeight =
                  d.total > 0 ? Math.max(6, Math.round((d.total / maxTrendValue) * 92)) : 3;
                const y = 116 - barHeight;
                return (
                  <g key={d.key}>
                    <rect
                      x={x}
                      y={y}
                      width={barWidth}
                      height={barHeight}
                      rx="4"
                      fill={d.total > 0 ? '#14532D' : '#E4E4E7'}
                    />
                    {d.total > 0 && (
                      <text
                        x={x + barWidth / 2}
                        y={y - 5}
                        textAnchor="middle"
                        fontSize="9"
                        fill="#18181B"
                        fontWeight="600"
                      >
                        {Math.round(d.total / 1000)}rb
                      </text>
                    )}
                    <text
                      x={x + barWidth / 2}
                      y="133"
                      textAnchor="middle"
                      fontSize="9"
                      fill="#71717A"
                    >
                      {d.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-200">
            <h3 className="text-sm font-semibold text-zinc-900">5 Produk Terlaris</h3>
            <p className="text-xs text-zinc-500">Berdasarkan jumlah terjual pada periode terpilih.</p>
          </div>
          {analytics.topProducts.length === 0 ? (
            <div className="p-6 text-center text-xs text-zinc-500">
              Belum ada data penjualan produk pada periode ini.
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 text-xs">
              {analytics.topProducts.map((tp, idx) => (
                <div key={tp.name} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-900 truncate">
                      {idx + 1}. {tp.name}
                    </p>
                    <p className="text-zinc-500 tabular-price">Terjual {tp.qty} unit</p>
                  </div>
                  <span className="font-mono font-semibold text-[#14532D] tabular-price shrink-0">
                    {formatRupiah(tp.revenue)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Org Structure Hierarchy Summary */}
      <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#14532D]" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-zinc-900">
              Struktur Komando &amp; Divisi Toko Dimas Jaya
            </h3>
          </div>
          <span className="text-xs text-zinc-500 tabular-price">
            {staff.filter((s) => s.active).length} Petugas Aktif
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 text-xs">
          {(
            [
              'PEMILIK',
              'DIREKTUR',
              'KEUANGAN',
              'KASIR',
              'GUDANG',
              'KURIR',
              'PEMASOK',
            ] as DivisionRole[]
          ).map((r) => (
            <div key={r} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <p className="font-semibold text-zinc-900 truncate">{ROLE_LABELS[r]}</p>
              <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
                {ROLE_HIERARCHY_LEVEL[r]}
              </p>
              <p className="text-xs font-bold text-[#14532D] tabular-price mt-1.5">
                {roleCount(r)} Akun
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Division operational queues */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 print:hidden">
        <button
          type="button"
          onClick={() => onNavigateTab('kasir')}
          className="text-left bg-white border border-zinc-200 rounded-xl p-5 hover:border-zinc-300 transition-colors cursor-pointer"
        >
          <p className="text-xs text-zinc-500">Divisi Kasir &amp; Pesanan</p>
          <p className="text-lg font-bold text-zinc-900 tabular-price mt-1">
            {overview.pendingOrdersCount} Pesanan Aktif
          </p>
          <p className="text-xs font-medium text-[#14532D] mt-2">Buka Meja Kasir →</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('kurir')}
          className="text-left bg-white border border-zinc-200 rounded-xl p-5 hover:border-zinc-300 transition-colors cursor-pointer"
        >
          <p className="text-xs text-zinc-500">Divisi Kurir Antar</p>
          <p className="text-lg font-bold text-zinc-900 tabular-price mt-1">
            {overview.activeDeliveriesCount} Sedang Diantar
          </p>
          <p className="text-xs font-medium text-[#14532D] mt-2">Pantau Peta Kurir →</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('gudang')}
          className="text-left bg-white border border-zinc-200 rounded-xl p-5 hover:border-zinc-300 transition-colors cursor-pointer"
        >
          <p className="text-xs text-zinc-500">Divisi Gudang &amp; Stok</p>
          <p className="text-lg font-bold text-zinc-900 tabular-price mt-1">
            {overview.lowStockCount} Stok Menipis
          </p>
          <p className="text-xs font-medium text-[#14532D] mt-2">Cek Stok Gudang →</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('pemasok')}
          className="text-left bg-white border border-zinc-200 rounded-xl p-5 hover:border-zinc-300 transition-colors cursor-pointer"
        >
          <p className="text-xs text-zinc-500">Mitra Pemasok</p>
          <p className="text-lg font-bold text-zinc-900 tabular-price mt-1">
            {overview.pendingSupplierDeliveriesCount ?? 0} Kiriman Masuk
          </p>
          <p className="text-xs font-medium text-[#14532D] mt-2">Cek Suplai →</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('komplain')}
          className="text-left bg-white border border-zinc-200 rounded-xl p-5 hover:border-zinc-300 transition-colors cursor-pointer"
        >
          <p className="text-xs text-zinc-500">Komplain &amp; Retur</p>
          <p className="text-lg font-bold text-zinc-900 tabular-price mt-1">
            {overview.pendingComplaintsCount ?? 0} Perlu Tindakan
          </p>
          <p className="text-xs font-medium text-[#14532D] mt-2">Kelola Retur →</p>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent orders */}
        <div className="lg:col-span-7 bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900">Transaksi &amp; Pesanan Terbaru</h3>
            <button
              type="button"
              onClick={() => onNavigateTab('kasir')}
              className="text-xs font-medium text-[#14532D] hover:underline cursor-pointer print:hidden"
            >
              Lihat Semua
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                  <th className="py-2.5 px-4 font-medium">Kode</th>
                  <th className="py-2.5 px-4 font-medium">Pelanggan</th>
                  <th className="py-2.5 px-4 font-medium">Status</th>
                  <th className="py-2.5 px-4 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {analytics.filteredOrders.slice(0, 6).map((ord) => (
                  <tr key={ord.id} className="hover:bg-zinc-50">
                    <td className="py-2.5 px-4 font-mono text-xs text-zinc-700 tabular-price">
                      {ord.orderNumber}
                    </td>
                    <td className="py-2.5 px-4">
                      <p className="font-medium text-zinc-900 text-xs">{ord.customerName}</p>
                      <p className="text-xs text-zinc-500">{formatShortDate(ord.createdAt)}</p>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-zinc-700">
                      {ORDER_STATUS_LABELS[ord.status]}
                    </td>
                    <td className="py-2.5 px-4 text-right font-semibold text-zinc-900 tabular-price text-xs">
                      {formatRupiah(ord.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Low stock watchlist */}
        <div className="lg:col-span-5 bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900">Peringatan Stok Gudang</h3>
            <button
              type="button"
              onClick={() => onNavigateTab('gudang')}
              className="text-xs font-medium text-[#14532D] hover:underline cursor-pointer print:hidden"
            >
              Kelola Stok
            </button>
          </div>

          {lowStockVariants.length === 0 ? (
            <div className="p-6 text-center text-sm text-zinc-500">
              Semua stok barang berada di atas batas minimum aman.
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {lowStockVariants.slice(0, 6).map((item, idx) => (
                <div
                  key={`${item.productName}-${idx}`}
                  className="px-5 py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900 truncate">{item.productName}</p>
                    <p className="text-xs text-zinc-500">{item.variantLabel}</p>
                  </div>
                  <span className="text-xs font-mono font-semibold text-amber-700 tabular-price shrink-0">
                    Sisa {item.stock} / min {item.minStock}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cashier Shifts & Audit Log */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900">Shift Laci Kasir Terbaru</h3>
            <span className="text-xs text-zinc-500 tabular-price">
              {overview.openShiftsCount ?? 0} Aktif
            </span>
          </div>
          {shifts.length === 0 ? (
            <div className="p-6 text-center text-xs text-zinc-500">
              Belum ada shift kasir tercatat. Kasir dapat membuka laci di menu Kasir &amp; POS.
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 text-xs">
              {shifts.slice(0, 5).map((sh) => (
                <div key={sh.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-zinc-900">
                      {sh.cashierName}{' '}
                      <span
                        className={
                          sh.status === 'TERBUKA' ? 'text-[#14532D]' : 'text-zinc-500'
                        }
                      >
                        ({sh.status === 'TERBUKA' ? 'Aktif' : 'Tutup'})
                      </span>
                    </p>
                    <p className="text-zinc-500 mt-0.5">{formatShortDate(sh.openedAt)}</p>
                  </div>
                  <div className="text-right tabular-price">
                    <p className="font-semibold text-zinc-900">
                      Tunai {formatRupiah(sh.expectedCash)}
                    </p>
                    <p className="text-zinc-500">QRIS {formatRupiah(sh.qrisSalesTotal)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-7 bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-200">
            <h3 className="text-sm font-semibold text-zinc-900">
              Log Audit Aktivitas Penting
            </h3>
          </div>
          {auditLogs.length === 0 ? (
            <div className="p-6 text-center text-xs text-zinc-500">
              Belum ada catatan audit terbaru.
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 text-xs">
              {auditLogs.slice(0, 10).map((log) => (
                <div key={log.id} className="px-5 py-2.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-zinc-900">
                      <span className="font-semibold">{log.actorName}</span>{' '}
                      <span className="text-zinc-500">({log.actorRole})</span> ·{' '}
                      <span className="font-mono text-[#14532D]">{log.action}</span>
                    </p>
                    <p className="text-zinc-600 truncate mt-0.5">
                      {log.target} — {log.detail}
                    </p>
                  </div>
                  <span className="text-zinc-400 whitespace-nowrap shrink-0">
                    {formatShortDate(log.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

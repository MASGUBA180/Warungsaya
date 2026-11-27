import {Eye, EyeOff, Navigation} from 'lucide-react';
import {useEffect, useState, type FormEvent} from 'react';
import {
  formatRupiah,
  formatShortDate,
  ORDER_STATUS_LABELS,
  ROLE_LABELS,
} from '../../lib/storeData';
import {apiFetch} from '../../lib/apiClient';
import type {
  DivisionRole,
  GeoPoint,
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
  pendingOrdersCount: number;
  activeDeliveriesCount: number;
  lowStockCount: number;
  pendingSupplierDeliveriesCount?: number;
  totalKasbonOutstanding: number;
  totalOrders: number;
}

interface OwnerOverviewTabProps {
  mode: 'overview' | 'admin';
  overview: OverviewMetrics;
  orders: Order[];
  products: Product[];
  staff: PublicStaffProfile[];
  settings: StoreSettings;
  authToken: string;
  onRefresh: () => Promise<void>;
  onNavigateTab: (tab: 'kasir' | 'gudang' | 'pemasok' | 'kurir' | 'keuangan') => void;
}

export function OwnerOverviewTab({
  mode,
  overview,
  orders,
  products,
  staff,
  settings,
  authToken,
  onRefresh,
  onNavigateTab,
}: OwnerOverviewTabProps) {
  // Staff creation state
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

  // Settings form state
  const [hours, setHours] = useState(settings.hours);
  const [daysOpen, setDaysOpen] = useState(settings.daysOpen);
  const [deliveryArea, setDeliveryArea] = useState(settings.deliveryArea);
  const [deliveryFee, setDeliveryFee] = useState(String(settings.deliveryFee));
  const [freeDeliveryMin, setFreeDeliveryMin] = useState(String(settings.freeDeliveryMin));
  const [storeCoords, setStoreCoords] = useState<GeoPoint | null>(settings.storeCoords ?? null);
  const [storeGpsNotice, setStoreGpsNotice] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSavedMsg, setSettingsSavedMsg] = useState('');

  useEffect(() => {
    setStoreCoords(settings.storeCoords ?? null);
  }, [settings.storeCoords]);

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
    try {
      const res = await apiFetch(`/api/ops/staff/${member.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({active: !member.active}),
      });
      if (res.ok) {
        await onRefresh();
      }
    } catch {
      // ignore transient
    }
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
              <h3 className="text-base font-semibold text-zinc-900">Tambah Akun Staf Divisi</h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Buat akses khusus untuk Kasir, Gudang, Mitra Pemasok, Kurir Antar, atau Keuangan.
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
                  Divisi
                </label>
                <select
                  id="staff-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as DivisionRole)}
                  className="w-full px-3 py-2 min-h-[40px] text-sm bg-white border border-zinc-300 rounded-lg focus:outline-none focus:border-[#14532D]"
                >
                  <option value="KASIR">Divisi Kasir</option>
                  <option value="GUDANG">Divisi Gudang &amp; Stok</option>
                  <option value="PEMASOK">Mitra Pemasok / Supplier</option>
                  <option value="KURIR">Divisi Kurir Antar</option>
                  <option value="KEUANGAN">Divisi Keuangan</option>
                  <option value="PEMILIK">Pemilik / Wakil</option>
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
          <div className="lg:col-span-7 bg-white border border-zinc-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-200">
              <h3 className="text-base font-semibold text-zinc-900">Daftar Akun Pemilik & Divisi</h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Kelola status aktif petugas di setiap divisi Toko Dimas Jaya.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                    <th className="py-3 px-4 font-medium">Nama</th>
                    <th className="py-3 px-4 font-medium">Username</th>
                    <th className="py-3 px-4 font-medium">Divisi</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {staff.map((member) => (
                    <tr key={member.id} className="hover:bg-zinc-50">
                      <td className="py-3 px-4 font-medium text-zinc-900">{member.displayName}</td>
                      <td className="py-3 px-4 font-mono text-xs text-zinc-600">
                        {member.username}
                      </td>
                      <td className="py-3 px-4 text-xs text-zinc-700">
                        {ROLE_LABELS[member.role]}
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
                        {resetTargetId === member.id ? (
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
                          <div className="inline-flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                setResetTargetId(member.id);
                                setResetPassValue('');
                              }}
                              className="text-xs font-medium text-[#14532D] hover:underline underline-offset-2 cursor-pointer whitespace-nowrap"
                            >
                              Ubah Sandi
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleStaffActive(member)}
                              className="text-xs font-medium text-zinc-700 hover:text-zinc-900 underline underline-offset-2 cursor-pointer whitespace-nowrap"
                            >
                              {member.active ? 'Nonaktifkan' : 'Aktifkan'}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
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
              Pengaturan Operasional & Pengantaran
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Perubahan langsung tampil di halaman utama pelanggan Toko Dimas Jaya.
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

  return (
    <div className="space-y-8">
      {/* Financial & operational KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-zinc-200 rounded-xl p-5">
          <p className="text-xs text-zinc-500">Total Kas Masuk</p>
          <p className="text-2xl font-bold text-zinc-900 tabular-price mt-1">
            {formatRupiah(overview.totalRevenue)}
          </p>
        </div>

        <div className="bg-white border border-zinc-200 rounded-xl p-5">
          <p className="text-xs text-zinc-500">Total Pengeluaran</p>
          <p className="text-2xl font-bold text-zinc-900 tabular-price mt-1">
            {formatRupiah(overview.totalExpense)}
          </p>
        </div>

        <div className="bg-white border border-zinc-200 rounded-xl p-5">
          <p className="text-xs text-zinc-500">Saldo Kas Bersih</p>
          <p className="text-2xl font-bold text-[#14532D] tabular-price mt-1">
            {formatRupiah(overview.netCash)}
          </p>
        </div>

        <div className="bg-white border border-zinc-200 rounded-xl p-5">
          <p className="text-xs text-zinc-500">Piutang Kasbon Aktif</p>
          <p className="text-2xl font-bold text-amber-700 tabular-price mt-1">
            {formatRupiah(overview.totalKasbonOutstanding)}
          </p>
        </div>
      </div>

      {/* Division operational queues */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onNavigateTab('kasir')}
          className="text-left bg-white border border-zinc-200 rounded-xl p-5 hover:border-zinc-300 transition-colors cursor-pointer"
        >
          <p className="text-xs text-zinc-500">Divisi Kasir &amp; Pesanan</p>
          <p className="text-xl font-bold text-zinc-900 tabular-price mt-1">
            {overview.pendingOrdersCount} Pesanan Perlu Diproses
          </p>
          <p className="text-xs font-medium text-[#14532D] mt-2">Buka Meja Kasir →</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('kurir')}
          className="text-left bg-white border border-zinc-200 rounded-xl p-5 hover:border-zinc-300 transition-colors cursor-pointer"
        >
          <p className="text-xs text-zinc-500">Divisi Pengantaran / Kurir</p>
          <p className="text-xl font-bold text-zinc-900 tabular-price mt-1">
            {overview.activeDeliveriesCount} Sedang Diantar COD
          </p>
          <p className="text-xs font-medium text-[#14532D] mt-2">Pantau Kurir Gang Makam →</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('gudang')}
          className="text-left bg-white border border-zinc-200 rounded-xl p-5 hover:border-zinc-300 transition-colors cursor-pointer"
        >
          <p className="text-xs text-zinc-500">Divisi Gudang &amp; Stok</p>
          <p className="text-xl font-bold text-zinc-900 tabular-price mt-1">
            {overview.lowStockCount} Varian Stok Menipis
          </p>
          <p className="text-xs font-medium text-[#14532D] mt-2">Cek Stok Gudang →</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('pemasok')}
          className="text-left bg-white border border-zinc-200 rounded-xl p-5 hover:border-zinc-300 transition-colors cursor-pointer"
        >
          <p className="text-xs text-zinc-500">Pemasok &amp; Suplai Barang</p>
          <p className="text-xl font-bold text-zinc-900 tabular-price mt-1">
            {overview.pendingSupplierDeliveriesCount ?? 0} Kiriman Menunggu
          </p>
          <p className="text-xs font-medium text-[#14532D] mt-2">Cek Antrean Suplai →</p>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent orders */}
        <div className="lg:col-span-7 bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900">Transaksi & Pesanan Terbaru</h3>
            <button
              type="button"
              onClick={() => onNavigateTab('kasir')}
              className="text-xs font-medium text-[#14532D] hover:underline cursor-pointer"
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
                {orders.slice(0, 6).map((ord) => (
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
              className="text-xs font-medium text-[#14532D] hover:underline cursor-pointer"
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
                <div key={`${item.productName}-${idx}`} className="px-5 py-3 flex items-center justify-between gap-3">
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
    </div>
  );
}

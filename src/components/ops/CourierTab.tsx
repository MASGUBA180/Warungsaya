import {
  Camera,
  ExternalLink,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Radio,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import {type ChangeEvent, FormEvent, useEffect, useRef, useState} from 'react';
import {apiFetch} from '../../lib/apiClient';
import {compressImageFileToDataUrl} from '../../lib/imageHelpers';
import {buildCourierWhatsappLink} from '../../lib/qrisHelpers';
import {
  DELIVERY_CHECKPOINT_LABELS,
  formatRupiah,
  formatShortDate,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from '../../lib/storeData';
import type {
  AuthUser,
  DeliveryCheckpoint,
  GeoPoint,
  Order,
  OrderStatus,
  PublicStaffProfile,
  StoreSettings,
} from '../../types/store';
import {DeliveryMap} from '../DeliveryMap';

interface CourierTabProps {
  currentUser?: AuthUser;
  couriers?: PublicStaffProfile[];
  orders: Order[];
  settings: StoreSettings;
  authToken: string;
  onRefresh: () => Promise<void>;
}

const CHECKPOINT_ORDER: DeliveryCheckpoint[] = [
  'PERSIAPAN_TOKO',
  'MENUJU_LOKASI',
  'DEKAT_TUJUAN',
  'SUDAH_TIBA',
];

export function CourierTab({
  currentUser,
  orders,
  settings,
  authToken,
  onRefresh,
}: CourierTabProps) {
  const codOrders = orders.filter((o) => o.deliveryMethod === 'cod');
  const allActiveDeliveries = codOrders.filter(
    (o) => o.status === 'MENUNGGU' || o.status === 'DISIAPKAN' || o.status === 'DIANTAR'
  );
  const myAssignedCount = currentUser
    ? allActiveDeliveries.filter((o) => o.assignedCourierId === currentUser.id).length
    : 0;

  const [filterScope, setFilterScope] = useState<'ALL' | 'MINE'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PICKUP_READY' | 'ON_WAY'>('ALL');
  const [activeSearch, setActiveSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');

  const scopedActiveDeliveries =
    filterScope === 'MINE' && currentUser
      ? allActiveDeliveries.filter((o) => o.assignedCourierId === currentUser.id)
      : allActiveDeliveries;

  const activeNorm = activeSearch.trim().toLowerCase();
  const activeDeliveries = scopedActiveDeliveries.filter((o) => {
    if (statusFilter === 'PICKUP_READY' && o.status === 'DIANTAR') return false;
    if (statusFilter === 'ON_WAY' && o.status !== 'DIANTAR') return false;
    if (
      activeNorm &&
      !o.orderNumber.toLowerCase().includes(activeNorm) &&
      !o.customerName.toLowerCase().includes(activeNorm) &&
      !o.addressNote.toLowerCase().includes(activeNorm) &&
      !o.phone.toLowerCase().includes(activeNorm)
    ) {
      return false;
    }
    return true;
  });

  const completedDeliveries = codOrders.filter((o) => o.status === 'SELESAI');
  const histNorm = historySearch.trim().toLowerCase();
  const filteredCompletedDeliveries = completedDeliveries.filter(
    (o) =>
      !histNorm ||
      o.orderNumber.toLowerCase().includes(histNorm) ||
      o.customerName.toLowerCase().includes(histNorm) ||
      o.addressNote.toLowerCase().includes(histNorm)
  );

  // Daily COD summary
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCutoff = todayStart.getTime();
  const completedToday = completedDeliveries.filter((o) => {
    const ts = new Date(o.updatedAt || o.createdAt).getTime();
    return Number.isFinite(ts) && ts >= todayCutoff;
  });
  const codCashTodayTotal = completedToday
    .filter((o) => o.paymentMethod !== 'QRIS')
    .reduce((sum, o) => sum + o.total, 0);
  const qrisCodTodayTotal = completedToday
    .filter((o) => o.paymentMethod === 'QRIS')
    .reduce((sum, o) => sum + o.total, 0);

  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [checkpoint, setCheckpoint] = useState<DeliveryCheckpoint>('MENUJU_LOKASI');
  const [locationNote, setLocationNote] = useState('');
  const [etaMinutes, setEtaMinutes] = useState('10');
  const [proofNote, setProofNote] = useState('');
  const [proofPhoto, setProofPhoto] = useState<string | undefined>(undefined);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [previewProofPhoto, setPreviewProofPhoto] = useState<string | null>(null);
  const [courierCoords, setCourierCoords] = useState<GeoPoint | null>(null);
  const [autoGpsActive, setAutoGpsActive] = useState(false);
  const [gpsMessage, setGpsMessage] = useState('');
  const [savingTrack, setSavingTrack] = useState(false);
  const [sendingWaId, setSendingWaId] = useState<string | null>(null);

  const lastAutoPushRef = useRef<number>(0);

  const selectedOrder =
    activeDeliveries.find((o) => o.id === selectedOrderId) ||
    activeDeliveries[0] ||
    null;

  useEffect(() => {
    if (!selectedOrder) return;
    if (selectedOrder.id !== selectedOrderId) {
      setSelectedOrderId(selectedOrder.id);
    }
    setCheckpoint(selectedOrder.tracking?.checkpoint || 'MENUJU_LOKASI');
    setLocationNote(selectedOrder.tracking?.locationNote || '');
    setProofNote(selectedOrder.tracking?.proofNote || '');
    setProofPhoto(selectedOrder.tracking?.proofPhoto);
    setEtaMinutes(
      selectedOrder.tracking?.etaMinutes !== undefined
        ? String(selectedOrder.tracking.etaMinutes)
        : '10'
    );
    setCourierCoords(selectedOrder.tracking?.courierCoords ?? null);
    setGpsMessage('');
  }, [selectedOrder?.id, selectedOrder?.updatedAt]);

  // Real-time background watchPosition when GPS Otomatis Aktif is enabled
  useEffect(() => {
    if (!autoGpsActive || !selectedOrder) return;
    if (!navigator.geolocation) {
      setGpsMessage('Browser tidak mendukung pelacakan GPS otomatis.');
      setAutoGpsActive(false);
      return;
    }

    const orderId = selectedOrder.id;
    const activeCheckpoint = checkpoint;
    const activeNote = locationNote;
    const activeEta = Number(etaMinutes || 0);

    setGpsMessage('GPS Otomatis Aktif: mengirim pembaruan posisi kurir tiap ~15 detik.');

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const pt: GeoPoint = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        };
        setCourierCoords(pt);

        const now = Date.now();
        if (now - lastAutoPushRef.current >= 15000) {
          lastAutoPushRef.current = now;
          apiFetch(`/api/ops/orders/${orderId}/tracking`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({
              checkpoint: activeCheckpoint,
              locationNote:
                activeNote.trim() || DELIVERY_CHECKPOINT_LABELS[activeCheckpoint].label,
              progressPercent: DELIVERY_CHECKPOINT_LABELS[activeCheckpoint].progress,
              etaMinutes: activeEta,
              courierCoords: pt,
            }),
          })
            .then((res) => {
              if (res.ok) {
                setGpsMessage(
                  `GPS terkirim (${pt.lat.toFixed(4)}, ${pt.lng.toFixed(4)}) · ${new Date().toLocaleTimeString('id-ID', {hour: '2-digit', minute: '2-digit'})}`
                );
              }
            })
            .catch(() => {
              // ignore transient background error
            });
        }
      },
      () => {
        setGpsMessage('Izin GPS otomatis ditolak atau sinyal lemah. Anda tetap bisa geser pin manual.');
        setAutoGpsActive(false);
      },
      {enableHighAccuracy: true, maximumAge: 10000, timeout: 10000}
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [autoGpsActive, selectedOrder?.id, authToken, checkpoint, locationNote, etaMinutes]);

  const handleProofPhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingProof(true);
    setGpsMessage('');
    try {
      const dataUrl = await compressImageFileToDataUrl(file, 720, 0.72);
      setProofPhoto(dataUrl);
      setGpsMessage('Foto bukti serah terima siap disimpan.');
    } catch (err) {
      setGpsMessage(err instanceof Error ? err.message : 'Gagal membaca foto bukti.');
    } finally {
      setUploadingProof(false);
      e.target.value = '';
    }
  };

  const updateDeliveryStatus = async (orderId: string, status: OrderStatus) => {
    try {
      const useSelectedProof = selectedOrder?.id === orderId;
      const res = await apiFetch(`/api/ops/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          status,
          proofNote:
            status === 'SELESAI'
              ? (useSelectedProof ? proofNote.trim() : '') || undefined
              : undefined,
          proofPhoto: status === 'SELESAI' && useSelectedProof ? proofPhoto : undefined,
        }),
      });
      if (res.ok) {
        if (status === 'SELESAI' && useSelectedProof) {
          setAutoGpsActive(false);
        }
        await onRefresh();
      }
    } catch {
      // ignore transient
    }
  };

  const handleTriggerWhatsapp = async (ord: Order) => {
    setSendingWaId(ord.id);
    try {
      const res = await apiFetch(`/api/ops/orders/${ord.id}/whatsapp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          trigger:
            ord.status === 'SELESAI'
              ? 'SELESAI'
              : ord.status === 'DISIAPKAN'
                ? 'DISIAPKAN'
                : 'DIANTAR',
        }),
      });
      if (res.ok) {
        await onRefresh();
      }
    } finally {
      setSendingWaId(null);
    }
  };

  const handleCaptureCourierGps = () => {
    if (!navigator.geolocation) {
      setGpsMessage('Browser tidak mendukung GPS. Klik titik peta atau pilih status tahap di bawah.');
      return;
    }
    setGpsMessage('Mengambil posisi GPS kurir...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const pt: GeoPoint = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        };
        setCourierCoords(pt);
        setGpsMessage(
          `Pin kurir disetel ke GPS Anda (${pt.lat.toFixed(4)}, ${pt.lng.toFixed(4)}). Tekan Simpan untuk mengirim.`
        );
      },
      () => {
        setGpsMessage(
          'Izin GPS belum aktif. Anda tetap bisa klik langsung pada peta atau update tahap perjalanan.'
        );
      },
      {enableHighAccuracy: true, timeout: 8000}
    );
  };

  const handleSaveTracking = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setSavingTrack(true);
    setGpsMessage('');
    try {
      const res = await apiFetch(`/api/ops/orders/${selectedOrder.id}/tracking`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          checkpoint,
          locationNote: locationNote.trim() || DELIVERY_CHECKPOINT_LABELS[checkpoint].label,
          progressPercent: DELIVERY_CHECKPOINT_LABELS[checkpoint].progress,
          etaMinutes: Number(etaMinutes || 0),
          proofNote: proofNote.trim() || undefined,
          proofPhoto,
          courierCoords,
        }),
      });
      if (res.ok) {
        setGpsMessage('Posisi, foto bukti, dan status kurir diperbarui untuk dilihat pelanggan.');
        await onRefresh();
      } else {
        setGpsMessage('Gagal memperbarui posisi kurir.');
      }
    } finally {
      setSavingTrack(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Rekap Tugas & Setoran COD Hari Ini */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <p className="text-xs text-zinc-500">Antrean COD Aktif</p>
          <p className="text-xl font-bold text-zinc-900 tabular-price mt-1">
            {scopedActiveDeliveries.length}
          </p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <p className="text-xs text-zinc-500">Selesai Antar Hari Ini</p>
          <p className="text-xl font-bold text-[#14532D] tabular-price mt-1">
            {completedToday.length}
          </p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <p className="text-xs text-zinc-500">Tunai COD Perlu Disetor</p>
          <p className="text-xl font-bold text-zinc-900 tabular-price mt-1">
            {formatRupiah(codCashTodayTotal)}
          </p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <p className="text-xs text-zinc-500">QRIS COD Lunas Hari Ini</p>
          <p className="text-xl font-bold text-[#14532D] tabular-price mt-1">
            {formatRupiah(qrisCodTodayTotal)}
          </p>
        </div>
      </div>

      {/* Interactive Courier Map & Live Position Panel */}
      {selectedOrder && (
        <div className="bg-white border border-zinc-200 rounded-xl p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-zinc-900">
                Peta Pengantaran Kurir — {selectedOrder.orderNumber} ({selectedOrder.customerName})
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                {selectedOrder.assignedCourierName
                  ? `Ditugaskan ke: ${selectedOrder.assignedCourierName} · `
                  : ''}
                Saat Anda memulai pengantaran, notifikasi WhatsApp otomatis dibuat agar pelanggan siap menerima barang.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setAutoGpsActive((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-lg border text-xs font-semibold cursor-pointer whitespace-nowrap ${
                  autoGpsActive
                    ? 'bg-[#14532D] text-white border-[#14532D]'
                    : 'bg-white text-zinc-800 border-zinc-300 hover:bg-zinc-50'
                }`}
              >
                <Radio className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{autoGpsActive ? 'GPS Otomatis Aktif' : 'Aktifkan GPS Otomatis'}</span>
              </button>

              {activeDeliveries.length > 1 && (
                <select
                  aria-label="Pilih pesanan COD di peta"
                  value={selectedOrder.id}
                  onChange={(e) => setSelectedOrderId(e.target.value)}
                  className="px-3 py-2 min-h-[38px] text-xs bg-white border border-zinc-300 rounded-lg"
                >
                  {activeDeliveries.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.orderNumber} — {o.customerName}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <div className="lg:col-span-7">
              <DeliveryMap
                mapInstanceId={`courier-map-${selectedOrder.id}`}
                storeName={settings.name}
                storeAddress={settings.fullAddress}
                storeCoords={settings.storeCoords}
                customerLabel={selectedOrder.customerName}
                customerAddress={selectedOrder.addressNote}
                customerCoords={selectedOrder.customerCoords}
                courierName={
                  selectedOrder.assignedCourierName ||
                  selectedOrder.courierName ||
                  'Kurir Toko'
                }
                orderStatus={selectedOrder.status}
                tracking={{
                  checkpoint,
                  locationNote:
                    locationNote || DELIVERY_CHECKPOINT_LABELS[checkpoint].label,
                  progressPercent: DELIVERY_CHECKPOINT_LABELS[checkpoint].progress,
                  etaMinutes: Number(etaMinutes || 0),
                  courierCoords,
                  updatedAt: selectedOrder.updatedAt,
                }}
                mapsUrl={settings.mapsUrl}
                heightClass="h-72"
                interactivePickTarget="courier"
                onPickCoords={(coords) => {
                  setCourierCoords(coords);
                  setGpsMessage(
                    `Pin kurir dipindahkan (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}). Klik Simpan Posisi.`
                  );
                }}
              />
            </div>

            <form onSubmit={handleSaveTracking} className="lg:col-span-5 space-y-4">
              <div>
                <p className="text-xs font-semibold text-zinc-700 mb-1.5">
                  Tahap Perjalanan Kurir
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {CHECKPOINT_ORDER.map((cp) => {
                    const active = checkpoint === cp;
                    return (
                      <button
                        key={cp}
                        type="button"
                        onClick={() => {
                          setCheckpoint(cp);
                          setLocationNote(DELIVERY_CHECKPOINT_LABELS[cp].label);
                          if (cp === 'SUDAH_TIBA') setEtaMinutes('0');
                        }}
                        className={`p-2 rounded-lg border text-left text-xs transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#14532D] text-white border-[#14532D] font-semibold'
                            : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50'
                        }`}
                      >
                        {DELIVERY_CHECKPOINT_LABELS[cp].label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label htmlFor="cur-note" className="block text-xs text-zinc-600 mb-1">
                  Catatan Posisi Kurir (Dilihat Pelanggan)
                </label>
                <input
                  id="cur-note"
                  type="text"
                  value={locationNote}
                  onChange={(e) => setLocationNote(e.target.value)}
                  placeholder="Contoh: Lewat Gang Makam dekat masjid"
                  className="w-full px-3 py-2 min-h-[38px] text-sm border border-zinc-300 rounded-lg"
                />
              </div>

              <div>
                <label htmlFor="cur-proof" className="block text-xs text-zinc-600 mb-1">
                  Bukti / Catatan Serah Terima (Opsional)
                </label>
                <input
                  id="cur-proof"
                  type="text"
                  value={proofNote}
                  onChange={(e) => setProofNote(e.target.value)}
                  placeholder="Contoh: Diterima Ibu Santi di teras rumah"
                  className="w-full px-3 py-2 min-h-[38px] text-sm border border-zinc-300 rounded-lg"
                />
              </div>

              <div>
                <p className="block text-xs text-zinc-600 mb-1">
                  Foto Bukti Serah Terima Barang (Opsional)
                </p>
                <div className="flex flex-wrap items-center gap-2.5">
                  <label className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[36px] rounded-lg border border-zinc-300 bg-white text-xs font-medium text-zinc-800 hover:bg-zinc-50 cursor-pointer whitespace-nowrap">
                    <Camera className="w-3.5 h-3.5 text-[#14532D]" aria-hidden="true" />
                    <span>{uploadingProof ? 'Memproses...' : proofPhoto ? 'Ganti Foto Bukti' : 'Unggah Foto Bukti'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleProofPhotoChange}
                      className="sr-only"
                    />
                  </label>
                  {proofPhoto && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewProofPhoto(proofPhoto)}
                        className="w-9 h-9 rounded border border-zinc-300 overflow-hidden cursor-pointer"
                        aria-label="Lihat foto bukti"
                      >
                        <img src={proofPhoto} alt="Bukti serah terima" className="w-full h-full object-cover" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setProofPhoto(undefined)}
                        aria-label="Hapus foto bukti"
                        className="p-1.5 text-zinc-400 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="cur-eta" className="block text-xs text-zinc-600 mb-1">
                    Estimasi Tiba (menit)
                  </label>
                  <input
                    id="cur-eta"
                    type="number"
                    min={0}
                    max={180}
                    value={etaMinutes}
                    onChange={(e) => setEtaMinutes(e.target.value)}
                    className="w-full px-3 py-2 min-h-[38px] text-sm tabular-price border border-zinc-300 rounded-lg"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleCaptureCourierGps}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[38px] rounded-lg border border-zinc-300 bg-white text-xs font-medium text-zinc-800 hover:bg-zinc-50 cursor-pointer whitespace-nowrap"
                  >
                    <Navigation className="w-3.5 h-3.5 text-[#14532D]" aria-hidden="true" />
                    <span>Ambil GPS Saya</span>
                  </button>
                </div>
              </div>

              {gpsMessage && (
                <p className="text-[11px] text-[#14532D] bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                  {gpsMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={savingTrack}
                className="w-full py-2.5 px-4 min-h-[42px] rounded-lg bg-[#14532D] text-white text-xs font-semibold hover:bg-[#166534] disabled:opacity-60 cursor-pointer"
              >
                {savingTrack ? 'Menyimpan Posisi...' : 'Simpan Posisi & Info Kurir'}
              </button>
            </form>
          </div>
        </div>
      )}

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-zinc-900">
              Antrean Pengantaran COD Gang Makam &amp; Gunung Batin Udik
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Pilih kartu pesanan untuk memperbarui titik lokasi di peta, kirim WhatsApp pemberitahuan, lalu konfirmasi setelah barang diterima.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={activeSearch}
              onChange={(e) => setActiveSearch(e.target.value)}
              placeholder="Cari kode, nama, alamat..."
              aria-label="Cari antrean pengantaran"
              className="px-3 py-1.5 text-xs bg-white border border-zinc-300 rounded-lg w-48"
            />
            {currentUser?.role === 'KURIR' && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setFilterScope('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap ${
                    filterScope === 'ALL'
                      ? 'bg-[#14532D] text-white'
                      : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  Semua ({allActiveDeliveries.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterScope('MINE')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap ${
                    filterScope === 'MINE'
                      ? 'bg-[#14532D] text-white'
                      : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  Tugas Saya ({myAssignedCount})
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {(
            [
              {id: 'ALL', label: `Semua (${scopedActiveDeliveries.length})`},
              {
                id: 'PICKUP_READY',
                label: `Perlu Diambil (${
                  scopedActiveDeliveries.filter((o) => o.status !== 'DIANTAR').length
                })`,
              },
              {
                id: 'ON_WAY',
                label: `Sedang Diantar (${
                  scopedActiveDeliveries.filter((o) => o.status === 'DIANTAR').length
                })`,
              },
            ] as {id: 'ALL' | 'PICKUP_READY' | 'ON_WAY'; label: string}[]
          ).map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setStatusFilter(chip.id)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap ${
                statusFilter === chip.id
                  ? 'bg-zinc-900 text-white'
                  : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {activeDeliveries.length === 0 ? (
          <div className="mt-4 bg-white border border-zinc-200 rounded-xl p-8 text-center text-sm text-zinc-500">
            {filterScope === 'MINE' && scopedActiveDeliveries.length === 0
              ? 'Belum ada pesanan COD yang ditugaskan khusus ke akun Anda.'
              : allActiveDeliveries.length === 0
                ? 'Semua pengantaran COD saat ini sudah selesai.'
                : 'Tidak ada pesanan pada filter pengantaran ini.'}
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeDeliveries.map((ord) => {
              const isSelected = selectedOrder?.id === ord.id;
              const isMine =
                Boolean(currentUser?.id) && ord.assignedCourierId === currentUser?.id;
              const latestWa = ord.whatsappNotifications?.[0];
              const effectiveStoreUrl =
                (settings.storeUrl || '').trim() ||
                (typeof window !== 'undefined' && window.location?.origin
                  ? window.location.origin
                  : '');
              const generatedWaLink = buildCourierWhatsappLink({
                phone: ord.phone,
                customerName: ord.customerName,
                orderNumber: ord.orderNumber,
                courierName: ord.assignedCourierName || ord.courierName || 'Kurir Toko',
                etaMinutes: ord.tracking?.etaMinutes,
                addressNote: ord.addressNote,
                total: ord.total,
                paymentStatus: ord.paymentStatus,
                trigger: ord.status === 'SELESAI' ? 'SELESAI' : 'DIANTAR',
                storeUrl: effectiveStoreUrl,
              }).waLink;
              const directWaLink =
                latestWa?.waLink && /https?:\/\//i.test(latestWa.message || '')
                  ? latestWa.waLink
                  : generatedWaLink;
              return (
                <div
                  key={ord.id}
                  className={`bg-white rounded-xl p-5 flex flex-col justify-between gap-4 transition-colors ${
                    isSelected
                      ? 'border-2 border-[#14532D] shadow-sm'
                      : 'border border-zinc-200'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-xs font-semibold text-[#14532D] tabular-price">
                          {ord.orderNumber} · {ORDER_STATUS_LABELS[ord.status]}
                          {isMine ? ' · Tugas Anda' : ''}
                        </p>
                        <h4 className="text-base font-bold text-zinc-900 mt-0.5">
                          {ord.customerName}
                        </h4>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          {ord.paymentMethod} ·{' '}
                          {ord.paymentStatus
                            ? PAYMENT_STATUS_LABELS[ord.paymentStatus]
                            : 'Bayar di Tempat'}
                          {ord.assignedCourierName
                            ? ` · Kurir: ${ord.assignedCourierName}`
                            : ''}
                        </p>
                      </div>
                      <p className="text-base font-bold text-zinc-900 tabular-price">
                        {formatRupiah(ord.total)}
                      </p>
                    </div>

                    <div className="space-y-1.5 text-xs text-zinc-600">
                      <p className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" aria-hidden="true" />
                        <span>{ord.addressNote}</span>
                      </p>
                      <p className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-zinc-400 shrink-0" aria-hidden="true" />
                        <span>{ord.phone}</span>
                      </p>
                      {ord.tracking?.locationNote && (
                        <p className="text-[11px] font-medium text-[#14532D]">
                          Posisi terakhir: {ord.tracking.locationNote} ({ord.tracking.progressPercent}%)
                        </p>
                      )}
                    </div>

                    <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200 text-xs text-zinc-700 space-y-1">
                      {ord.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between gap-2">
                          <span>
                            {item.productName} ({item.variantLabel})
                          </span>
                          <span className="font-mono tabular-price">x{item.quantity}</span>
                        </div>
                      ))}
                    </div>

                    {/* Automatic WhatsApp notification status & instant link */}
                    <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#14532D] flex items-center gap-1.5">
                          <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>
                            {latestWa
                              ? `Notifikasi WA tercatat (${formatShortDate(latestWa.sentAt)})`
                              : 'Siap Kirim Notifikasi WA Kurir'}
                          </span>
                        </span>
                        <button
                          type="button"
                          disabled={sendingWaId === ord.id}
                          onClick={() => handleTriggerWhatsapp(ord)}
                          className="text-[11px] font-semibold text-[#14532D] underline cursor-pointer"
                        >
                          {sendingWaId === ord.id ? 'Mencatat...' : 'Log Notif WA'}
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 pt-0.5">
                        <a
                          href={directWaLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#14532D] hover:underline"
                        >
                          <span>Buka Chat WhatsApp Pelanggan</span>
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                        </a>
                        {ord.phone && ord.phone !== '-' && (
                          <a
                            href={`tel:${ord.phone.replace(/[^0-9+]/g, '')}`}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-800 hover:underline"
                          >
                            <Phone className="w-3 h-3" aria-hidden="true" />
                            <span>Telepon Langsung</span>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-zinc-100">
                    {!isSelected && (
                      <button
                        type="button"
                        onClick={() => setSelectedOrderId(ord.id)}
                        className="px-3 py-2.5 min-h-[40px] rounded-lg border border-zinc-300 bg-white text-zinc-800 text-xs font-semibold hover:bg-zinc-50 cursor-pointer whitespace-nowrap"
                      >
                        Atur di Peta
                      </button>
                    )}

                    {(ord.status === 'MENUNGGU' || ord.status === 'DISIAPKAN') && (
                      <button
                        type="button"
                        onClick={() => updateDeliveryStatus(ord.id, 'DIANTAR')}
                        className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 min-h-[40px] rounded-lg bg-zinc-900 text-white text-xs font-semibold hover:bg-zinc-800 cursor-pointer whitespace-nowrap"
                      >
                        <Truck className="w-4 h-4" aria-hidden="true" />
                        <span>Mulai Antar + Notif WA</span>
                      </button>
                    )}

                    {ord.status === 'DIANTAR' && (
                      <button
                        type="button"
                        onClick={() => updateDeliveryStatus(ord.id, 'SELESAI')}
                        className="flex-1 py-2.5 px-4 min-h-[40px] rounded-lg bg-[#14532D] text-white text-xs font-semibold hover:bg-[#166534] cursor-pointer whitespace-nowrap"
                      >
                        {ord.paymentStatus === 'LUNAS'
                          ? 'Selesai Diserahkan (Sudah Lunas)'
                          : 'Selesai Diterima & Terima Tunai'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Completed COD History */}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-zinc-900">Riwayat Pengantaran Selesai</h3>
            <p className="text-xs text-zinc-500 mt-0.5 tabular-price">
              Menampilkan {Math.min(15, filteredCompletedDeliveries.length)} dari{' '}
              {completedDeliveries.length} pengantaran selesai
            </p>
          </div>
          <input
            type="search"
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            placeholder="Cari riwayat pengantaran..."
            aria-label="Cari riwayat pengantaran"
            className="px-3 py-1.5 text-xs border border-zinc-300 rounded-lg w-48"
          />
        </div>
        {filteredCompletedDeliveries.length === 0 ? (
          <div className="p-6 text-center text-sm text-zinc-500">
            {completedDeliveries.length === 0
              ? 'Belum ada riwayat pengantaran COD selesai.'
              : 'Tidak ada riwayat pengantaran yang cocok.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                  <th className="py-3 px-4 font-medium">Kode</th>
                  <th className="py-3 px-4 font-medium">Pelanggan &amp; Alamat</th>
                  <th className="py-3 px-4 font-medium">Kurir &amp; Bukti</th>
                  <th className="py-3 px-4 font-medium text-right">Setoran</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-xs">
                {filteredCompletedDeliveries.slice(0, 15).map((ord) => (
                  <tr key={ord.id} className="hover:bg-zinc-50">
                    <td className="py-3 px-4 font-mono text-zinc-700 tabular-price">
                      {ord.orderNumber}
                      <div className="font-sans text-zinc-400">
                        {formatShortDate(ord.updatedAt)}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-zinc-900">{ord.customerName}</p>
                      <p className="text-zinc-500">{ord.addressNote}</p>
                    </td>
                    <td className="py-3 px-4 text-zinc-700">
                      <div className="flex items-center gap-2.5">
                        {ord.tracking?.proofPhoto && (
                          <button
                            type="button"
                            onClick={() => setPreviewProofPhoto(ord.tracking?.proofPhoto || null)}
                            className="w-10 h-10 rounded border border-zinc-300 overflow-hidden shrink-0 cursor-pointer"
                            aria-label={`Lihat bukti foto ${ord.orderNumber}`}
                          >
                            <img
                              src={ord.tracking.proofPhoto}
                              alt={`Bukti ${ord.orderNumber}`}
                              className="w-full h-full object-cover"
                            />
                          </button>
                        )}
                        <div>
                          <p>{ord.assignedCourierName || ord.courierName || '-'}</p>
                          {ord.tracking?.proofNote && (
                            <p className="text-[11px] text-zinc-500">{ord.tracking.proofNote}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-[#14532D] tabular-price">
                      {formatRupiah(ord.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {previewProofPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Pratinjau foto bukti serah terima"
          onClick={() => setPreviewProofPhoto(null)}
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-xl w-full bg-white rounded-xl overflow-hidden shadow-xl"
          >
            <button
              type="button"
              onClick={() => setPreviewProofPhoto(null)}
              aria-label="Tutup foto"
              className="absolute top-3 right-3 p-2 rounded-full bg-white/90 text-zinc-800 hover:bg-white shadow cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={previewProofPhoto}
              alt="Bukti serah terima kurir"
              className="w-full max-h-[80vh] object-contain bg-zinc-900"
            />
          </div>
        </div>
      )}
    </div>
  );
}

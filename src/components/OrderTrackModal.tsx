import {
  Camera,
  Check,
  Copy,
  MessageCircle,
  MessageSquareWarning,
  RefreshCw,
  Search,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import {ChangeEvent, FormEvent, useCallback, useEffect, useState} from 'react';
import {apiFetch} from '../lib/apiClient';
import {compressImageFileToDataUrl} from '../lib/imageHelpers';
import {
  COMPLAINT_CATEGORY_LABELS,
  COMPLAINT_RESOLUTION_LABELS,
  COMPLAINT_STATUS_LABELS,
  DELIVERY_CHECKPOINT_LABELS,
  formatRupiah,
  formatShortDate,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from '../lib/storeData';
import type {
  ComplaintCategory,
  ComplaintRecord,
  ComplaintResolution,
  DeliveryTrackingInfo,
  GeoPoint,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  QrisPaymentInfo,
  StoreSettings,
  WhatsappNotification,
} from '../types/store';
import {DeliveryMap} from './DeliveryMap';
import {QrisCard} from './QrisCard';

interface TrackedOrder {
  orderNumber: string;
  customerName: string;
  deliveryMethod: 'cod' | 'pickup' | 'instore';
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  qris?: QrisPaymentInfo;
  addressNote: string;
  notes?: string;
  status: OrderStatus;
  items: {
    productName: string;
    variantLabel: string;
    quantity: number;
    unitPrice: number;
  }[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  handledBy?: string;
  courierName: string;
  customerCoords?: GeoPoint | null;
  tracking?: DeliveryTrackingInfo;
  whatsappNotifications?: WhatsappNotification[];
  createdAt: string;
  updatedAt: string;
}

interface OrderTrackModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCode?: string;
  settings?: StoreSettings;
  customerToken?: string | null;
}

const DELIVERY_METHOD_LABELS: Record<TrackedOrder['deliveryMethod'], string> = {
  cod: 'Antar COD Lokal',
  pickup: 'Ambil di Toko',
  instore: 'Belanja di Kasir',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  COD: 'Bayar di Tempat (COD)',
  TUNAI: 'Tunai di Toko',
  QRIS: 'QRIS Dinamis Otomatis',
  KASBON: 'Kasbon Pelanggan',
};

const STATUS_STEPS: {key: OrderStatus; label: string; pickupLabel?: string}[] = [
  {key: 'MENUNGGU', label: 'Masuk'},
  {key: 'DISIAPKAN', label: 'Disiapkan'},
  {key: 'DIANTAR', label: 'Diantar', pickupLabel: 'Siap Ambil'},
  {key: 'SELESAI', label: 'Selesai'},
];

export function OrderTrackModal({
  isOpen,
  onClose,
  initialCode = '',
  settings,
  customerToken = null,
}: OrderTrackModalProps) {
  const [code, setCode] = useState(initialCode);
  const [phoneLast4, setPhoneLast4] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmingQris, setConfirmingQris] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<TrackedOrder | null>(null);
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [storeCoords, setStoreCoords] = useState<GeoPoint | null>(
    settings?.storeCoords ?? null
  );
  const [copied, setCopied] = useState(false);

  // Complaint inline form
  const [showComplaintForm, setShowComplaintForm] = useState(false);
  const [cmpCategory, setCmpCategory] = useState<ComplaintCategory>('BARANG_RUSAK');
  const [cmpResolution, setCmpResolution] = useState<ComplaintResolution>('GANTI_BARANG');
  const [cmpDesc, setCmpDesc] = useState('');
  const [cmpPhoto, setCmpPhoto] = useState('');
  const [cmpError, setCmpError] = useState('');
  const [cmpSaving, setCmpSaving] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const fetchTrackedOrder = useCallback(
    async (targetCode?: string, silent = false) => {
      const lookupCode = (targetCode ?? code).trim();
      if (!lookupCode) return;
      if (!customerToken && phoneLast4.replace(/\D/g, '').length < 4) return;
      if (!silent) {
        setError('');
        setLoading(true);
      }
      try {
        const params = new URLSearchParams({
          code: lookupCode,
          phone: phoneLast4.trim(),
        });
        const headers: Record<string, string> = {};
        if (customerToken) headers.Authorization = `Bearer ${customerToken}`;
        const res = await apiFetch<{
          order?: TrackedOrder;
          complaints?: ComplaintRecord[];
          storeCoords?: GeoPoint | null;
          error?: string;
        }>(`/api/public/orders/track?${params.toString()}`, {headers});
        if (!res.ok || !res.data.order) {
          if (!silent) {
            setResult(null);
            setComplaints([]);
            setError(res.data.error || 'Pesanan tidak ditemukan.');
          }
          return;
        }
        setResult(res.data.order);
        setComplaints(res.data.complaints || []);
        if (res.data.storeCoords !== undefined) {
          setStoreCoords(res.data.storeCoords);
        }
      } catch {
        if (!silent) {
          setResult(null);
          setError('Gagal menghubungi server toko. Coba beberapa saat lagi.');
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [code, phoneLast4, customerToken]
  );

  useEffect(() => {
    if (initialCode) {
      setCode(initialCode);
      if (isOpen && customerToken) {
        fetchTrackedOrder(initialCode);
      }
    }
  }, [initialCode, isOpen, customerToken, fetchTrackedOrder]);

  // Auto-poll live tracking & QRIS status every 12s while active
  useEffect(() => {
    if (!isOpen || !result) return;
    if (result.status === 'SELESAI' || result.status === 'DIBATALKAN') return;
    const timer = window.setInterval(() => {
      fetchTrackedOrder(result.orderNumber, true);
    }, 12000);
    return () => window.clearInterval(timer);
  }, [isOpen, result, fetchTrackedOrder]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleTrack = async (e: FormEvent) => {
    e.preventDefault();
    setCopied(false);
    setShowComplaintForm(false);
    await fetchTrackedOrder();
  };

  const handleConfirmQris = async () => {
    if (!result) return;
    setConfirmingQris(true);
    try {
      const headers: Record<string, string> = {'Content-Type': 'application/json'};
      if (customerToken) headers.Authorization = `Bearer ${customerToken}`;
      const res = await apiFetch<{order?: TrackedOrder; error?: string}>(
        `/api/public/orders/${result.orderNumber}/qris-pay`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({phoneLast4: phoneLast4.trim()}),
        }
      );
      if (res.ok && res.data.order) {
        setResult(res.data.order);
      }
    } finally {
      setConfirmingQris(false);
    }
  };

  const handleComplaintPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCmpError('');
    try {
      const compressed = await compressImageFileToDataUrl(file);
      setCmpPhoto(compressed);
    } catch (err) {
      setCmpError(err instanceof Error ? err.message : 'Gagal membaca gambar.');
    }
    e.target.value = '';
  };

  const handleSubmitComplaint = async (e: FormEvent) => {
    e.preventDefault();
    if (!result) return;
    setCmpError('');
    setCmpSaving(true);
    try {
      const headers: Record<string, string> = {'Content-Type': 'application/json'};
      if (customerToken) headers.Authorization = `Bearer ${customerToken}`;
      const res = await apiFetch<{complaint?: ComplaintRecord; error?: string}>(
        '/api/public/complaints',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            orderNumber: result.orderNumber,
            phoneLast4: phoneLast4.trim(),
            category: cmpCategory,
            requestedResolution: cmpResolution,
            description: cmpDesc.trim(),
            evidencePhoto: cmpPhoto || undefined,
          }),
        }
      );
      if (!res.ok || !res.data.complaint) {
        setCmpError(res.data.error || 'Gagal mengirim laporan komplain.');
        return;
      }
      setComplaints((prev) => [res.data.complaint!, ...prev]);
      setCmpDesc('');
      setCmpPhoto('');
      setShowComplaintForm(false);
    } finally {
      setCmpSaving(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!result) return;
    setCancelling(true);
    try {
      const headers: Record<string, string> = {'Content-Type': 'application/json'};
      if (customerToken) headers.Authorization = `Bearer ${customerToken}`;
      const res = await apiFetch<{order?: TrackedOrder; error?: string}>(
        `/api/public/orders/${result.orderNumber}/cancel`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({phoneLast4: phoneLast4.trim()}),
        }
      );
      if (res.ok && res.data.order) {
        setResult(res.data.order);
        setConfirmCancel(false);
      } else {
        setError(res.data.error || 'Gagal membatalkan pesanan.');
      }
    } finally {
      setCancelling(false);
    }
  };

  const handleCopySummary = async () => {
    if (!result) return;
    const methodLabel = DELIVERY_METHOD_LABELS[result.deliveryMethod];
    const paymentLabel =
      PAYMENT_METHOD_LABELS[result.paymentMethod || (result.deliveryMethod === 'cod' ? 'COD' : 'TUNAI')] ||
      'Tunai';
    const lines = [
      `Status Pesanan ${result.orderNumber} — Toko Dimas Jaya`,
      `Status: ${ORDER_STATUS_LABELS[result.status]}`,
      `Pemesan: ${result.customerName}`,
      `Metode: ${methodLabel} (${paymentLabel})`,
      `Alamat: ${result.addressNote}`,
      ...(result.notes ? [`Catatan: ${result.notes}`] : []),
      '',
      ...result.items.map(
        (i) =>
          `- ${i.productName} (${i.variantLabel}) x${i.quantity} = ${formatRupiah(
            i.unitPrice * i.quantity
          )}`
      ),
      '',
      `Subtotal: ${formatRupiah(result.subtotal)}`,
      `Ongkos Antar: ${result.deliveryFee === 0 ? 'Gratis' : formatRupiah(result.deliveryFee)}`,
      `Total Bayar: ${formatRupiah(result.total)}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      setCopied(false);
    }
  };

  const activeStepIndex = result
    ? STATUS_STEPS.findIndex((s) => s.key === result.status)
    : -1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="track-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-2xl max-h-[92vh] flex flex-col rounded-xl border border-zinc-200 shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between gap-4 shrink-0">
          <div>
            <h2 id="track-modal-title" className="font-display text-lg font-bold text-zinc-900">
              Lacak Status Pesanan
            </h2>
            <p className="text-xs text-zinc-500">
              {customerToken
                ? 'Masukkan kode pesanan Anda (4 digit HP otomatis terverifikasi dari akun)'
                : 'Masukkan kode pesanan (contoh: DJ-1001) dan 4 digit akhir nomor HP'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pelacakan pesanan"
            className="p-1.5 text-zinc-500 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          <form onSubmit={handleTrack} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className={customerToken ? 'sm:col-span-9' : 'sm:col-span-5'}>
              <label htmlFor="track-code" className="block text-xs text-zinc-600 mb-1">
                Kode Pesanan
              </label>
              <input
                id="track-code"
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="DJ-1001"
                className="w-full px-3 py-2 min-h-[40px] text-sm font-mono uppercase border border-zinc-300 rounded-lg focus:outline-none focus:border-[#14532D] focus:ring-1 focus:ring-[#14532D]"
              />
            </div>

            {!customerToken && (
              <div className="sm:col-span-4">
                <label htmlFor="track-phone" className="block text-xs text-zinc-600 mb-1">
                  4 Digit Akhir HP
                </label>
                <input
                  id="track-phone"
                  type="text"
                  required
                  maxLength={15}
                  value={phoneLast4}
                  onChange={(e) => setPhoneLast4(e.target.value)}
                  placeholder="1122"
                  className="w-full px-3 py-2 min-h-[40px] text-sm font-mono border border-zinc-300 rounded-lg focus:outline-none focus:border-[#14532D] focus:ring-1 focus:ring-[#14532D]"
                />
              </div>
            )}

            <div className="sm:col-span-3 flex items-end">
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg bg-[#14532D] text-white text-sm font-semibold hover:bg-[#166534] disabled:opacity-60 transition-colors cursor-pointer"
              >
                <Search className="w-4 h-4" aria-hidden="true" />
                <span>{loading ? 'Cek...' : 'Cek'}</span>
              </button>
            </div>
          </form>

          {error && (
            <p
              role="alert"
              className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg p-3"
            >
              {error}
            </p>
          )}

          {result && (
            <div className="border border-zinc-200 rounded-xl overflow-hidden bg-zinc-50">
              {/* Header & Status Progress */}
              <div className="p-5 bg-white border-b border-zinc-200 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs text-zinc-500 tabular-price">
                      {result.orderNumber} · Dibuat {formatShortDate(result.createdAt)}
                    </p>
                    <p className="text-base font-bold text-zinc-900 mt-0.5">
                      {ORDER_STATUS_LABELS[result.status]}
                    </p>
                    <p className="text-[11px] text-zinc-500 mt-0.5 tabular-price">
                      Terakhir diperbarui: {formatShortDate(result.updatedAt)}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => fetchTrackedOrder()}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-300 bg-white text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
                      aria-hidden="true"
                    />
                    <span>Muat Ulang</span>
                  </button>
                </div>

                {result.status === 'DIBATALKAN' ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
                    Pesanan ini dibatalkan. Stok barang telah dikembalikan ke gudang toko.
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-2 pt-1">
                    {STATUS_STEPS.map((step, idx) => {
                      const isDone = idx <= activeStepIndex;
                      const isCurrent = idx === activeStepIndex;
                      const label =
                        result.deliveryMethod === 'pickup' && step.pickupLabel
                          ? step.pickupLabel
                          : step.label;
                      return (
                        <div key={step.key} className="space-y-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-colors ${
                              isDone ? 'bg-[#14532D]' : 'bg-zinc-200'
                            }`}
                          />
                          <p
                            className={`text-[11px] leading-tight ${
                              isCurrent
                                ? 'font-bold text-[#14532D]'
                                : isDone
                                  ? 'font-medium text-zinc-800'
                                  : 'text-zinc-400'
                            }`}
                          >
                            {idx + 1}. {label}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Dynamic QRIS Section if applicable */}
              {result.qris && result.status !== 'DIBATALKAN' && (
                <div className="p-4 sm:px-5 bg-zinc-50 border-b border-zinc-200">
                  <QrisCard
                    qris={result.qris}
                    orderNumber={result.orderNumber}
                    onConfirmPayment={
                      result.qris.gatewayStatus === 'PENDING' ? handleConfirmQris : undefined
                    }
                    confirming={confirmingQris}
                  />
                </div>
              )}

              {/* Automated WhatsApp Notifications */}
              {result.whatsappNotifications && result.whatsappNotifications.length > 0 && (
                <div className="p-4 sm:px-5 bg-emerald-50/70 border-b border-zinc-200 space-y-2">
                  <p className="text-xs font-bold text-[#14532D] flex items-center gap-1.5">
                    <MessageCircle className="w-4 h-4" aria-hidden="true" />
                    <span>Pembaruan WhatsApp Kurir &amp; Toko</span>
                  </p>
                  {result.whatsappNotifications.slice(0, 2).map((notif) => (
                    <div
                      key={notif.id}
                      className="rounded-lg bg-white border border-emerald-200 p-3 text-xs text-zinc-700 space-y-1"
                    >
                      <p className="text-[11px] text-zinc-500">
                        {formatShortDate(notif.sentAt)} · oleh {notif.actorName}
                      </p>
                      <p className="whitespace-pre-line leading-relaxed">{notif.message}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Order Info Grid */}
              <div className="p-4 sm:px-5 bg-zinc-50 border-b border-zinc-200 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-zinc-500">Pemesan &amp; Pengambilan</p>
                  <p className="font-semibold text-zinc-900 mt-0.5">
                    {result.customerName} · {DELIVERY_METHOD_LABELS[result.deliveryMethod]}
                  </p>
                  <p className="text-zinc-600 mt-0.5">{result.addressNote}</p>
                </div>

                <div>
                  <p className="text-zinc-500">Pembayaran &amp; Petugas</p>
                  <p className="font-semibold text-zinc-900 mt-0.5">
                    {PAYMENT_METHOD_LABELS[
                      result.paymentMethod || (result.deliveryMethod === 'cod' ? 'COD' : 'TUNAI')
                    ] || 'Tunai'}
                    {result.paymentStatus ? ` · ${PAYMENT_STATUS_LABELS[result.paymentStatus]}` : ''}
                  </p>
                  <p className="text-zinc-600 mt-0.5">
                    {result.courierName
                      ? `Kurir: ${result.courierName}`
                      : result.handledBy
                        ? `Ditangani: ${result.handledBy}`
                        : 'Menunggu konfirmasi kasir / gudang'}
                  </p>
                </div>

                {result.notes && (
                  <div className="sm:col-span-2 pt-2 border-t border-zinc-200">
                    <p className="text-zinc-500">Catatan Pemesan</p>
                    <p className="text-zinc-800 mt-0.5">{result.notes}</p>
                  </div>
                )}
              </div>

              {/* Live Delivery Map & Arrival Status for COD Orders */}
              {result.deliveryMethod === 'cod' && result.status !== 'DIBATALKAN' && (
                <div className="p-4 sm:px-5 bg-white border-b border-zinc-200 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-[#14532D] shrink-0" aria-hidden="true" />
                      <div>
                        <p className="text-xs font-bold text-zinc-900">
                          {result.status === 'SELESAI' ||
                          result.tracking?.checkpoint === 'SUDAH_TIBA'
                            ? 'Kurir Sudah Tiba di Lokasi Tujuan'
                            : result.status === 'DIANTAR'
                              ? 'Kurir Sedang Dalam Perjalanan'
                              : 'Belum Berangkat (Menunggu Penyiapan Toko)'}
                        </p>
                        <p className="text-[11px] text-zinc-600 mt-0.5">
                          {result.tracking?.locationNote ||
                            (result.tracking?.checkpoint
                              ? DELIVERY_CHECKPOINT_LABELS[result.tracking.checkpoint].label
                              : 'Pesanan sedang diproses di Toko Dimas Jaya')}
                        </p>
                      </div>
                    </div>

                    <div className="text-right text-[11px] tabular-price">
                      {result.status !== 'SELESAI' &&
                        result.tracking?.etaMinutes !== undefined &&
                        result.tracking.etaMinutes > 0 && (
                          <span className="inline-block px-2 py-0.5 rounded bg-amber-50 border border-amber-200 font-semibold text-amber-800">
                            Estimasi ±{result.tracking.etaMinutes} menit
                          </span>
                        )}
                    </div>
                  </div>

                  <DeliveryMap
                    mapInstanceId={`track-map-${result.orderNumber}`}
                    storeName={settings?.name || 'Toko Dimas Jaya'}
                    storeAddress={settings?.fullAddress}
                    storeCoords={storeCoords ?? settings?.storeCoords}
                    customerLabel={result.customerName}
                    customerAddress={result.addressNote}
                    customerCoords={result.customerCoords}
                    courierName={result.courierName || 'Kurir Gang Makam'}
                    orderStatus={result.status}
                    tracking={result.tracking}
                    mapsUrl={settings?.mapsUrl}
                    heightClass="h-56"
                  />

                  {(result.tracking?.proofNote || result.tracking?.proofPhoto) && (
                    <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 flex flex-wrap items-start gap-3 text-xs text-emerald-950">
                      {result.tracking.proofPhoto && (
                        <img
                          src={result.tracking.proofPhoto}
                          alt="Foto bukti serah terima kurir"
                          className="w-20 h-20 object-cover rounded-lg border border-emerald-300 shrink-0"
                        />
                      )}
                      <div className="space-y-0.5 min-w-0">
                        <p className="font-semibold">Bukti Serah Terima Pengantaran</p>
                        {result.tracking.proofNote && (
                          <p className="text-emerald-900">{result.tracking.proofNote}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Items & Totals Breakdown */}
              <div className="divide-y divide-zinc-200 bg-white">
                {result.items.map((item, idx) => (
                  <div
                    key={`${item.productName}-${idx}`}
                    className="px-4 sm:px-5 py-2.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-900 truncate">{item.productName}</p>
                      <p className="text-zinc-500">
                        {item.variantLabel} · {item.quantity}x @ {formatRupiah(item.unitPrice)}
                      </p>
                    </div>
                    <span className="font-semibold text-zinc-900 tabular-price shrink-0">
                      {formatRupiah(item.unitPrice * item.quantity)}
                    </span>
                  </div>
                ))}

                <div className="px-4 sm:px-5 py-2.5 bg-white flex items-center justify-between text-xs text-zinc-600">
                  <span>Subtotal Barang</span>
                  <span className="tabular-price">{formatRupiah(result.subtotal)}</span>
                </div>

                <div className="px-4 sm:px-5 py-2.5 bg-white flex items-center justify-between text-xs text-zinc-600">
                  <span>Ongkos Antar</span>
                  <span className="tabular-price">
                    {result.deliveryFee === 0 ? 'Gratis' : formatRupiah(result.deliveryFee)}
                  </span>
                </div>

                <div className="px-4 sm:px-5 py-3 bg-zinc-50 flex items-center justify-between text-sm font-bold text-zinc-900">
                  <span>Total Bayar</span>
                  <span className="tabular-price">{formatRupiah(result.total)}</span>
                </div>
              </div>

              {/* Complaints / Returns status + inline submission */}
              {(complaints.length > 0 || showComplaintForm) && (
                <div className="p-4 sm:px-5 bg-zinc-50 border-t border-zinc-200 space-y-3">
                  {complaints.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-zinc-800">
                        Status Komplain / Retur Pesanan Ini
                      </p>
                      {complaints.map((c) => (
                        <div
                          key={c.id}
                          className="p-3 rounded-lg bg-white border border-zinc-200 text-xs space-y-1"
                        >
                          <div className="flex justify-between gap-2">
                            <span className="font-mono font-semibold text-zinc-900">
                              {c.complaintNumber}
                            </span>
                            <span className="font-semibold text-[#14532D]">
                              {COMPLAINT_STATUS_LABELS[c.status]}
                            </span>
                          </div>
                          <p className="text-zinc-700">
                            {COMPLAINT_CATEGORY_LABELS[c.category]} — {c.description}
                          </p>
                          {c.evidencePhoto && (
                            <img
                              src={c.evidencePhoto}
                              alt={`Foto bukti ${c.complaintNumber}`}
                              className="w-20 h-20 object-cover rounded-lg border border-zinc-200 mt-1"
                            />
                          )}
                          {c.staffResponse && (
                            <p className="text-emerald-900 bg-emerald-50 border border-emerald-200 rounded p-2">
                              Tanggapan Toko: {c.staffResponse}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {showComplaintForm && (
                    <form
                      onSubmit={handleSubmitComplaint}
                      className="p-3.5 rounded-lg bg-white border border-zinc-200 space-y-3"
                    >
                      <p className="text-xs font-bold text-zinc-900">
                        Ajukan Komplain / Retur untuk {result.orderNumber}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <select
                          aria-label="Kategori komplain"
                          value={cmpCategory}
                          onChange={(e) => setCmpCategory(e.target.value as ComplaintCategory)}
                          className="px-2.5 py-2 text-xs bg-white border border-zinc-300 rounded-lg"
                        >
                          {Object.entries(COMPLAINT_CATEGORY_LABELS).map(([k, lbl]) => (
                            <option key={k} value={k}>
                              {lbl}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label="Solusi retur"
                          value={cmpResolution}
                          onChange={(e) =>
                            setCmpResolution(e.target.value as ComplaintResolution)
                          }
                          className="px-2.5 py-2 text-xs bg-white border border-zinc-300 rounded-lg"
                        >
                          {Object.entries(COMPLAINT_RESOLUTION_LABELS).map(([k, lbl]) => (
                            <option key={k} value={k}>
                              {lbl}
                            </option>
                          ))}
                        </select>
                      </div>
                      <textarea
                        rows={2}
                        required
                        value={cmpDesc}
                        onChange={(e) => setCmpDesc(e.target.value)}
                        placeholder="Jelaskan barang yang bermasalah atau kurang..."
                        className="w-full px-3 py-2 text-xs border border-zinc-300 rounded-lg"
                      />
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 bg-zinc-50 text-xs font-medium text-zinc-700 hover:bg-zinc-100 cursor-pointer">
                          <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{cmpPhoto ? 'Ganti Foto Bukti' : 'Foto Bukti (Opsional)'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleComplaintPhoto}
                            className="hidden"
                          />
                        </label>
                        {cmpPhoto && (
                          <div className="flex items-center gap-2">
                            <img
                              src={cmpPhoto}
                              alt="Pratinjau foto komplain"
                              className="w-12 h-12 object-cover rounded-lg border border-zinc-200"
                            />
                            <button
                              type="button"
                              onClick={() => setCmpPhoto('')}
                              className="p-1 text-red-700 hover:bg-red-50 rounded cursor-pointer"
                              aria-label="Hapus foto komplain"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                      {cmpError && (
                        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                          {cmpError}
                        </p>
                      )}
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowComplaintForm(false)}
                          className="px-3 py-1.5 text-xs text-zinc-600 cursor-pointer"
                        >
                          Batal
                        </button>
                        <button
                          type="submit"
                          disabled={cmpSaving}
                          className="px-3.5 py-1.5 rounded-lg bg-[#14532D] text-white text-xs font-semibold hover:bg-[#166534] cursor-pointer"
                        >
                          {cmpSaving ? 'Mengirim...' : 'Kirim Komplain'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              <div className="px-4 sm:px-5 py-3 bg-white border-t border-zinc-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowComplaintForm((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 bg-white text-xs font-medium text-zinc-700 hover:bg-zinc-50 cursor-pointer whitespace-nowrap"
                  >
                    <MessageSquareWarning className="w-3.5 h-3.5 text-amber-700" aria-hidden="true" />
                    <span>{showComplaintForm ? 'Tutup Form Komplain' : 'Ajukan Komplain / Retur'}</span>
                  </button>

                  {result.status === 'MENUNGGU' &&
                    (confirmCancel ? (
                      <span className="inline-flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1 text-xs">
                        <span className="text-red-800 font-medium">Batalkan pesanan?</span>
                        <button
                          type="button"
                          disabled={cancelling}
                          onClick={handleCancelOrder}
                          className="font-bold text-red-700 underline cursor-pointer"
                        >
                          {cancelling ? '...' : 'Ya, Batal'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmCancel(false)}
                          className="text-zinc-600 cursor-pointer"
                        >
                          Tidak
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmCancel(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 bg-white text-xs font-medium text-red-700 hover:bg-red-50 cursor-pointer whitespace-nowrap"
                      >
                        Batalkan Pesanan
                      </button>
                    ))}
                </div>

                <button
                  type="button"
                  onClick={handleCopySummary}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 bg-white text-xs font-medium text-zinc-800 hover:bg-zinc-50 cursor-pointer whitespace-nowrap"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#14532D]" aria-hidden="true" />
                      <span>Disalin</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Salin Info</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

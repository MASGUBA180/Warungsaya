import {Check, Copy, RefreshCw, Search, Truck, X} from 'lucide-react';
import {FormEvent, useEffect, useState} from 'react';
import {apiFetch} from '../lib/apiClient';
import {
  DELIVERY_CHECKPOINT_LABELS,
  formatRupiah,
  formatShortDate,
  ORDER_STATUS_LABELS,
} from '../lib/storeData';
import type {
  DeliveryTrackingInfo,
  GeoPoint,
  OrderStatus,
  PaymentMethod,
  StoreSettings,
} from '../types/store';
import {DeliveryMap} from './DeliveryMap';

interface TrackedOrder {
  orderNumber: string;
  customerName: string;
  deliveryMethod: 'cod' | 'pickup' | 'instore';
  paymentMethod?: PaymentMethod;
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
  createdAt: string;
  updatedAt: string;
}

interface OrderTrackModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCode?: string;
  settings?: StoreSettings;
}

const DELIVERY_METHOD_LABELS: Record<TrackedOrder['deliveryMethod'], string> = {
  cod: 'Antar COD Lokal',
  pickup: 'Ambil di Toko',
  instore: 'Belanja di Kasir',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  COD: 'Bayar di Tempat (COD)',
  TUNAI: 'Tunai di Toko',
  TRANSFER: 'Transfer / QRIS',
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
}: OrderTrackModalProps) {
  const [code, setCode] = useState(initialCode);
  const [phoneLast4, setPhoneLast4] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<TrackedOrder | null>(null);
  const [storeCoords, setStoreCoords] = useState<GeoPoint | null>(
    settings?.storeCoords ?? null
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (initialCode) setCode(initialCode);
  }, [initialCode]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const fetchTrackedOrder = async () => {
    setError('');
    setLoading(true);
    try {
      const params = new URLSearchParams({
        code: code.trim(),
        phone: phoneLast4.trim(),
      });
      const res = await apiFetch<{
        order?: TrackedOrder;
        storeCoords?: GeoPoint | null;
        error?: string;
      }>(`/api/public/orders/track?${params.toString()}`);
      if (!res.ok || !res.data.order) {
        setResult(null);
        setError(res.data.error || 'Pesanan tidak ditemukan.');
        return;
      }
      setResult(res.data.order);
      if (res.data.storeCoords !== undefined) {
        setStoreCoords(res.data.storeCoords);
      }
    } catch {
      setResult(null);
      setError('Gagal menghubungi server toko. Coba beberapa saat lagi.');
    } finally {
      setLoading(false);
    }
  };

  const handleTrack = async (e: FormEvent) => {
    e.preventDefault();
    setCopied(false);
    await fetchTrackedOrder();
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
              Masukkan kode pesanan (contoh: DJ-1001) dan 4 digit akhir nomor HP
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
            <div className="sm:col-span-5">
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
                    onClick={fetchTrackedOrder}
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

              {/* Order Info Grid */}
              <div className="p-4 sm:px-5 bg-zinc-50 border-b border-zinc-200 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-zinc-500">Pemesan & Pengambilan</p>
                  <p className="font-semibold text-zinc-900 mt-0.5">
                    {result.customerName} · {DELIVERY_METHOD_LABELS[result.deliveryMethod]}
                  </p>
                  <p className="text-zinc-600 mt-0.5">{result.addressNote}</p>
                </div>

                <div>
                  <p className="text-zinc-500">Pembayaran & Petugas</p>
                  <p className="font-semibold text-zinc-900 mt-0.5">
                    {PAYMENT_METHOD_LABELS[
                      result.paymentMethod || (result.deliveryMethod === 'cod' ? 'COD' : 'TUNAI')
                    ] || 'Tunai'}
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

              <div className="px-4 sm:px-5 py-3 bg-white border-t border-zinc-200 flex items-center justify-between gap-3">
                <p className="text-[11px] text-zinc-500">
                  Jam operasional: 06.30 – 21.00 WIB
                </p>
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

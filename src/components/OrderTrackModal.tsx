import {Search, X} from 'lucide-react';
import {FormEvent, useEffect, useState} from 'react';
import {formatRupiah, formatShortDate, ORDER_STATUS_LABELS} from '../data/storeData';
import type {OrderStatus} from '../types/store';

interface TrackedOrder {
  orderNumber: string;
  customerName: string;
  deliveryMethod: 'cod' | 'pickup' | 'instore';
  addressNote: string;
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
  courierName: string;
  createdAt: string;
  updatedAt: string;
}

interface OrderTrackModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCode?: string;
}

export function OrderTrackModal({
  isOpen,
  onClose,
  initialCode = '',
}: OrderTrackModalProps) {
  const [code, setCode] = useState(initialCode);
  const [phoneLast4, setPhoneLast4] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<TrackedOrder | null>(null);

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

  const handleTrack = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({
        code: code.trim(),
        phone: phoneLast4.trim(),
      });
      const res = await fetch(`/api/public/orders/track?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Pesanan tidak ditemukan.');
        return;
      }
      setResult(data.order);
    } catch {
      setError('Gagal menghubungi server toko. Coba beberapa saat lagi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="track-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-lg rounded-xl border border-zinc-200 shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between gap-4">
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

        <div className="p-6 space-y-5">
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
              <div className="p-4 bg-white border-b border-zinc-200 flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-xs text-zinc-500 tabular-price">
                    {result.orderNumber} · {formatShortDate(result.updatedAt)}
                  </p>
                  <p className="text-base font-bold text-zinc-900 mt-0.5">
                    {ORDER_STATUS_LABELS[result.status]}
                  </p>
                  <p className="text-xs text-zinc-600 mt-1">
                    {result.customerName} · {result.addressNote}
                  </p>
                  {result.courierName && (
                    <p className="text-xs text-[#14532D] font-medium mt-1">
                      Petugas Pengantar: {result.courierName}
                    </p>
                  )}
                </div>
              </div>

              <div className="divide-y divide-zinc-200 bg-white">
                {result.items.map((item, idx) => (
                  <div
                    key={`${item.productName}-${idx}`}
                    className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="text-zinc-700">
                      {item.productName} ({item.variantLabel}) x{item.quantity}
                    </span>
                    <span className="font-semibold text-zinc-900 tabular-price">
                      {formatRupiah(item.unitPrice * item.quantity)}
                    </span>
                  </div>
                ))}
                <div className="px-4 py-3 bg-zinc-50 flex items-center justify-between text-sm font-bold text-zinc-900">
                  <span>Total Bayar</span>
                  <span className="tabular-price">{formatRupiah(result.total)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

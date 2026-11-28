import {Check, Copy, MapPin, MessageCircle, Minus, Plus, QrCode, ShoppingBag, Trash2, X} from 'lucide-react';
import {FormEvent, useEffect, useState} from 'react';
import {apiFetch} from '../lib/apiClient';
import {formatRupiah} from '../lib/storeData';
import type {
  CustomerProfile,
  GeoPoint,
  PaymentMethod,
  PaymentStatus,
  Product,
  ProductVariant,
  QrisPaymentInfo,
  StoreSettings,
} from '../types/store';
import {QrisCard} from './QrisCard';

export interface CartItem {
  key: string;
  product: Product;
  variant: ProductVariant;
  quantity: number;
}

interface OrderReceipt {
  orderNumber: string;
  customerName: string;
  deliveryMethod: 'cod' | 'pickup';
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  qris?: QrisPaymentInfo;
  addressNote: string;
  notes: string;
  items: {
    productName: string;
    variantLabel: string;
    unitPrice: number;
    quantity: number;
  }[];
  subtotal: number;
  deliveryFee: number;
  total: number;
}

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  settings: StoreSettings;
  customer?: CustomerProfile | null;
  customerToken?: string | null;
  onUpdateQuantity: (key: string, delta: number) => void;
  onRemoveItem: (key: string) => void;
  onClearCart?: () => void;
  onOrderCreated: (orderNumber: string) => void;
  onOpenTracker: (code: string) => void;
}

export function CartDrawer({
  isOpen,
  onClose,
  items,
  settings,
  customer,
  customerToken,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onOrderCreated,
  onOpenTracker,
}: CartDrawerProps) {
  const [customerName, setCustomerName] = useState(customer?.name || '');
  const [phone, setPhone] = useState(customer?.phone || '');
  const [deliveryMethod, setDeliveryMethod] = useState<'cod' | 'pickup'>('cod');
  const [paymentChoice, setPaymentChoice] = useState<'PAY_ON_DELIVERY' | 'QRIS'>('PAY_ON_DELIVERY');
  const [addressNote, setAddressNote] = useState(
    customer?.defaultAddress || 'Gang Makam, Gunung Batin Udik'
  );
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmingQris, setConfirmingQris] = useState(false);
  const [confirmClearCart, setConfirmClearCart] = useState(false);
  const [formError, setFormError] = useState('');
  const [receipt, setReceipt] = useState<OrderReceipt | null>(null);
  const [copiedReceipt, setCopiedReceipt] = useState(false);
  const [customerCoords, setCustomerCoords] = useState<GeoPoint | null>(
    customer?.savedCoords ?? null
  );
  const [gpsStatus, setGpsStatus] = useState('');

  useEffect(() => {
    if (customer) {
      setCustomerName((prev) => prev || customer.name);
      setPhone((prev) => prev || customer.phone);
      setAddressNote((prev) =>
        prev === 'Gang Makam, Gunung Batin Udik' || !prev ? customer.defaultAddress : prev
      );
      if (customer.savedCoords) {
        setCustomerCoords((prev) => prev ?? customer.savedCoords ?? null);
      }
    }
  }, [customer]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const subtotal = items.reduce((sum, item) => sum + item.variant.price * item.quantity, 0);
  const freeDelivery = subtotal >= settings.freeDeliveryMin;
  const freeDeliveryShortfall = Math.max(0, settings.freeDeliveryMin - subtotal);
  const freeDeliveryProgress =
    settings.freeDeliveryMin > 0
      ? Math.min(100, Math.round((subtotal / settings.freeDeliveryMin) * 100))
      : 100;
  const deliveryFee = deliveryMethod === 'cod' && !freeDelivery ? settings.deliveryFee : 0;
  const grandTotal = subtotal + deliveryFee;
  const waDigits = (settings.whatsappNumber || '6281279008899').replace(/\D/g, '');
  const storeWaLink = receipt
    ? `https://wa.me/${waDigits}?text=${encodeURIComponent(
        `Halo ${settings.name}, saya ${receipt.customerName} konfirmasi pesanan #${receipt.orderNumber} senilai ${formatRupiah(receipt.total)}.`
      )}`
    : '';

  const handleSubmitOrder = async (e: FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !phone.trim()) {
      setFormError('Mohon isi nama pemesan dan nomor HP/WhatsApp.');
      return;
    }
    if (deliveryMethod === 'cod' && !addressNote.trim()) {
      setFormError('Mohon lengkapi patokan alamat pengantaran di Gunung Batin Udik.');
      return;
    }

    setFormError('');
    setSubmitting(true);
    try {
      const headers: Record<string, string> = {'Content-Type': 'application/json'};
      if (customerToken) headers.Authorization = `Bearer ${customerToken}`;

      const res = await apiFetch<{order?: OrderReceipt; error?: string}>(
        '/api/public/orders',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            customerName: customerName.trim(),
            phone: phone.trim(),
            deliveryMethod,
            paymentMethod:
              paymentChoice === 'QRIS'
                ? 'QRIS'
                : deliveryMethod === 'cod'
                  ? 'COD'
                  : 'TUNAI',
            addressNote: addressNote.trim(),
            notes: notes.trim(),
            customerCoords: deliveryMethod === 'cod' ? customerCoords : null,
            items: items.map((item) => ({
              productId: item.product.id,
              variantId: item.variant.id,
              quantity: item.quantity,
            })),
          }),
        }
      );
      if (!res.ok || !res.data.order) {
        setFormError(res.data.error || 'Gagal mengirim pesanan.');
        return;
      }

      setReceipt(res.data.order);
      onOrderCreated(res.data.order.orderNumber);
    } catch {
      setFormError('Gagal terhubung ke server Toko Dimas Jaya.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmQrisPayment = async () => {
    if (!receipt) return;
    setConfirmingQris(true);
    try {
      const headers: Record<string, string> = {'Content-Type': 'application/json'};
      if (customerToken) headers.Authorization = `Bearer ${customerToken}`;
      const res = await apiFetch<{order?: OrderReceipt; error?: string}>(
        `/api/public/orders/${receipt.orderNumber}/qris-pay`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            phoneLast4: phone.replace(/\D/g, '').slice(-4),
          }),
        }
      );
      if (res.ok && res.data.order) {
        setReceipt(res.data.order);
      }
    } finally {
      setConfirmingQris(false);
    }
  };

  const handleCopyReceipt = async () => {
    if (!receipt) return;
    const lines = [
      `Pesanan ${receipt.orderNumber} — ${settings.name}`,
      `Pemesan: ${receipt.customerName}`,
      `Metode: ${receipt.deliveryMethod === 'cod' ? 'Antar COD' : 'Ambil di Toko'}`,
      `Pembayaran: ${receipt.paymentMethod === 'QRIS' ? `QRIS (${receipt.paymentStatus})` : 'COD / Tunai'}`,
      `Alamat: ${receipt.addressNote}`,
      '',
      ...receipt.items.map(
        (i) =>
          `- ${i.productName} (${i.variantLabel}) x${i.quantity} = ${formatRupiah(
            i.unitPrice * i.quantity
          )}`
      ),
      '',
      `Ongkir: ${receipt.deliveryFee === 0 ? 'Gratis' : formatRupiah(receipt.deliveryFee)}`,
      `Total: ${formatRupiah(receipt.total)}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedReceipt(true);
      window.setTimeout(() => setCopiedReceipt(false), 2500);
    } catch {
      setCopiedReceipt(false);
    }
  };

  const handleCaptureGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus('Browser tidak mendukung GPS. Alamat teks tetap bisa dipakai.');
      return;
    }
    setGpsStatus('Mengambil titik GPS rumah Anda...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const pt: GeoPoint = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        };
        setCustomerCoords(pt);
        setGpsStatus(`Titik peta rumah tersimpan (${pt.lat.toFixed(4)}, ${pt.lng.toFixed(4)}).`);
      },
      () => {
        setGpsStatus('Izin lokasi belum aktif. Kurir tetap dapat mengantar lewat patokan alamat.');
      },
      {enableHighAccuracy: true, timeout: 8000}
    );
  };

  const handleNewOrder = () => {
    setReceipt(null);
    if (!customer) {
      setCustomerName('');
      setPhone('');
    }
    setNotes('');
    setCustomerCoords(null);
    setGpsStatus('');
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keranjang Belanja Toko Dimas Jaya"
      className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white h-full flex flex-col border-l border-zinc-200 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold text-zinc-900">
              {receipt ? 'Pesanan Tercatat' : 'Keranjang Belanja'}
            </h2>
            <p className="text-xs text-zinc-500">
              {settings.name} · Gang Makam, Gunung Batin Udik
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup keranjang"
            className="p-2 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {receipt ? (
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            <div className="p-5 rounded-xl bg-[#F3F4F2] border border-zinc-200 space-y-2">
              <p className="text-xs font-mono font-medium text-[#14532D] tabular-price">
                Kode Pesanan: {receipt.orderNumber}
              </p>
              <h3 className="text-base font-bold text-zinc-900">
                Terima kasih, {receipt.customerName}
              </h3>
              <p className="text-sm text-zinc-600 leading-relaxed">
                {receipt.paymentMethod === 'QRIS' && receipt.paymentStatus !== 'LUNAS'
                  ? 'Scan kode QRIS dinamis di bawah ini agar kasir & kurir langsung memproses pesanan Anda.'
                  : 'Pesanan Anda telah masuk ke sistem kasir & gudang Toko Dimas Jaya.'}
              </p>
            </div>

            {receipt.qris && (
              <QrisCard
                qris={receipt.qris}
                orderNumber={receipt.orderNumber}
                onConfirmPayment={
                  receipt.qris.gatewayStatus === 'PENDING'
                    ? handleConfirmQrisPayment
                    : undefined
                }
                confirming={confirmingQris}
              />
            )}

            <div className="space-y-3">
              <p className="text-xs font-semibold text-zinc-500">Rincian Belanja</p>
              <div className="divide-y divide-zinc-100 border border-zinc-200 rounded-xl bg-white">
                {receipt.items.map((item, idx) => (
                  <div
                    key={`${item.productName}-${idx}`}
                    className="p-3.5 flex items-center justify-between gap-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-900 truncate">{item.productName}</p>
                      <p className="text-xs text-zinc-500">
                        {item.variantLabel} · {item.quantity}x
                      </p>
                    </div>
                    <span className="font-semibold text-zinc-900 tabular-price shrink-0">
                      {formatRupiah(item.unitPrice * item.quantity)}
                    </span>
                  </div>
                ))}
                <div className="p-3.5 flex items-center justify-between text-xs text-zinc-600">
                  <span>Ongkos Antar</span>
                  <span className="tabular-price">
                    {receipt.deliveryFee === 0 ? 'Gratis' : formatRupiah(receipt.deliveryFee)}
                  </span>
                </div>
                <div className="p-3.5 bg-zinc-50 flex items-center justify-between text-sm font-bold text-zinc-900">
                  <span>
                    Total Bayar (
                    {receipt.paymentMethod === 'QRIS'
                      ? receipt.paymentStatus === 'LUNAS'
                        ? 'QRIS Lunas'
                        : 'QRIS Dinamis'
                      : 'Tunai / COD'}
                    )
                  </span>
                  <span className="tabular-price">{formatRupiah(receipt.total)}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => {
                  const code = receipt.orderNumber;
                  handleNewOrder();
                  onOpenTracker(code);
                }}
                className="w-full py-2.5 px-4 min-h-[42px] rounded-lg border border-zinc-300 bg-white text-zinc-900 text-sm font-semibold hover:bg-zinc-50 transition-colors cursor-pointer"
              >
                Lacak Status &amp; Peta Kurir
              </button>

              <button
                type="button"
                onClick={handleCopyReceipt}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 min-h-[42px] rounded-lg border border-zinc-300 bg-white text-zinc-900 text-sm font-medium hover:bg-zinc-50 transition-colors cursor-pointer"
              >
                {copiedReceipt ? (
                  <>
                    <Check className="w-4 h-4 text-[#14532D]" aria-hidden="true" />
                    <span>Ringkasan Pesanan Disalin</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" aria-hidden="true" />
                    <span>Salin Ringkasan Pesanan</span>
                  </>
                )}
              </button>

              {storeWaLink && (
                <a
                  href={storeWaLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 min-h-[42px] rounded-lg border border-emerald-200 bg-emerald-50 text-[#14532D] text-sm font-semibold hover:bg-emerald-100 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" aria-hidden="true" />
                  <span>Hubungi Toko via WhatsApp</span>
                </a>
              )}

              <button
                type="button"
                onClick={handleNewOrder}
                className="w-full py-3 px-4 min-h-[44px] rounded-lg bg-[#14532D] text-white text-sm font-semibold hover:bg-[#166534] transition-colors cursor-pointer"
              >
                Selesai &amp; Kembali Belanja
              </button>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 mb-3">
              <ShoppingBag className="w-5 h-5" aria-hidden="true" />
            </div>
            <p className="text-base font-semibold text-zinc-900">Keranjang masih kosong</p>
            <p className="text-sm text-zinc-500 mt-1 max-w-xs">
              Pilih beras, minyak goreng, telur, atau kebutuhan harian dari katalog {settings.name}.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 px-4 py-2.5 min-h-[40px] rounded-lg bg-[#14532D] text-white text-sm font-medium hover:bg-[#166534] transition-colors cursor-pointer"
            >
              Lihat Katalog
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmitOrder} className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {onClearCart && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500 font-medium">
                    {items.reduce((s, i) => s + i.quantity, 0)} barang dipilih
                  </span>
                  {confirmClearCart ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="text-red-700 font-medium">Kosongkan?</span>
                      <button
                        type="button"
                        onClick={() => {
                          onClearCart();
                          setConfirmClearCart(false);
                        }}
                        className="font-bold text-red-700 underline cursor-pointer"
                      >
                        Ya
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClearCart(false)}
                        className="text-zinc-600 cursor-pointer"
                      >
                        Batal
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmClearCart(true)}
                      className="text-zinc-500 hover:text-red-600 cursor-pointer"
                    >
                      Kosongkan Keranjang
                    </button>
                  )}
                </div>
              )}

              <div className="divide-y divide-zinc-200 border border-zinc-200 rounded-xl bg-white">
                {items.map((item) => (
                  <div key={item.key} className="p-4 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-zinc-900">{item.product.name}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{item.variant.label}</p>
                      <p className="text-sm font-semibold text-zinc-900 tabular-price mt-1.5">
                        {formatRupiah(item.variant.price * item.quantity)}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onRemoveItem(item.key)}
                        aria-label={`Hapus ${item.product.name}`}
                        className="p-1 text-zinc-400 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <div className="flex items-center border border-zinc-300 rounded-lg">
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(item.key, -1)}
                          aria-label="Kurangi jumlah"
                          className="p-1.5 text-zinc-700 hover:bg-zinc-100 rounded-l-lg cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-2.5 text-xs font-semibold tabular-price">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          disabled={item.quantity >= item.variant.stock}
                          onClick={() => onUpdateQuantity(item.key, 1)}
                          aria-label="Tambah jumlah"
                          className="p-1.5 text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 rounded-r-lg cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-zinc-700">Metode Pengambilan</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDeliveryMethod('cod')}
                    className={`py-2.5 px-3 min-h-[40px] rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                      deliveryMethod === 'cod'
                        ? 'bg-[#14532D] text-white border-[#14532D]'
                        : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50'
                    }`}
                  >
                    Antar Kurir Lokal
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeliveryMethod('pickup')}
                    className={`py-2.5 px-3 min-h-[40px] rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                      deliveryMethod === 'pickup'
                        ? 'bg-[#14532D] text-white border-[#14532D]'
                        : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50'
                    }`}
                  >
                    Ambil di Toko
                  </button>
                </div>
                {deliveryMethod === 'cod' && (
                  <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-3 space-y-1.5">
                    <p className="text-xs text-zinc-700 font-medium tabular-price">
                      {freeDelivery
                        ? 'Selamat! Gratis ongkir sekitar Gang Makam & Gunung Batin Udik aktif.'
                        : `Tambah belanja ${formatRupiah(freeDeliveryShortfall)} lagi untuk gratis ongkir (hemat ${formatRupiah(settings.deliveryFee)}).`}
                    </p>
                    <div className="w-full h-1.5 rounded-full bg-zinc-200 overflow-hidden">
                      <div
                        className="h-full bg-[#14532D] transition-[width] duration-300"
                        style={{width: `${freeDeliveryProgress}%`}}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-zinc-700">Cara Pembayaran</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentChoice('PAY_ON_DELIVERY')}
                    className={`py-2.5 px-3 min-h-[40px] rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                      paymentChoice === 'PAY_ON_DELIVERY'
                        ? 'bg-zinc-900 text-white border-zinc-900'
                        : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50'
                    }`}
                  >
                    {deliveryMethod === 'cod' ? 'Bayar COD (Tunai)' : 'Tunai di Toko'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentChoice('QRIS')}
                    className={`inline-flex items-center justify-center gap-1.5 py-2.5 px-3 min-h-[40px] rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                      paymentChoice === 'QRIS'
                        ? 'bg-zinc-900 text-white border-zinc-900'
                        : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50'
                    }`}
                  >
                    <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>QRIS Dinamis</span>
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold text-zinc-700">
                  Data Pemesan {customer ? '(Terisi dari Akun Anda)' : ''}
                </p>

                <div>
                  <label htmlFor="order-name" className="block text-xs text-zinc-600 mb-1">
                    Nama Lengkap
                  </label>
                  <input
                    id="order-name"
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Contoh: Ibu Siti / Pak Budi"
                    className="w-full px-3 py-2 min-h-[40px] text-sm border border-zinc-300 rounded-lg focus:outline-none focus:border-[#14532D] focus:ring-1 focus:ring-[#14532D]"
                  />
                </div>

                <div>
                  <label htmlFor="order-phone" className="block text-xs text-zinc-600 mb-1">
                    Nomor HP / WhatsApp
                  </label>
                  <input
                    id="order-phone"
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="08xx-xxxx-xxxx"
                    className="w-full px-3 py-2 min-h-[40px] text-sm border border-zinc-300 rounded-lg focus:outline-none focus:border-[#14532D] focus:ring-1 focus:ring-[#14532D]"
                  />
                </div>

                {deliveryMethod === 'cod' && (
                  <div className="space-y-2">
                    <label htmlFor="order-address" className="block text-xs text-zinc-600 mb-1">
                      Alamat / Patokan Rumah
                    </label>
                    <input
                      id="order-address"
                      type="text"
                      required
                      value={addressNote}
                      onChange={(e) => setAddressNote(e.target.value)}
                      placeholder="Gang Makam RT ..., dekat ..."
                      className="w-full px-3 py-2 min-h-[40px] text-sm border border-zinc-300 rounded-lg focus:outline-none focus:border-[#14532D] focus:ring-1 focus:ring-[#14532D]"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={handleCaptureGps}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 bg-white text-xs font-medium text-zinc-800 hover:bg-zinc-50 cursor-pointer"
                      >
                        <MapPin className="w-3.5 h-3.5 text-[#14532D]" aria-hidden="true" />
                        <span>
                          {customerCoords
                            ? 'Perbarui Pin Lokasi Saya'
                            : 'Tandai Titik GPS Saya (Opsional)'}
                        </span>
                      </button>
                      {customerCoords && (
                        <button
                          type="button"
                          onClick={() => {
                            setCustomerCoords(null);
                            setGpsStatus('');
                          }}
                          className="text-[11px] text-zinc-500 hover:text-zinc-800 cursor-pointer"
                        >
                          Hapus Pin
                        </button>
                      )}
                    </div>
                    {gpsStatus && <p className="text-[11px] text-zinc-600">{gpsStatus}</p>}
                  </div>
                )}

                <div>
                  <label htmlFor="order-notes" className="block text-xs text-zinc-600 mb-1">
                    Catatan Tambahan (Opsional)
                  </label>
                  <input
                    id="order-notes"
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Contoh: diantar sore jam 4"
                    className="w-full px-3 py-2 min-h-[40px] text-sm border border-zinc-300 rounded-lg focus:outline-none focus:border-[#14532D] focus:ring-1 focus:ring-[#14532D]"
                  />
                </div>
              </div>

              {formError && (
                <p
                  role="alert"
                  className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg p-3"
                >
                  {formError}
                </p>
              )}
            </div>

            <div className="p-6 border-t border-zinc-200 bg-zinc-50 space-y-2.5">
              <div className="flex items-center justify-between text-xs text-zinc-600">
                <span>Subtotal Barang</span>
                <span className="tabular-price">{formatRupiah(subtotal)}</span>
              </div>
              {deliveryMethod === 'cod' && (
                <div className="flex items-center justify-between text-xs text-zinc-600">
                  <span>Ongkos Antar</span>
                  <span className="tabular-price">
                    {deliveryFee === 0 ? 'Gratis' : formatRupiah(deliveryFee)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm pt-1 border-t border-zinc-200">
                <span className="font-medium text-zinc-700">Total Bayar</span>
                <span className="text-lg font-bold text-zinc-900 tabular-price">
                  {formatRupiah(grandTotal)}
                </span>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-4 min-h-[44px] rounded-lg bg-[#14532D] text-white text-sm font-semibold hover:bg-[#166534] disabled:opacity-60 transition-colors cursor-pointer"
              >
                {submitting
                  ? 'Mengirim Pesanan...'
                  : paymentChoice === 'QRIS'
                    ? 'Buat Pesanan & Tampilkan QRIS'
                    : `Buat Pesanan (${deliveryMethod === 'cod' ? 'Bayar COD' : 'Ambil di Toko'})`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

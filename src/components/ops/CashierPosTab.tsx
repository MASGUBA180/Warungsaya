import {
  CheckCircle2,
  LockOpen,
  MessageCircle,
  Minus,
  PauseCircle,
  Plus,
  Printer,
  QrCode,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {FormEvent, type KeyboardEvent, useEffect, useState} from 'react';
import {apiFetch} from '../../lib/apiClient';
import {
  formatRupiah,
  formatShortDate,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from '../../lib/storeData';
import type {
  CashierShift,
  DivisionRole,
  KasbonRecord,
  Order,
  OrderStatus,
  PaymentMethod,
  Product,
  ProductVariant,
  PublicStaffProfile,
} from '../../types/store';
import {QrisCard} from '../QrisCard';

interface PosBasketItem {
  key: string;
  product: Product;
  variant: ProductVariant;
  quantity: number;
}

interface HeldReceiptTicket {
  id: string;
  customerName: string;
  phone: string;
  paymentMethod: PaymentMethod;
  discountMode: 'RP' | 'PERCENT';
  discountValue: string;
  notes: string;
  savedAt: string;
  items: {productId: string; variantId: string; quantity: number}[];
}

interface CashierPosTabProps {
  role: DivisionRole;
  products: Product[];
  orders: Order[];
  shifts: CashierShift[];
  couriers?: PublicStaffProfile[];
  kasbon?: KasbonRecord[];
  authToken: string;
  onRefresh: () => Promise<void>;
}

const HELD_POS_KEY = 'tdj_pos_held_v1';

function buildPosWhatsappReceiptLink(order: Order): string {
  const digits = (order.phone || '').replace(/\D/g, '');
  const waPhone =
    digits.length >= 8
      ? digits.startsWith('0')
        ? `62${digits.slice(1)}`
        : digits.startsWith('62')
          ? digits
          : `62${digits}`
      : '';
  const itemLines = order.items
    .map(
      (i) =>
        `- ${i.productName} (${i.variantLabel}) x${i.quantity}: ${formatRupiah(
          i.unitPrice * i.quantity
        )}`
    )
    .join('\n');
  const discountLine =
    (order.discountAmount || 0) > 0
      ? `\nDiskon: -${formatRupiah(order.discountAmount || 0)}`
      : '';
  const text = `Struk Belanja *Toko Dimas Jaya*\nNo: #${order.orderNumber}\nPembeli: ${order.customerName}\n\n${itemLines}${discountLine}\n*Total: ${formatRupiah(order.total)}* (${order.paymentMethod})\n\nTerima kasih sudah berbelanja di Toko Dimas Jaya.`;
  return waPhone
    ? `https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function CashierPosTab({
  role,
  products,
  orders,
  shifts,
  couriers = [],
  kasbon = [],
  authToken,
  onRefresh,
}: CashierPosTabProps) {
  const isLeader = role === 'PEMILIK' || role === 'DIREKTUR';
  const openShift = shifts.find((s) => s.status === 'TERBUKA') || null;

  const [searchPos, setSearchPos] = useState('');
  const [scanNotice, setScanNotice] = useState('');
  const [basket, setBasket] = useState<PosBasketItem[]>([]);
  const [customerName, setCustomerName] = useState('Pembeli Toko');
  const [phone, setPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('TUNAI');
  const [kasbonDueDate, setKasbonDueDate] = useState('');
  const [discountMode, setDiscountMode] = useState<'RP' | 'PERCENT'>('RP');
  const [discountAmount, setDiscountAmount] = useState('');
  const [cashReceived, setCashReceived] = useState('');
  const [notes, setNotes] = useState('');
  const [posError, setPosError] = useState('');
  const [posSuccess, setPosSuccess] = useState('');
  const [lastPosOrder, setLastPosOrder] = useState<
    (Order & {cashPaid?: number; changeDue?: number}) | null
  >(null);
  const [orderActionError, setOrderActionError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Filters for online queue & POS history
  const [onlineStatusFilter, setOnlineStatusFilter] = useState<'ALL' | OrderStatus>('ALL');
  const [onlineSearch, setOnlineSearch] = useState('');
  const [posHistorySearch, setPosHistorySearch] = useState('');
  const [showShiftHistory, setShowShiftHistory] = useState(false);

  const [heldTickets, setHeldTickets] = useState<HeldReceiptTicket[]>(() => {
    try {
      const raw = window.sessionStorage.getItem(HELD_POS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      window.sessionStorage.setItem(HELD_POS_KEY, JSON.stringify(heldTickets));
    } catch {
      // ignore storage errors
    }
  }, [heldTickets]);

  // Shift open / close controls
  const [showShiftModal, setShowShiftModal] = useState<'open' | 'close' | null>(null);
  const [shiftCashInput, setShiftCashInput] = useState('');
  const [shiftNoteInput, setShiftNoteInput] = useState('');
  const [shiftSaving, setShiftSaving] = useState(false);
  const [shiftError, setShiftError] = useState('');

  const [confirmingQrisId, setConfirmingQrisId] = useState<string | null>(null);
  const [assigningCourierId, setAssigningCourierId] = useState<string | null>(null);

  const filteredProducts = products.filter((p) => {
    const q = searchPos.trim().toLowerCase();
    return (
      q === '' ||
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.variants.some((v) => (v.sku || '').toLowerCase().includes(q))
    );
  });

  const addToBasket = (product: Product, variant: ProductVariant) => {
    if (variant.stock <= 0) return;
    const key = `${product.id}__${variant.id}`;
    setBasket((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (existing) {
        if (existing.quantity >= variant.stock) return prev;
        return prev.map((i) => (i.key === key ? {...i, quantity: i.quantity + 1} : i));
      }
      return [...prev, {key, product, variant, quantity: 1}];
    });
  };

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const q = searchPos.trim().toLowerCase();
    if (!q) return;
    for (const p of products) {
      const matchedVar = p.variants.find(
        (v) => v.sku && v.sku.trim().toLowerCase() === q
      );
      if (matchedVar) {
        e.preventDefault();
        if (matchedVar.stock <= 0) {
          setScanNotice(`Stok ${p.name} (${matchedVar.label}) habis.`);
          return;
        }
        addToBasket(p, matchedVar);
        setScanNotice(`Masuk struk via SKU: ${p.name} (${matchedVar.label})`);
        setSearchPos('');
        return;
      }
    }
  };

  const updateBasketQty = (key: string, delta: number) => {
    setBasket((prev) =>
      prev
        .map((item) => {
          if (item.key !== key) return item;
          const next = item.quantity + delta;
          if (next > item.variant.stock) return item;
          return {...item, quantity: next};
        })
        .filter((item) => item.quantity > 0)
    );
  };

  const basketSubtotal = basket.reduce(
    (sum, item) => sum + item.variant.price * item.quantity,
    0
  );
  const rawDiscNum = Math.max(0, Number(discountAmount || 0) || 0);
  const parsedDiscount =
    discountMode === 'PERCENT'
      ? Math.min(
          basketSubtotal,
          Math.round((basketSubtotal * Math.min(100, rawDiscNum)) / 100)
        )
      : Math.min(basketSubtotal, Math.round(rawDiscNum));
  const basketTotal = Math.max(0, basketSubtotal - parsedDiscount);
  const parsedCashReceived = Math.max(0, Math.round(Number(cashReceived || 0) || 0));
  const cashChange = parsedCashReceived - basketTotal;

  const handleHoldReceipt = () => {
    if (basket.length === 0) return;
    const ticket: HeldReceiptTicket = {
      id: `hold-${Date.now()}`,
      customerName: customerName.trim() || 'Pembeli Toko',
      phone: phone.trim(),
      paymentMethod,
      discountMode,
      discountValue: discountAmount,
      notes: notes.trim(),
      savedAt: new Date().toLocaleTimeString('id-ID', {hour: '2-digit', minute: '2-digit'}),
      items: basket.map((b) => ({
        productId: b.product.id,
        variantId: b.variant.id,
        quantity: b.quantity,
      })),
    };
    setHeldTickets((prev) => [ticket, ...prev].slice(0, 8));
    setBasket([]);
    setCustomerName('Pembeli Toko');
    setPhone('');
    setDiscountAmount('');
    setCashReceived('');
    setNotes('');
    setPosSuccess(`Struk ${ticket.customerName} ditahan sementara.`);
    setPosError('');
  };

  const handleResumeTicket = (ticket: HeldReceiptTicket) => {
    const restored: PosBasketItem[] = [];
    for (const item of ticket.items) {
      const product = products.find((p) => p.id === item.productId);
      const variant = product?.variants.find((v) => v.id === item.variantId);
      if (product && variant && variant.stock > 0) {
        restored.push({
          key: `${product.id}__${variant.id}`,
          product,
          variant,
          quantity: Math.min(item.quantity, variant.stock),
        });
      }
    }
    setBasket(restored);
    setCustomerName(ticket.customerName);
    setPhone(ticket.phone);
    setPaymentMethod(ticket.paymentMethod);
    setDiscountMode(ticket.discountMode);
    setDiscountAmount(ticket.discountValue);
    setNotes(ticket.notes);
    setHeldTickets((prev) => prev.filter((t) => t.id !== ticket.id));
    setPosSuccess(`Struk ${ticket.customerName} dipanggil kembali.`);
    setPosError('');
  };

  const handleCheckoutPos = async (e: FormEvent) => {
    e.preventDefault();
    if (basket.length === 0) {
      setPosError('Pilih minimal 1 barang untuk transaksi kasir.');
      return;
    }
    if (paymentMethod === 'TUNAI' && cashReceived !== '' && parsedCashReceived < basketTotal) {
      setPosError('Nominal uang diterima kurang dari total tagihan.');
      return;
    }
    setPosError('');
    setPosSuccess('');
    setSubmitting(true);
    try {
      const res = await apiFetch<{order?: Order; error?: string}>('/api/ops/pos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          customerName: customerName.trim() || 'Pembeli Toko',
          phone: phone.trim() || '-',
          paymentMethod,
          kasbonDueDate: paymentMethod === 'KASBON' && kasbonDueDate ? kasbonDueDate : undefined,
          discountAmount: parsedDiscount,
          notes: notes.trim(),
          items: basket.map((i) => ({
            productId: i.product.id,
            variantId: i.variant.id,
            quantity: i.quantity,
          })),
        }),
      });
      if (!res.ok || !res.data.order) {
        setPosError(res.data.error || 'Gagal mencatat transaksi kasir.');
        return;
      }

      const paidCash =
        paymentMethod === 'TUNAI' && parsedCashReceived >= basketTotal
          ? parsedCashReceived
          : undefined;
      setLastPosOrder({
        ...res.data.order,
        cashPaid: paidCash,
        changeDue: paidCash !== undefined ? paidCash - res.data.order.total : undefined,
      });
      setPosSuccess(
        `Transaksi #${res.data.order.orderNumber} (${formatRupiah(res.data.order.total)}) tercatat.`
      );
      setBasket([]);
      setCustomerName('Pembeli Toko');
      setPhone('');
      setKasbonDueDate('');
      setDiscountAmount('');
      setCashReceived('');
      setNotes('');
      setPaymentMethod('TUNAI');
      await onRefresh();
    } catch {
      setPosError('Gagal terhubung ke server.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenCloseShift = async (e: FormEvent) => {
    e.preventDefault();
    if (!showShiftModal) return;
    setShiftSaving(true);
    setShiftError('');
    try {
      const endpoint =
        showShiftModal === 'open' ? '/api/ops/shifts/open' : '/api/ops/shifts/close';
      const payload =
        showShiftModal === 'open'
          ? {openingCash: Number(shiftCashInput || 0), note: shiftNoteInput.trim()}
          : {countedCash: Number(shiftCashInput || 0), note: shiftNoteInput.trim()};

      const res = await apiFetch<{shift?: CashierShift; error?: string}>(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setShiftError(res.data.error || 'Gagal memproses shift kasir.');
        return;
      }
      setShowShiftModal(null);
      setShiftCashInput('');
      setShiftNoteInput('');
      await onRefresh();
    } catch {
      setShiftError('Gagal menghubungi server toko.');
    } finally {
      setShiftSaving(false);
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, status: OrderStatus) => {
    setOrderActionError('');
    try {
      const res = await apiFetch<{error?: string}>(`/api/ops/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({status}),
      });
      if (res.ok) {
        await onRefresh();
      } else {
        setOrderActionError(res.data.error || 'Aksi tidak diizinkan untuk peran Anda.');
      }
    } catch {
      setOrderActionError('Gagal memperbarui status pesanan.');
    }
  };

  const handleConfirmQrisOrder = async (orderId: string) => {
    setOrderActionError('');
    setConfirmingQrisId(orderId);
    try {
      const res = await apiFetch<{error?: string}>(`/api/ops/orders/${orderId}/qris-confirm`, {
        method: 'PATCH',
        headers: {Authorization: `Bearer ${authToken}`},
      });
      if (res.ok) {
        await onRefresh();
      } else {
        setOrderActionError(res.data.error || 'Gagal memverifikasi QRIS.');
      }
    } finally {
      setConfirmingQrisId(null);
    }
  };

  const handleAssignCourier = async (orderId: string, courierId: string) => {
    setOrderActionError('');
    setAssigningCourierId(orderId);
    try {
      const res = await apiFetch<{error?: string}>(
        `/api/ops/orders/${orderId}/assign-courier`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({courierId}),
        }
      );
      if (res.ok) {
        await onRefresh();
      } else {
        setOrderActionError(res.data.error || 'Gagal menugaskan kurir.');
      }
    } finally {
      setAssigningCourierId(null);
    }
  };

  const onlineOrders = orders.filter((o) => o.source === 'ONLINE');
  const onlineSearchNorm = onlineSearch.trim().toLowerCase();
  const filteredOnlineOrders = onlineOrders.filter((o) => {
    if (onlineStatusFilter !== 'ALL' && o.status !== onlineStatusFilter) return false;
    if (
      onlineSearchNorm &&
      !o.orderNumber.toLowerCase().includes(onlineSearchNorm) &&
      !o.customerName.toLowerCase().includes(onlineSearchNorm) &&
      !o.phone.toLowerCase().includes(onlineSearchNorm)
    ) {
      return false;
    }
    return true;
  });

  const posOrders = orders.filter((o) => o.source === 'POS');
  const posHistNorm = posHistorySearch.trim().toLowerCase();
  const filteredPosOrders = posOrders.filter(
    (o) =>
      !posHistNorm ||
      o.orderNumber.toLowerCase().includes(posHistNorm) ||
      o.customerName.toLowerCase().includes(posHistNorm)
  );
  const closedShifts = shifts.filter((s) => s.status === 'DITUTUP');
  const uniqueKasbonCustomers = Array.from(
    new Map(
      kasbon
        .filter((k) => k.customerName && k.customerName !== 'Pembeli Toko')
        .map((k) => [k.customerName.toLowerCase(), k])
    ).values()
  );

  return (
    <div className="space-y-8">
      {/* Shift Kasir (Buka / Tutup Laci) */}
      <div className="bg-white border border-zinc-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4 print:hidden">
        {openShift ? (
          <>
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-[#14532D] flex items-center gap-1.5">
                <LockOpen className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Shift Kasir Aktif — {openShift.cashierName}</span>
              </p>
              <p className="text-xs text-zinc-600 tabular-price">
                Modal awal {formatRupiah(openShift.openingCash)} · Perkiraan kas tunai{' '}
                <strong className="text-zinc-900">{formatRupiah(openShift.expectedCash)}</strong> ·
                QRIS {formatRupiah(openShift.qrisSalesTotal)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowShiftModal('close');
                setShiftCashInput(String(openShift.expectedCash));
                setShiftError('');
              }}
              className="px-4 py-2 rounded-lg border border-zinc-300 bg-white text-xs font-semibold text-zinc-900 hover:bg-zinc-50 cursor-pointer whitespace-nowrap"
            >
              Tutup Shift &amp; Hitung Laci
            </button>
          </>
        ) : (
          <>
            <div>
              <p className="text-xs font-semibold text-zinc-900">Laci Kasir Belum Dibuka</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Catat uang modal kembalian awal sebelum melayani transaksi agar selisih kas tercatat otomatis.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowShiftModal('open');
                setShiftCashInput('150000');
                setShiftError('');
              }}
              className="px-4 py-2 rounded-lg bg-[#14532D] text-white text-xs font-semibold hover:bg-[#166534] cursor-pointer whitespace-nowrap"
            >
              Buka Shift Kasir
            </button>
          </>
        )}
      </div>

      {showShiftModal && (
        <form
          onSubmit={handleOpenCloseShift}
          className="bg-zinc-50 border border-zinc-300 rounded-xl p-5 space-y-4 print:hidden"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-900">
              {showShiftModal === 'open'
                ? 'Buka Shift Laci Kasir'
                : 'Tutup Shift & Setoran Laci Kasir'}
            </h3>
            <button
              type="button"
              onClick={() => setShowShiftModal(null)}
              className="text-xs text-zinc-600 hover:text-zinc-900 cursor-pointer"
            >
              Batal
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="shift-cash" className="block text-xs text-zinc-600 mb-1">
                {showShiftModal === 'open'
                  ? 'Modal Awal Laci (Rp)'
                  : 'Uang Tunai Fisik Dihitung (Rp)'}
              </label>
              <input
                id="shift-cash"
                type="number"
                required
                min={0}
                value={shiftCashInput}
                onChange={(e) => setShiftCashInput(e.target.value)}
                className="w-full px-3 py-2 min-h-[38px] text-sm tabular-price bg-white border border-zinc-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="shift-note" className="block text-xs text-zinc-600 mb-1">
                Catatan Shift (Opsional)
              </label>
              <input
                id="shift-note"
                type="text"
                value={shiftNoteInput}
                onChange={(e) => setShiftNoteInput(e.target.value)}
                placeholder="Shift pagi / sore"
                className="w-full px-3 py-2 min-h-[38px] text-sm bg-white border border-zinc-300 rounded-lg"
              />
            </div>
          </div>
          {shiftError && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
              {shiftError}
            </p>
          )}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={shiftSaving}
              className="px-4 py-2 rounded-lg bg-[#14532D] text-white text-xs font-semibold hover:bg-[#166534] cursor-pointer"
            >
              {shiftSaving
                ? 'Menyimpan...'
                : showShiftModal === 'open'
                  ? 'Mulai Shift Kasir'
                  : 'Simpan & Tutup Shift'}
            </button>
          </div>
        </form>
      )}

      {/* Held Receipts Strip */}
      {heldTickets.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2.5 print:hidden">
          <p className="text-xs font-semibold text-amber-950">
            Struk Ditahan ({heldTickets.length}) — Klik Panggil untuk melanjutkan transaksi
          </p>
          <div className="flex flex-wrap gap-2">
            {heldTickets.map((t) => (
              <div
                key={t.id}
                className="inline-flex items-center gap-2 bg-white border border-amber-300 rounded-lg px-3 py-1.5 text-xs"
              >
                <span className="font-semibold text-zinc-900">{t.customerName}</span>
                <span className="text-zinc-500">
                  · {t.items.length} item ({t.savedAt})
                </span>
                <button
                  type="button"
                  onClick={() => handleResumeTicket(t)}
                  className="inline-flex items-center gap-1 font-semibold text-[#14532D] hover:underline cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" aria-hidden="true" />
                  <span>Panggil</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setHeldTickets((prev) => prev.filter((item) => item.id !== t.id))
                  }
                  aria-label="Hapus struk ditahan"
                  className="text-zinc-400 hover:text-red-600 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* POS Terminal */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 print:hidden">
        <div className="lg:col-span-7 bg-white border border-zinc-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-zinc-900">Kasir Langsung (POS)</h3>
              <p className="text-xs text-zinc-500">
                Ketuk varian barang atau scan/ketik kode SKU lalu tekan Enter.
              </p>
            </div>
            <input
              type="search"
              value={searchPos}
              onChange={(e) => {
                setSearchPos(e.target.value);
                if (scanNotice) setScanNotice('');
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder="Cari nama barang atau SKU..."
              className="w-full sm:w-64 px-3 py-2 min-h-[38px] text-sm border border-zinc-300 rounded-lg focus:outline-none focus:border-[#14532D]"
            />
          </div>

          {scanNotice && (
            <p className="text-xs text-[#14532D] bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              {scanNotice}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[460px] overflow-y-auto pr-1">
            {filteredProducts.map((product) => (
              <div
                key={product.id}
                className="border border-zinc-200 rounded-lg p-3.5 space-y-2.5 bg-zinc-50/50"
              >
                <div>
                  <p className="text-xs text-zinc-500">{product.category}</p>
                  <p className="text-sm font-semibold text-zinc-900">{product.name}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {product.variants.map((variant) => (
                    <button
                      key={variant.id}
                      type="button"
                      disabled={variant.stock <= 0}
                      onClick={() => addToBasket(product, variant)}
                      className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-white border border-zinc-300 text-zinc-800 hover:border-[#14532D] hover:text-[#14532D] disabled:opacity-40 cursor-pointer text-left"
                    >
                      <span>
                        {variant.label} · {formatRupiah(variant.price)} ({variant.stock})
                      </span>
                      {variant.sku && (
                        <span className="block font-mono text-[10px] text-zinc-400">
                          SKU: {variant.sku}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* POS Checkout Ticket */}
        <form
          onSubmit={handleCheckoutPos}
          className="lg:col-span-5 bg-white border border-zinc-200 rounded-xl p-5 flex flex-col justify-between gap-4"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-zinc-900">Struk Transaksi Toko</h3>
              {basket.length > 0 && (
                <button
                  type="button"
                  onClick={handleHoldReceipt}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-300 bg-white text-xs font-medium text-zinc-700 hover:bg-zinc-50 cursor-pointer whitespace-nowrap"
                >
                  <PauseCircle className="w-3.5 h-3.5 text-amber-700" aria-hidden="true" />
                  <span>Tahan Struk</span>
                </button>
              )}
            </div>

            {basket.length === 0 ? (
              <p className="text-sm text-zinc-500 py-6 text-center border border-dashed border-zinc-200 rounded-lg">
                Belum ada barang dipilih.
              </p>
            ) : (
              <div className="divide-y divide-zinc-100 border border-zinc-200 rounded-lg max-h-52 overflow-y-auto">
                {basket.map((item) => (
                  <div key={item.key} className="p-3 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-zinc-900 truncate">{item.product.name}</p>
                      <p className="text-zinc-500">
                        {item.variant.label} · {formatRupiah(item.variant.price)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateBasketQty(item.key, -1)}
                        className="p-1 border border-zinc-300 rounded hover:bg-zinc-100 cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="font-mono font-semibold w-5 text-center tabular-price">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateBasketQty(item.key, 1)}
                        className="p-1 border border-zinc-300 rounded hover:bg-zinc-100 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => updateBasketQty(item.key, -item.quantity)}
                        className="p-1 text-zinc-400 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pos-customer" className="block text-xs text-zinc-600 mb-1">
                  Nama Pembeli
                </label>
                <input
                  id="pos-customer"
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-2 min-h-[38px] text-sm border border-zinc-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="pos-method" className="block text-xs text-zinc-600 mb-1">
                  Metode Bayar
                </label>
                <select
                  id="pos-method"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 min-h-[38px] text-sm bg-white border border-zinc-300 rounded-lg"
                >
                  <option value="TUNAI">Tunai Laci</option>
                  <option value="QRIS">QRIS Dinamis</option>
                  <option value="KASBON">Bon / Kasbon</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="pos-discount" className="text-xs text-zinc-600">
                  Diskon Belanja ({discountMode === 'RP' ? 'Nominal Rp' : 'Persen %'})
                </label>
                <div className="inline-flex rounded border border-zinc-300 overflow-hidden text-[11px]">
                  <button
                    type="button"
                    onClick={() => {
                      setDiscountMode('RP');
                      setDiscountAmount('');
                    }}
                    className={`px-2 py-0.5 cursor-pointer ${
                      discountMode === 'RP'
                        ? 'bg-[#14532D] text-white font-semibold'
                        : 'bg-white text-zinc-600'
                    }`}
                  >
                    Rp
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDiscountMode('PERCENT');
                      setDiscountAmount('');
                    }}
                    className={`px-2 py-0.5 cursor-pointer ${
                      discountMode === 'PERCENT'
                        ? 'bg-[#14532D] text-white font-semibold'
                        : 'bg-white text-zinc-600'
                    }`}
                  >
                    %
                  </button>
                </div>
              </div>
              <input
                id="pos-discount"
                type="number"
                min={0}
                max={discountMode === 'PERCENT' ? 100 : basketSubtotal}
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 min-h-[38px] text-sm tabular-price border border-zinc-300 rounded-lg"
              />
            </div>

            {paymentMethod === 'TUNAI' && basketTotal > 0 && (
              <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="pos-cash" className="text-xs font-medium text-zinc-700">
                    Uang Diterima (Rp)
                  </label>
                  <input
                    id="pos-cash"
                    type="number"
                    min={0}
                    value={cashReceived}
                    onChange={(e) => setCashReceived(e.target.value)}
                    placeholder={String(basketTotal)}
                    className="w-36 px-2.5 py-1.5 text-sm text-right font-mono tabular-price bg-white border border-zinc-300 rounded-md"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCashReceived(String(basketTotal))}
                    className="px-2 py-1 rounded border border-zinc-300 bg-white text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 cursor-pointer"
                  >
                    Uang Pas
                  </button>
                  {[20000, 50000, 100000, 200000].map((nom) => (
                    <button
                      key={nom}
                      type="button"
                      onClick={() => setCashReceived(String(nom))}
                      className="px-2 py-1 rounded border border-zinc-300 bg-white text-[11px] font-mono text-zinc-700 hover:bg-zinc-100 cursor-pointer"
                    >
                      {nom / 1000}rb
                    </button>
                  ))}
                </div>
                {cashReceived !== '' && (
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-200">
                    <span className="text-zinc-600">
                      {cashChange >= 0 ? 'Kembalian' : 'Kurang Bayar'}
                    </span>
                    <span
                      className={`font-mono font-bold tabular-price ${
                        cashChange >= 0 ? 'text-[#14532D]' : 'text-amber-700'
                      }`}
                    >
                      {formatRupiah(Math.abs(cashChange))}
                    </span>
                  </div>
                )}
              </div>
            )}

            {paymentMethod === 'KASBON' && (
              <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-3 space-y-2.5">
                {uniqueKasbonCustomers.length > 0 && (
                  <div>
                    <label htmlFor="pos-kasbon-pick" className="block text-xs text-zinc-700 mb-1">
                      Pilih Pelanggan Bon Tersimpan (Opsional)
                    </label>
                    <select
                      id="pos-kasbon-pick"
                      defaultValue=""
                      onChange={(e) => {
                        const found = uniqueKasbonCustomers.find((k) => k.id === e.target.value);
                        if (found) {
                          setCustomerName(found.customerName);
                          if (found.phone) setPhone(found.phone);
                          if (found.address) setNotes(found.address);
                        }
                      }}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-amber-300 rounded-md"
                    >
                      <option value="">-- Ketik nama baru atau pilih pelanggan --</option>
                      {uniqueKasbonCustomers.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.customerName} (Sisa {formatRupiah(Math.max(0, k.amountDue - k.totalPaid))})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label htmlFor="pos-kasbon-due" className="block text-xs text-zinc-700 mb-1">
                    Tanggal Jatuh Tempo Bon (Opsional)
                  </label>
                  <input
                    id="pos-kasbon-due"
                    type="date"
                    value={kasbonDueDate}
                    onChange={(e) => setKasbonDueDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-amber-300 rounded-md"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pos-phone" className="block text-xs text-zinc-600 mb-1">
                  No. HP / WhatsApp {paymentMethod === 'KASBON' ? '' : '(Opsional)'}
                </label>
                <input
                  id="pos-phone"
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="08xx..."
                  className="w-full px-3 py-2 min-h-[38px] text-sm border border-zinc-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="pos-notes" className="block text-xs text-zinc-600 mb-1">
                  {paymentMethod === 'KASBON' ? 'Alamat / Catatan Bon' : 'Catatan (Opsional)'}
                </label>
                <input
                  id="pos-notes"
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Gang Makam RT..."
                  className="w-full px-3 py-2 min-h-[38px] text-sm border border-zinc-300 rounded-lg"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-200 space-y-3">
            {posError && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                {posError}
              </p>
            )}
            {posSuccess && (
              <p className="text-xs text-[#14532D] bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                {posSuccess}
              </p>
            )}

            <div className="space-y-1 text-xs">
              {parsedDiscount > 0 && (
                <>
                  <div className="flex justify-between text-zinc-500 tabular-price">
                    <span>Subtotal</span>
                    <span>{formatRupiah(basketSubtotal)}</span>
                  </div>
                  <div className="flex justify-between text-[#14532D] tabular-price">
                    <span>Diskon Kasir</span>
                    <span>- {formatRupiah(parsedDiscount)}</span>
                  </div>
                </>
              )}
              <div className="flex items-center justify-between pt-1">
                <span className="text-sm text-zinc-700 font-medium">Total Tagihan</span>
                <span className="text-xl font-bold text-zinc-900 tabular-price">
                  {formatRupiah(basketTotal)}
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || basket.length === 0}
              className="w-full py-2.5 px-4 min-h-[42px] rounded-lg bg-[#14532D] text-white text-sm font-semibold hover:bg-[#166534] disabled:opacity-50 transition-colors cursor-pointer"
            >
              {submitting ? 'Memproses...' : 'Simpan Transaksi Kasir'}
            </button>
          </div>
        </form>
      </div>

      {/* Last POS Receipt + QRIS Card + Thermal Print & WA Receipt */}
      {lastPosOrder && (
        <div className="bg-white border border-zinc-300 rounded-xl p-5 space-y-4 print:w-[72mm] print:mx-auto print:border-0 print:p-2 print:shadow-none">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-mono font-bold text-[#14532D]">
                TOKO DIMAS JAYA · #{lastPosOrder.orderNumber}
              </p>
              <p className="text-sm font-semibold text-zinc-900">
                {lastPosOrder.customerName} · {lastPosOrder.paymentMethod} ·{' '}
                <span className="tabular-price">{formatRupiah(lastPosOrder.total)}</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <a
                href={buildPosWhatsappReceiptLink(lastPosOrder)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#14532D] text-white text-xs font-semibold hover:bg-[#166534] whitespace-nowrap"
              >
                <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Kirim Struk WA</span>
              </a>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-zinc-300 bg-white text-xs font-semibold text-zinc-800 hover:bg-zinc-50 cursor-pointer whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Cetak Struk</span>
              </button>
              <button
                type="button"
                onClick={() => setLastPosOrder(null)}
                className="px-2.5 py-2 text-xs text-zinc-500 hover:text-zinc-900 cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs print:grid-cols-1">
            <div className="border border-zinc-200 rounded-lg p-3.5 space-y-1.5 bg-zinc-50 print:bg-white print:border-zinc-400">
              {lastPosOrder.items.map((item, idx) => (
                <div key={idx} className="flex justify-between gap-2 tabular-price">
                  <span>
                    {item.productName} ({item.variantLabel}) x{item.quantity}
                  </span>
                  <span>{formatRupiah(item.unitPrice * item.quantity)}</span>
                </div>
              ))}
              {(lastPosOrder.discountAmount || 0) > 0 && (
                <div className="flex justify-between gap-2 text-[#14532D] tabular-price">
                  <span>Diskon</span>
                  <span>- {formatRupiah(lastPosOrder.discountAmount || 0)}</span>
                </div>
              )}
              <div className="flex justify-between gap-2 font-bold text-zinc-900 pt-2 border-t border-zinc-200 tabular-price">
                <span>Total Dibayar</span>
                <span>{formatRupiah(lastPosOrder.total)}</span>
              </div>
              {lastPosOrder.cashPaid !== undefined && (
                <>
                  <div className="flex justify-between gap-2 text-zinc-600 tabular-price">
                    <span>Tunai Diterima</span>
                    <span>{formatRupiah(lastPosOrder.cashPaid)}</span>
                  </div>
                  <div className="flex justify-between gap-2 font-semibold text-[#14532D] tabular-price">
                    <span>Kembalian</span>
                    <span>{formatRupiah(lastPosOrder.changeDue ?? 0)}</span>
                  </div>
                </>
              )}
            </div>

            {lastPosOrder.qris && (
              <QrisCard qris={lastPosOrder.qris} orderNumber={lastPosOrder.orderNumber} />
            )}
          </div>
        </div>
      )}

      {/* Incoming Online & COD Orders */}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden print:hidden">
        <div className="px-6 py-4 border-b border-zinc-200 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-zinc-900">
                Antrean Pesanan Online &amp; COD Masuk
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                {role === 'KASIR'
                  ? 'Konfirmasi pesanan warga, tugaskan kurir antar COD, verifikasi pembayaran QRIS, dan selesaikan pengambilan di toko.'
                  : 'Kelola antrean pesanan online, tugaskan kurir COD, verifikasi QRIS masuk, atau teruskan ke Kurir.'}
              </p>
            </div>
            <input
              type="search"
              value={onlineSearch}
              onChange={(e) => setOnlineSearch(e.target.value)}
              placeholder="Cari kode, nama, atau HP..."
              aria-label="Cari pesanan online"
              className="px-3 py-1.5 text-xs border border-zinc-300 rounded-lg w-full sm:w-56"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                {id: 'ALL', label: `Semua (${onlineOrders.length})`},
                {id: 'MENUNGGU', label: 'Menunggu'},
                {id: 'DISIAPKAN', label: 'Disiapkan'},
                {id: 'DIANTAR', label: 'Diantar'},
                {id: 'SELESAI', label: 'Selesai'},
                {id: 'DIBATALKAN', label: 'Batal'},
              ] as {id: 'ALL' | OrderStatus; label: string}[]
            ).map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setOnlineStatusFilter(chip.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap ${
                  onlineStatusFilter === chip.id
                    ? 'bg-[#14532D] text-white'
                    : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {orderActionError && (
            <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
              {orderActionError}
            </p>
          )}
        </div>

        {filteredOnlineOrders.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-500">
            {onlineOrders.length === 0
              ? 'Belum ada pesanan online masuk.'
              : 'Tidak ada pesanan online pada filter ini.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                  <th className="py-3 px-4 font-medium">Kode</th>
                  <th className="py-3 px-4 font-medium">Pemesan &amp; Alamat</th>
                  <th className="py-3 px-4 font-medium">Barang</th>
                  <th className="py-3 px-4 font-medium">Status &amp; Kurir</th>
                  <th className="py-3 px-4 font-medium text-right">Total</th>
                  <th className="py-3 px-4 font-medium text-right">Aksi Kasir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredOnlineOrders.map((ord) => (
                  <tr key={ord.id} className="hover:bg-zinc-50 align-top">
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-zinc-800 tabular-price">
                      {ord.orderNumber}
                      <div className="font-sans font-normal text-zinc-400 mt-0.5">
                        {formatShortDate(ord.createdAt)}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-zinc-900 text-xs">
                        {ord.customerName} · {ord.phone}
                      </p>
                      <p className="text-xs text-zinc-600 mt-0.5">{ord.addressNote}</p>
                      {ord.notes && (
                        <p className="text-xs text-zinc-500 mt-0.5">Catatan: {ord.notes}</p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-zinc-700">
                      {ord.items.map((item, idx) => (
                        <div key={idx}>
                          {item.productName} ({item.variantLabel}) x{item.quantity}
                        </div>
                      ))}
                    </td>
                    <td className="py-3 px-4 text-xs space-y-1.5">
                      <div>
                        <p className="font-medium text-zinc-800">
                          {ORDER_STATUS_LABELS[ord.status]}
                        </p>
                        <p
                          className={`text-[11px] mt-0.5 ${
                            ord.paymentStatus === 'LUNAS'
                              ? 'text-[#14532D] font-semibold'
                              : ord.paymentMethod === 'QRIS'
                                ? 'text-amber-700 font-semibold'
                                : 'text-zinc-500'
                          }`}
                        >
                          {ord.paymentMethod} ·{' '}
                          {ord.paymentStatus
                            ? PAYMENT_STATUS_LABELS[ord.paymentStatus]
                            : 'Bayar Saat Terima'}
                        </p>
                      </div>

                      {ord.deliveryMethod === 'cod' &&
                        ord.status !== 'SELESAI' &&
                        ord.status !== 'DIBATALKAN' &&
                        couriers.length > 0 && (
                          <div>
                            <select
                              aria-label={`Tugaskan kurir untuk ${ord.orderNumber}`}
                              disabled={assigningCourierId === ord.id}
                              value={ord.assignedCourierId || ''}
                              onChange={(e) => handleAssignCourier(ord.id, e.target.value)}
                              className="px-2 py-1 text-[11px] bg-white border border-zinc-300 rounded-md"
                            >
                              <option value="">-- Tugaskan Kurir --</option>
                              {couriers.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.displayName}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      {ord.assignedCourierName && (
                        <p className="text-[11px] text-[#14532D] font-medium">
                          Kurir: {ord.assignedCourierName}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold tabular-price text-xs text-zinc-900">
                      {formatRupiah(ord.total)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex flex-wrap justify-end gap-1.5 items-center">
                        {ord.paymentMethod === 'QRIS' &&
                          ord.paymentStatus !== 'LUNAS' &&
                          ord.status !== 'DIBATALKAN' && (
                            <button
                              type="button"
                              disabled={confirmingQrisId === ord.id}
                              onClick={() => handleConfirmQrisOrder(ord.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 cursor-pointer whitespace-nowrap"
                            >
                              <QrCode className="w-3 h-3" aria-hidden="true" />
                              <span>
                                {confirmingQrisId === ord.id ? 'Cek...' : 'Konfirmasi QRIS Lunas'}
                              </span>
                            </button>
                          )}
                        {ord.paymentStatus === 'LUNAS' && ord.paymentMethod === 'QRIS' && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-[#14532D] font-semibold px-1.5">
                            <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                            <span>QRIS Lunas</span>
                          </span>
                        )}
                        {ord.status === 'MENUNGGU' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateOrderStatus(ord.id, 'DISIAPKAN')}
                            className="px-2.5 py-1.5 rounded bg-[#14532D] text-white text-xs font-medium hover:bg-[#166534] cursor-pointer whitespace-nowrap"
                          >
                            Siapkan
                          </button>
                        )}
                        {isLeader &&
                          ord.status === 'DISIAPKAN' &&
                          ord.deliveryMethod === 'cod' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateOrderStatus(ord.id, 'DIANTAR')}
                              className="px-2.5 py-1.5 rounded bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800 cursor-pointer whitespace-nowrap"
                            >
                              Kirim Kurir
                            </button>
                          )}
                        {ord.status === 'DISIAPKAN' && ord.deliveryMethod === 'pickup' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateOrderStatus(ord.id, 'SELESAI')}
                            className="px-2.5 py-1.5 rounded border border-zinc-300 bg-white text-zinc-800 text-xs font-medium hover:bg-zinc-50 cursor-pointer whitespace-nowrap"
                          >
                            Selesai Diambil
                          </button>
                        )}
                        {isLeader &&
                          ord.deliveryMethod === 'cod' &&
                          (ord.status === 'DISIAPKAN' || ord.status === 'DIANTAR') && (
                            <button
                              type="button"
                              onClick={() => handleUpdateOrderStatus(ord.id, 'SELESAI')}
                              className="px-2.5 py-1.5 rounded border border-zinc-300 bg-white text-zinc-800 text-xs font-medium hover:bg-zinc-50 cursor-pointer whitespace-nowrap"
                            >
                              Selesai COD
                            </button>
                          )}
                        {role === 'KASIR' &&
                          ord.deliveryMethod === 'cod' &&
                          (ord.status === 'DISIAPKAN' || ord.status === 'DIANTAR') && (
                            <span className="text-[11px] text-zinc-500 px-2">Menunggu Kurir</span>
                          )}
                        {(ord.status === 'MENUNGGU' || ord.status === 'DISIAPKAN') && (
                          <button
                            type="button"
                            onClick={() => handleUpdateOrderStatus(ord.id, 'DIBATALKAN')}
                            className="px-2.5 py-1.5 rounded text-red-700 hover:bg-red-50 text-xs font-medium cursor-pointer whitespace-nowrap"
                          >
                            Batalkan
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Riwayat Transaksi Kasir (POS) */}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden print:hidden">
        <div className="px-6 py-4 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-zinc-900">
              Riwayat Transaksi Kasir (POS)
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5 tabular-price">
              Menampilkan {Math.min(15, filteredPosOrders.length)} dari {posOrders.length} transaksi langsung di toko.
            </p>
          </div>
          <input
            type="search"
            value={posHistorySearch}
            onChange={(e) => setPosHistorySearch(e.target.value)}
            placeholder="Cari no. struk atau pembeli..."
            aria-label="Cari riwayat POS"
            className="px-3 py-1.5 text-xs border border-zinc-300 rounded-lg w-full sm:w-56"
          />
        </div>

        {filteredPosOrders.length === 0 ? (
          <div className="p-6 text-center text-sm text-zinc-500">
            Belum ada riwayat transaksi kasir POS.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                  <th className="py-3 px-4 font-medium">No. Struk</th>
                  <th className="py-3 px-4 font-medium">Pembeli</th>
                  <th className="py-3 px-4 font-medium">Ringkasan Barang</th>
                  <th className="py-3 px-4 font-medium">Metode</th>
                  <th className="py-3 px-4 font-medium text-right">Total</th>
                  <th className="py-3 px-4 font-medium text-right">Struk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-xs">
                {filteredPosOrders.slice(0, 15).map((ord) => (
                  <tr key={ord.id} className="hover:bg-zinc-50">
                    <td className="py-2.5 px-4 font-mono font-semibold text-zinc-800 tabular-price">
                      {ord.orderNumber}
                      <div className="font-sans font-normal text-zinc-400">
                        {formatShortDate(ord.createdAt)}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 font-medium text-zinc-900">{ord.customerName}</td>
                    <td className="py-2.5 px-4 text-zinc-600">
                      {ord.items
                        .map((i) => `${i.productName} (${i.variantLabel}) x${i.quantity}`)
                        .join(', ')}
                    </td>
                    <td className="py-2.5 px-4 text-zinc-700 font-medium">{ord.paymentMethod}</td>
                    <td className="py-2.5 px-4 text-right font-mono font-semibold text-zinc-900 tabular-price">
                      {formatRupiah(ord.total)}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <a
                          href={buildPosWhatsappReceiptLink(ord)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 rounded border border-emerald-200 bg-emerald-50 text-[#14532D] font-medium hover:bg-emerald-100 whitespace-nowrap"
                        >
                          WA
                        </a>
                        <button
                          type="button"
                          onClick={() => setLastPosOrder(ord)}
                          className="px-2.5 py-1 rounded border border-zinc-300 bg-white text-zinc-800 font-medium hover:bg-zinc-50 cursor-pointer whitespace-nowrap"
                        >
                          Lihat Struk
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Riwayat Shift Kasir & Selisih Laci */}
      {closedShifts.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden print:hidden">
          <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-zinc-900">
                Riwayat Tutup Shift &amp; Selisih Laci ({closedShifts.length})
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Rekap kesesuaian kas tunai sistem dan uang fisik saat tutup laci.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowShiftHistory((v) => !v)}
              className="px-3 py-1.5 rounded-lg border border-zinc-300 bg-white text-xs font-medium text-zinc-800 hover:bg-zinc-50 cursor-pointer whitespace-nowrap"
            >
              {showShiftHistory ? 'Tutup Tabel' : 'Lihat Riwayat Shift'}
            </button>
          </div>
          {showShiftHistory && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-500">
                    <th className="py-2.5 px-4 font-medium">Kasir &amp; Waktu</th>
                    <th className="py-2.5 px-4 font-medium text-right">Modal Awal</th>
                    <th className="py-2.5 px-4 font-medium text-right">Perkiraan Sistem</th>
                    <th className="py-2.5 px-4 font-medium text-right">Fisik Dihitung</th>
                    <th className="py-2.5 px-4 font-medium text-right">Selisih Laci</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {closedShifts.slice(0, 12).map((sh) => {
                    const diff = sh.discrepancy ?? 0;
                    return (
                      <tr key={sh.id} className="hover:bg-zinc-50">
                        <td className="py-2.5 px-4">
                          <p className="font-semibold text-zinc-900">{sh.cashierName}</p>
                          <p className="text-zinc-500">
                            {formatShortDate(sh.closedAt || sh.openedAt)}
                          </p>
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-price text-zinc-600">
                          {formatRupiah(sh.openingCash)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-price text-zinc-900">
                          {formatRupiah(sh.expectedCash)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-price text-zinc-900">
                          {formatRupiah(sh.countedCash ?? sh.expectedCash)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-semibold tabular-price">
                          <span
                            className={`inline-block px-2 py-0.5 rounded border text-[11px] ${
                              diff === 0
                                ? 'bg-emerald-50 border-emerald-200 text-[#14532D]'
                                : diff > 0
                                  ? 'bg-zinc-50 border-zinc-300 text-zinc-800'
                                  : 'bg-red-50 border-red-200 text-red-700'
                            }`}
                          >
                            {diff === 0
                              ? 'Pas (Rp 0)'
                              : `${diff > 0 ? '+' : '-'}${formatRupiah(Math.abs(diff))}`}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

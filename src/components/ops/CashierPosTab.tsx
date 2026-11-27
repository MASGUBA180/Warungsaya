import {Minus, Plus, Trash2} from 'lucide-react';
import {FormEvent, useState} from 'react';
import {formatRupiah, formatShortDate, ORDER_STATUS_LABELS} from '../../lib/storeData';
import {apiFetch} from '../../lib/apiClient';
import type {
  DivisionRole,
  Order,
  OrderStatus,
  PaymentMethod,
  Product,
  ProductVariant,
} from '../../types/store';

interface PosBasketItem {
  key: string;
  product: Product;
  variant: ProductVariant;
  quantity: number;
}

interface CashierPosTabProps {
  role: DivisionRole;
  products: Product[];
  orders: Order[];
  authToken: string;
  onRefresh: () => Promise<void>;
}

export function CashierPosTab({
  role,
  products,
  orders,
  authToken,
  onRefresh,
}: CashierPosTabProps) {
  const [searchPos, setSearchPos] = useState('');
  const [basket, setBasket] = useState<PosBasketItem[]>([]);
  const [customerName, setCustomerName] = useState('Pembeli Toko');
  const [phone, setPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('TUNAI');
  const [notes, setNotes] = useState('');
  const [posError, setPosError] = useState('');
  const [posSuccess, setPosSuccess] = useState('');
  const [orderActionError, setOrderActionError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const filteredProducts = products.filter((p) => {
    const q = searchPos.trim().toLowerCase();
    return (
      q === '' ||
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
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

  const basketTotal = basket.reduce(
    (sum, item) => sum + item.variant.price * item.quantity,
    0
  );

  const handleCheckoutPos = async (e: FormEvent) => {
    e.preventDefault();
    if (basket.length === 0) {
      setPosError('Pilih minimal 1 barang untuk transaksi kasir.');
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

      setPosSuccess(
        `Transaksi #${res.data.order.orderNumber} (${formatRupiah(res.data.order.total)}) tercatat.`
      );
      setBasket([]);
      setCustomerName('Pembeli Toko');
      setPhone('');
      setNotes('');
      setPaymentMethod('TUNAI');
      await onRefresh();
    } catch {
      setPosError('Gagal terhubung ke server.');
    } finally {
      setSubmitting(false);
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

  const onlineOrders = orders.filter((o) => o.source === 'ONLINE');

  return (
    <div className="space-y-8">
      {/* POS Terminal */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-zinc-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-zinc-900">Kasir Langsung (POS)</h3>
              <p className="text-xs text-zinc-500">
                Ketuk varian barang untuk memasukkan ke struk belanja toko.
              </p>
            </div>
            <input
              type="search"
              value={searchPos}
              onChange={(e) => setSearchPos(e.target.value)}
              placeholder="Cari barang..."
              className="w-full sm:w-56 px-3 py-2 min-h-[38px] text-sm border border-zinc-300 rounded-lg focus:outline-none focus:border-[#14532D]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[440px] overflow-y-auto pr-1">
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
                      className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-white border border-zinc-300 text-zinc-800 hover:border-[#14532D] hover:text-[#14532D] disabled:opacity-40 cursor-pointer"
                    >
                      {variant.label} · {formatRupiah(variant.price)} ({variant.stock})
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
            <h3 className="text-base font-semibold text-zinc-900">Struk Transaksi Toko</h3>

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
                  <option value="TUNAI">Tunai</option>
                  <option value="QRIS">QRIS / Transfer</option>
                  <option value="KASBON">Bon / Kasbon</option>
                </select>
              </div>
            </div>

            {paymentMethod === 'KASBON' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="pos-phone" className="block text-xs text-zinc-600 mb-1">
                    No. HP Pelanggan
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
                    Alamat / Catatan Bon
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
            )}
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

            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-600">Total Tagihan</span>
              <span className="text-xl font-bold text-zinc-900 tabular-price">
                {formatRupiah(basketTotal)}
              </span>
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

      {/* Incoming Online & COD Orders */}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200">
          <h3 className="text-base font-semibold text-zinc-900">
            Antrean Pesanan Online & COD Masuk
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            {role === 'KASIR'
              ? 'Konfirmasi pesanan warga dan selesaikan pengambilan di toko. Pengantaran COD dikelola oleh Kurir.'
              : 'Konfirmasi pesanan baru dari warga sebelum disiapkan gudang atau diantar kurir.'}
          </p>
          {orderActionError && (
            <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
              {orderActionError}
            </p>
          )}
        </div>

        {onlineOrders.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-500">
            Belum ada pesanan online masuk.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                  <th className="py-3 px-4 font-medium">Kode</th>
                  <th className="py-3 px-4 font-medium">Pemesan & Alamat</th>
                  <th className="py-3 px-4 font-medium">Barang</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Total</th>
                  <th className="py-3 px-4 font-medium text-right">Aksi Kasir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {onlineOrders.map((ord) => (
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
                    <td className="py-3 px-4 text-xs font-medium text-zinc-800">
                      {ORDER_STATUS_LABELS[ord.status]}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold tabular-price text-xs text-zinc-900">
                      {formatRupiah(ord.total)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex flex-wrap justify-end gap-1.5 items-center">
                        {ord.status === 'MENUNGGU' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateOrderStatus(ord.id, 'DISIAPKAN')}
                            className="px-2.5 py-1.5 rounded bg-[#14532D] text-white text-xs font-medium hover:bg-[#166534] cursor-pointer whitespace-nowrap"
                          >
                            Siapkan
                          </button>
                        )}
                        {role === 'PEMILIK' &&
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
                        {role === 'PEMILIK' &&
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
    </div>
  );
}

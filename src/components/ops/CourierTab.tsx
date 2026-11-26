import {MapPin, Phone, Truck} from 'lucide-react';
import {apiFetch} from '../../lib/apiClient';
import {formatRupiah, formatShortDate, ORDER_STATUS_LABELS} from '../../lib/storeData';
import type {Order, OrderStatus} from '../../types/store';

interface CourierTabProps {
  orders: Order[];
  authToken: string;
  onRefresh: () => Promise<void>;
}

export function CourierTab({orders, authToken, onRefresh}: CourierTabProps) {
  const codOrders = orders.filter((o) => o.deliveryMethod === 'cod');
  const activeDeliveries = codOrders.filter(
    (o) => o.status === 'MENUNGGU' || o.status === 'DISIAPKAN' || o.status === 'DIANTAR'
  );
  const completedDeliveries = codOrders.filter((o) => o.status === 'SELESAI');

  const updateDeliveryStatus = async (orderId: string, status: OrderStatus) => {
    try {
      const res = await apiFetch(`/api/ops/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({status}),
      });
      if (res.ok) {
        await onRefresh();
      }
    } catch {
      // ignore transient
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-base font-semibold text-zinc-900">
          Antrean Pengantaran COD Gang Makam & Gunung Batin Udik
        </h3>
        <p className="text-xs text-zinc-500 mt-0.5">
          Konfirmasi saat barang diambil dari toko untuk diantar, lalu tandai selesai setelah
          menerima pembayaran tunai dari pelanggan.
        </p>

        {activeDeliveries.length === 0 ? (
          <div className="mt-4 bg-white border border-zinc-200 rounded-xl p-8 text-center text-sm text-zinc-500">
            Semua pengantaran COD saat ini sudah selesai.
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeDeliveries.map((ord) => (
              <div
                key={ord.id}
                className="bg-white border border-zinc-200 rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs font-semibold text-[#14532D] tabular-price">
                        {ord.orderNumber} · {ORDER_STATUS_LABELS[ord.status]}
                      </p>
                      <h4 className="text-base font-bold text-zinc-900 mt-0.5">
                        {ord.customerName}
                      </h4>
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
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-zinc-100">
                  {(ord.status === 'MENUNGGU' || ord.status === 'DISIAPKAN') && (
                    <button
                      type="button"
                      onClick={() => updateDeliveryStatus(ord.id, 'DIANTAR')}
                      className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 min-h-[40px] rounded-lg bg-zinc-900 text-white text-xs font-semibold hover:bg-zinc-800 cursor-pointer whitespace-nowrap"
                    >
                      <Truck className="w-4 h-4" aria-hidden="true" />
                      <span>Ambil & Mulai Antar</span>
                    </button>
                  )}

                  {ord.status === 'DIANTAR' && (
                    <button
                      type="button"
                      onClick={() => updateDeliveryStatus(ord.id, 'SELESAI')}
                      className="flex-1 py-2.5 px-4 min-h-[40px] rounded-lg bg-[#14532D] text-white text-xs font-semibold hover:bg-[#166534] cursor-pointer whitespace-nowrap"
                    >
                      Selesai Diterima & Terima Tunai
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completed COD History */}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200">
          <h3 className="text-base font-semibold text-zinc-900">Riwayat Pengantaran Selesai</h3>
        </div>
        {completedDeliveries.length === 0 ? (
          <div className="p-6 text-center text-sm text-zinc-500">
            Belum ada riwayat pengantaran COD selesai.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                  <th className="py-3 px-4 font-medium">Kode</th>
                  <th className="py-3 px-4 font-medium">Pelanggan & Alamat</th>
                  <th className="py-3 px-4 font-medium">Kurir</th>
                  <th className="py-3 px-4 font-medium text-right">Setoran COD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-xs">
                {completedDeliveries.slice(0, 15).map((ord) => (
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
                    <td className="py-3 px-4 text-zinc-700">{ord.courierName || '-'}</td>
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
    </div>
  );
}

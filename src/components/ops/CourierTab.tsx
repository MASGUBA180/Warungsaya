import {MapPin, Navigation, Phone, Truck} from 'lucide-react';
import {FormEvent, useEffect, useState} from 'react';
import {apiFetch} from '../../lib/apiClient';
import {
  DELIVERY_CHECKPOINT_LABELS,
  formatRupiah,
  formatShortDate,
  ORDER_STATUS_LABELS,
} from '../../lib/storeData';
import type {
  DeliveryCheckpoint,
  GeoPoint,
  Order,
  OrderStatus,
  StoreSettings,
} from '../../types/store';
import {DeliveryMap} from '../DeliveryMap';

interface CourierTabProps {
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
  orders,
  settings,
  authToken,
  onRefresh,
}: CourierTabProps) {
  const codOrders = orders.filter((o) => o.deliveryMethod === 'cod');
  const activeDeliveries = codOrders.filter(
    (o) => o.status === 'MENUNGGU' || o.status === 'DISIAPKAN' || o.status === 'DIANTAR'
  );
  const completedDeliveries = codOrders.filter((o) => o.status === 'SELESAI');

  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [checkpoint, setCheckpoint] = useState<DeliveryCheckpoint>('MENUJU_LOKASI');
  const [locationNote, setLocationNote] = useState('');
  const [etaMinutes, setEtaMinutes] = useState('10');
  const [courierCoords, setCourierCoords] = useState<GeoPoint | null>(null);
  const [gpsMessage, setGpsMessage] = useState('');
  const [savingTrack, setSavingTrack] = useState(false);

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
    setEtaMinutes(
      selectedOrder.tracking?.etaMinutes !== undefined
        ? String(selectedOrder.tracking.etaMinutes)
        : '10'
    );
    setCourierCoords(selectedOrder.tracking?.courierCoords ?? null);
    setGpsMessage('');
  }, [selectedOrder?.id, selectedOrder?.updatedAt]);

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
        setGpsMessage(`Pin kurir disetel ke GPS Anda (${pt.lat.toFixed(4)}, ${pt.lng.toFixed(4)}). Tekan Simpan untuk mengirim.`);
      },
      () => {
        setGpsMessage('Izin GPS belum aktif. Anda tetap bisa klik langsung pada peta atau update tahap perjalanan.');
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
          courierCoords,
        }),
      });
      if (res.ok) {
        setGpsMessage('Posisi dan status kurir diperbarui untuk dilihat pelanggan.');
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
      {/* Interactive Courier Map & Live Position Panel */}
      {selectedOrder && (
        <div className="bg-white border border-zinc-200 rounded-xl p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-zinc-900">
                Peta Pengantaran Kurir — {selectedOrder.orderNumber} ({selectedOrder.customerName})
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Perbarui posisi kurir agar pelanggan bisa memantau kurir sudah sampai mana dari menu Lacak Pesanan.
              </p>
            </div>

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
                courierName={selectedOrder.courierName || 'Kurir Toko'}
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
        <h3 className="text-base font-semibold text-zinc-900">
          Antrean Pengantaran COD Gang Makam & Gunung Batin Udik
        </h3>
        <p className="text-xs text-zinc-500 mt-0.5">
          Pilih kartu pesanan untuk memperbarui titik lokasi di peta, lalu konfirmasi setelah pembayaran tunai diterima.
        </p>

        {activeDeliveries.length === 0 ? (
          <div className="mt-4 bg-white border border-zinc-200 rounded-xl p-8 text-center text-sm text-zinc-500">
            Semua pengantaran COD saat ini sudah selesai.
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeDeliveries.map((ord) => {
              const isSelected = selectedOrder?.id === ord.id;
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
              );
            })}
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

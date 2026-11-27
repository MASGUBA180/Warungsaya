import {CheckCircle2, PackagePlus, Truck} from 'lucide-react';
import {FormEvent, useEffect, useState} from 'react';
import {apiFetch} from '../../lib/apiClient';
import {formatRupiah, formatShortDate} from '../../lib/storeData';
import type {DivisionRole, Product, SupplierDelivery} from '../../types/store';

interface SupplierTabProps {
  role: DivisionRole;
  products: Product[];
  supplierDeliveries: SupplierDelivery[];
  authToken: string;
  onRefresh: () => Promise<void>;
}

export function SupplierTab({
  role,
  products,
  supplierDeliveries,
  authToken,
  onRefresh,
}: SupplierTabProps) {
  const isSupplier = role === 'PEMASOK';
  const canReceive = role === 'PEMILIK' || role === 'GUDANG';

  const variantOptions = products.flatMap((p) =>
    p.variants.map((v) => ({
      productId: p.id,
      productName: p.name,
      category: p.category,
      variantId: v.id,
      variantLabel: v.label,
      stock: v.stock,
      minStock: v.minStock,
    }))
  );

  const lowStockItems = variantOptions.filter((v) => v.stock <= v.minStock);

  const [selectedKey, setSelectedKey] = useState(
    variantOptions[0] ? `${variantOptions[0].productId}__${variantOptions[0].variantId}` : ''
  );
  const [quantity, setQuantity] = useState('10');
  const [unitCost, setUnitCost] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [recordExpenseOnReceive, setRecordExpenseOnReceive] = useState(true);

  useEffect(() => {
    if (!selectedKey && variantOptions.length > 0) {
      setSelectedKey(`${variantOptions[0].productId}__${variantOptions[0].variantId}`);
    }
  }, [selectedKey, variantOptions]);

  const handleSubmitDelivery = async (e: FormEvent) => {
    e.preventDefault();
    const chosen = variantOptions.find(
      (v) => `${v.productId}__${v.variantId}` === selectedKey
    );
    if (!chosen) {
      setFormError('Pilih barang yang akan disuplai terlebih dahulu.');
      return;
    }

    setFormError('');
    setFormSuccess('');
    setSubmitting(true);
    try {
      const res = await apiFetch<{delivery?: SupplierDelivery; error?: string}>(
        '/api/ops/supplier/deliveries',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            productId: chosen.productId,
            variantId: chosen.variantId,
            quantity: Number(quantity),
            unitCost: Number(unitCost || 0),
            note: note.trim(),
          }),
        }
      );
      if (!res.ok || !res.data.delivery) {
        setFormError(res.data.error || 'Gagal mencatat pengiriman suplai.');
        return;
      }
      setFormSuccess(
        `Kiriman ${chosen.productName} (${chosen.variantLabel}) x${quantity} tercatat dan menunggu verifikasi gudang.`
      );
      setNote('');
      setUnitCost('');
      await onRefresh();
    } catch {
      setFormError('Gagal menghubungi server toko.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReceiveDelivery = async (deliveryId: string) => {
    setReceivingId(deliveryId);
    try {
      const res = await apiFetch(`/api/ops/supplier/deliveries/${deliveryId}/receive`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({recordExpense: recordExpenseOnReceive}),
      });
      if (res.ok) {
        await onRefresh();
      }
    } finally {
      setReceivingId(null);
    }
  };

  const pendingDeliveries = supplierDeliveries.filter(
    (d) => d.status === 'MENUNGGU_TERIMA'
  );

  return (
    <div className="space-y-8">
      {/* Low stock restock needs (no costPrice or customer info exposed) */}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-zinc-900">
              Kebutuhan Suplai & Stok Gudang
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Daftar barang dengan stok menipis yang diprioritaskan untuk pengiriman berikutnya.
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800 tabular-price">
            {lowStockItems.length} Varian Perlu Suplai
          </span>
        </div>

        {lowStockItems.length === 0 ? (
          <div className="p-6 text-center text-sm text-zinc-500">
            Semua stok barang toko saat ini masih di atas batas aman minimum.
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {lowStockItems.map((item) => (
              <div
                key={`${item.productId}__${item.variantId}`}
                className="px-6 py-3.5 flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <p className="text-sm font-semibold text-zinc-900">{item.productName}</p>
                  <p className="text-xs text-zinc-500">
                    {item.category} · {item.variantLabel}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-semibold text-amber-700 tabular-price">
                    Sisa {item.stock} / min {item.minStock}
                  </span>
                  {(isSupplier || role === 'PEMILIK') && (
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedKey(`${item.productId}__${item.variantId}`)
                      }
                      className="px-3 py-1.5 rounded-lg border border-zinc-300 bg-white text-xs font-medium text-zinc-800 hover:bg-zinc-50 cursor-pointer whitespace-nowrap"
                    >
                      Pilih untuk Kirim
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Supplier delivery submission form (PEMASOK or PEMILIK) */}
      {(isSupplier || role === 'PEMILIK') && (
        <form
          onSubmit={handleSubmitDelivery}
          className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4"
        >
          <div className="flex items-center gap-2">
            <PackagePlus className="w-5 h-5 text-[#14532D]" aria-hidden="true" />
            <div>
              <h3 className="text-base font-semibold text-zinc-900">
                Catat Pengiriman Suplai ke Toko Dimas Jaya
              </h3>
              <p className="text-xs text-zinc-500">
                Data kiriman akan muncul di antrean Divisi Gudang untuk dicek dan dimasukkan ke stok.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="sup-item" className="block text-xs text-zinc-600 mb-1">
                Barang & Kemasan
              </label>
              <select
                id="sup-item"
                value={selectedKey}
                onChange={(e) => setSelectedKey(e.target.value)}
                className="w-full px-3 py-2 min-h-[40px] text-sm bg-white border border-zinc-300 rounded-lg"
              >
                {variantOptions.map((item) => (
                  <option
                    key={`${item.productId}__${item.variantId}`}
                    value={`${item.productId}__${item.variantId}`}
                  >
                    {item.productName} — {item.variantLabel} (Sisa: {item.stock})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="sup-qty" className="block text-xs text-zinc-600 mb-1">
                Jumlah Kirim (Unit)
              </label>
              <input
                id="sup-qty"
                type="number"
                required
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full px-3 py-2 min-h-[40px] text-sm tabular-price border border-zinc-300 rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="sup-cost" className="block text-xs text-zinc-600 mb-1">
                Harga Suplai / Unit (Opsional)
              </label>
              <input
                id="sup-cost"
                type="number"
                min={0}
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder="Contoh: 64000"
                className="w-full px-3 py-2 min-h-[40px] text-sm tabular-price border border-zinc-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label htmlFor="sup-note" className="block text-xs text-zinc-600 mb-1">
              Nomor Surat Jalan / Keterangan Kiriman
            </label>
            <input
              id="sup-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Contoh: Surat Jalan SJ-102, antar pagi"
              className="w-full px-3 py-2 min-h-[40px] text-sm border border-zinc-300 rounded-lg"
            />
          </div>

          {formError && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
              {formError}
            </p>
          )}
          {formSuccess && (
            <p className="text-xs text-[#14532D] bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
              {formSuccess}
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 min-h-[40px] rounded-lg bg-[#14532D] text-white text-xs font-semibold hover:bg-[#166534] disabled:opacity-60 cursor-pointer whitespace-nowrap"
            >
              {submitting ? 'Mengirim Catatan...' : 'Kirim Catatan Suplai'}
            </button>
          </div>
        </form>
      )}

      {/* Warehouse Verification Controls when Gudang / Pemilik views incoming shipments */}
      {canReceive && pendingDeliveries.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-amber-950">
            <Truck className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
            <span>
              Ada <strong>{pendingDeliveries.length}</strong> kiriman pemasok menunggu konfirmasi
              terima gudang.
            </span>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-amber-950 cursor-pointer">
            <input
              type="checkbox"
              checked={recordExpenseOnReceive}
              onChange={(e) => setRecordExpenseOnReceive(e.target.checked)}
              className="rounded border-amber-400"
            />
            <span>Catat tagihan suplai ke pengeluaran buku kas saat diterima</span>
          </label>
        </div>
      )}

      {/* Delivery Log Table */}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200">
          <h3 className="text-base font-semibold text-zinc-900">
            {isSupplier
              ? 'Riwayat Pengiriman Suplai Saya'
              : 'Daftar Kiriman Masuk dari Pemasok'}
          </h3>
        </div>

        {supplierDeliveries.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-500">
            Belum ada catatan kiriman suplai barang.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                  <th className="py-3 px-4 font-medium">Waktu & Pemasok</th>
                  <th className="py-3 px-4 font-medium">Barang</th>
                  <th className="py-3 px-4 font-medium text-right">Qty</th>
                  {!isSupplier && <th className="py-3 px-4 font-medium text-right">Harga Suplai</th>}
                  <th className="py-3 px-4 font-medium">Keterangan</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  {canReceive && <th className="py-3 px-4 font-medium text-right">Aksi Gudang</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-xs">
                {supplierDeliveries.map((d) => (
                  <tr key={d.id} className="hover:bg-zinc-50">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-zinc-900">{d.supplierName}</p>
                      <p className="text-zinc-500">{formatShortDate(d.createdAt)}</p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-zinc-900">{d.productName}</p>
                      <p className="text-zinc-500">{d.variantLabel}</p>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold tabular-price text-zinc-900">
                      +{d.quantity}
                    </td>
                    {!isSupplier && (
                      <td className="py-3 px-4 text-right font-mono tabular-price text-zinc-700">
                        {d.unitCost > 0 ? formatRupiah(d.unitCost) : '-'}
                      </td>
                    )}
                    <td className="py-3 px-4 text-zinc-600">{d.note}</td>
                    <td className="py-3 px-4">
                      {d.status === 'DITERIMA' ? (
                        <span className="inline-flex items-center gap-1 text-[#14532D] font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Diterima ({d.receivedBy || 'Gudang'})</span>
                        </span>
                      ) : (
                        <span className="font-semibold text-amber-700">Menunggu Gudang</span>
                      )}
                    </td>
                    {canReceive && (
                      <td className="py-3 px-4 text-right">
                        {d.status === 'MENUNGGU_TERIMA' ? (
                          <button
                            type="button"
                            disabled={receivingId === d.id}
                            onClick={() => handleReceiveDelivery(d.id)}
                            className="px-3 py-1.5 rounded-lg bg-[#14532D] text-white text-xs font-semibold hover:bg-[#166534] disabled:opacity-60 cursor-pointer whitespace-nowrap"
                          >
                            {receivingId === d.id ? 'Memproses...' : 'Terima ke Stok'}
                          </button>
                        ) : (
                          <span className="text-zinc-400">Masuk stok</span>
                        )}
                      </td>
                    )}
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

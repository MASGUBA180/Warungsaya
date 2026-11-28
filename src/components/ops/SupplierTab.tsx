import {Camera, CheckCircle2, Copy, Edit3, PackagePlus, Plus, Printer, Trash2, Truck, X} from 'lucide-react';
import {type ChangeEvent, FormEvent, useEffect, useState} from 'react';
import {apiFetch} from '../../lib/apiClient';
import {compressImageFileToDataUrl} from '../../lib/imageHelpers';
import {formatRupiah, formatShortDate} from '../../lib/storeData';
import type {DivisionRole, Product, SupplierDelivery} from '../../types/store';

interface SupplierTabProps {
  role: DivisionRole;
  products: Product[];
  supplierDeliveries: SupplierDelivery[];
  authToken: string;
  onRefresh: () => Promise<void>;
}

interface BatchItemDraft {
  rowId: string;
  key: string;
  quantity: string;
  unitCost: string;
}

export function SupplierTab({
  role,
  products,
  supplierDeliveries,
  authToken,
  onRefresh,
}: SupplierTabProps) {
  const isSupplier = role === 'PEMASOK';
  const isLeader = role === 'PEMILIK' || role === 'DIREKTUR';
  const canSubmit = isSupplier || isLeader;
  const canReceive = isLeader || role === 'GUDANG';

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

  const defaultKey = variantOptions[0]
    ? `${variantOptions[0].productId}__${variantOptions[0].variantId}`
    : '';

  const [batchItems, setBatchItems] = useState<BatchItemDraft[]>([
    {rowId: 'row-1', key: defaultKey, quantity: '10', unitCost: ''},
  ]);
  const [batchCode, setBatchCode] = useState('');
  const [paymentTerm, setPaymentTerm] = useState<'TUNAI' | 'TEMPO'>('TUNAI');
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [invoicePhoto, setInvoicePhoto] = useState<string | undefined>(undefined);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [recordExpenseOnReceive, setRecordExpenseOnReceive] = useState(true);

  // Edit / Cancel pending delivery state
  const [editingDelivery, setEditingDelivery] = useState<SupplierDelivery | null>(null);
  const [editQty, setEditQty] = useState('');
  const [editCost, setEditCost] = useState('');
  const [editPaymentStatus, setEditPaymentStatus] = useState<'TUNAI' | 'TEMPO'>('TUNAI');
  const [editDueDate, setEditDueDate] = useState('');
  const [editNote, setEditNote] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [tableError, setTableError] = useState('');

  // Delivery log filters
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState<
    'ALL' | 'PENDING' | 'RECEIVED' | 'TEMPO'
  >('ALL');
  const [deliverySearch, setDeliverySearch] = useState('');

  useEffect(() => {
    if (defaultKey) {
      setBatchItems((prev) =>
        prev.map((row) => (row.key ? row : {...row, key: defaultKey}))
      );
    }
  }, [defaultKey]);

  const handleSelectLowStock = (key: string) => {
    setBatchItems((prev) => {
      if (prev.some((r) => r.key === key)) {
        return prev;
      }
      if (prev.length === 1 && (!prev[0].key || prev[0].unitCost === '')) {
        return [{...prev[0], key}];
      }
      return [
        ...prev,
        {
          rowId: `row-${Date.now()}-${prev.length + 1}`,
          key,
          quantity: '10',
          unitCost: '',
        },
      ];
    });
  };

  const handleAddBatchRow = () => {
    setBatchItems((prev) => [
      ...prev,
      {
        rowId: `row-${Date.now()}-${prev.length + 1}`,
        key: defaultKey,
        quantity: '10',
        unitCost: '',
      },
    ]);
  };

  const handleRemoveBatchRow = (rowId: string) => {
    setBatchItems((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.rowId !== rowId)));
  };

  const handleDuplicateDeliveryToForm = (d: SupplierDelivery) => {
    const key = `${d.productId}__${d.variantId}`;
    setBatchItems((prev) => {
      if (prev.length === 1 && prev[0].unitCost === '' && prev[0].quantity === '10') {
        return [
          {
            rowId: prev[0].rowId,
            key,
            quantity: String(d.quantity),
            unitCost: d.unitCost > 0 ? String(d.unitCost) : '',
          },
        ];
      }
      return [
        ...prev,
        {
          rowId: `row-${Date.now()}-${prev.length + 1}`,
          key,
          quantity: String(d.quantity),
          unitCost: d.unitCost > 0 ? String(d.unitCost) : '',
        },
      ];
    });
    setFormSuccess(
      `${d.productName} (${d.variantLabel}) x${d.quantity} disalin ke form surat jalan.`
    );
    setFormError('');
  };

  const handleUploadInvoicePhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    setFormError('');
    try {
      const dataUrl = await compressImageFileToDataUrl(file, 720, 0.72);
      setInvoicePhoto(dataUrl);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal membaca foto faktur.');
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleSubmitDelivery = async (e: FormEvent) => {
    e.preventDefault();
    const resolvedItems = batchItems
      .map((row) => {
        const chosen = variantOptions.find(
          (v) => `${v.productId}__${v.variantId}` === row.key
        );
        if (!chosen) return null;
        return {
          chosen,
          productId: chosen.productId,
          variantId: chosen.variantId,
          quantity: Number(row.quantity),
          unitCost: Number(row.unitCost || 0),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (resolvedItems.length === 0) {
      setFormError('Pilih minimal satu barang yang akan disuplai.');
      return;
    }

    setFormError('');
    setFormSuccess('');
    setSubmitting(true);
    try {
      const res = await apiFetch<{
        delivery?: SupplierDelivery;
        deliveries?: SupplierDelivery[];
        error?: string;
      }>('/api/ops/supplier/deliveries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          batchCode: batchCode.trim() || undefined,
          paymentStatus: paymentTerm,
          dueDate: paymentTerm === 'TEMPO' && dueDate ? dueDate : undefined,
          note: note.trim(),
          invoicePhoto,
          items: resolvedItems.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            quantity: i.quantity,
            unitCost: i.unitCost,
          })),
        }),
      });
      if (!res.ok || !res.data.delivery) {
        setFormError(res.data.error || 'Gagal mencatat pengiriman suplai.');
        return;
      }
      const createdCount = res.data.deliveries?.length || 1;
      setFormSuccess(
        createdCount > 1
          ? `${createdCount} item barang dalam surat jalan berhasil dikirim ke antrean verifikasi gudang.`
          : `Kiriman ${resolvedItems[0].chosen.productName} (${resolvedItems[0].chosen.variantLabel}) x${resolvedItems[0].quantity} tercatat dan menunggu verifikasi gudang.`
      );
      setBatchItems([{rowId: 'row-reset', key: defaultKey, quantity: '10', unitCost: ''}]);
      setBatchCode('');
      setNote('');
      setDueDate('');
      setInvoicePhoto(undefined);
      await onRefresh();
    } catch {
      setFormError('Gagal menghubungi server toko.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReceiveDelivery = async (deliveryId: string) => {
    setReceivingId(deliveryId);
    setTableError('');
    try {
      const res = await apiFetch<{error?: string}>(
        `/api/ops/supplier/deliveries/${deliveryId}/receive`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({recordExpense: recordExpenseOnReceive}),
        }
      );
      if (res.ok) {
        await onRefresh();
      } else {
        setTableError(res.data.error || 'Gagal mengonfirmasi penerimaan gudang.');
      }
    } finally {
      setReceivingId(null);
    }
  };

  const handleSaveEditDelivery = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingDelivery) return;
    setSavingEdit(true);
    setTableError('');
    try {
      const res = await apiFetch<{error?: string}>(
        `/api/ops/supplier/deliveries/${editingDelivery.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            quantity: Number(editQty),
            unitCost: Number(editCost || 0),
            paymentStatus: editPaymentStatus,
            dueDate: editPaymentStatus === 'TEMPO' ? editDueDate : '',
            note: editNote.trim(),
          }),
        }
      );
      if (!res.ok) {
        setTableError(res.data.error || 'Gagal memperbarui catatan kiriman.');
        return;
      }
      setEditingDelivery(null);
      await onRefresh();
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCancelDelivery = async (deliveryId: string) => {
    setTableError('');
    const res = await apiFetch<{error?: string}>(
      `/api/ops/supplier/deliveries/${deliveryId}`,
      {
        method: 'DELETE',
        headers: {Authorization: `Bearer ${authToken}`},
      }
    );
    if (!res.ok) {
      setTableError(res.data.error || 'Gagal membatalkan kiriman suplai.');
      return;
    }
    setConfirmCancelId(null);
    await onRefresh();
  };

  const pendingDeliveries = supplierDeliveries.filter(
    (d) => d.status === 'MENUNGGU_TERIMA'
  );
  const receivedDeliveries = supplierDeliveries.filter((d) => d.status === 'DITERIMA');
  const totalTempoPayable = supplierDeliveries
    .filter((d) => d.paymentStatus === 'TEMPO' && d.unitCost > 0)
    .reduce((sum, d) => sum + d.unitCost * d.quantity, 0);

  const delivSearchNorm = deliverySearch.trim().toLowerCase();
  const filteredDeliveries = supplierDeliveries.filter((d) => {
    if (deliveryStatusFilter === 'PENDING' && d.status !== 'MENUNGGU_TERIMA') return false;
    if (deliveryStatusFilter === 'RECEIVED' && d.status !== 'DITERIMA') return false;
    if (deliveryStatusFilter === 'TEMPO' && d.paymentStatus !== 'TEMPO') return false;
    if (
      delivSearchNorm &&
      !d.productName.toLowerCase().includes(delivSearchNorm) &&
      !d.supplierName.toLowerCase().includes(delivSearchNorm) &&
      !(d.batchCode || '').toLowerCase().includes(delivSearchNorm) &&
      !d.note.toLowerCase().includes(delivSearchNorm)
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-8">
      {/* Ringkasan Status Suplai */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:hidden">
        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <p className="text-xs text-zinc-500">Menunggu Verifikasi Gudang</p>
          <p className="text-xl font-bold text-amber-700 tabular-price mt-1">
            {pendingDeliveries.length}
          </p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <p className="text-xs text-zinc-500">Sudah Diterima Gudang</p>
          <p className="text-xl font-bold text-[#14532D] tabular-price mt-1">
            {receivedDeliveries.length}
          </p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <p className="text-xs text-zinc-500">Total Tagihan Tempo Aktif</p>
          <p className="text-xl font-bold text-zinc-900 tabular-price mt-1">
            {formatRupiah(totalTempoPayable)}
          </p>
        </div>
      </div>

      {/* Low stock restock needs (no costPrice or customer info exposed) */}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-zinc-900">
              Kebutuhan Suplai &amp; Stok Gudang
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
                  {canSubmit && (
                    <button
                      type="button"
                      onClick={() =>
                        handleSelectLowStock(`${item.productId}__${item.variantId}`)
                      }
                      className="px-3 py-1.5 rounded-lg border border-zinc-300 bg-white text-xs font-medium text-zinc-800 hover:bg-zinc-50 cursor-pointer whitespace-nowrap"
                    >
                      + Tambah ke Surat Jalan
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Supplier multi-item delivery submission form */}
      {canSubmit && (
        <form
          onSubmit={handleSubmitDelivery}
          className="bg-white border border-zinc-200 rounded-xl p-6 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <PackagePlus className="w-5 h-5 text-[#14532D]" aria-hidden="true" />
              <div>
                <h3 className="text-base font-semibold text-zinc-900">
                  Catat Surat Jalan Suplai ke Toko Dimas Jaya
                </h3>
                <p className="text-xs text-zinc-500">
                  Dapat mengirim beberapa barang sekaligus dalam satu surat jalan beserta foto faktur.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleAddBatchRow}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-300 bg-white text-xs font-semibold text-zinc-800 hover:bg-zinc-50 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 text-[#14532D]" aria-hidden="true" />
              <span>Tambah Baris Barang</span>
            </button>
          </div>

          <div className="space-y-3">
            {batchItems.map((row, idx) => (
              <div
                key={row.rowId}
                className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end p-3 rounded-lg bg-zinc-50 border border-zinc-200"
              >
                <div className="sm:col-span-6">
                  <label
                    htmlFor={`sup-item-${row.rowId}`}
                    className="block text-xs text-zinc-600 mb-1"
                  >
                    Barang &amp; Kemasan #{idx + 1}
                  </label>
                  <select
                    id={`sup-item-${row.rowId}`}
                    value={row.key}
                    onChange={(e) =>
                      setBatchItems((prev) =>
                        prev.map((r) =>
                          r.rowId === row.rowId ? {...r, key: e.target.value} : r
                        )
                      )
                    }
                    className="w-full px-3 py-2 min-h-[38px] text-sm bg-white border border-zinc-300 rounded-lg"
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

                <div className="sm:col-span-2">
                  <label
                    htmlFor={`sup-qty-${row.rowId}`}
                    className="block text-xs text-zinc-600 mb-1"
                  >
                    Jumlah
                  </label>
                  <input
                    id={`sup-qty-${row.rowId}`}
                    type="number"
                    required
                    min={1}
                    value={row.quantity}
                    onChange={(e) =>
                      setBatchItems((prev) =>
                        prev.map((r) =>
                          r.rowId === row.rowId ? {...r, quantity: e.target.value} : r
                        )
                      )
                    }
                    className="w-full px-3 py-2 min-h-[38px] text-sm tabular-price bg-white border border-zinc-300 rounded-lg"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label
                    htmlFor={`sup-cost-${row.rowId}`}
                    className="block text-xs text-zinc-600 mb-1"
                  >
                    Harga Suplai / Unit (Rp)
                  </label>
                  <input
                    id={`sup-cost-${row.rowId}`}
                    type="number"
                    min={0}
                    value={row.unitCost}
                    onChange={(e) =>
                      setBatchItems((prev) =>
                        prev.map((r) =>
                          r.rowId === row.rowId ? {...r, unitCost: e.target.value} : r
                        )
                      )
                    }
                    placeholder="Contoh: 64000"
                    className="w-full px-3 py-2 min-h-[38px] text-sm tabular-price bg-white border border-zinc-300 rounded-lg"
                  />
                </div>

                <div className="sm:col-span-1 flex justify-end">
                  {batchItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveBatchRow(row.rowId)}
                      aria-label="Hapus baris barang"
                      className="p-2 text-zinc-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label htmlFor="sup-batch" className="block text-xs text-zinc-600 mb-1">
                Nomor Surat Jalan (Opsional)
              </label>
              <input
                id="sup-batch"
                type="text"
                value={batchCode}
                onChange={(e) => setBatchCode(e.target.value)}
                placeholder="Contoh: SJ-2026-01"
                className="w-full px-3 py-2 min-h-[40px] text-sm font-mono border border-zinc-300 rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="sup-term" className="block text-xs text-zinc-600 mb-1">
                Skema Pembayaran
              </label>
              <select
                id="sup-term"
                value={paymentTerm}
                onChange={(e) => setPaymentTerm(e.target.value as 'TUNAI' | 'TEMPO')}
                className="w-full px-3 py-2 min-h-[40px] text-sm bg-white border border-zinc-300 rounded-lg"
              >
                <option value="TUNAI">Bayar Tunai Saat Terima</option>
                <option value="TEMPO">Tempo / Hutang Jatuh Tempo</option>
              </select>
            </div>

            {paymentTerm === 'TEMPO' ? (
              <div>
                <label htmlFor="sup-due" className="block text-xs text-zinc-600 mb-1">
                  Jatuh Tempo Tagihan
                </label>
                <input
                  id="sup-due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 min-h-[40px] text-sm border border-zinc-300 rounded-lg"
                />
              </div>
            ) : (
              <div>
                <p className="block text-xs text-zinc-600 mb-1">Foto Faktur / Surat Jalan</p>
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg border border-zinc-300 bg-white text-xs font-medium text-zinc-800 hover:bg-zinc-50 cursor-pointer whitespace-nowrap">
                    <Camera className="w-3.5 h-3.5 text-[#14532D]" aria-hidden="true" />
                    <span>
                      {uploadingPhoto
                        ? 'Memproses...'
                        : invoicePhoto
                          ? 'Ganti Foto Faktur'
                          : 'Unggah Foto Faktur'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleUploadInvoicePhoto}
                      className="sr-only"
                    />
                  </label>
                  {invoicePhoto && (
                    <button
                      type="button"
                      onClick={() => setInvoicePhoto(undefined)}
                      aria-label="Hapus foto faktur"
                      className="p-1.5 text-zinc-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )}

            <div>
              <label htmlFor="sup-note" className="block text-xs text-zinc-600 mb-1">
                Keterangan Kiriman
              </label>
              <input
                id="sup-note"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Contoh: Antar pagi via mobil box"
                className="w-full px-3 py-2 min-h-[40px] text-sm border border-zinc-300 rounded-lg"
              />
            </div>
          </div>

          {paymentTerm === 'TEMPO' && (
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-lg border border-zinc-300 bg-white text-xs font-medium text-zinc-800 hover:bg-zinc-50 cursor-pointer whitespace-nowrap">
                <Camera className="w-3.5 h-3.5 text-[#14532D]" aria-hidden="true" />
                <span>
                  {uploadingPhoto
                    ? 'Memproses...'
                    : invoicePhoto
                      ? 'Ganti Foto Faktur Tempo'
                      : 'Unggah Foto Faktur / Surat Jalan (Opsional)'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleUploadInvoicePhoto}
                  className="sr-only"
                />
              </label>
              {invoicePhoto && (
                <button
                  type="button"
                  onClick={() => setInvoicePhoto(undefined)}
                  className="text-xs text-red-700 hover:underline cursor-pointer"
                >
                  Hapus Foto
                </button>
              )}
            </div>
          )}

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
              {submitting ? 'Mengirim Catatan...' : `Kirim Catatan Suplai (${batchItems.length} Item)`}
            </button>
          </div>
        </form>
      )}

      {/* Warehouse Verification Controls */}
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
            <span>Catat tagihan tunai ke pengeluaran buku kas saat diterima</span>
          </label>
        </div>
      )}

      {/* Inline Edit Pending Delivery Form */}
      {editingDelivery && (
        <form
          onSubmit={handleSaveEditDelivery}
          className="bg-zinc-50 border border-zinc-300 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-900">
              Edit Kiriman: {editingDelivery.productName} ({editingDelivery.variantLabel})
            </h3>
            <button
              type="button"
              onClick={() => setEditingDelivery(null)}
              className="text-xs text-zinc-600 hover:text-zinc-900 cursor-pointer"
            >
              Batal
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label htmlFor="ed-qty" className="block text-xs text-zinc-600 mb-1">
                Jumlah
              </label>
              <input
                id="ed-qty"
                type="number"
                required
                min={1}
                value={editQty}
                onChange={(e) => setEditQty(e.target.value)}
                className="w-full px-3 py-2 min-h-[38px] text-sm tabular-price bg-white border border-zinc-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="ed-cost" className="block text-xs text-zinc-600 mb-1">
                Harga / Unit (Rp)
              </label>
              <input
                id="ed-cost"
                type="number"
                min={0}
                value={editCost}
                onChange={(e) => setEditCost(e.target.value)}
                className="w-full px-3 py-2 min-h-[38px] text-sm tabular-price bg-white border border-zinc-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="ed-term" className="block text-xs text-zinc-600 mb-1">
                Skema Bayar
              </label>
              <select
                id="ed-term"
                value={editPaymentStatus}
                onChange={(e) => setEditPaymentStatus(e.target.value as 'TUNAI' | 'TEMPO')}
                className="w-full px-3 py-2 min-h-[38px] text-sm bg-white border border-zinc-300 rounded-lg"
              >
                <option value="TUNAI">TUNAI</option>
                <option value="TEMPO">TEMPO</option>
              </select>
            </div>
            <div>
              <label htmlFor="ed-due" className="block text-xs text-zinc-600 mb-1">
                Jatuh Tempo
              </label>
              <input
                id="ed-due"
                type="date"
                disabled={editPaymentStatus !== 'TEMPO'}
                value={editDueDate}
                onChange={(e) => setEditDueDate(e.target.value)}
                className="w-full px-3 py-2 min-h-[38px] text-sm bg-white border border-zinc-300 rounded-lg disabled:opacity-50"
              />
            </div>
            <div>
              <label htmlFor="ed-note" className="block text-xs text-zinc-600 mb-1">
                Keterangan
              </label>
              <input
                id="ed-note"
                type="text"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                className="w-full px-3 py-2 min-h-[38px] text-sm bg-white border border-zinc-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingEdit}
              className="px-4 py-2 rounded-lg bg-[#14532D] text-white text-xs font-semibold hover:bg-[#166534] cursor-pointer"
            >
              {savingEdit ? 'Menyimpan...' : 'Simpan Perubahan Kiriman'}
            </button>
          </div>
        </form>
      )}

      {/* Delivery Log Table */}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-zinc-900">
                {isSupplier
                  ? 'Riwayat Pengiriman Suplai Saya'
                  : 'Daftar Kiriman Masuk dari Pemasok'}
              </h3>
              <p className="text-xs text-zinc-500 tabular-price mt-0.5">
                Menampilkan {filteredDeliveries.length} dari {supplierDeliveries.length} kiriman
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <input
                type="search"
                value={deliverySearch}
                onChange={(e) => setDeliverySearch(e.target.value)}
                placeholder="Cari barang, pemasok, surat jalan..."
                aria-label="Cari daftar kiriman suplai"
                className="px-3 py-1.5 text-xs border border-zinc-300 rounded-lg w-52"
              />
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 bg-white text-xs font-semibold text-zinc-800 hover:bg-zinc-50 cursor-pointer whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5 text-zinc-700" aria-hidden="true" />
                <span>Cetak Ringkasan</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 print:hidden">
            {(
              [
                {id: 'ALL', label: `Semua (${supplierDeliveries.length})`},
                {id: 'PENDING', label: `Menunggu Gudang (${pendingDeliveries.length})`},
                {id: 'RECEIVED', label: `Diterima (${receivedDeliveries.length})`},
                {
                  id: 'TEMPO',
                  label: `Tempo Belum Lunas (${
                    supplierDeliveries.filter((d) => d.paymentStatus === 'TEMPO').length
                  })`,
                },
              ] as {id: 'ALL' | 'PENDING' | 'RECEIVED' | 'TEMPO'; label: string}[]
            ).map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setDeliveryStatusFilter(chip.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap ${
                  deliveryStatusFilter === chip.id
                    ? 'bg-[#14532D] text-white'
                    : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {tableError && (
            <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
              {tableError}
            </p>
          )}
        </div>

        {filteredDeliveries.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-500">
            {supplierDeliveries.length === 0
              ? 'Belum ada catatan kiriman suplai barang.'
              : 'Tidak ada kiriman suplai pada filter ini.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                  <th className="py-3 px-4 font-medium">Waktu &amp; Pemasok</th>
                  <th className="py-3 px-4 font-medium">Barang &amp; Faktur</th>
                  <th className="py-3 px-4 font-medium text-right">Qty</th>
                  <th className="py-3 px-4 font-medium text-right">Tagihan</th>
                  <th className="py-3 px-4 font-medium">Pembayaran</th>
                  <th className="py-3 px-4 font-medium">Status Gudang</th>
                  {(canReceive || canSubmit) && (
                    <th className="py-3 px-4 font-medium text-right">Aksi</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-xs">
                {filteredDeliveries.map((d) => {
                  const canManagePending = d.status === 'MENUNGGU_TERIMA' && canSubmit;
                  return (
                    <tr key={d.id} className="hover:bg-zinc-50">
                      <td className="py-3 px-4">
                        <p className="font-semibold text-zinc-900">{d.supplierName}</p>
                        <p className="text-zinc-500">{formatShortDate(d.createdAt)}</p>
                        {d.batchCode && (
                          <p className="font-mono text-[11px] text-[#14532D] mt-0.5">
                            {d.batchCode}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-start gap-2.5">
                          {d.invoicePhoto && (
                            <button
                              type="button"
                              onClick={() => setPreviewPhoto(d.invoicePhoto || null)}
                              className="w-10 h-10 rounded border border-zinc-300 overflow-hidden shrink-0 cursor-pointer"
                              aria-label="Lihat foto faktur surat jalan"
                            >
                              <img
                                src={d.invoicePhoto}
                                alt={`Faktur ${d.productName}`}
                                className="w-full h-full object-cover"
                              />
                            </button>
                          )}
                          <div>
                            <p className="font-medium text-zinc-900">{d.productName}</p>
                            <p className="text-zinc-500">
                              {d.variantLabel} · {d.note}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold tabular-price text-zinc-900">
                        +{d.quantity}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-price text-zinc-700">
                        {d.unitCost > 0 ? formatRupiah(d.unitCost * d.quantity) : '-'}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`font-semibold ${
                            d.paymentStatus === 'LUNAS'
                              ? 'text-[#14532D]'
                              : d.paymentStatus === 'TEMPO'
                                ? 'text-amber-700'
                                : 'text-zinc-700'
                          }`}
                        >
                          {d.paymentStatus || 'TUNAI'}
                        </span>
                        {d.dueDate && d.paymentStatus === 'TEMPO' && (
                          <p className="text-[11px] text-zinc-500">Tempo: {d.dueDate}</p>
                        )}
                      </td>
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
                      {(canReceive || canSubmit) && (
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex flex-wrap justify-end items-center gap-1.5">
                            {canReceive && d.status === 'MENUNGGU_TERIMA' && (
                              <button
                                type="button"
                                disabled={receivingId === d.id}
                                onClick={() => handleReceiveDelivery(d.id)}
                                className="px-3 py-1.5 rounded-lg bg-[#14532D] text-white text-xs font-semibold hover:bg-[#166534] disabled:opacity-60 cursor-pointer whitespace-nowrap"
                              >
                                {receivingId === d.id ? 'Memproses...' : 'Terima ke Stok'}
                              </button>
                            )}
                            {canManagePending && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingDelivery(d);
                                    setEditQty(String(d.quantity));
                                    setEditCost(String(d.unitCost));
                                    setEditPaymentStatus(
                                      d.paymentStatus === 'TEMPO' ? 'TEMPO' : 'TUNAI'
                                    );
                                    setEditDueDate(d.dueDate || '');
                                    setEditNote(d.note);
                                    setTableError('');
                                  }}
                                  title="Edit kiriman"
                                  className="p-1.5 rounded border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                {confirmCancelId === d.id ? (
                                  <button
                                    type="button"
                                    onClick={() => handleCancelDelivery(d.id)}
                                    className="px-2.5 py-1.5 rounded bg-red-600 text-white text-xs font-semibold hover:bg-red-700 cursor-pointer whitespace-nowrap"
                                  >
                                    Yakin Batal?
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmCancelId(d.id)}
                                    title="Batalkan kiriman"
                                    className="p-1.5 rounded text-zinc-400 hover:text-red-600 cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </>
                            )}
                            {canSubmit && (
                              <button
                                type="button"
                                onClick={() => handleDuplicateDeliveryToForm(d)}
                                title="Duplikat ke form surat jalan"
                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded border border-zinc-300 bg-white text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 cursor-pointer whitespace-nowrap print:hidden"
                              >
                                <Copy className="w-3 h-3" aria-hidden="true" />
                                <span>Duplikat</span>
                              </button>
                            )}
                            {d.status === 'DITERIMA' && (
                              <span className="text-zinc-400">Masuk stok</span>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {previewPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Pratinjau foto faktur surat jalan"
          onClick={() => setPreviewPhoto(null)}
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-xl w-full bg-white rounded-xl overflow-hidden shadow-xl"
          >
            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              aria-label="Tutup foto"
              className="absolute top-3 right-3 p-2 rounded-full bg-white/90 text-zinc-800 hover:bg-white shadow cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={previewPhoto}
              alt="Foto faktur surat jalan pemasok"
              className="w-full max-h-[80vh] object-contain bg-zinc-900"
            />
          </div>
        </div>
      )}
    </div>
  );
}

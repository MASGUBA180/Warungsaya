import {AlertCircle, CheckCircle2, Image as ImageIcon, MessageCircle, RotateCcw, X} from 'lucide-react';
import {FormEvent, useState} from 'react';
import {apiFetch} from '../../lib/apiClient';
import {
  COMPLAINT_CATEGORY_LABELS,
  COMPLAINT_RESOLUTION_LABELS,
  COMPLAINT_STATUS_LABELS,
  formatRupiah,
  formatShortDate,
} from '../../lib/storeData';
import type {
  ComplaintRecord,
  ComplaintStatus,
  DivisionRole,
  Order,
  Product,
} from '../../types/store';

interface ComplaintsTabProps {
  role: DivisionRole;
  complaints: ComplaintRecord[];
  products: Product[];
  orders?: Order[];
  authToken: string;
  onRefresh: () => Promise<void>;
}

function buildComplaintWhatsappLink(c: ComplaintRecord): string {
  const digits = (c.phone || '').replace(/\D+/g, '');
  if (!digits) return '';
  const waPhone = digits.startsWith('0')
    ? `62${digits.slice(1)}`
    : digits.startsWith('62')
      ? digits
      : `62${digits}`;
  const msg = `Halo ${c.customerName}, kami dari *Toko Dimas Jaya* menindaklanjuti laporan komplain *${c.complaintNumber}* untuk pesanan *#${c.orderNumber}*. `;
  return `https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`;
}

export function ComplaintsTab({
  role,
  complaints,
  products,
  orders = [],
  authToken,
  onRefresh,
}: ComplaintsTabProps) {
  const isLeadership = role === 'PEMILIK' || role === 'DIREKTUR';
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'OPEN' | 'DONE'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [statusDraft, setStatusDraft] = useState<ComplaintStatus>('DIPROSES');
  const [staffResponse, setStaffResponse] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [returnItemKey, setReturnItemKey] = useState('');
  const [returnQty, setReturnQty] = useState('1');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  const openCount = complaints.filter(
    (c) => c.status === 'BARU' || c.status === 'DIPROSES'
  ).length;
  const approvedCount = complaints.filter(
    (c) => c.status === 'DISETUJUI' || c.status === 'SELESAI'
  ).length;
  const newCount = complaints.filter((c) => c.status === 'BARU').length;

  const searchNorm = searchQuery.trim().toLowerCase();
  const filtered = complaints.filter((c) => {
    if (filterStatus === 'OPEN' && c.status !== 'BARU' && c.status !== 'DIPROSES') return false;
    if (
      filterStatus === 'DONE' &&
      c.status !== 'DISETUJUI' &&
      c.status !== 'SELESAI' &&
      c.status !== 'DITOLAK'
    ) {
      return false;
    }
    if (
      searchNorm &&
      !c.complaintNumber.toLowerCase().includes(searchNorm) &&
      !c.orderNumber.toLowerCase().includes(searchNorm) &&
      !c.customerName.toLowerCase().includes(searchNorm) &&
      !c.phone.toLowerCase().includes(searchNorm) &&
      !c.description.toLowerCase().includes(searchNorm)
    ) {
      return false;
    }
    return true;
  });

  const variantChoices = products.flatMap((p) =>
    p.variants.map((v) => ({
      key: `${p.id}__${v.id}`,
      productId: p.id,
      variantId: v.id,
      label: `${p.name} — ${v.label}`,
    }))
  );

  const openEditor = (complaint: ComplaintRecord) => {
    setEditingId(complaint.id);
    setStatusDraft(
      isLeadership
        ? complaint.status === 'BARU'
          ? 'DISETUJUI'
          : complaint.status
        : 'DIPROSES'
    );
    setStaffResponse(complaint.staffResponse || '');
    setRefundAmount(complaint.refundAmount ? String(complaint.refundAmount) : '');
    setReturnItemKey('');
    setReturnQty('1');
    setErrorMsg('');
  };

  const handleSave = async (e: FormEvent, complaint: ComplaintRecord) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg('');
    try {
      const [retProductId, retVariantId] = returnItemKey ? returnItemKey.split('__') : ['', ''];
      const res = await apiFetch<{complaint?: ComplaintRecord; error?: string}>(
        `/api/ops/complaints/${complaint.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            status: statusDraft,
            staffResponse: staffResponse.trim(),
            refundAmount: refundAmount ? Number(refundAmount) : undefined,
            returnProductId: retProductId || undefined,
            returnVariantId: retVariantId || undefined,
            returnQty: retProductId && retVariantId ? Number(returnQty || 0) : undefined,
          }),
        }
      );
      if (!res.ok) {
        setErrorMsg(res.data.error || 'Gagal menyimpan pembaruan komplain.');
        return;
      }
      setEditingId(null);
      await onRefresh();
    } catch {
      setErrorMsg('Gagal menghubungi server toko.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-zinc-200 rounded-xl p-5">
          <p className="text-xs text-zinc-500">Laporan Baru Masuk</p>
          <p className="text-2xl font-bold text-amber-700 tabular-price mt-1">{newCount}</p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-xl p-5">
          <p className="text-xs text-zinc-500">Perlu Tindak Lanjut</p>
          <p className="text-2xl font-bold text-zinc-900 tabular-price mt-1">{openCount}</p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-xl p-5">
          <p className="text-xs text-zinc-500">Disetujui / Selesai</p>
          <p className="text-2xl font-bold text-[#14532D] tabular-price mt-1">{approvedCount}</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-zinc-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-zinc-900">
            Antrean Komplain &amp; Retur Pelanggan
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            {isLeadership
              ? 'Pemilik & Direktur berwenang menyetujui refund dana, penggantian barang, atau menolak klaim.'
              : 'Kasir & Gudang dapat mengecek kondisi barang, mencatat tanggapan awal, dan menandai Sedang Dicek.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari kode komplain, pesanan, nama..."
            aria-label="Cari komplain pelanggan"
            className="px-3 py-1.5 text-xs border border-zinc-300 rounded-lg w-56"
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilterStatus('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap ${
                filterStatus === 'ALL'
                  ? 'bg-[#14532D] text-white'
                  : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              Semua ({complaints.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('OPEN')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap ${
                filterStatus === 'OPEN'
                  ? 'bg-amber-700 text-white'
                  : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              Aktif ({openCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('DONE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap ${
                filterStatus === 'DONE'
                  ? 'bg-zinc-900 text-white'
                  : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              Selesai ({complaints.length - openCount})
            </button>
          </div>
        </div>
      </div>

      {/* Complaints List */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-10 text-center space-y-2">
          <CheckCircle2 className="w-8 h-8 text-[#14532D] mx-auto" aria-hidden="true" />
          <p className="text-sm font-semibold text-zinc-900">Belum ada laporan komplain pada filter ini</p>
          <p className="text-xs text-zinc-500">
            Pengajuan retur atau komplain dari pelanggan akan langsung muncul di halaman ini.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((c) => {
            const isEditing = editingId === c.id;
            const matchedOrder = orders.find(
              (o) => o.id === c.orderId || o.orderNumber === c.orderNumber
            );
            const waLink = buildComplaintWhatsappLink(c);
            return (
              <div
                key={c.id}
                className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-bold text-[#14532D]">
                        {c.complaintNumber}
                      </span>
                      <span className="text-zinc-400">·</span>
                      <span className="font-mono text-zinc-700">Pesanan #{c.orderNumber}</span>
                      <span className="text-zinc-400">·</span>
                      <span className="text-zinc-500">{formatShortDate(c.createdAt)}</span>
                    </div>
                    <h4 className="text-sm font-bold text-zinc-900 mt-1">
                      {c.customerName} ({c.phone})
                    </h4>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {waLink && (
                      <a
                        href={waLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-emerald-200 bg-emerald-50 text-xs font-semibold text-[#14532D] hover:bg-emerald-100 whitespace-nowrap"
                      >
                        <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Hubungi Pelanggan via WA</span>
                      </a>
                    )}
                    <span
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${
                        c.status === 'DISETUJUI' || c.status === 'SELESAI'
                          ? 'bg-emerald-50 border-emerald-200 text-[#14532D]'
                          : c.status === 'DITOLAK'
                            ? 'bg-red-50 border-red-200 text-red-700'
                            : 'bg-amber-50 border-amber-200 text-amber-800'
                      }`}
                    >
                      {COMPLAINT_STATUS_LABELS[c.status]}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-zinc-50 border border-zinc-200 rounded-lg p-3.5 text-xs">
                  <div>
                    <p className="text-zinc-500">Kategori Masalah</p>
                    <p className="font-semibold text-zinc-900 mt-0.5">
                      {COMPLAINT_CATEGORY_LABELS[c.category]}
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Solusi Diminta Pembeli</p>
                    <p className="font-semibold text-zinc-900 mt-0.5">
                      {COMPLAINT_RESOLUTION_LABELS[c.requestedResolution]}
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Nominal Refund / Penanganan</p>
                    <p className="font-semibold text-zinc-900 tabular-price mt-0.5">
                      {c.refundAmount ? formatRupiah(c.refundAmount) : '-'}
                      {c.handledBy ? ` · Oleh ${c.handledBy}` : ''}
                    </p>
                  </div>
                </div>

                {matchedOrder && (
                  <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-zinc-600">
                      <span className="font-semibold text-zinc-900">
                        Rincian Barang Pesanan #{matchedOrder.orderNumber}
                      </span>
                      <span className="font-mono font-semibold text-zinc-900 tabular-price">
                        {matchedOrder.paymentMethod} · Total {formatRupiah(matchedOrder.total)}
                      </span>
                    </div>
                    <div className="divide-y divide-zinc-100">
                      {matchedOrder.items.map((item, idx) => (
                        <div key={idx} className="py-1 flex justify-between gap-2 text-zinc-700">
                          <span>
                            {item.productName} ({item.variantLabel}) x{item.quantity}
                          </span>
                          <span className="font-mono tabular-price">
                            {formatRupiah(item.unitPrice * item.quantity)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-xs text-zinc-800 leading-relaxed">
                  <span className="font-semibold text-zinc-600">Keluhan pelanggan: </span>
                  {c.description}
                </p>

                {c.evidencePhoto && (
                  <div className="flex items-center gap-3 p-2.5 rounded-lg border border-zinc-200 bg-zinc-50">
                    <button
                      type="button"
                      onClick={() => setPreviewPhoto(c.evidencePhoto || null)}
                      className="w-16 h-16 rounded-md overflow-hidden border border-zinc-300 shrink-0 cursor-pointer hover:opacity-90"
                      aria-label="Perbesar foto bukti komplain"
                    >
                      <img
                        src={c.evidencePhoto}
                        alt={`Bukti ${c.complaintNumber}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                    <div className="text-xs">
                      <p className="font-semibold text-zinc-800 flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5 text-[#14532D]" aria-hidden="true" />
                        <span>Foto Bukti Kondisi Barang dari Pelanggan</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => setPreviewPhoto(c.evidencePhoto || null)}
                        className="text-[11px] font-medium text-[#14532D] hover:underline mt-0.5 cursor-pointer"
                      >
                        Klik untuk perbesar foto
                      </button>
                    </div>
                  </div>
                )}

                {c.staffResponse && !isEditing && (
                  <p className="text-xs text-[#14532D] bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                    <span className="font-semibold">Tanggapan Toko: </span>
                    {c.staffResponse}
                  </p>
                )}

                {isEditing ? (
                  <form
                    onSubmit={(e) => handleSave(e, c)}
                    className="bg-zinc-50 border border-zinc-300 rounded-xl p-4 space-y-3"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor={`cmp-status-${c.id}`}
                          className="block text-xs text-zinc-600 mb-1"
                        >
                          Status Penanganan
                        </label>
                        <select
                          id={`cmp-status-${c.id}`}
                          value={statusDraft}
                          onChange={(e) => setStatusDraft(e.target.value as ComplaintStatus)}
                          className="w-full px-3 py-2 min-h-[38px] text-xs bg-white border border-zinc-300 rounded-lg"
                        >
                          <option value="DIPROSES">Sedang Dicek Toko</option>
                          {isLeadership && (
                            <>
                              <option value="DISETUJUI">Disetujui (Ganti / Refund)</option>
                              <option value="SELESAI">Selesai Ditangani</option>
                              <option value="DITOLAK">Tidak Disetujui</option>
                            </>
                          )}
                          {!isLeadership && (
                            <option value="SELESAI">Selesai (Tukar Fisik / Terkonfirmasi)</option>
                          )}
                        </select>
                      </div>

                      {isLeadership &&
                        (c.requestedResolution === 'REFUND_DANA' ||
                          c.requestedResolution === 'POTONG_TAGIHAN') && (
                          <div>
                            <label
                              htmlFor={`cmp-refund-${c.id}`}
                              className="block text-xs text-zinc-600 mb-1"
                            >
                              {c.requestedResolution === 'POTONG_TAGIHAN'
                                ? 'Nominal Potong Kasbon (Rp — potong saldo bon otomatis)'
                                : 'Nominal Refund Dana (Rp — masuk buku kas)'}
                            </label>
                            <input
                              id={`cmp-refund-${c.id}`}
                              type="number"
                              min={0}
                              value={refundAmount}
                              onChange={(e) => setRefundAmount(e.target.value)}
                              placeholder="Contoh: 17500"
                              className="w-full px-3 py-2 min-h-[38px] text-xs tabular-price bg-white border border-zinc-300 rounded-lg"
                            />
                          </div>
                        )}
                    </div>

                    <div>
                      <label
                        htmlFor={`cmp-resp-${c.id}`}
                        className="block text-xs text-zinc-600 mb-1"
                      >
                        Tanggapan Resmi Toko (Ditampilkan ke Pelanggan)
                      </label>
                      <textarea
                        id={`cmp-resp-${c.id}`}
                        rows={2}
                        required
                        value={staffResponse}
                        onChange={(e) => setStaffResponse(e.target.value)}
                        placeholder="Contoh: Barang pengganti siap dikirim bersama kurir / dana dikembalikan via kas toko."
                        className="w-full px-3 py-2 text-xs bg-white border border-zinc-300 rounded-lg"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                      <div className="sm:col-span-2">
                        <label
                          htmlFor={`cmp-ret-${c.id}`}
                          className="block text-xs text-zinc-600 mb-1"
                        >
                          Kembalikan Stok Barang Retur Layak Jual (Opsional)
                        </label>
                        <select
                          id={`cmp-ret-${c.id}`}
                          value={returnItemKey}
                          onChange={(e) => setReturnItemKey(e.target.value)}
                          className="w-full px-3 py-2 min-h-[38px] text-xs bg-white border border-zinc-300 rounded-lg"
                        >
                          <option value="">-- Tidak ada barang masuk stok --</option>
                          {variantChoices.map((vc) => (
                            <option key={vc.key} value={vc.key}>
                              {vc.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label
                          htmlFor={`cmp-ret-qty-${c.id}`}
                          className="block text-xs text-zinc-600 mb-1"
                        >
                          Jumlah Retur Masuk
                        </label>
                        <input
                          id={`cmp-ret-qty-${c.id}`}
                          type="number"
                          min={1}
                          disabled={!returnItemKey}
                          value={returnQty}
                          onChange={(e) => setReturnQty(e.target.value)}
                          className="w-full px-3 py-2 min-h-[38px] text-xs tabular-price bg-white border border-zinc-300 rounded-lg disabled:opacity-50"
                        />
                      </div>
                    </div>

                    {errorMsg && (
                      <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>{errorMsg}</span>
                      </p>
                    )}

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="px-3 py-2 rounded-lg border border-zinc-300 bg-white text-xs font-medium text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="px-4 py-2 rounded-lg bg-[#14532D] text-white text-xs font-semibold hover:bg-[#166534] disabled:opacity-60 cursor-pointer whitespace-nowrap"
                      >
                        {saving ? 'Menyimpan...' : 'Simpan Tindak Lanjut'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => openEditor(c)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-zinc-300 bg-white text-xs font-semibold text-zinc-800 hover:bg-zinc-50 cursor-pointer whitespace-nowrap"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-[#14532D]" aria-hidden="true" />
                      <span>Tindak Lanjuti Komplain</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {previewPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Pratinjau foto bukti komplain"
          onClick={() => setPreviewPhoto(null)}
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-2xl w-full bg-white rounded-xl overflow-hidden shadow-xl"
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
              alt="Bukti komplain pelanggan"
              className="w-full max-h-[80vh] object-contain bg-zinc-900"
            />
          </div>
        </div>
      )}
    </div>
  );
}

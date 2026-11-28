import {Download, MessageCircle, Plus, Trash2} from 'lucide-react';
import {FormEvent, useState} from 'react';
import {apiFetch} from '../../lib/apiClient';
import {formatRupiah, formatShortDate} from '../../lib/storeData';
import type {
  DivisionRole,
  KasbonRecord,
  LedgerEntry,
  SupplierDelivery,
} from '../../types/store';

interface FinanceTabProps {
  role: DivisionRole;
  ledger: LedgerEntry[];
  kasbon: KasbonRecord[];
  supplierDeliveries?: SupplierDelivery[];
  authToken: string;
  onRefresh: () => Promise<void>;
}

function getDueStatus(dueDate?: string): 'OVERDUE' | 'SOON' | 'OK' | null {
  if (!dueDate) return null;
  const dueTs = new Date(`${dueDate}T23:59:59`).getTime();
  if (!Number.isFinite(dueTs)) return null;
  const diffDays = (dueTs - Date.now()) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return 'OVERDUE';
  if (diffDays <= 3) return 'SOON';
  return 'OK';
}

function formatWaPhone(raw: string): string {
  const digits = raw.replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('62')) return digits;
  return `62${digits}`;
}

export function FinanceTab({
  role,
  ledger,
  kasbon,
  supplierDeliveries = [],
  authToken,
  onRefresh,
}: FinanceTabProps) {
  const [entryType, setEntryType] = useState<'MASUK' | 'KELUAR'>('KELUAR');
  const [category, setCategory] = useState('Kulakan Barang');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('TUNAI');
  const [ledgerError, setLedgerError] = useState('');
  const [savingLedger, setSavingLedger] = useState(false);
  const [payingKasbonId, setPayingKasbonId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payingSupplierId, setPayingSupplierId] = useState<string | null>(null);
  const [supplierPayMethods, setSupplierPayMethods] = useState<
    Record<string, 'TRANSFER' | 'TUNAI'>
  >({});

  // Ledger filtering & deletion
  const [filterType, setFilterType] = useState<'ALL' | 'MASUK' | 'KELUAR'>('ALL');
  const [filterMethod, setFilterMethod] = useState<string>('ALL');
  const [searchText, setSearchText] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [confirmDeleteLedgerId, setConfirmDeleteLedgerId] = useState<string | null>(null);
  const [deletingLedgerId, setDeletingLedgerId] = useState<string | null>(null);

  // Kasbon filtering & export
  const [kasbonFilter, setKasbonFilter] = useState<'ALL' | 'UNPAID' | 'OVERDUE' | 'PAID'>('ALL');
  const [kasbonSearch, setKasbonSearch] = useState('');

  // Manual Kasbon entry state
  const [showAddKasbon, setShowAddKasbon] = useState(false);
  const [kasbonName, setKasbonName] = useState('');
  const [kasbonPhone, setKasbonPhone] = useState('');
  const [kasbonAddress, setKasbonAddress] = useState('');
  const [kasbonAmount, setKasbonAmount] = useState('');
  const [kasbonDueDate, setKasbonDueDate] = useState('');
  const [kasbonNote, setKasbonNote] = useState('');
  const [kasbonError, setKasbonError] = useState('');
  const [savingKasbon, setSavingKasbon] = useState(false);

  const canWriteLedger = role === 'PEMILIK' || role === 'DIREKTUR' || role === 'KEUANGAN';
  const isCashierKasbonMode = role === 'KASIR';

  const dateFilteredLedger = ledger.filter((entry) => {
    const entryDate = entry.createdAt.slice(0, 10);
    if (dateFrom && entryDate < dateFrom) return false;
    if (dateTo && entryDate > dateTo) return false;
    return true;
  });

  const totalMasuk = dateFilteredLedger
    .filter((l) => l.type === 'MASUK')
    .reduce((sum, l) => sum + l.amount, 0);
  const totalKeluar = dateFilteredLedger
    .filter((l) => l.type === 'KELUAR')
    .reduce((sum, l) => sum + l.amount, 0);
  const masukTunai = dateFilteredLedger
    .filter((l) => l.type === 'MASUK' && l.paymentMethod !== 'QRIS' && l.paymentMethod !== 'TRANSFER')
    .reduce((sum, l) => sum + l.amount, 0);
  const masukNonTunai = dateFilteredLedger
    .filter((l) => l.type === 'MASUK' && (l.paymentMethod === 'QRIS' || l.paymentMethod === 'TRANSFER'))
    .reduce((sum, l) => sum + l.amount, 0);

  // Structured P&L Breakdown for the active period
  const penjualanSales = dateFilteredLedger
    .filter((l) => l.type === 'MASUK' && l.category.startsWith('Penjualan'))
    .reduce((sum, l) => sum + l.amount, 0);
  const pelunasanKasbon = dateFilteredLedger
    .filter((l) => l.type === 'MASUK' && l.category === 'Pelunasan Kasbon')
    .reduce((sum, l) => sum + l.amount, 0);
  const pemasukanLain = Math.max(0, totalMasuk - penjualanSales - pelunasanKasbon);

  const bebanKulakan = dateFilteredLedger
    .filter(
      (l) =>
        l.type === 'KELUAR' &&
        (l.category === 'Kulakan Barang' ||
          l.category === 'Kulakan Pemasok' ||
          l.category === 'Bayar Hutang Pemasok')
    )
    .reduce((sum, l) => sum + l.amount, 0);
  const bebanOperasionalRefund = Math.max(0, totalKeluar - bebanKulakan);

  const tempoPayables = supplierDeliveries.filter(
    (d) => d.paymentStatus === 'TEMPO' && d.unitCost > 0
  );
  const totalPiutangKasbon = kasbon.reduce(
    (sum, k) => sum + Math.max(0, k.amountDue - k.totalPaid),
    0
  );
  const totalHutangTempo = tempoPayables.reduce(
    (sum, d) => sum + d.unitCost * d.quantity,
    0
  );

  const filteredLedger = dateFilteredLedger.filter((entry) => {
    if (filterType !== 'ALL' && entry.type !== filterType) return false;
    if (filterMethod === 'TUNAI' && entry.paymentMethod !== 'TUNAI') return false;
    if (
      filterMethod === 'NON_TUNAI' &&
      entry.paymentMethod !== 'QRIS' &&
      entry.paymentMethod !== 'TRANSFER'
    ) {
      return false;
    }
    const q = searchText.trim().toLowerCase();
    if (
      q &&
      !entry.category.toLowerCase().includes(q) &&
      !entry.description.toLowerCase().includes(q) &&
      !entry.actorName.toLowerCase().includes(q)
    ) {
      return false;
    }
    return true;
  });

  const kasbonSearchNorm = kasbonSearch.trim().toLowerCase();
  const filteredKasbon = kasbon.filter((k) => {
    const remaining = Math.max(0, k.amountDue - k.totalPaid);
    const dueState = remaining > 0 ? getDueStatus(k.dueDate) : null;
    if (kasbonFilter === 'UNPAID' && remaining <= 0) return false;
    if (kasbonFilter === 'OVERDUE' && !(remaining > 0 && dueState === 'OVERDUE')) return false;
    if (kasbonFilter === 'PAID' && remaining > 0) return false;
    if (
      kasbonSearchNorm &&
      !k.customerName.toLowerCase().includes(kasbonSearchNorm) &&
      !k.address.toLowerCase().includes(kasbonSearchNorm) &&
      !(k.phone || '').toLowerCase().includes(kasbonSearchNorm) &&
      !k.note.toLowerCase().includes(kasbonSearchNorm)
    ) {
      return false;
    }
    return true;
  });

  const handleExportKasbonCsv = () => {
    const header = ['Pelanggan', 'HP', 'Alamat', 'Total Bon', 'Terbayar', 'Sisa', 'Jatuh Tempo', 'Catatan'];
    const rows = filteredKasbon.map((k) => [
      k.customerName.replace(/"/g, '""'),
      (k.phone || '').replace(/"/g, '""'),
      k.address.replace(/"/g, '""'),
      String(k.amountDue),
      String(k.totalPaid),
      String(Math.max(0, k.amountDue - k.totalPaid)),
      k.dueDate || '',
      k.note.replace(/"/g, '""'),
    ]);
    const csvContent = [
      header.join(','),
      ...rows.map((r) => r.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');
    const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `daftar-kasbon-toko-dimas-jaya-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const header = ['Waktu', 'Jenis', 'Kategori', 'Keterangan', 'Metode', 'Nominal', 'Petugas'];
    const rows = filteredLedger.map((e) => [
      e.createdAt,
      e.type,
      e.category,
      e.description.replace(/"/g, '""'),
      e.paymentMethod,
      String(e.amount),
      e.actorName.replace(/"/g, '""'),
    ]);
    const csvContent = [
      header.join(','),
      ...rows.map((r) => r.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');
    const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `buku-kas-toko-dimas-jaya-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleAddLedger = async (e: FormEvent) => {
    e.preventDefault();
    setLedgerError('');
    setSavingLedger(true);
    try {
      const res = await apiFetch<{error?: string}>('/api/ops/ledger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          type: entryType,
          category,
          description: description.trim(),
          amount: Number(amount),
          paymentMethod,
        }),
      });
      if (!res.ok) {
        setLedgerError(res.data.error || 'Gagal mencatat buku kas.');
        return;
      }
      setDescription('');
      setAmount('');
      await onRefresh();
    } catch {
      setLedgerError('Gagal menghubungi server.');
    } finally {
      setSavingLedger(false);
    }
  };

  const handleAddKasbon = async (e: FormEvent) => {
    e.preventDefault();
    setKasbonError('');
    setSavingKasbon(true);
    try {
      const res = await apiFetch<{error?: string}>('/api/ops/kasbon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          customerName: kasbonName.trim(),
          phone: kasbonPhone.trim(),
          address: kasbonAddress.trim(),
          amountDue: Number(kasbonAmount),
          dueDate: kasbonDueDate.trim() || undefined,
          note: kasbonNote.trim(),
        }),
      });
      if (!res.ok) {
        setKasbonError(res.data.error || 'Gagal mencatat kasbon.');
        return;
      }
      setKasbonName('');
      setKasbonPhone('');
      setKasbonAddress('');
      setKasbonAmount('');
      setKasbonDueDate('');
      setKasbonNote('');
      setShowAddKasbon(false);
      await onRefresh();
    } catch {
      setKasbonError('Gagal menghubungi server.');
    } finally {
      setSavingKasbon(false);
    }
  };

  const handlePayKasbon = async (record: KasbonRecord) => {
    const remaining = Math.max(0, record.amountDue - record.totalPaid);
    const nominal = Number(payAmount || remaining);
    if (!Number.isFinite(nominal) || nominal <= 0) return;

    const res = await apiFetch(`/api/ops/kasbon/${record.id}/pay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({amount: Math.min(nominal, remaining)}),
    });
    if (res.ok) {
      setPayingKasbonId(null);
      setPayAmount('');
      await onRefresh();
    }
  };

  const handlePaySupplier = async (deliveryId: string) => {
    setPayingSupplierId(deliveryId);
    const chosenMethod = supplierPayMethods[deliveryId] || 'TRANSFER';
    try {
      const res = await apiFetch(`/api/ops/supplier/deliveries/${deliveryId}/pay`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({paymentMethod: chosenMethod}),
      });
      if (res.ok) {
        await onRefresh();
      }
    } finally {
      setPayingSupplierId(null);
    }
  };

  const handleDeleteLedger = async (entryId: string) => {
    setDeletingLedgerId(entryId);
    setLedgerError('');
    try {
      const res = await apiFetch<{error?: string}>(`/api/ops/ledger/${entryId}`, {
        method: 'DELETE',
        headers: {Authorization: `Bearer ${authToken}`},
      });
      if (!res.ok) {
        setLedgerError(res.data.error || 'Gagal menghapus catatan kas.');
        return;
      }
      setConfirmDeleteLedgerId(null);
      await onRefresh();
    } finally {
      setDeletingLedgerId(null);
    }
  };

  return (
    <div className="space-y-8">
      {isCashierKasbonMode ? (
        <div className="bg-zinc-100 border border-zinc-200 rounded-xl px-5 py-3.5 text-xs text-zinc-700">
          Mode Meja Kasir: khusus pengecekan, pencatatan, dan cicilan kasbon pelanggan. Buku kas
          harian dikelola Divisi Keuangan, Direktur &amp; Pemilik.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-zinc-200 rounded-xl p-5">
              <p className="text-xs text-zinc-500">
                Pemasukan {dateFrom || dateTo ? '(Periode Terpilih)' : 'Tercatat'}
              </p>
              <p className="text-xl font-bold text-[#14532D] tabular-price mt-1">
                {formatRupiah(totalMasuk)}
              </p>
            </div>
            <div className="bg-white border border-zinc-200 rounded-xl p-5">
              <p className="text-xs text-zinc-500">Pemasukan Tunai vs QRIS/Transfer</p>
              <p className="text-sm font-bold text-zinc-900 tabular-price mt-1.5">
                Tunai {formatRupiah(masukTunai)}
              </p>
              <p className="text-xs font-semibold text-[#14532D] tabular-price">
                QRIS / Bank {formatRupiah(masukNonTunai)}
              </p>
            </div>
            <div className="bg-white border border-zinc-200 rounded-xl p-5">
              <p className="text-xs text-zinc-500">
                Pengeluaran {dateFrom || dateTo ? '(Periode Terpilih)' : 'Tercatat'}
              </p>
              <p className="text-xl font-bold text-zinc-900 tabular-price mt-1">
                {formatRupiah(totalKeluar)}
              </p>
            </div>
            <div className="bg-white border border-zinc-200 rounded-xl p-5">
              <p className="text-xs text-zinc-500">Selisih Arus Kas</p>
              <p className="text-xl font-bold text-zinc-900 tabular-price mt-1">
                {formatRupiah(totalMasuk - totalKeluar)}
              </p>
            </div>
          </div>

          {/* Ringkasan Laba Rugi (P&L) */}
          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-zinc-100">
              <div>
                <h3 className="text-sm font-semibold text-zinc-900">
                  Ringkasan Laba Rugi &amp; Neraca Kas
                </h3>
                <p className="text-xs text-zinc-500">
                  {dateFrom || dateTo
                    ? `Periode: ${dateFrom || 'Awal'} s/d ${dateTo || 'Sekarang'}`
                    : 'Akumulasi seluruh buku kas tercatat'}
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-zinc-600">
                  Piutang Kasbon:{' '}
                  <strong className="font-mono text-zinc-900 tabular-price">
                    {formatRupiah(totalPiutangKasbon)}
                  </strong>
                </span>
                <span className="text-zinc-600">
                  Hutang Tempo:{' '}
                  <strong className="font-mono text-amber-800 tabular-price">
                    {formatRupiah(totalHutangTempo)}
                  </strong>
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-3 text-xs">
              <div className="space-y-2">
                <p className="font-semibold text-zinc-800">Arus Kas Masuk</p>
                <div className="flex justify-between text-zinc-600">
                  <span>Penjualan Toko, COD &amp; QRIS</span>
                  <span className="font-mono tabular-price text-zinc-900">
                    {formatRupiah(penjualanSales)}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-600">
                  <span>Pelunasan Kasbon Warga</span>
                  <span className="font-mono tabular-price text-zinc-900">
                    {formatRupiah(pelunasanKasbon)}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-600">
                  <span>Modal &amp; Pemasukan Lain</span>
                  <span className="font-mono tabular-price text-zinc-900">
                    {formatRupiah(pemasukanLain)}
                  </span>
                </div>
                <div className="flex justify-between font-semibold text-[#14532D] pt-1 border-t border-zinc-100">
                  <span>Subtotal Pemasukan</span>
                  <span className="font-mono tabular-price">{formatRupiah(totalMasuk)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="font-semibold text-zinc-800">Arus Kas Keluar &amp; Beban</p>
                <div className="flex justify-between text-zinc-600">
                  <span>Kulakan Stok &amp; Bayar Pemasok</span>
                  <span className="font-mono tabular-price text-zinc-900">
                    {formatRupiah(bebanKulakan)}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-600">
                  <span>Operasional Toko, Listrik, Bensin &amp; Refund</span>
                  <span className="font-mono tabular-price text-zinc-900">
                    {formatRupiah(bebanOperasionalRefund)}
                  </span>
                </div>
                <div className="flex justify-between font-semibold text-zinc-900 pt-1 border-t border-zinc-100">
                  <span>Subtotal Pengeluaran</span>
                  <span className="font-mono tabular-price">{formatRupiah(totalKeluar)}</span>
                </div>
                <div className="flex justify-between font-bold text-zinc-900 pt-1 border-t border-zinc-200">
                  <span>Arus Kas Bersih Periode</span>
                  <span
                    className={`font-mono tabular-price ${
                      totalMasuk - totalKeluar >= 0 ? 'text-[#14532D]' : 'text-red-700'
                    }`}
                  >
                    {formatRupiah(totalMasuk - totalKeluar)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {canWriteLedger && (
        <form
          onSubmit={handleAddLedger}
          className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4"
        >
          <h3 className="text-base font-semibold text-zinc-900">
            Catat Pemasukan / Pengeluaran Kas
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label htmlFor="ldg-type" className="block text-xs text-zinc-600 mb-1">
                Jenis Kas
              </label>
              <select
                id="ldg-type"
                value={entryType}
                onChange={(e) => setEntryType(e.target.value as 'MASUK' | 'KELUAR')}
                className="w-full px-3 py-2 min-h-[40px] text-sm bg-white border border-zinc-300 rounded-lg"
              >
                <option value="KELUAR">Kas Keluar</option>
                <option value="MASUK">Kas Masuk</option>
              </select>
            </div>

            <div>
              <label htmlFor="ldg-cat" className="block text-xs text-zinc-600 mb-1">
                Kategori
              </label>
              <select
                id="ldg-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 min-h-[40px] text-sm bg-white border border-zinc-300 rounded-lg"
              >
                <option value="Kulakan Barang">Kulakan Barang</option>
                <option value="Operasional Toko">Operasional Toko</option>
                <option value="Listrik & Air">Listrik &amp; Air</option>
                <option value="Bensin Kurir">Bensin Kurir</option>
                <option value="Modal Tambahan">Modal Tambahan</option>
              </select>
            </div>

            <div className="lg:col-span-2">
              <label htmlFor="ldg-desc" className="block text-xs text-zinc-600 mb-1">
                Keterangan
              </label>
              <input
                id="ldg-desc"
                type="text"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Contoh: Beli stok minyak goreng 5 dus"
                className="w-full px-3 py-2 min-h-[40px] text-sm border border-zinc-300 rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="ldg-amt" className="block text-xs text-zinc-600 mb-1">
                Nominal (Rp)
              </label>
              <input
                id="ldg-amt"
                type="number"
                required
                min={500}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="150000"
                className="w-full px-3 py-2 min-h-[40px] text-sm tabular-price border border-zinc-300 rounded-lg"
              />
            </div>
          </div>

          {ledgerError && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
              {ledgerError}
            </p>
          )}

          <div className="flex items-center justify-between gap-4">
            <select
              aria-label="Metode pembayaran kas"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="px-3 py-2 min-h-[38px] text-xs bg-white border border-zinc-300 rounded-lg"
            >
              <option value="TUNAI">Kas Tunai Laci</option>
              <option value="TRANSFER">Transfer Bank / QRIS</option>
            </select>

            <button
              type="submit"
              disabled={savingLedger}
              className="px-4 py-2 min-h-[40px] rounded-lg bg-[#14532D] text-white text-xs font-semibold hover:bg-[#166534] cursor-pointer"
            >
              {savingLedger ? 'Menyimpan...' : 'Simpan Catatan Kas'}
            </button>
          </div>
        </form>
      )}

      {/* Supplier Payables (TEMPO) */}
      {!isCashierKasbonMode && tempoPayables.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-200">
            <h3 className="text-base font-semibold text-zinc-900">
              Tagihan Hutang Pemasok (Tempo)
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Tagihan suplai dengan skema Tempo yang perlu dilunasi Divisi Keuangan / Pimpinan.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                  <th className="py-3 px-4 font-medium">Pemasok</th>
                  <th className="py-3 px-4 font-medium">Barang Suplai</th>
                  <th className="py-3 px-4 font-medium">Jatuh Tempo</th>
                  <th className="py-3 px-4 font-medium text-right">Total Tagihan</th>
                  {canWriteLedger && <th className="py-3 px-4 font-medium text-right">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-xs">
                {tempoPayables.map((d) => {
                  const dueState = getDueStatus(d.dueDate);
                  return (
                    <tr key={d.id} className="hover:bg-zinc-50">
                      <td className="py-3 px-4 font-semibold text-zinc-900">{d.supplierName}</td>
                      <td className="py-3 px-4 text-zinc-700">
                        {d.productName} ({d.variantLabel}) x{d.quantity}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`font-medium ${
                            dueState === 'OVERDUE'
                              ? 'text-red-700 font-semibold'
                              : dueState === 'SOON'
                                ? 'text-amber-700 font-semibold'
                                : 'text-zinc-700'
                          }`}
                        >
                          {d.dueDate || 'Segera'}
                        </span>
                        {dueState === 'OVERDUE' && (
                          <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-red-50 border border-red-200 text-red-700 text-[10px] font-semibold">
                            Lewat Jatuh Tempo
                          </span>
                        )}
                        {dueState === 'SOON' && (
                          <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-semibold">
                            Jatuh Tempo ≤ 3 Hari
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold tabular-price text-zinc-900">
                        {formatRupiah(d.unitCost * d.quantity)}
                      </td>
                      {canWriteLedger && (
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <select
                              aria-label={`Metode pelunasan ${d.supplierName}`}
                              value={supplierPayMethods[d.id] || 'TRANSFER'}
                              onChange={(e) =>
                                setSupplierPayMethods((prev) => ({
                                  ...prev,
                                  [d.id]: e.target.value as 'TRANSFER' | 'TUNAI',
                                }))
                              }
                              className="px-2 py-1.5 text-xs bg-white border border-zinc-300 rounded-lg"
                            >
                              <option value="TRANSFER">Transfer</option>
                              <option value="TUNAI">Tunai</option>
                            </select>
                            <button
                              type="button"
                              disabled={payingSupplierId === d.id}
                              onClick={() => handlePaySupplier(d.id)}
                              className="px-3 py-1.5 rounded-lg bg-[#14532D] text-white text-xs font-semibold hover:bg-[#166534] disabled:opacity-60 cursor-pointer whitespace-nowrap"
                            >
                              {payingSupplierId === d.id ? 'Memproses...' : 'Bayar Lunas'}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Kasbon / Piutang Pelanggan */}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-zinc-900">
                Catatan Bon / Kasbon Warga &amp; Warung
              </h3>
              <p className="text-xs text-zinc-500 tabular-price mt-0.5">
                Menampilkan {filteredKasbon.length} dari {kasbon.length} data kasbon
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExportKasbonCsv}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-300 bg-white text-xs font-semibold text-zinc-800 hover:bg-zinc-50 cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5 text-[#14532D]" aria-hidden="true" />
                <span>Unduh CSV Kasbon</span>
              </button>
              <button
                type="button"
                onClick={() => setShowAddKasbon((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#14532D] text-white text-xs font-semibold hover:bg-[#166534] cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{showAddKasbon ? 'Tutup Form Kasbon' : 'Catat Kasbon Baru'}</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  {id: 'ALL', label: `Semua (${kasbon.length})`},
                  {
                    id: 'UNPAID',
                    label: `Belum Lunas (${kasbon.filter((k) => k.amountDue - k.totalPaid > 0).length})`,
                  },
                  {
                    id: 'OVERDUE',
                    label: `Jatuh Tempo (${
                      kasbon.filter(
                        (k) =>
                          k.amountDue - k.totalPaid > 0 && getDueStatus(k.dueDate) === 'OVERDUE'
                      ).length
                    })`,
                  },
                  {
                    id: 'PAID',
                    label: `Lunas (${kasbon.filter((k) => k.amountDue - k.totalPaid <= 0).length})`,
                  },
                ] as {id: 'ALL' | 'UNPAID' | 'OVERDUE' | 'PAID'; label: string}[]
              ).map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setKasbonFilter(chip.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap ${
                    kasbonFilter === chip.id
                      ? 'bg-[#14532D] text-white'
                      : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
            <input
              type="search"
              value={kasbonSearch}
              onChange={(e) => setKasbonSearch(e.target.value)}
              placeholder="Cari nama warga, alamat, HP..."
              aria-label="Cari kasbon pelanggan"
              className="px-3 py-1.5 text-xs border border-zinc-300 rounded-lg w-full sm:w-56"
            />
          </div>
        </div>

        {showAddKasbon && (
          <form
            onSubmit={handleAddKasbon}
            className="p-5 bg-zinc-50 border-b border-zinc-200 space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label htmlFor="ksb-name" className="block text-xs text-zinc-600 mb-1">
                  Nama Warga / Warung
                </label>
                <input
                  id="ksb-name"
                  type="text"
                  required
                  value={kasbonName}
                  onChange={(e) => setKasbonName(e.target.value)}
                  placeholder="Contoh: Ibu Siti / Warung Pak Budi"
                  className="w-full px-3 py-2 min-h-[38px] text-sm bg-white border border-zinc-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="ksb-phone" className="block text-xs text-zinc-600 mb-1">
                  Nomor WhatsApp (Opsional)
                </label>
                <input
                  id="ksb-phone"
                  type="tel"
                  value={kasbonPhone}
                  onChange={(e) => setKasbonPhone(e.target.value)}
                  placeholder="0812..."
                  className="w-full px-3 py-2 min-h-[38px] text-sm bg-white border border-zinc-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="ksb-addr" className="block text-xs text-zinc-600 mb-1">
                  Alamat / Dusun (Opsional)
                </label>
                <input
                  id="ksb-addr"
                  type="text"
                  value={kasbonAddress}
                  onChange={(e) => setKasbonAddress(e.target.value)}
                  placeholder="Dusun II Gunung Batin Udik"
                  className="w-full px-3 py-2 min-h-[38px] text-sm bg-white border border-zinc-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="ksb-amt" className="block text-xs text-zinc-600 mb-1">
                  Nominal Kasbon (Rp)
                </label>
                <input
                  id="ksb-amt"
                  type="number"
                  required
                  min={500}
                  value={kasbonAmount}
                  onChange={(e) => setKasbonAmount(e.target.value)}
                  placeholder="75000"
                  className="w-full px-3 py-2 min-h-[38px] text-sm tabular-price bg-white border border-zinc-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="ksb-due" className="block text-xs text-zinc-600 mb-1">
                  Jatuh Tempo (Opsional)
                </label>
                <input
                  id="ksb-due"
                  type="date"
                  value={kasbonDueDate}
                  onChange={(e) => setKasbonDueDate(e.target.value)}
                  className="w-full px-3 py-2 min-h-[38px] text-sm bg-white border border-zinc-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="ksb-note" className="block text-xs text-zinc-600 mb-1">
                  Catatan Barang
                </label>
                <input
                  id="ksb-note"
                  type="text"
                  value={kasbonNote}
                  onChange={(e) => setKasbonNote(e.target.value)}
                  placeholder="Beras 5 kg & minyak goreng"
                  className="w-full px-3 py-2 min-h-[38px] text-sm bg-white border border-zinc-300 rounded-lg"
                />
              </div>
            </div>
            {kasbonError && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                {kasbonError}
              </p>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingKasbon}
                className="px-4 py-2 rounded-lg bg-[#14532D] text-white text-xs font-semibold hover:bg-[#166534] cursor-pointer"
              >
                {savingKasbon ? 'Menyimpan...' : 'Simpan Catatan Kasbon'}
              </button>
            </div>
          </form>
        )}

        {filteredKasbon.length === 0 ? (
          <div className="p-6 text-center text-sm text-zinc-500">
            {kasbon.length === 0
              ? 'Tidak ada catatan kasbon pelanggan.'
              : 'Tidak ada data kasbon pada filter ini.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                  <th className="py-3 px-4 font-medium">Pelanggan</th>
                  <th className="py-3 px-4 font-medium">Catatan &amp; Tempo</th>
                  <th className="py-3 px-4 font-medium text-right">Total Bon</th>
                  <th className="py-3 px-4 font-medium text-right">Sisa Tagihan</th>
                  <th className="py-3 px-4 font-medium text-right">Pembayaran</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-xs">
                {filteredKasbon.map((k) => {
                  const remaining = Math.max(0, k.amountDue - k.totalPaid);
                  const dueState = remaining > 0 ? getDueStatus(k.dueDate) : null;
                  const waDigits = formatWaPhone(k.phone || '');
                  const waMessage = encodeURIComponent(
                    `Halo ${k.customerName}, pengingat tagihan bon Toko Dimas Jaya sebesar ${formatRupiah(remaining)}${
                      k.dueDate ? ` (jatuh tempo ${k.dueDate})` : ''
                    }. Terima kasih.`
                  );
                  return (
                    <tr key={k.id} className="hover:bg-zinc-50">
                      <td className="py-3 px-4">
                        <p className="font-semibold text-zinc-900">{k.customerName}</p>
                        <p className="text-zinc-500">
                          {k.address}
                          {k.phone ? ` · ${k.phone}` : ''}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-zinc-600">
                        <p>{k.note}</p>
                        {k.dueDate && (
                          <p className="mt-0.5">
                            <span
                              className={
                                dueState === 'OVERDUE'
                                  ? 'text-red-700 font-semibold'
                                  : dueState === 'SOON'
                                    ? 'text-amber-700 font-semibold'
                                    : 'text-zinc-500'
                              }
                            >
                              Tempo: {k.dueDate}
                            </span>
                            {dueState === 'OVERDUE' && (
                              <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded bg-red-50 border border-red-200 text-red-700 text-[10px] font-semibold">
                                Lewat Jatuh Tempo
                              </span>
                            )}
                            {dueState === 'SOON' && (
                              <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-semibold">
                                Jatuh Tempo ≤ 3 Hari
                              </span>
                            )}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-price text-zinc-700">
                        {formatRupiah(k.amountDue)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold tabular-price text-zinc-900">
                        {remaining === 0 ? (
                          <span className="text-[#14532D]">Lunas</span>
                        ) : (
                          formatRupiah(remaining)
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {remaining > 0 && (
                          <div className="inline-flex flex-wrap justify-end items-center gap-1.5">
                            {waDigits && (
                              <a
                                href={`https://wa.me/${waDigits}?text=${waMessage}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-emerald-200 bg-emerald-50 text-[#14532D] font-medium hover:bg-emerald-100 whitespace-nowrap"
                              >
                                <MessageCircle className="w-3 h-3" aria-hidden="true" />
                                <span>Ingatkan WA</span>
                              </a>
                            )}
                            {payingKasbonId === k.id ? (
                              <div className="inline-flex items-center gap-1.5">
                                <input
                                  type="number"
                                  min={1}
                                  max={remaining}
                                  value={payAmount}
                                  onChange={(e) => setPayAmount(e.target.value)}
                                  placeholder={String(remaining)}
                                  className="w-24 px-2 py-1 text-xs tabular-price border border-zinc-300 rounded"
                                />
                                <button
                                  type="button"
                                  onClick={() => handlePayKasbon(k)}
                                  className="px-2.5 py-1 rounded bg-[#14532D] text-white text-xs font-medium cursor-pointer"
                                >
                                  Simpan
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPayingKasbonId(null)}
                                  className="px-2 py-1 text-xs text-zinc-500 cursor-pointer"
                                >
                                  Batal
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setPayingKasbonId(k.id);
                                  setPayAmount(String(remaining));
                                }}
                                className="px-3 py-1.5 rounded border border-zinc-300 bg-white text-zinc-800 font-medium hover:bg-zinc-50 cursor-pointer whitespace-nowrap"
                              >
                                Catat Bayar
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Ledger Table with Filters & CSV Export */}
      {!isCashierKasbonMode && (
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-zinc-900">Buku Kas Harian</h3>
              <p className="text-xs text-zinc-500 tabular-price mt-0.5">
                Menampilkan {filteredLedger.length} dari {ledger.length} transaksi kas
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                aria-label="Dari tanggal"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-white border border-zinc-300 rounded-lg"
              />
              <span className="text-xs text-zinc-400">s/d</span>
              <input
                type="date"
                aria-label="Sampai tanggal"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-white border border-zinc-300 rounded-lg"
              />
              {(dateFrom || dateTo) && (
                <button
                  type="button"
                  onClick={() => {
                    setDateFrom('');
                    setDateTo('');
                  }}
                  className="px-2 py-1.5 text-xs text-zinc-600 hover:text-zinc-900 cursor-pointer"
                >
                  Reset
                </button>
              )}
              <input
                type="search"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Cari kategori / keterangan..."
                className="px-3 py-1.5 text-xs border border-zinc-300 rounded-lg"
              />
              <select
                aria-label="Filter jenis kas"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as 'ALL' | 'MASUK' | 'KELUAR')}
                className="px-2.5 py-1.5 text-xs bg-white border border-zinc-300 rounded-lg"
              >
                <option value="ALL">Semua Jenis</option>
                <option value="MASUK">Kas Masuk</option>
                <option value="KELUAR">Kas Keluar</option>
              </select>
              <select
                aria-label="Filter metode bayar"
                value={filterMethod}
                onChange={(e) => setFilterMethod(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-white border border-zinc-300 rounded-lg"
              >
                <option value="ALL">Semua Metode</option>
                <option value="TUNAI">Tunai</option>
                <option value="NON_TUNAI">QRIS / Transfer</option>
              </select>
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 bg-white text-xs font-semibold text-zinc-800 hover:bg-zinc-50 cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5 text-[#14532D]" aria-hidden="true" />
                <span>Unduh CSV</span>
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                  <th className="py-3 px-4 font-medium">Waktu</th>
                  <th className="py-3 px-4 font-medium">Kategori &amp; Keterangan</th>
                  <th className="py-3 px-4 font-medium">Metode</th>
                  <th className="py-3 px-4 font-medium">Petugas</th>
                  <th className="py-3 px-4 font-medium text-right">Nominal</th>
                  {canWriteLedger && <th className="py-3 px-4 font-medium text-right">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-xs">
                {filteredLedger.map((entry) => (
                  <tr key={entry.id} className="hover:bg-zinc-50">
                    <td className="py-2.5 px-4 text-zinc-500 whitespace-nowrap">
                      {formatShortDate(entry.createdAt)}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="font-semibold text-zinc-900">{entry.category}</span>
                      <span className="text-zinc-400 mx-1.5">·</span>
                      <span className="text-zinc-700">{entry.description}</span>
                    </td>
                    <td className="py-2.5 px-4 text-zinc-600">{entry.paymentMethod}</td>
                    <td className="py-2.5 px-4 text-zinc-600">{entry.actorName}</td>
                    <td
                      className={`py-2.5 px-4 text-right font-mono font-semibold tabular-price ${
                        entry.type === 'MASUK' ? 'text-[#14532D]' : 'text-red-700'
                      }`}
                    >
                      {entry.type === 'MASUK' ? '+' : '-'} {formatRupiah(entry.amount)}
                    </td>
                    {canWriteLedger && (
                      <td className="py-2.5 px-4 text-right">
                        {confirmDeleteLedgerId === entry.id ? (
                          <span className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={deletingLedgerId === entry.id}
                              onClick={() => handleDeleteLedger(entry.id)}
                              className="px-2 py-0.5 rounded bg-red-600 text-white text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                            >
                              {deletingLedgerId === entry.id ? '...' : 'Yakin Hapus?'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteLedgerId(null)}
                              className="text-[11px] text-zinc-500 cursor-pointer"
                            >
                              Batal
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            aria-label={`Hapus catatan kas ${entry.description}`}
                            onClick={() => setConfirmDeleteLedgerId(entry.id)}
                            className="p-1 text-zinc-400 hover:text-red-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

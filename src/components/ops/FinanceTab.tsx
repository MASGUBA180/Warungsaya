import {FormEvent, useState} from 'react';
import {formatRupiah, formatShortDate} from '../../data/storeData';
import type {DivisionRole, KasbonRecord, LedgerEntry} from '../../types/store';

interface FinanceTabProps {
  role: DivisionRole;
  ledger: LedgerEntry[];
  kasbon: KasbonRecord[];
  authToken: string;
  onRefresh: () => Promise<void>;
}

export function FinanceTab({
  role,
  ledger,
  kasbon,
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

  const canWriteLedger = role === 'PEMILIK' || role === 'KEUANGAN';

  const totalMasuk = ledger
    .filter((l) => l.type === 'MASUK')
    .reduce((sum, l) => sum + l.amount, 0);
  const totalKeluar = ledger
    .filter((l) => l.type === 'KELUAR')
    .reduce((sum, l) => sum + l.amount, 0);

  const handleAddLedger = async (e: FormEvent) => {
    e.preventDefault();
    setLedgerError('');
    setSavingLedger(true);
    try {
      const res = await fetch('/api/ops/ledger', {
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
      const data = await res.json();
      if (!res.ok) {
        setLedgerError(data.error || 'Gagal mencatat buku kas.');
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

  const handlePayKasbon = async (record: KasbonRecord) => {
    const remaining = Math.max(0, record.amountDue - record.totalPaid);
    const nominal = Number(payAmount || remaining);
    if (!Number.isFinite(nominal) || nominal <= 0) return;

    const res = await fetch(`/api/ops/kasbon/${record.id}/pay`, {
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

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-zinc-200 rounded-xl p-5">
          <p className="text-xs text-zinc-500">Total Pemasukan Tercatat</p>
          <p className="text-xl font-bold text-[#14532D] tabular-price mt-1">
            {formatRupiah(totalMasuk)}
          </p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-xl p-5">
          <p className="text-xs text-zinc-500">Total Pengeluaran Tercatat</p>
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
                <option value="Listrik & Air">Listrik & Air</option>
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

      {/* Kasbon / Piutang Pelanggan */}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200">
          <h3 className="text-base font-semibold text-zinc-900">
            Catatan Bon / Kasbon Warga & Warung
          </h3>
        </div>
        {kasbon.length === 0 ? (
          <div className="p-6 text-center text-sm text-zinc-500">
            Tidak ada catatan kasbon pelanggan.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                  <th className="py-3 px-4 font-medium">Pelanggan</th>
                  <th className="py-3 px-4 font-medium">Catatan</th>
                  <th className="py-3 px-4 font-medium text-right">Total Bon</th>
                  <th className="py-3 px-4 font-medium text-right">Sisa Tagihan</th>
                  <th className="py-3 px-4 font-medium text-right">Pembayaran</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-xs">
                {kasbon.map((k) => {
                  const remaining = Math.max(0, k.amountDue - k.totalPaid);
                  return (
                    <tr key={k.id} className="hover:bg-zinc-50">
                      <td className="py-3 px-4">
                        <p className="font-semibold text-zinc-900">{k.customerName}</p>
                        <p className="text-zinc-500">{k.address}</p>
                      </td>
                      <td className="py-3 px-4 text-zinc-600">{k.note}</td>
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
                          payingKasbonId === k.id ? (
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
                          )
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

      {/* Ledger Table */}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200">
          <h3 className="text-base font-semibold text-zinc-900">Buku Kas Harian</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                <th className="py-3 px-4 font-medium">Waktu</th>
                <th className="py-3 px-4 font-medium">Kategori & Keterangan</th>
                <th className="py-3 px-4 font-medium">Petugas</th>
                <th className="py-3 px-4 font-medium text-right">Nominal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-xs">
              {ledger.map((entry) => (
                <tr key={entry.id} className="hover:bg-zinc-50">
                  <td className="py-2.5 px-4 text-zinc-500 whitespace-nowrap">
                    {formatShortDate(entry.createdAt)}
                  </td>
                  <td className="py-2.5 px-4">
                    <span className="font-semibold text-zinc-900">{entry.category}</span>
                    <span className="text-zinc-400 mx-1.5">·</span>
                    <span className="text-zinc-700">{entry.description}</span>
                  </td>
                  <td className="py-2.5 px-4 text-zinc-600">{entry.actorName}</td>
                  <td
                    className={`py-2.5 px-4 text-right font-mono font-semibold tabular-price ${
                      entry.type === 'MASUK' ? 'text-[#14532D]' : 'text-red-700'
                    }`}
                  >
                    {entry.type === 'MASUK' ? '+' : '-'} {formatRupiah(entry.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

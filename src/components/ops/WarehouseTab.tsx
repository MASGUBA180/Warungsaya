import {Plus} from 'lucide-react';
import {FormEvent, useState} from 'react';
import {formatRupiah, formatShortDate, STORE_CATEGORIES} from '../../data/storeData';
import type {Product, ProductCategory, StockMovement} from '../../types/store';

interface WarehouseTabProps {
  products: Product[];
  stockMovements: StockMovement[];
  authToken: string;
  onRefresh: () => Promise<void>;
}

export function WarehouseTab({
  products,
  stockMovements,
  authToken,
  onRefresh,
}: WarehouseTabProps) {
  const [filterLowOnly, setFilterLowOnly] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);

  // Add Product Form
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<Exclude<ProductCategory, 'Semua'>>('Sembako');
  const [newVariantLabel, setNewVariantLabel] = useState('');
  const [newCostPrice, setNewCostPrice] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newStock, setNewStock] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [prodError, setProdError] = useState('');
  const [savingProd, setSavingProd] = useState(false);

  // Stock update inline modal state
  const [stockTarget, setStockTarget] = useState<{
    productId: string;
    productName: string;
    variantId: string;
    variantLabel: string;
    currentStock: number;
  } | null>(null);
  const [stockType, setStockType] = useState<'MASUK' | 'OPNAME'>('MASUK');
  const [stockQty, setStockQty] = useState('');
  const [stockNote, setStockNote] = useState('');
  const [recordExpense, setRecordExpense] = useState(true);
  const [savingStock, setSavingStock] = useState(false);

  const flatVariants = products.flatMap((p) =>
    p.variants.map((v) => ({
      product: p,
      variant: v,
      isLow: v.stock <= v.minStock,
    }))
  );

  const visibleRows = filterLowOnly
    ? flatVariants.filter((r) => r.isLow)
    : flatVariants;

  const handleAddProduct = async (e: FormEvent) => {
    e.preventDefault();
    setProdError('');
    setSavingProd(true);
    try {
      const res = await fetch('/api/ops/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          name: newName.trim(),
          category: newCategory,
          variantLabel: newVariantLabel.trim() || 'Satuan',
          costPrice: Number(newCostPrice || 0),
          price: Number(newPrice || 0),
          stock: Number(newStock || 0),
          description: newDesc.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setProdError(data.error || 'Gagal menambah produk.');
        return;
      }
      setNewName('');
      setNewVariantLabel('');
      setNewCostPrice('');
      setNewPrice('');
      setNewStock('');
      setNewDesc('');
      setShowAddProduct(false);
      await onRefresh();
    } catch {
      setProdError('Gagal terhubung ke server.');
    } finally {
      setSavingProd(false);
    }
  };

  const handleSubmitStock = async (e: FormEvent) => {
    e.preventDefault();
    if (!stockTarget) return;
    setSavingStock(true);
    try {
      const res = await fetch('/api/ops/stock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          productId: stockTarget.productId,
          variantId: stockTarget.variantId,
          type: stockType,
          quantity: Number(stockQty),
          note: stockNote.trim(),
          recordExpense: stockType === 'MASUK' && recordExpense,
        }),
      });
      if (res.ok) {
        setStockTarget(null);
        setStockQty('');
        setStockNote('');
        await onRefresh();
      }
    } finally {
      setSavingStock(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterLowOnly(false)}
            className={`px-3.5 py-2 min-h-[38px] rounded-lg text-xs font-medium cursor-pointer ${
              !filterLowOnly
                ? 'bg-[#14532D] text-white'
                : 'bg-white border border-zinc-200 text-zinc-700'
            }`}
          >
            Semua Stok ({flatVariants.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterLowOnly(true)}
            className={`px-3.5 py-2 min-h-[38px] rounded-lg text-xs font-medium cursor-pointer ${
              filterLowOnly
                ? 'bg-amber-700 text-white'
                : 'bg-white border border-zinc-200 text-zinc-700'
            }`}
          >
            Stok Menipis ({flatVariants.filter((r) => r.isLow).length})
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowAddProduct((v) => !v)}
          className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-lg bg-[#14532D] text-white text-xs font-semibold hover:bg-[#166534] cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>{showAddProduct ? 'Tutup Form Produk' : 'Tambah Produk Baru'}</span>
        </button>
      </div>

      {/* Add product panel */}
      {showAddProduct && (
        <form
          onSubmit={handleAddProduct}
          className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4"
        >
          <h3 className="text-base font-semibold text-zinc-900">Tambah Produk Katalog</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label htmlFor="np-name" className="block text-xs text-zinc-600 mb-1">
                Nama Produk
              </label>
              <input
                id="np-name"
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Contoh: Tepung Terigu Segitiga"
                className="w-full px-3 py-2 min-h-[40px] text-sm border border-zinc-300 rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="np-cat" className="block text-xs text-zinc-600 mb-1">
                Kategori
              </label>
              <select
                id="np-cat"
                value={newCategory}
                onChange={(e) =>
                  setNewCategory(e.target.value as Exclude<ProductCategory, 'Semua'>)
                }
                className="w-full px-3 py-2 min-h-[40px] text-sm bg-white border border-zinc-300 rounded-lg"
              >
                {STORE_CATEGORIES.filter((c) => c !== 'Semua').map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="np-var" className="block text-xs text-zinc-600 mb-1">
                Kemasan / Satuan
              </label>
              <input
                id="np-var"
                type="text"
                required
                value={newVariantLabel}
                onChange={(e) => setNewVariantLabel(e.target.value)}
                placeholder="Kemasan 1 kg"
                className="w-full px-3 py-2 min-h-[40px] text-sm border border-zinc-300 rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="np-cost" className="block text-xs text-zinc-600 mb-1">
                Harga Modal (Rp)
              </label>
              <input
                id="np-cost"
                type="number"
                min={0}
                value={newCostPrice}
                onChange={(e) => setNewCostPrice(e.target.value)}
                placeholder="11000"
                className="w-full px-3 py-2 min-h-[40px] text-sm tabular-price border border-zinc-300 rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="np-price" className="block text-xs text-zinc-600 mb-1">
                Harga Jual (Rp)
              </label>
              <input
                id="np-price"
                type="number"
                required
                min={500}
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                placeholder="13500"
                className="w-full px-3 py-2 min-h-[40px] text-sm tabular-price border border-zinc-300 rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="np-stock" className="block text-xs text-zinc-600 mb-1">
                Stok Awal
              </label>
              <input
                id="np-stock"
                type="number"
                required
                min={0}
                value={newStock}
                onChange={(e) => setNewStock(e.target.value)}
                placeholder="20"
                className="w-full px-3 py-2 min-h-[40px] text-sm tabular-price border border-zinc-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label htmlFor="np-desc" className="block text-xs text-zinc-600 mb-1">
              Deskripsi Singkat (Opsional)
            </label>
            <input
              id="np-desc"
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Cocok untuk kue dan gorengan rumahan."
              className="w-full px-3 py-2 min-h-[40px] text-sm border border-zinc-300 rounded-lg"
            />
          </div>

          {prodError && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
              {prodError}
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingProd}
              className="px-5 py-2.5 min-h-[40px] rounded-lg bg-[#14532D] text-white text-sm font-semibold hover:bg-[#166534] cursor-pointer"
            >
              {savingProd ? 'Menyimpan...' : 'Simpan ke Katalog'}
            </button>
          </div>
        </form>
      )}

      {/* Stock Adjustment Form */}
      {stockTarget && (
        <form
          onSubmit={handleSubmitStock}
          className="bg-[#F3F4F2] border border-zinc-300 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-zinc-900">
                Atur Stok: {stockTarget.productName} ({stockTarget.variantLabel})
              </h3>
              <p className="text-xs text-zinc-600 tabular-price">
                Stok saat ini: {stockTarget.currentStock} unit
              </p>
            </div>
            <button
              type="button"
              onClick={() => setStockTarget(null)}
              className="text-xs font-medium text-zinc-600 hover:text-zinc-900 cursor-pointer"
            >
              Batal
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="stk-type" className="block text-xs text-zinc-600 mb-1">
                Jenis Perubahan
              </label>
              <select
                id="stk-type"
                value={stockType}
                onChange={(e) => setStockType(e.target.value as 'MASUK' | 'OPNAME')}
                className="w-full px-3 py-2 min-h-[40px] text-sm bg-white border border-zinc-300 rounded-lg"
              >
                <option value="MASUK">Stok Masuk (+ Tambah)</option>
                <option value="OPNAME">Stok Opname (Set Nilai Akhir)</option>
              </select>
            </div>

            <div>
              <label htmlFor="stk-qty" className="block text-xs text-zinc-600 mb-1">
                {stockType === 'MASUK' ? 'Jumlah Tambah' : 'Jumlah Stok Fisik'}
              </label>
              <input
                id="stk-qty"
                type="number"
                required
                min={stockType === 'MASUK' ? 1 : 0}
                value={stockQty}
                onChange={(e) => setStockQty(e.target.value)}
                className="w-full px-3 py-2 min-h-[40px] text-sm tabular-price bg-white border border-zinc-300 rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="stk-note" className="block text-xs text-zinc-600 mb-1">
                Keterangan
              </label>
              <input
                id="stk-note"
                type="text"
                value={stockNote}
                onChange={(e) => setStockNote(e.target.value)}
                placeholder="Kulakan agen / cek fisik"
                className="w-full px-3 py-2 min-h-[40px] text-sm bg-white border border-zinc-300 rounded-lg"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            {stockType === 'MASUK' ? (
              <label className="inline-flex items-center gap-2 text-xs text-zinc-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={recordExpense}
                  onChange={(e) => setRecordExpense(e.target.checked)}
                  className="rounded border-zinc-300"
                />
                <span>Catat otomatis sebagai pengeluaran kulakan di buku kas</span>
              </label>
            ) : (
              <span />
            )}

            <button
              type="submit"
              disabled={savingStock}
              className="px-4 py-2 min-h-[40px] rounded-lg bg-[#14532D] text-white text-xs font-semibold hover:bg-[#166534] cursor-pointer"
            >
              {savingStock ? 'Menyimpan...' : 'Simpan Perubahan Stok'}
            </button>
          </div>
        </form>
      )}

      {/* Inventory table */}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200">
          <h3 className="text-base font-semibold text-zinc-900">Inventaris Barang & Harga</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                <th className="py-3 px-4 font-medium">Produk & Kemasan</th>
                <th className="py-3 px-4 font-medium">Kategori</th>
                <th className="py-3 px-4 font-medium text-right">Modal</th>
                <th className="py-3 px-4 font-medium text-right">Harga Jual</th>
                <th className="py-3 px-4 font-medium text-right">Stok</th>
                <th className="py-3 px-4 font-medium text-right">Aksi Gudang</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {visibleRows.map(({product, variant, isLow}) => (
                <tr key={`${product.id}-${variant.id}`} className="hover:bg-zinc-50">
                  <td className="py-3 px-4">
                    <p className="font-semibold text-zinc-900 text-xs">{product.name}</p>
                    <p className="text-xs text-zinc-500">{variant.label}</p>
                  </td>
                  <td className="py-3 px-4 text-xs text-zinc-600">{product.category}</td>
                  <td className="py-3 px-4 text-right font-mono text-xs text-zinc-600 tabular-price">
                    {formatRupiah(variant.costPrice ?? 0)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs font-semibold text-zinc-900 tabular-price">
                    {formatRupiah(variant.price)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs tabular-price">
                    <span className={isLow ? 'font-bold text-amber-700' : 'text-zinc-900'}>
                      {variant.stock}
                    </span>
                    <span className="text-zinc-400"> / min {variant.minStock}</span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        setStockTarget({
                          productId: product.id,
                          productName: product.name,
                          variantId: variant.id,
                          variantLabel: variant.label,
                          currentStock: variant.stock,
                        })
                      }
                      className="px-3 py-1.5 rounded border border-zinc-300 bg-white text-xs font-medium text-zinc-800 hover:bg-zinc-50 cursor-pointer whitespace-nowrap"
                    >
                      Atur Stok
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stock Movement Log */}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200">
          <h3 className="text-base font-semibold text-zinc-900">Riwayat Pergerakan Stok</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                <th className="py-3 px-4 font-medium">Waktu</th>
                <th className="py-3 px-4 font-medium">Barang</th>
                <th className="py-3 px-4 font-medium">Keterangan</th>
                <th className="py-3 px-4 font-medium">Petugas</th>
                <th className="py-3 px-4 font-medium text-right">Perubahan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {stockMovements.slice(0, 15).map((m) => (
                <tr key={m.id} className="hover:bg-zinc-50 text-xs">
                  <td className="py-2.5 px-4 text-zinc-500 whitespace-nowrap">
                    {formatShortDate(m.createdAt)}
                  </td>
                  <td className="py-2.5 px-4">
                    <span className="font-medium text-zinc-900">{m.productName}</span>{' '}
                    <span className="text-zinc-500">({m.variantLabel})</span>
                  </td>
                  <td className="py-2.5 px-4 text-zinc-600">{m.note}</td>
                  <td className="py-2.5 px-4 text-zinc-600">{m.actorName}</td>
                  <td
                    className={`py-2.5 px-4 text-right font-mono font-semibold tabular-price ${
                      m.quantityDelta >= 0 ? 'text-[#14532D]' : 'text-zinc-800'
                    }`}
                  >
                    {m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}
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

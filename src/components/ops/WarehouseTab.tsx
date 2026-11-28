import {AlertTriangle, Camera, Download, Edit3, Plus, Search, Trash2, X} from 'lucide-react';
import {ChangeEvent, FormEvent, useState} from 'react';
import {apiFetch} from '../../lib/apiClient';
import {compressImageFileToDataUrl} from '../../lib/imageHelpers';
import {
  formatRupiah,
  formatShortDate,
  ORDER_STATUS_LABELS,
  STORE_CATEGORIES,
} from '../../lib/storeData';
import type {
  Order,
  Product,
  ProductCategory,
  ProductVariant,
  StockMovement,
} from '../../types/store';

interface WarehouseTabProps {
  products: Product[];
  stockMovements: StockMovement[];
  orders?: Order[];
  pendingSupplierCount?: number;
  onOpenSupplierTab?: () => void;
  authToken: string;
  onRefresh: () => Promise<void>;
}

function isExpiringSoon(expiryDate?: string): boolean {
  if (!expiryDate) return false;
  const ts = new Date(expiryDate).getTime();
  if (!Number.isFinite(ts)) return false;
  const diffDays = (ts - Date.now()) / (1000 * 60 * 60 * 24);
  return diffDays <= 30;
}

export function WarehouseTab({
  products,
  stockMovements,
  orders = [],
  pendingSupplierCount = 0,
  onOpenSupplierTab,
  authToken,
  onRefresh,
}: WarehouseTabProps) {
  const [filterMode, setFilterMode] = useState<'ALL' | 'LOW' | 'EXPIRY'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddProduct, setShowAddProduct] = useState(false);

  // Add Product Form
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<Exclude<ProductCategory, 'Semua'>>('Sembako');
  const [newVariantLabel, setNewVariantLabel] = useState('');
  const [newSku, setNewSku] = useState('');
  const [newCostPrice, setNewCostPrice] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newStock, setNewStock] = useState('');
  const [newExpiry, setNewExpiry] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newImage, setNewImage] = useState('');
  const [prodError, setProdError] = useState('');
  const [savingProd, setSavingProd] = useState(false);

  // Edit product / variant / add variant inline state
  const [editProductTarget, setEditProductTarget] = useState<Product | null>(null);
  const [editProdName, setEditProdName] = useState('');
  const [editProdCategory, setEditProdCategory] =
    useState<Exclude<ProductCategory, 'Semua'>>('Sembako');
  const [editProdDesc, setEditProdDesc] = useState('');
  const [editProdImage, setEditProdImage] = useState('');

  const [editVariantTarget, setEditVariantTarget] = useState<{
    product: Product;
    variant: ProductVariant;
  } | null>(null);
  const [editVarLabel, setEditVarLabel] = useState('');
  const [editVarSku, setEditVarSku] = useState('');
  const [editVarCost, setEditVarCost] = useState('');
  const [editVarPrice, setEditVarPrice] = useState('');
  const [editVarMinStock, setEditVarMinStock] = useState('');
  const [editVarExpiry, setEditVarExpiry] = useState('');

  const [addVariantTarget, setAddVariantTarget] = useState<Product | null>(null);
  const [addVarLabel, setAddVarLabel] = useState('');
  const [addVarSku, setAddVarSku] = useState('');
  const [addVarCost, setAddVarCost] = useState('');
  const [addVarPrice, setAddVarPrice] = useState('');
  const [addVarStock, setAddVarStock] = useState('');
  const [addVarMinStock, setAddVarMinStock] = useState('4');
  const [addVarExpiry, setAddVarExpiry] = useState('');

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteVariantKey, setConfirmDeleteVariantKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  // Stock update inline modal state
  const [stockTarget, setStockTarget] = useState<{
    productId: string;
    productName: string;
    variantId: string;
    variantLabel: string;
    currentStock: number;
  } | null>(null);
  const [stockType, setStockType] = useState<'MASUK' | 'OPNAME' | 'RUSAK'>('MASUK');
  const [stockQty, setStockQty] = useState('');
  const [stockNote, setStockNote] = useState('');
  const [recordExpense, setRecordExpense] = useState(true);
  const [savingStock, setSavingStock] = useState(false);

  // Stock movement filtering & export state
  const [movementTypeFilter, setMovementTypeFilter] = useState<
    'ALL' | 'MASUK' | 'KELUAR' | 'OPNAME' | 'RETUR' | 'RUSAK'
  >('ALL');
  const [movementSearch, setMovementSearch] = useState('');
  const [showAllMovements, setShowAllMovements] = useState(false);

  const flatVariants = products.flatMap((p) =>
    p.variants.map((v) => ({
      product: p,
      variant: v,
      isLow: v.stock <= v.minStock,
      isExpiring: isExpiringSoon(v.expiryDate),
    }))
  );

  const totalUnitsStock = flatVariants.reduce((sum, r) => sum + r.variant.stock, 0);
  const totalCapitalValuation = flatVariants.reduce(
    (sum, r) => sum + r.variant.stock * (r.variant.costPrice ?? Math.round(r.variant.price * 0.85)),
    0
  );
  const totalRetailValuation = flatVariants.reduce(
    (sum, r) => sum + r.variant.stock * r.variant.price,
    0
  );

  const expiringCount = flatVariants.filter((r) => r.isExpiring).length;
  const q = searchQuery.trim().toLowerCase();
  const visibleRows = flatVariants.filter((r) => {
    if (filterMode === 'LOW' && !r.isLow) return false;
    if (filterMode === 'EXPIRY' && !r.isExpiring) return false;
    if (
      q &&
      !r.product.name.toLowerCase().includes(q) &&
      !r.variant.label.toLowerCase().includes(q) &&
      !(r.variant.sku || '').toLowerCase().includes(q) &&
      !r.product.category.toLowerCase().includes(q)
    ) {
      return false;
    }
    return true;
  });

  const movSearchNorm = movementSearch.trim().toLowerCase();
  const filteredMovements = stockMovements.filter((m) => {
    if (movementTypeFilter !== 'ALL' && m.type !== movementTypeFilter) return false;
    if (
      movSearchNorm &&
      !m.productName.toLowerCase().includes(movSearchNorm) &&
      !m.variantLabel.toLowerCase().includes(movSearchNorm) &&
      !m.note.toLowerCase().includes(movSearchNorm) &&
      !m.actorName.toLowerCase().includes(movSearchNorm)
    ) {
      return false;
    }
    return true;
  });

  const handleExportMovementsCsv = () => {
    const header = ['Waktu', 'Jenis', 'Produk', 'Kemasan', 'Perubahan', 'Keterangan', 'Petugas'];
    const rows = filteredMovements.map((m) => [
      m.createdAt,
      m.type,
      m.productName.replace(/"/g, '""'),
      m.variantLabel.replace(/"/g, '""'),
      String(m.quantityDelta),
      m.note.replace(/"/g, '""'),
      m.actorName.replace(/"/g, '""'),
    ]);
    const csvContent = [
      header.join(','),
      ...rows.map((r) => r.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');
    const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pergerakan-stok-gudang-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImageUpload = async (
    e: ChangeEvent<HTMLInputElement>,
    target: 'NEW' | 'EDIT'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageFileToDataUrl(file, 720, 0.72);
      if (target === 'NEW') {
        setNewImage(dataUrl);
      } else {
        setEditProdImage(dataUrl);
      }
    } catch {
      setActionError('Gagal memproses foto produk. Gunakan format JPG/PNG.');
    } finally {
      e.target.value = '';
    }
  };

  const handleAddProduct = async (e: FormEvent) => {
    e.preventDefault();
    setProdError('');
    setSavingProd(true);
    try {
      const res = await apiFetch<{product?: Product; error?: string}>('/api/ops/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          name: newName.trim(),
          category: newCategory,
          variantLabel: newVariantLabel.trim() || 'Satuan',
          sku: newSku.trim() || undefined,
          costPrice: Number(newCostPrice || 0),
          price: Number(newPrice || 0),
          stock: Number(newStock || 0),
          expiryDate: newExpiry.trim() || undefined,
          description: newDesc.trim(),
          image: newImage || undefined,
        }),
      });
      if (!res.ok) {
        setProdError(res.data.error || 'Gagal menambah produk.');
        return;
      }
      setNewName('');
      setNewVariantLabel('');
      setNewSku('');
      setNewCostPrice('');
      setNewPrice('');
      setNewStock('');
      setNewExpiry('');
      setNewDesc('');
      setNewImage('');
      setShowAddProduct(false);
      await onRefresh();
    } catch {
      setProdError('Gagal terhubung ke server.');
    } finally {
      setSavingProd(false);
    }
  };

  const handleSaveEditProduct = async (e: FormEvent) => {
    e.preventDefault();
    if (!editProductTarget) return;
    setActionError('');
    const res = await apiFetch<{error?: string}>(`/api/ops/products/${editProductTarget.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        name: editProdName.trim(),
        category: editProdCategory,
        description: editProdDesc.trim(),
        image: editProdImage || undefined,
      }),
    });
    if (!res.ok) {
      setActionError(res.data.error || 'Gagal mengubah info produk.');
      return;
    }
    setEditProductTarget(null);
    setEditProdImage('');
    await onRefresh();
  };

  const handleSaveEditVariant = async (e: FormEvent) => {
    e.preventDefault();
    if (!editVariantTarget) return;
    setActionError('');
    const res = await apiFetch<{error?: string}>(
      `/api/ops/products/${editVariantTarget.product.id}/variant/${editVariantTarget.variant.id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          label: editVarLabel.trim(),
          sku: editVarSku.trim(),
          costPrice: Number(editVarCost || 0),
          price: Number(editVarPrice || 0),
          minStock: Number(editVarMinStock || 0),
          expiryDate: editVarExpiry.trim(),
        }),
      }
    );
    if (!res.ok) {
      setActionError(res.data.error || 'Gagal memperbarui harga/kemasan varian.');
      return;
    }
    setEditVariantTarget(null);
    await onRefresh();
  };

  const handleSaveNewVariant = async (e: FormEvent) => {
    e.preventDefault();
    if (!addVariantTarget) return;
    setActionError('');
    const res = await apiFetch<{error?: string}>(
      `/api/ops/products/${addVariantTarget.id}/variants`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          label: addVarLabel.trim(),
          sku: addVarSku.trim() || undefined,
          costPrice: Number(addVarCost || 0),
          price: Number(addVarPrice || 0),
          stock: Number(addVarStock || 0),
          minStock: Number(addVarMinStock || 4),
          expiryDate: addVarExpiry.trim() || undefined,
        }),
      }
    );
    if (!res.ok) {
      setActionError(res.data.error || 'Gagal menambah kemasan baru.');
      return;
    }
    setAddVariantTarget(null);
    setAddVarLabel('');
    setAddVarSku('');
    setAddVarCost('');
    setAddVarPrice('');
    setAddVarStock('');
    setAddVarExpiry('');
    await onRefresh();
  };

  const handleDeleteVariant = async (productId: string, variantId: string) => {
    setActionError('');
    const res = await apiFetch<{error?: string}>(
      `/api/ops/products/${productId}/variant/${variantId}`,
      {
        method: 'DELETE',
        headers: {Authorization: `Bearer ${authToken}`},
      }
    );
    if (!res.ok) {
      setActionError(res.data.error || 'Gagal menghapus varian kemasan.');
      return;
    }
    setConfirmDeleteVariantKey(null);
    await onRefresh();
  };

  const handleDeleteProduct = async (productId: string) => {
    setActionError('');
    const res = await apiFetch<{error?: string}>(`/api/ops/products/${productId}`, {
      method: 'DELETE',
      headers: {Authorization: `Bearer ${authToken}`},
    });
    if (!res.ok) {
      setActionError(res.data.error || 'Gagal menghapus produk.');
      return;
    }
    setConfirmDeleteId(null);
    await onRefresh();
  };

  const handleSubmitStock = async (e: FormEvent) => {
    e.preventDefault();
    if (!stockTarget) return;
    setActionError('');
    setSavingStock(true);
    try {
      const res = await apiFetch<{error?: string}>('/api/ops/stock', {
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
      if (!res.ok) {
        setActionError(res.data.error || 'Gagal menyimpan perubahan stok.');
        return;
      }
      setStockTarget(null);
      setStockQty('');
      setStockNote('');
      await onRefresh();
    } finally {
      setSavingStock(false);
    }
  };

  const [packingId, setPackingId] = useState<string | null>(null);

  const onlinePackingOrders = orders.filter(
    (o) => o.source === 'ONLINE' && (o.status === 'MENUNGGU' || o.status === 'DISIAPKAN')
  );

  const handleMarkOrderPrepared = async (orderId: string) => {
    setPackingId(orderId);
    try {
      const res = await apiFetch(`/api/ops/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({status: 'DISIAPKAN'}),
      });
      if (res.ok) {
        await onRefresh();
      }
    } finally {
      setPackingId(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Ringkasan Valuasi Inventaris */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <p className="text-xs text-zinc-500">Total Varian Aktif</p>
          <p className="text-xl font-bold text-zinc-900 tabular-price mt-1">
            {flatVariants.length}
          </p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <p className="text-xs text-zinc-500">Total Unit Stok</p>
          <p className="text-xl font-bold text-zinc-900 tabular-price mt-1">
            {totalUnitsStock.toLocaleString('id-ID')}
          </p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <p className="text-xs text-zinc-500">Estimasi Nilai Modal Gudang</p>
          <p className="text-xl font-bold text-zinc-900 tabular-price mt-1">
            {formatRupiah(totalCapitalValuation)}
          </p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <p className="text-xs text-zinc-500">Estimasi Nilai Jual</p>
          <p className="text-xl font-bold text-[#14532D] tabular-price mt-1">
            {formatRupiah(totalRetailValuation)}
          </p>
        </div>
      </div>

      {pendingSupplierCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-amber-950">
            Ada <strong className="tabular-price">{pendingSupplierCount}</strong> kiriman barang dari
            pemasok menunggu verifikasi masuk stok gudang.
          </p>
          {onOpenSupplierTab && (
            <button
              type="button"
              onClick={onOpenSupplierTab}
              className="px-3.5 py-2 rounded-lg bg-[#14532D] text-white text-xs font-semibold hover:bg-[#166534] cursor-pointer whitespace-nowrap"
            >
              Buka Terima Pemasok
            </button>
          )}
        </div>
      )}

      {expiringCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-red-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" aria-hidden="true" />
            <span>
              Perhatian: <strong className="tabular-price">{expiringCount}</strong> varian barang
              mendekati atau melewati tanggal kedaluwarsa (≤ 30 hari).
            </span>
          </p>
          <button
            type="button"
            onClick={() => setFilterMode('EXPIRY')}
            className="px-3 py-1.5 rounded-lg border border-red-300 bg-white text-xs font-semibold text-red-800 hover:bg-red-100 cursor-pointer"
          >
            Lihat Barang Kedaluwarsa
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterMode('ALL')}
            className={`px-3.5 py-2 min-h-[38px] rounded-lg text-xs font-medium cursor-pointer ${
              filterMode === 'ALL'
                ? 'bg-[#14532D] text-white'
                : 'bg-white border border-zinc-200 text-zinc-700'
            }`}
          >
            Semua Stok ({flatVariants.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('LOW')}
            className={`px-3.5 py-2 min-h-[38px] rounded-lg text-xs font-medium cursor-pointer ${
              filterMode === 'LOW'
                ? 'bg-amber-700 text-white'
                : 'bg-white border border-zinc-200 text-zinc-700'
            }`}
          >
            Stok Menipis ({flatVariants.filter((r) => r.isLow).length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('EXPIRY')}
            className={`px-3.5 py-2 min-h-[38px] rounded-lg text-xs font-medium cursor-pointer ${
              filterMode === 'EXPIRY'
                ? 'bg-red-700 text-white'
                : 'bg-white border border-zinc-200 text-zinc-700'
            }`}
          >
            Cek Kedaluwarsa ({expiringCount})
          </button>
          <div className="relative">
            <Search
              className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari produk atau SKU..."
              aria-label="Cari produk atau SKU"
              className="pl-8 pr-3 py-2 min-h-[38px] text-xs bg-white border border-zinc-200 rounded-lg w-48 sm:w-56"
            />
          </div>
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

      {actionError && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {actionError}
        </p>
      )}

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

            <div>
              <label htmlFor="np-sku" className="block text-xs text-zinc-600 mb-1">
                SKU / Barcode (Opsional)
              </label>
              <input
                id="np-sku"
                type="text"
                value={newSku}
                onChange={(e) => setNewSku(e.target.value)}
                placeholder="8992761001"
                className="w-full px-3 py-2 min-h-[40px] text-sm font-mono border border-zinc-300 rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="np-expiry" className="block text-xs text-zinc-600 mb-1">
                Tanggal Kedaluwarsa (Opsional)
              </label>
              <input
                id="np-expiry"
                type="date"
                value={newExpiry}
                onChange={(e) => setNewExpiry(e.target.value)}
                className="w-full px-3 py-2 min-h-[40px] text-sm border border-zinc-300 rounded-lg"
              />
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

            <div className="sm:col-span-2 lg:col-span-3">
              <span className="block text-xs text-zinc-600 mb-1">
                Foto Produk (Opsional, otomatis pakai foto kategori bila kosong)
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-300 bg-white text-xs font-medium text-zinc-800 hover:bg-zinc-50 cursor-pointer">
                  <Camera className="w-3.5 h-3.5 text-[#14532D]" aria-hidden="true" />
                  <span>{newImage ? 'Ganti Foto Produk' : 'Unggah Foto Produk'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, 'NEW')}
                    className="sr-only"
                  />
                </label>
                {newImage && (
                  <div className="flex items-center gap-2">
                    <img
                      src={newImage}
                      alt="Pratinjau foto produk baru"
                      className="w-11 h-11 rounded-lg object-cover border border-zinc-200"
                    />
                    <button
                      type="button"
                      onClick={() => setNewImage('')}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-red-700 hover:bg-red-50 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                      <span>Hapus Foto</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
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

      {/* Edit Product Metadata Form */}
      {editProductTarget && (
        <form
          onSubmit={handleSaveEditProduct}
          className="bg-zinc-50 border border-zinc-300 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-900">
              Edit Info Produk: {editProductTarget.name}
            </h3>
            <button
              type="button"
              onClick={() => setEditProductTarget(null)}
              className="text-xs text-zinc-600 hover:text-zinc-900 cursor-pointer"
            >
              Batal
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="ep-name" className="block text-xs text-zinc-600 mb-1">
                Nama Produk
              </label>
              <input
                id="ep-name"
                type="text"
                required
                value={editProdName}
                onChange={(e) => setEditProdName(e.target.value)}
                className="w-full px-3 py-2 min-h-[38px] text-sm bg-white border border-zinc-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="ep-cat" className="block text-xs text-zinc-600 mb-1">
                Kategori
              </label>
              <select
                id="ep-cat"
                value={editProdCategory}
                onChange={(e) =>
                  setEditProdCategory(e.target.value as Exclude<ProductCategory, 'Semua'>)
                }
                className="w-full px-3 py-2 min-h-[38px] text-sm bg-white border border-zinc-300 rounded-lg"
              >
                {STORE_CATEGORIES.filter((c) => c !== 'Semua').map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ep-desc" className="block text-xs text-zinc-600 mb-1">
                Deskripsi Etalase
              </label>
              <input
                id="ep-desc"
                type="text"
                value={editProdDesc}
                onChange={(e) => setEditProdDesc(e.target.value)}
                className="w-full px-3 py-2 min-h-[38px] text-sm bg-white border border-zinc-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <img
                src={editProdImage || editProductTarget.image}
                alt={editProductTarget.name}
                className="w-11 h-11 rounded-lg object-cover border border-zinc-200 bg-white"
              />
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 bg-white text-xs font-medium text-zinc-800 hover:bg-zinc-50 cursor-pointer">
                <Camera className="w-3.5 h-3.5 text-[#14532D]" aria-hidden="true" />
                <span>Ganti Foto Produk</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e, 'EDIT')}
                  className="sr-only"
                />
              </label>
              {editProdImage && (
                <button
                  type="button"
                  onClick={() => setEditProdImage('')}
                  className="text-xs text-zinc-500 hover:text-zinc-900 cursor-pointer"
                >
                  Batal Ganti Foto
                </button>
              )}
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#14532D] text-white text-xs font-semibold hover:bg-[#166534] cursor-pointer"
            >
              Simpan Perubahan Produk
            </button>
          </div>
        </form>
      )}

      {/* Edit Variant Price/Cost/MinStock/Expiry Form */}
      {editVariantTarget && (
        <form
          onSubmit={handleSaveEditVariant}
          className="bg-zinc-50 border border-zinc-300 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-900">
              Edit Varian: {editVariantTarget.product.name} ({editVariantTarget.variant.label})
            </h3>
            <button
              type="button"
              onClick={() => setEditVariantTarget(null)}
              className="text-xs text-zinc-600 hover:text-zinc-900 cursor-pointer"
            >
              Batal
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div>
              <label htmlFor="ev-label" className="block text-xs text-zinc-600 mb-1">
                Label Kemasan
              </label>
              <input
                id="ev-label"
                type="text"
                required
                value={editVarLabel}
                onChange={(e) => setEditVarLabel(e.target.value)}
                className="w-full px-3 py-2 min-h-[38px] text-sm bg-white border border-zinc-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="ev-sku" className="block text-xs text-zinc-600 mb-1">
                SKU / Barcode (Opsional)
              </label>
              <input
                id="ev-sku"
                type="text"
                value={editVarSku}
                onChange={(e) => setEditVarSku(e.target.value)}
                placeholder="8992761001"
                className="w-full px-3 py-2 min-h-[38px] text-sm font-mono bg-white border border-zinc-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="ev-cost" className="block text-xs text-zinc-600 mb-1">
                Harga Modal (Rp)
              </label>
              <input
                id="ev-cost"
                type="number"
                min={0}
                value={editVarCost}
                onChange={(e) => setEditVarCost(e.target.value)}
                className="w-full px-3 py-2 min-h-[38px] text-sm tabular-price bg-white border border-zinc-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="ev-price" className="block text-xs text-zinc-600 mb-1">
                Harga Jual (Rp)
              </label>
              <input
                id="ev-price"
                type="number"
                required
                min={500}
                value={editVarPrice}
                onChange={(e) => setEditVarPrice(e.target.value)}
                className="w-full px-3 py-2 min-h-[38px] text-sm tabular-price bg-white border border-zinc-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="ev-min" className="block text-xs text-zinc-600 mb-1">
                Batas Min. Stok
              </label>
              <input
                id="ev-min"
                type="number"
                min={0}
                value={editVarMinStock}
                onChange={(e) => setEditVarMinStock(e.target.value)}
                className="w-full px-3 py-2 min-h-[38px] text-sm tabular-price bg-white border border-zinc-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="ev-exp" className="block text-xs text-zinc-600 mb-1">
                Kedaluwarsa
              </label>
              <input
                id="ev-exp"
                type="date"
                value={editVarExpiry}
                onChange={(e) => setEditVarExpiry(e.target.value)}
                className="w-full px-3 py-2 min-h-[38px] text-sm bg-white border border-zinc-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#14532D] text-white text-xs font-semibold hover:bg-[#166534] cursor-pointer"
            >
              Simpan Perubahan Varian
            </button>
          </div>
        </form>
      )}

      {/* Add New Variant to Product Form */}
      {addVariantTarget && (
        <form
          onSubmit={handleSaveNewVariant}
          className="bg-zinc-50 border border-zinc-300 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-900">
              Tambah Kemasan Baru untuk: {addVariantTarget.name}
            </h3>
            <button
              type="button"
              onClick={() => setAddVariantTarget(null)}
              className="text-xs text-zinc-600 hover:text-zinc-900 cursor-pointer"
            >
              Batal
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label htmlFor="av-label" className="block text-xs text-zinc-600 mb-1">
                Label Kemasan
              </label>
              <input
                id="av-label"
                type="text"
                required
                value={addVarLabel}
                onChange={(e) => setAddVarLabel(e.target.value)}
                placeholder="Contoh: Karung 10 kg"
                className="w-full px-3 py-2 min-h-[38px] text-sm bg-white border border-zinc-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="av-sku" className="block text-xs text-zinc-600 mb-1">
                SKU / Barcode (Opsional)
              </label>
              <input
                id="av-sku"
                type="text"
                value={addVarSku}
                onChange={(e) => setAddVarSku(e.target.value)}
                placeholder="8992761002"
                className="w-full px-3 py-2 min-h-[38px] text-sm font-mono bg-white border border-zinc-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="av-cost" className="block text-xs text-zinc-600 mb-1">
                Modal (Rp)
              </label>
              <input
                id="av-cost"
                type="number"
                min={0}
                value={addVarCost}
                onChange={(e) => setAddVarCost(e.target.value)}
                className="w-full px-3 py-2 min-h-[38px] text-sm tabular-price bg-white border border-zinc-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="av-price" className="block text-xs text-zinc-600 mb-1">
                Jual (Rp)
              </label>
              <input
                id="av-price"
                type="number"
                required
                min={500}
                value={addVarPrice}
                onChange={(e) => setAddVarPrice(e.target.value)}
                className="w-full px-3 py-2 min-h-[38px] text-sm tabular-price bg-white border border-zinc-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="av-stock" className="block text-xs text-zinc-600 mb-1">
                Stok Awal
              </label>
              <input
                id="av-stock"
                type="number"
                required
                min={0}
                value={addVarStock}
                onChange={(e) => setAddVarStock(e.target.value)}
                className="w-full px-3 py-2 min-h-[38px] text-sm tabular-price bg-white border border-zinc-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="av-exp" className="block text-xs text-zinc-600 mb-1">
                Kedaluwarsa
              </label>
              <input
                id="av-exp"
                type="date"
                value={addVarExpiry}
                onChange={(e) => setAddVarExpiry(e.target.value)}
                className="w-full px-3 py-2 min-h-[38px] text-sm bg-white border border-zinc-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="w-36">
              <label htmlFor="av-min" className="block text-xs text-zinc-600 mb-1">
                Min. Stok Aman
              </label>
              <input
                id="av-min"
                type="number"
                min={0}
                value={addVarMinStock}
                onChange={(e) => setAddVarMinStock(e.target.value)}
                className="w-full px-3 py-2 min-h-[38px] text-sm tabular-price bg-white border border-zinc-300 rounded-lg"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#14532D] text-white text-xs font-semibold hover:bg-[#166534] cursor-pointer"
            >
              Simpan Varian Baru
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
                onChange={(e) => setStockType(e.target.value as 'MASUK' | 'OPNAME' | 'RUSAK')}
                className="w-full px-3 py-2 min-h-[40px] text-sm bg-white border border-zinc-300 rounded-lg"
              >
                <option value="MASUK">Stok Masuk (+ Tambah)</option>
                <option value="OPNAME">Stok Opname (Set Nilai Akhir)</option>
                <option value="RUSAK">Barang Rusak / Kedaluwarsa / Susut (- Kurangi)</option>
              </select>
            </div>

            <div>
              <label htmlFor="stk-qty" className="block text-xs text-zinc-600 mb-1">
                {stockType === 'MASUK'
                  ? 'Jumlah Tambah'
                  : stockType === 'RUSAK'
                    ? `Jumlah Rusak / Susut (Maks ${stockTarget.currentStock})`
                    : 'Jumlah Stok Fisik'}
              </label>
              <input
                id="stk-qty"
                type="number"
                required
                min={stockType === 'OPNAME' ? 0 : 1}
                max={stockType === 'RUSAK' ? stockTarget.currentStock : undefined}
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
                placeholder={
                  stockType === 'RUSAK'
                    ? 'Kemasan bocor / kedaluwarsa'
                    : 'Kulakan agen / cek fisik'
                }
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
          <h3 className="text-base font-semibold text-zinc-900">Inventaris Barang &amp; Harga</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                <th className="py-3 px-4 font-medium">Produk &amp; Kemasan</th>
                <th className="py-3 px-4 font-medium">Kategori &amp; Exp</th>
                <th className="py-3 px-4 font-medium text-right">Modal</th>
                <th className="py-3 px-4 font-medium text-right">Harga Jual</th>
                <th className="py-3 px-4 font-medium text-right">Stok</th>
                <th className="py-3 px-4 font-medium text-right">Aksi Gudang</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {visibleRows.map(({product, variant, isLow, isExpiring}) => {
                const variantKey = `${product.id}:${variant.id}`;
                return (
                  <tr key={`${product.id}-${variant.id}`} className="hover:bg-zinc-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={product.image}
                          alt={product.name}
                          className="w-10 h-10 rounded-lg object-cover border border-zinc-200 shrink-0 bg-zinc-100"
                        />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold text-zinc-900 text-xs">{product.name}</p>
                            <button
                              type="button"
                              onClick={() => {
                                setEditProductTarget(product);
                                setEditProdName(product.name);
                                setEditProdCategory(product.category);
                                setEditProdDesc(product.description);
                                setEditProdImage('');
                              }}
                              title="Edit info produk"
                              className="p-1 text-zinc-400 hover:text-zinc-800 cursor-pointer"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                          </div>
                          <p className="text-xs text-zinc-500">
                            {variant.label}
                            {variant.sku && (
                              <span className="ml-2 font-mono text-[11px] text-zinc-400">
                                SKU: {variant.sku}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-zinc-600">
                      <p>{product.category}</p>
                      {variant.expiryDate && (
                        <p className={isExpiring ? 'text-red-700 font-semibold' : 'text-zinc-400'}>
                          Exp: {variant.expiryDate}
                        </p>
                      )}
                    </td>
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
                      <div className="inline-flex flex-wrap justify-end items-center gap-1.5">
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
                          className="px-2.5 py-1.5 rounded border border-zinc-300 bg-white text-xs font-medium text-zinc-800 hover:bg-zinc-50 cursor-pointer whitespace-nowrap"
                        >
                          Stok
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditVariantTarget({product, variant});
                            setEditVarLabel(variant.label);
                            setEditVarSku(variant.sku || '');
                            setEditVarCost(String(variant.costPrice ?? 0));
                            setEditVarPrice(String(variant.price));
                            setEditVarMinStock(String(variant.minStock));
                            setEditVarExpiry(variant.expiryDate || '');
                          }}
                          className="px-2.5 py-1.5 rounded border border-zinc-300 bg-white text-xs font-medium text-zinc-700 hover:bg-zinc-50 cursor-pointer whitespace-nowrap"
                        >
                          Edit Harga
                        </button>
                        <button
                          type="button"
                          onClick={() => setAddVariantTarget(product)}
                          className="px-2 py-1.5 rounded border border-zinc-300 bg-white text-xs font-medium text-[#14532D] hover:bg-emerald-50 cursor-pointer whitespace-nowrap"
                        >
                          + Varian
                        </button>
                        {product.variants.length > 1 &&
                          (confirmDeleteVariantKey === variantKey ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteVariant(product.id, variant.id)}
                              className="px-2 py-1.5 rounded bg-amber-700 text-white text-xs font-semibold hover:bg-amber-800 cursor-pointer whitespace-nowrap"
                            >
                              Hapus Varian?
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteVariantKey(variantKey)}
                              className="px-2 py-1.5 rounded border border-zinc-200 bg-white text-xs text-zinc-600 hover:text-red-700 hover:border-red-300 cursor-pointer whitespace-nowrap"
                            >
                              Hapus Varian
                            </button>
                          ))}
                        {confirmDeleteId === product.id ? (
                          <button
                            type="button"
                            onClick={() => handleDeleteProduct(product.id)}
                            className="px-2 py-1.5 rounded bg-red-600 text-white text-xs font-semibold hover:bg-red-700 cursor-pointer whitespace-nowrap"
                          >
                            Yakin Hapus?
                          </button>
                        ) : (
                          <button
                            type="button"
                            aria-label={`Hapus produk ${product.name}`}
                            onClick={() => setConfirmDeleteId(product.id)}
                            className="p-1.5 rounded text-zinc-400 hover:text-red-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Online Packing Queue for Gudang */}
      {onlinePackingOrders.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-200">
            <h3 className="text-base font-semibold text-zinc-900">
              Antrean Pesanan Online Siap Kemas
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Siapkan barang pesanan warga sebelum diambil di toko atau dibawa oleh kurir.
            </p>
          </div>
          <div className="divide-y divide-zinc-100">
            {onlinePackingOrders.map((ord) => (
              <div
                key={ord.id}
                className="px-6 py-4 flex flex-wrap items-center justify-between gap-4 text-xs"
              >
                <div className="space-y-1">
                  <p className="font-mono font-semibold text-zinc-900 tabular-price">
                    {ord.orderNumber} · {ORDER_STATUS_LABELS[ord.status]} ·{' '}
                    {ord.deliveryMethod === 'cod' ? 'Antar COD' : 'Ambil di Toko'}
                  </p>
                  <p className="text-zinc-600">
                    Pemesan: <span className="font-medium text-zinc-900">{ord.customerName}</span>
                  </p>
                  <p className="text-zinc-700">
                    {ord.items
                      .map((item) => `${item.productName} (${item.variantLabel}) x${item.quantity}`)
                      .join(', ')}
                  </p>
                </div>

                {ord.status === 'MENUNGGU' ? (
                  <button
                    type="button"
                    disabled={packingId === ord.id}
                    onClick={() => handleMarkOrderPrepared(ord.id)}
                    className="px-3.5 py-2 rounded-lg bg-[#14532D] text-white text-xs font-semibold hover:bg-[#166534] disabled:opacity-60 cursor-pointer whitespace-nowrap"
                  >
                    {packingId === ord.id ? 'Memproses...' : 'Tandai Sedang Disiapkan'}
                  </button>
                ) : (
                  <span className="px-3 py-1.5 rounded-md bg-emerald-50 text-[#14532D] font-semibold">
                    Siap Diserahkan
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stock Movement Log */}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-zinc-900">Riwayat Pergerakan Stok</h3>
            <p className="text-xs text-zinc-500 tabular-price mt-0.5">
              Menampilkan{' '}
              {showAllMovements
                ? filteredMovements.length
                : Math.min(15, filteredMovements.length)}{' '}
              dari {filteredMovements.length} catatan mutasi
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={movementSearch}
              onChange={(e) => setMovementSearch(e.target.value)}
              placeholder="Cari barang / catatan..."
              aria-label="Cari pergerakan stok"
              className="px-3 py-1.5 text-xs border border-zinc-300 rounded-lg w-44"
            />
            <select
              aria-label="Filter jenis mutasi stok"
              value={movementTypeFilter}
              onChange={(e) =>
                setMovementTypeFilter(
                  e.target.value as 'ALL' | 'MASUK' | 'KELUAR' | 'OPNAME' | 'RETUR' | 'RUSAK'
                )
              }
              className="px-2.5 py-1.5 text-xs bg-white border border-zinc-300 rounded-lg"
            >
              <option value="ALL">Semua Jenis</option>
              <option value="MASUK">MASUK</option>
              <option value="KELUAR">KELUAR</option>
              <option value="OPNAME">OPNAME</option>
              <option value="RETUR">RETUR</option>
              <option value="RUSAK">RUSAK</option>
            </select>
            <button
              type="button"
              onClick={handleExportMovementsCsv}
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
                <th className="py-3 px-4 font-medium">Barang</th>
                <th className="py-3 px-4 font-medium">Keterangan</th>
                <th className="py-3 px-4 font-medium">Petugas</th>
                <th className="py-3 px-4 font-medium text-right">Perubahan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(showAllMovements ? filteredMovements : filteredMovements.slice(0, 15)).map((m) => (
                <tr key={m.id} className="hover:bg-zinc-50 text-xs">
                  <td className="py-2.5 px-4 text-zinc-500 whitespace-nowrap">
                    {formatShortDate(m.createdAt)}
                  </td>
                  <td className="py-2.5 px-4">
                    <span className="font-medium text-zinc-900">{m.productName}</span>{' '}
                    <span className="text-zinc-500">({m.variantLabel})</span>
                  </td>
                  <td className="py-2.5 px-4 text-zinc-600">
                    <span
                      className={`inline-block mr-2 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        m.type === 'RUSAK'
                          ? 'bg-red-50 text-red-700 border border-red-200'
                          : m.type === 'RETUR'
                            ? 'bg-emerald-50 text-[#14532D] border border-emerald-200'
                            : m.type === 'MASUK'
                              ? 'bg-emerald-50 text-[#14532D]'
                              : 'bg-zinc-100 text-zinc-700'
                      }`}
                    >
                      {m.type}
                    </span>
                    <span>{m.note}</span>
                  </td>
                  <td className="py-2.5 px-4 text-zinc-600">{m.actorName}</td>
                  <td
                    className={`py-2.5 px-4 text-right font-mono font-semibold tabular-price ${
                      m.type === 'RUSAK'
                        ? 'text-red-700'
                        : m.quantityDelta >= 0
                          ? 'text-[#14532D]'
                          : 'text-zinc-800'
                    }`}
                  >
                    {m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredMovements.length > 15 && (
          <div className="px-6 py-3 border-t border-zinc-100 bg-zinc-50 text-center">
            <button
              type="button"
              onClick={() => setShowAllMovements((v) => !v)}
              className="text-xs font-semibold text-[#14532D] hover:underline cursor-pointer"
            >
              {showAllMovements
                ? 'Ringkas (15 Teratas)'
                : `Lihat Semua (${filteredMovements.length})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

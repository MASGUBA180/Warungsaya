import {Plus, Search, X} from 'lucide-react';
import {useState} from 'react';
import {formatRupiah, STORE_CATEGORIES} from '../lib/storeData';
import type {Product, ProductCategory, ProductVariant} from '../types/store';
import {ResilientImage} from './ResilientImage';

type CatalogSortMode = 'DEFAULT' | 'PRICE_ASC' | 'PRICE_DESC' | 'STOCK_DESC';

interface ProductCatalogProps {
  products: Product[];
  loading: boolean;
  selectedCategory: ProductCategory;
  onSelectCategory: (category: ProductCategory) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSelectProduct: (product: Product) => void;
  onQuickAdd: (product: Product, variant: ProductVariant) => void;
}

export function ProductCatalog({
  products,
  loading,
  selectedCategory,
  onSelectCategory,
  searchQuery,
  onSearchChange,
  onSelectProduct,
  onQuickAdd,
}: ProductCatalogProps) {
  const [sortBy, setSortBy] = useState<CatalogSortMode>('DEFAULT');
  const [inStockOnly, setInStockOnly] = useState(false);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredProducts = products
    .filter((product) => {
      const matchesCategory =
        selectedCategory === 'Semua' || product.category === selectedCategory;
      const matchesSearch =
        normalizedQuery === '' ||
        product.name.toLowerCase().includes(normalizedQuery) ||
        product.category.toLowerCase().includes(normalizedQuery) ||
        product.description.toLowerCase().includes(normalizedQuery);
      const hasAvailableStock = product.variants.some((v) => v.stock > 0);
      return matchesCategory && matchesSearch && (!inStockOnly || hasAvailableStock);
    })
    .slice()
    .sort((a, b) => {
      if (sortBy === 'DEFAULT') return 0;
      const aVar = a.variants.find((v) => v.stock > 0) ?? a.variants[0];
      const bVar = b.variants.find((v) => v.stock > 0) ?? b.variants[0];
      if (sortBy === 'PRICE_ASC') return (aVar?.price || 0) - (bVar?.price || 0);
      if (sortBy === 'PRICE_DESC') return (bVar?.price || 0) - (aVar?.price || 0);
      const aStock = a.variants.reduce((s, v) => s + v.stock, 0);
      const bStock = b.variants.reduce((s, v) => s + v.stock, 0);
      return bStock - aStock;
    });

  return (
    <section id="katalog" className="py-12 lg:py-16 bg-[#FAFAFA]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 pb-8 border-b border-zinc-200">
          <div>
            <p className="text-xs font-medium text-zinc-500">
              Katalog Toko Dimas Jaya · Stok & Harga Real-Time
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 mt-1 [text-wrap:balance]">
              Daftar Kebutuhan Pokok & Rumah Tangga
            </h2>
          </div>

          <div className="relative w-full md:w-80">
            <Search
              className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Cari beras, minyak, kopi, galon..."
              aria-label="Cari produk di katalog"
              className="w-full min-h-[42px] pl-10 pr-9 py-2 text-sm bg-white border border-zinc-300 rounded-lg text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-[#14532D] focus:ring-1 focus:ring-[#14532D]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="Hapus pencarian"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Category segmented controls + Sort & Stock Filter */}
        <div className="mt-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div
            role="tablist"
            aria-label="Filter kategori produk"
            className="flex items-center gap-1.5 overflow-x-auto pb-1"
          >
            {STORE_CATEGORIES.map((category) => {
              const active = selectedCategory === category;
              return (
                <button
                  key={category}
                  role="tab"
                  aria-selected={active}
                  type="button"
                  onClick={() => onSelectCategory(category)}
                  className={`px-3.5 py-2 min-h-[40px] rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14532D] ${
                    active
                      ? 'bg-[#14532D] text-white'
                      : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900'
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setInStockOnly((v) => !v)}
              className={`px-3 py-2 min-h-[38px] rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                inStockOnly
                  ? 'bg-[#14532D] text-white border-[#14532D]'
                  : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              Stok Tersedia Saja
            </button>

            <select
              aria-label="Urutkan produk"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as CatalogSortMode)}
              className="px-3 py-2 min-h-[38px] text-xs font-medium bg-white border border-zinc-200 rounded-lg text-zinc-700"
            >
              <option value="DEFAULT">Urutan: Standar Toko</option>
              <option value="PRICE_ASC">Harga: Termurah</option>
              <option value="PRICE_DESC">Harga: Termahal</option>
              <option value="STOCK_DESC">Stok: Terbanyak</option>
            </select>
          </div>
        </div>

        {/* Product Grid */}
        {loading ? (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {Array.from({length: 6}).map((_, idx) => (
              <div
                key={idx}
                className="bg-white border border-zinc-200 rounded-xl overflow-hidden animate-pulse"
              >
                <div className="aspect-4/3 bg-zinc-200" />
                <div className="p-5 space-y-3">
                  <div className="h-3 w-28 bg-zinc-200 rounded" />
                  <div className="h-5 w-44 bg-zinc-200 rounded" />
                  <div className="h-4 w-full bg-zinc-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="mt-10 bg-white border border-zinc-200 rounded-xl p-10 text-center">
            <p className="text-base font-semibold text-zinc-900">
              Produk tidak ditemukan untuk &ldquo;{searchQuery}&rdquo;
            </p>
            <p className="text-sm text-zinc-600 mt-1">
              Coba kata kunci lain atau tampilkan semua kategori barang.
            </p>
            <button
              type="button"
              onClick={() => {
                onSearchChange('');
                onSelectCategory('Semua');
              }}
              className="mt-5 px-4 py-2.5 min-h-[40px] rounded-lg bg-[#14532D] text-white text-sm font-medium hover:bg-[#166534] transition-colors cursor-pointer whitespace-nowrap"
            >
              Tampilkan Semua Produk
            </button>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {filteredProducts.map((product) => {
              const defaultVariant =
                product.variants.find((v) => v.stock > 0) ?? product.variants[0];
              const isOutOfStock = !defaultVariant || defaultVariant.stock <= 0;

              return (
                <article
                  key={product.id}
                  className="group bg-white border border-zinc-200 rounded-xl overflow-hidden flex flex-col justify-between transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-sm"
                >
                  <div>
                    <button
                      type="button"
                      onClick={() => onSelectProduct(product)}
                      className="w-full text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#14532D]"
                    >
                      <div className="aspect-4/3 w-full bg-zinc-100 overflow-hidden">
                        <ResilientImage
                          src={product.image}
                          alt={product.imageAlt}
                          fallbackLabel={product.name}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                        />
                      </div>

                      <div className="p-5 pb-3">
                        <div className="flex items-center gap-2 text-xs text-zinc-500">
                          <span>{product.category}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {isOutOfStock
                              ? 'Stok Habis'
                              : `Sisa ${defaultVariant.stock} unit`}
                          </span>
                          {product.variants.length > 1 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-[#14532D] font-medium">
                                {product.variants.length} kemasan
                              </span>
                            </>
                          )}
                        </div>

                        <h3 className="mt-1.5 text-base font-semibold text-zinc-900 group-hover:text-[#14532D] transition-colors">
                          {product.name}
                        </h3>

                        <p className="mt-1 text-sm text-zinc-600 line-clamp-2 leading-relaxed">
                          {product.description}
                        </p>
                      </div>
                    </button>
                  </div>

                  <div className="px-5 pb-5 pt-3 mt-auto border-t border-zinc-100 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs text-zinc-500 truncate">{defaultVariant.label}</p>
                      <p className="text-base font-semibold text-zinc-900 tabular-price">
                        {formatRupiah(defaultVariant.price)}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={isOutOfStock}
                      onClick={() => onQuickAdd(product, defaultVariant)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-lg border border-zinc-300 bg-white text-zinc-900 text-xs font-semibold hover:bg-[#14532D] hover:text-white hover:border-[#14532D] disabled:opacity-45 disabled:pointer-events-none transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14532D]"
                    >
                      <Plus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{isOutOfStock ? 'Habis' : 'Tambah'}</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

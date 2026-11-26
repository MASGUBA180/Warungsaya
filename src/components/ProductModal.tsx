import {Minus, Plus, X} from 'lucide-react';
import {useEffect, useState} from 'react';
import {formatRupiah} from '../lib/storeData';
import type {Product, ProductVariant} from '../types/store';
import {ResilientImage} from './ResilientImage';

interface ProductModalProps {
  product: Product | null;
  onClose: () => void;
  onAddToCart: (product: Product, variant: ProductVariant, quantity: number) => void;
}

export function ProductModal({product, onClose, onAddToCart}: ProductModalProps) {
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (product) {
      const available = product.variants.find((v) => v.stock > 0) ?? product.variants[0];
      setSelectedVariant(available);
      setQuantity(1);
    }
  }, [product]);

  useEffect(() => {
    if (!product) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [product, onClose]);

  if (!product || !selectedVariant) return null;

  const maxStock = Math.max(0, selectedVariant.stock);
  const subtotal = selectedVariant.price * quantity;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-2xl rounded-xl border border-zinc-200 overflow-hidden shadow-xl grid grid-cols-1 md:grid-cols-12"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="md:col-span-5 bg-zinc-100 aspect-4/3 md:aspect-auto">
          <ResilientImage
            src={product.image}
            alt={product.imageAlt}
            fallbackLabel={product.name}
            className="w-full h-full object-cover"
          />
        </div>

        <div className="md:col-span-7 p-6 flex flex-col justify-between gap-5">
          <div>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span>{product.category}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {maxStock > 0 ? `Stok ${maxStock} unit` : 'Stok Habis'}
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup detail produk"
                className="p-1.5 -mr-1.5 -mt-1.5 text-zinc-500 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <h3
              id="product-modal-title"
              className="font-display text-xl font-bold text-zinc-900 mt-2"
            >
              {product.name}
            </h3>

            <p className="text-sm text-zinc-600 leading-relaxed mt-2">{product.description}</p>

            {/* Variant selector */}
            <div className="mt-5">
              <p className="text-xs font-medium text-zinc-700 mb-2">Pilih Kemasan / Takaran</p>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((variant) => {
                  const isSelected = variant.id === selectedVariant.id;
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      onClick={() => {
                        setSelectedVariant(variant);
                        setQuantity(1);
                      }}
                      className={`px-3 py-2 min-h-[40px] rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        isSelected
                          ? 'bg-[#14532D] text-white border-[#14532D]'
                          : 'bg-white text-zinc-800 border-zinc-300 hover:bg-zinc-50'
                      }`}
                    >
                      {variant.label} · {formatRupiah(variant.price)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-200 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center border border-zinc-300 rounded-lg bg-white">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  aria-label="Kurangi jumlah"
                  className="p-2.5 text-zinc-700 hover:bg-zinc-100 rounded-l-lg cursor-pointer"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="px-3.5 text-sm font-semibold tabular-price min-w-[2.5rem] text-center">
                  {quantity}
                </span>
                <button
                  type="button"
                  disabled={quantity >= maxStock}
                  onClick={() => setQuantity((q) => Math.min(maxStock, q + 1))}
                  aria-label="Tambah jumlah"
                  className="p-2.5 text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 rounded-r-lg cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <div className="text-right">
                <p className="text-xs text-zinc-500">Total Harga</p>
                <p className="text-lg font-bold text-zinc-900 tabular-price">
                  {formatRupiah(subtotal)}
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={maxStock <= 0}
              onClick={() => {
                onAddToCart(product, selectedVariant, quantity);
                onClose();
              }}
              className="w-full py-3 px-4 min-h-[44px] rounded-lg bg-[#14532D] text-white text-sm font-semibold hover:bg-[#166534] disabled:opacity-50 disabled:pointer-events-none transition-colors cursor-pointer whitespace-nowrap"
            >
              {maxStock <= 0 ? 'Stok Sedang Habis' : 'Tambah ke Keranjang'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

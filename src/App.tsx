import {Check} from 'lucide-react';
import {useCallback, useEffect, useState} from 'react';
import {CartDrawer, CartItem} from './components/CartDrawer';
import {Footer} from './components/Footer';
import {Header} from './components/Header';
import {HeroSection} from './components/HeroSection';
import {LocationSection} from './components/LocationSection';
import {StaffPortal} from './components/ops/StaffPortal';
import {OrderTrackModal} from './components/OrderTrackModal';
import {ProductCatalog} from './components/ProductCatalog';
import {ProductModal} from './components/ProductModal';
import {DEFAULT_STORE_SETTINGS} from './data/storeData';
import type {
  Product,
  ProductCategory,
  ProductVariant,
  StoreSettings,
} from './types/store';

export default function App() {
  const [viewMode, setViewMode] = useState<'storefront' | 'portal'>('storefront');
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);

  const [selectedCategory, setSelectedCategory] = useState<ProductCategory>('Semua');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const [isTrackerOpen, setIsTrackerOpen] = useState(false);
  const [trackerInitialCode, setTrackerInitialCode] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchStoreCatalog = useCallback(async () => {
    try {
      const res = await fetch('/api/public/store');
      if (!res.ok) return;
      const data = await res.json();
      if (data.settings) setSettings(data.settings);
      if (Array.isArray(data.products)) setProducts(data.products);
    } catch {
      // keep existing state on transient error
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStoreCatalog();
  }, [fetchStoreCatalog]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const handleAddToCart = (product: Product, variant: ProductVariant, quantity: number) => {
    if (variant.stock <= 0) return;
    const itemKey = `${product.id}__${variant.id}`;
    setCartItems((prev) => {
      const existing = prev.find((item) => item.key === itemKey);
      if (existing) {
        const nextQty = Math.min(variant.stock, existing.quantity + quantity);
        return prev.map((item) =>
          item.key === itemKey ? {...item, quantity: nextQty} : item
        );
      }
      return [
        ...prev,
        {
          key: itemKey,
          product,
          variant,
          quantity: Math.min(variant.stock, quantity),
        },
      ];
    });
    setToastMessage(`${product.name} (${variant.label}) ditambahkan ke keranjang`);
  };

  const handleUpdateQuantity = (key: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((item) => {
          if (item.key !== key) return item;
          const next = Math.min(item.variant.stock, item.quantity + delta);
          return {...item, quantity: next};
        })
        .filter((item) => item.quantity > 0)
    );
  };

  const handleRemoveItem = (key: string) => {
    setCartItems((prev) => prev.filter((item) => item.key !== key));
  };

  const totalCartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  if (viewMode === 'portal') {
    return (
      <StaffPortal
        onBackToStorefront={() => {
          setViewMode('storefront');
          fetchStoreCatalog();
        }}
        onStoreDataChanged={fetchStoreCatalog}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA] text-zinc-900">
      <Header
        cartCount={totalCartCount}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenTracker={() => {
          setTrackerInitialCode('');
          setIsTrackerOpen(true);
        }}
        onOpenPortal={() => setViewMode('portal')}
      />

      <main className="flex-1">
        <HeroSection settings={settings} />

        <ProductCatalog
          products={products}
          loading={catalogLoading}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelectProduct={(product) => setSelectedProduct(product)}
          onQuickAdd={(product, variant) => handleAddToCart(product, variant, 1)}
        />

        <LocationSection
          settings={settings}
          onOpenTracker={() => {
            setTrackerInitialCode('');
            setIsTrackerOpen(true);
          }}
        />
      </main>

      <Footer
        settings={settings}
        onOpenTracker={() => {
          setTrackerInitialCode('');
          setIsTrackerOpen(true);
        }}
        onOpenPortal={() => setViewMode('portal')}
      />

      <ProductModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={handleAddToCart}
      />

      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        settings={settings}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onOrderCreated={() => {
          setCartItems([]);
          fetchStoreCatalog();
        }}
        onOpenTracker={(code) => {
          setTrackerInitialCode(code);
          setIsTrackerOpen(true);
        }}
      />

      <OrderTrackModal
        isOpen={isTrackerOpen}
        onClose={() => setIsTrackerOpen(false)}
        initialCode={trackerInitialCode}
      />

      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-40 max-w-sm bg-zinc-900 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 text-sm"
        >
          <Check className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
          <span className="truncate">{toastMessage}</span>
          <button
            type="button"
            onClick={() => {
              setToastMessage(null);
              setIsCartOpen(true);
            }}
            className="text-xs font-semibold text-emerald-300 hover:text-emerald-200 underline underline-offset-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Buka
          </button>
        </div>
      )}
    </div>
  );
}

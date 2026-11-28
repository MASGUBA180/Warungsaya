import {AlertTriangle, Check, X} from 'lucide-react';
import {useCallback, useEffect, useState} from 'react';
import {CartDrawer, CartItem} from './components/CartDrawer';
import {CustomerAccountModal} from './components/CustomerAccountModal';
import {Footer} from './components/Footer';
import {Header} from './components/Header';
import {HeroSection} from './components/HeroSection';
import {LocationSection} from './components/LocationSection';
import {StaffPortal} from './components/ops/StaffPortal';
import {OrderTrackModal} from './components/OrderTrackModal';
import {ProductCatalog} from './components/ProductCatalog';
import {ProductModal} from './components/ProductModal';
import {
  DEFAULT_STORE_SETTINGS,
  INITIAL_PUBLIC_PRODUCTS,
} from './lib/storeData';
import {apiFetch} from './lib/apiClient';
import type {
  CustomerProfile,
  Order,
  Product,
  ProductCategory,
  ProductVariant,
  StoreSettings,
} from './types/store';

const CART_STORAGE_KEY = 'tdj_cart_v1';
const CUSTOMER_SESSION_KEY = 'tdj_customer_session_v1';

function readInitialCart(): CartItem[] {
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readInitialCustomerSession(): {token: string | null; customer: CustomerProfile | null} {
  try {
    const raw = window.sessionStorage.getItem(CUSTOMER_SESSION_KEY);
    if (!raw) return {token: null, customer: null};
    const parsed = JSON.parse(raw) as {token?: string; customer?: CustomerProfile};
    if (parsed.token && parsed.customer) {
      return {token: parsed.token, customer: parsed.customer};
    }
  } catch {
    // ignore
  }
  return {token: null, customer: null};
}

export default function App() {
  const initialCustomer = readInitialCustomerSession();
  const [viewMode, setViewMode] = useState<'storefront' | 'portal'>('storefront');
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [products, setProducts] = useState<Product[]>(INITIAL_PUBLIC_PRODUCTS);
  const [catalogLoading, setCatalogLoading] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState<ProductCategory>('Semua');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>(readInitialCart);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const [isTrackerOpen, setIsTrackerOpen] = useState(false);
  const [trackerInitialCode, setTrackerInitialCode] = useState('');

  // Customer session persisted in sessionStorage
  const [customerToken, setCustomerToken] = useState<string | null>(initialCustomer.token);
  const [customer, setCustomer] = useState<CustomerProfile | null>(initialCustomer.customer);
  const [isAccountOpen, setIsAccountOpen] = useState(false);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [mapsQuotaBanner, setMapsQuotaBanner] = useState(false);

  const fetchStoreCatalog = useCallback(async () => {
    try {
      const res = await apiFetch<{settings?: StoreSettings; products?: Product[]}>(
        '/api/public/store'
      );
      if (!res.ok) return;
      if (res.data.settings) setSettings(res.data.settings);
      if (Array.isArray(res.data.products)) setProducts(res.data.products);
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
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
    } catch {
      // ignore quota errors
    }
  }, [cartItems]);

  useEffect(() => {
    if (!customerToken) return;
    let active = true;
    apiFetch<{customer?: CustomerProfile}>('/api/customer/me', {
      headers: {Authorization: `Bearer ${customerToken}`},
    })
      .then((res) => {
        if (!active) return;
        if (res.ok && res.data.customer) {
          setCustomer(res.data.customer);
          try {
            window.sessionStorage.setItem(
              CUSTOMER_SESSION_KEY,
              JSON.stringify({token: customerToken, customer: res.data.customer})
            );
          } catch {
            // ignore
          }
        } else if (res.status === 401) {
          setCustomerToken(null);
          setCustomer(null);
          window.sessionStorage.removeItem(CUSTOMER_SESSION_KEY);
        }
      })
      .catch(() => {
        // ignore transient errors
      });
    return () => {
      active = false;
    };
  }, [customerToken]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    const onQuota = () => setMapsQuotaBanner(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

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

  const handleReorderItems = (orderItems: Order['items']) => {
    let addedCount = 0;
    for (const item of orderItems) {
      const prod = products.find((p) => p.id === item.productId);
      const variant = prod?.variants.find((v) => v.id === item.variantId);
      if (prod && variant && variant.stock > 0) {
        handleAddToCart(prod, variant, Math.min(variant.stock, item.quantity));
        addedCount += 1;
      }
    }
    if (addedCount > 0) {
      setIsCartOpen(true);
    } else {
      setToastMessage('Stok produk dari pesanan sebelumnya sedang habis.');
    }
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

  const quotaBanner = mapsQuotaBanner ? (
    <div
      role="alert"
      className="sticky top-0 z-50 bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-xs text-amber-950"
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
          <p className="truncate sm:whitespace-normal">
            Batas kuota Google Maps tercapai atau kunci peta belum diaktifkan — tampilan beralih ke peta rute lokal.{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline underline-offset-2 text-amber-900"
            >
              Panduan Kuota &amp; Billing
            </a>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMapsQuotaBanner(false)}
          aria-label="Tutup pemberitahuan peta"
          className="p-1 text-amber-800 hover:bg-amber-100 rounded cursor-pointer shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  ) : null;

  if (viewMode === 'portal') {
    return (
      <>
        {quotaBanner}
        <StaffPortal
          onBackToStorefront={() => {
            setViewMode('storefront');
            fetchStoreCatalog();
          }}
          onStoreDataChanged={fetchStoreCatalog}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA] text-zinc-900">
      {quotaBanner}
      <Header
        cartCount={totalCartCount}
        customer={customer}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenTracker={() => {
          setTrackerInitialCode('');
          setIsTrackerOpen(true);
        }}
        onOpenAccount={() => setIsAccountOpen(true)}
        onOpenPortal={() => setViewMode('portal')}
      />

      <main className="flex-1">
        <HeroSection
          settings={settings}
          customer={customer}
          onOpenTracker={() => {
            setTrackerInitialCode('');
            setIsTrackerOpen(true);
          }}
          onOpenAccount={() => setIsAccountOpen(true)}
          onOpenPortal={() => setViewMode('portal')}
        />

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
        onOpenAccount={() => setIsAccountOpen(true)}
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
        customer={customer}
        customerToken={customerToken}
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
        settings={settings}
        customerToken={customerToken}
      />

      <CustomerAccountModal
        isOpen={isAccountOpen}
        onClose={() => setIsAccountOpen(false)}
        customer={customer}
        customerToken={customerToken}
        onAuthenticated={(token, profile) => {
          setCustomerToken(token);
          setCustomer(profile);
          try {
            window.sessionStorage.setItem(
              CUSTOMER_SESSION_KEY,
              JSON.stringify({token, customer: profile})
            );
          } catch {
            // ignore
          }
        }}
        onLogout={() => {
          setCustomerToken(null);
          setCustomer(null);
          try {
            window.sessionStorage.removeItem(CUSTOMER_SESSION_KEY);
          } catch {
            // ignore
          }
        }}
        onOpenOrderTracker={(code) => {
          setTrackerInitialCode(code);
          setIsTrackerOpen(true);
        }}
        onReorderItems={handleReorderItems}
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

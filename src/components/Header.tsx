import {Menu, ShoppingBag, X} from 'lucide-react';
import {useState} from 'react';
import type {CustomerProfile} from '../types/store';

interface HeaderProps {
  storeName?: string;
  cartCount: number;
  customer: CustomerProfile | null;
  onOpenCart: () => void;
  onOpenTracker: () => void;
  onOpenAccount: () => void;
  onOpenPortal: () => void;
}

export function Header({
  storeName = 'Toko Dimas Jaya',
  cartCount,
  customer,
  onOpenCart,
  onOpenTracker,
  onOpenAccount,
  onOpenPortal,
}: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-zinc-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Zone 1: Single-element brand wordmark */}
        <a
          href="#beranda"
          className="font-display text-lg sm:text-xl font-bold tracking-tight text-zinc-900 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14532D] rounded-sm"
        >
          {storeName}
        </a>

        {/* Zone 2: Concise single-line nav links (5 links max) */}
        <nav
          aria-label="Navigasi utama"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-600"
        >
          <a
            href="#katalog"
            className="hover:text-zinc-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Katalog
          </a>
          <button
            type="button"
            onClick={onOpenTracker}
            className="hover:text-zinc-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Lacak Pesanan
          </button>
          <button
            type="button"
            onClick={onOpenAccount}
            className="hover:text-zinc-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer text-[#14532D] font-semibold"
          >
            {customer ? `Akun: ${customer.name.split(' ')[0]}` : 'Akun Saya'}
          </button>
          <a
            href="#lokasi"
            className="hover:text-zinc-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Lokasi
          </a>
          <button
            type="button"
            onClick={onOpenPortal}
            className="hover:text-zinc-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Portal Staf
          </button>
        </nav>

        {/* Zone 3: Primary action + mobile menu button */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenCart}
            className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2.5 min-h-[40px] rounded-lg bg-[#14532D] text-white text-sm font-medium hover:bg-[#166534] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#14532D]"
          >
            <ShoppingBag className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Keranjang</span>
            {cartCount > 0 && (
              <span className="tabular-price font-mono text-xs bg-white/15 px-1.5 py-0.5 rounded">
                {cartCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
            className="md:hidden p-2 min-h-[40px] rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile navigation drawer */}
      {mobileMenuOpen && (
        <nav
          aria-label="Menu navigasi mobile"
          className="md:hidden border-t border-zinc-200 bg-white px-4 py-3 grid grid-cols-2 gap-2 text-xs font-medium"
        >
          <a
            href="#katalog"
            onClick={() => setMobileMenuOpen(false)}
            className="px-3 py-2.5 rounded-lg border border-zinc-200 text-zinc-800 hover:bg-zinc-50"
          >
            Katalog Barang
          </a>
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              onOpenTracker();
            }}
            className="text-left px-3 py-2.5 rounded-lg border border-zinc-200 text-zinc-800 hover:bg-zinc-50 cursor-pointer"
          >
            Lacak Pesanan
          </button>
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              onOpenAccount();
            }}
            className="text-left px-3 py-2.5 rounded-lg border border-emerald-200 bg-emerald-50 text-[#14532D] font-semibold cursor-pointer"
          >
            {customer ? `Akun: ${customer.name.split(' ')[0]}` : 'Akun Saya'}
          </button>
          <a
            href="#lokasi"
            onClick={() => setMobileMenuOpen(false)}
            className="px-3 py-2.5 rounded-lg border border-zinc-200 text-zinc-800 hover:bg-zinc-50"
          >
            Lokasi Toko
          </a>
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              onOpenPortal();
            }}
            className="col-span-2 text-left px-3 py-2.5 rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-50 cursor-pointer"
          >
            Portal Staf &amp; Pemilik
          </button>
        </nav>
      )}
    </header>
  );
}

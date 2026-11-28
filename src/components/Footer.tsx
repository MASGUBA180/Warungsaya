import type {StoreSettings} from '../types/store';

interface FooterProps {
  settings: StoreSettings;
  onOpenTracker: () => void;
  onOpenAccount: () => void;
  onOpenPortal: () => void;
}

export function Footer({
  settings,
  onOpenTracker,
  onOpenAccount,
  onOpenPortal,
}: FooterProps) {
  return (
    <footer className="bg-white border-t border-zinc-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="space-y-1">
          <p className="font-display text-lg font-bold text-zinc-900">{settings.name}</p>
          <p className="text-sm text-zinc-600">{settings.fullAddress}</p>
          <p className="text-xs text-zinc-500">
            {settings.daysOpen} · {settings.hours}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-6 text-sm text-zinc-600">
          <a href="#katalog" className="hover:text-zinc-900 transition-colors whitespace-nowrap">
            Katalog
          </a>
          <button
            type="button"
            onClick={onOpenTracker}
            className="hover:text-zinc-900 transition-colors whitespace-nowrap cursor-pointer"
          >
            Lacak Pesanan
          </button>
          <button
            type="button"
            onClick={onOpenAccount}
            className="hover:text-zinc-900 transition-colors whitespace-nowrap cursor-pointer"
          >
            Akun Pelanggan
          </button>
          <a href="#lokasi" className="hover:text-zinc-900 transition-colors whitespace-nowrap">
            Lokasi Toko
          </a>
          <button
            type="button"
            onClick={onOpenPortal}
            className="hover:text-zinc-900 font-medium text-[#14532D] transition-colors whitespace-nowrap cursor-pointer"
          >
            Portal Staf &amp; Pemilik
          </button>
        </div>
      </div>

      <div className="border-t border-zinc-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-zinc-500">
          <span>© 2026 {settings.name}. Melayani warga Gunung Batin Udik, Lampung Tengah.</span>
          <span>Pembayaran Tunai, COD Antar Lokal &amp; QRIS Dinamis</span>
        </div>
      </div>
    </footer>
  );
}

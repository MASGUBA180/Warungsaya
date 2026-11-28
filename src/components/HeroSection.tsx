import {ArrowRight, MapPin} from 'lucide-react';
import {STORE_HIGHLIGHTS} from '../lib/storeData';
import type {CustomerProfile, StoreSettings} from '../types/store';
import {ResilientImage} from './ResilientImage';

interface HeroSectionProps {
  settings: StoreSettings;
  customer: CustomerProfile | null;
  onOpenTracker: () => void;
  onOpenAccount: () => void;
  onOpenPortal: () => void;
}

export function HeroSection({
  settings,
  customer,
  onOpenTracker,
  onOpenAccount,
  onOpenPortal,
}: HeroSectionProps) {
  return (
    <section id="beranda" className="bg-white border-b border-zinc-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-12 lg:pt-14 lg:pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-between py-1">
            <div>
              <p className="text-xs sm:text-sm font-medium text-zinc-600 mb-4 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>Gang Makam</span>
                <span aria-hidden="true">·</span>
                <span>Gunung Batin Udik</span>
                <span aria-hidden="true">·</span>
                <span>Lampung Tengah</span>
              </p>

              <h1 className="font-display text-3xl sm:text-4xl lg:text-[2.75rem] font-bold tracking-tight text-zinc-900 leading-[1.12] [text-wrap:balance] max-w-xl">
                Belanja Sembako &amp; Kebutuhan Harian Dekat Rumah
              </h1>

              <p className="mt-5 text-base text-zinc-600 leading-relaxed max-w-xl">
                {settings.name} melayani warga Gang Makam dan Kampung Gunung Batin Udik setiap hari.
                Tersedia beras, minyak goreng, telur segar, kopi Lampung, bumbu dapur, hingga air
                galon siap antar langsung ke rumah.
              </p>
            </div>

            <div className="mt-8 space-y-4">
              <div className="flex flex-wrap items-center gap-4">
                <a
                  href="#katalog"
                  className="inline-flex items-center gap-2 px-5 py-3 min-h-[44px] rounded-lg bg-[#14532D] text-white text-sm font-semibold hover:bg-[#166534] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#14532D]"
                >
                  <span>Lihat Katalog Produk</span>
                  <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
                </a>

                <a
                  href="#lokasi"
                  className="inline-flex items-center gap-2 px-4 py-3 min-h-[44px] rounded-lg border border-zinc-300 bg-white text-zinc-800 text-sm font-medium hover:bg-zinc-50 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-zinc-400"
                >
                  <MapPin className="w-4 h-4 text-[#14532D] shrink-0" aria-hidden="true" />
                  <span>Lokasi &amp; Jam Buka</span>
                </a>
              </div>

              <div className="md:hidden flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-zinc-600 pt-1">
                <button
                  type="button"
                  onClick={onOpenAccount}
                  className="text-[#14532D] font-semibold underline underline-offset-4 cursor-pointer"
                >
                  {customer ? `Akun: ${customer.name}` : 'Akun Saya & Riwayat'}
                </button>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={onOpenTracker}
                  className="hover:text-zinc-900 underline underline-offset-4 cursor-pointer"
                >
                  Lacak Pesanan
                </button>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={onOpenPortal}
                  className="hover:text-zinc-900 underline underline-offset-4 cursor-pointer"
                >
                  Portal Staf
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="relative w-full aspect-16/10 lg:aspect-auto lg:h-full min-h-[260px] rounded-xl overflow-hidden bg-zinc-100 border border-zinc-200">
              <ResilientImage
                src={settings.heroImage}
                alt="Suasana rak sembako dan pelayanan di Toko Dimas Jaya Gang Makam Gunung Batin Udik"
                className="w-full h-full object-cover"
                fallbackLabel="Toko Dimas Jaya · Gang Makam"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent p-5">
                <p className="text-xs font-medium text-white/90">
                  {settings.daysOpen} · {settings.hours}
                </p>
                <p className="text-sm font-semibold text-white mt-0.5">
                  {settings.streetAddress}, {settings.province}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Full-width 4-column highlights strip below the split */}
        <div
          id="layanan"
          className="mt-10 pt-8 border-t border-zinc-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8"
        >
          {STORE_HIGHLIGHTS.map((item) => (
            <div key={item.index} className="space-y-1.5">
              <p className="text-xs font-mono font-medium text-[#14532D] tabular-price">
                {item.index}
              </p>
              <h2 className="text-sm font-semibold text-zinc-900">{item.title}</h2>
              <p className="text-sm text-zinc-600 leading-relaxed">{item.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

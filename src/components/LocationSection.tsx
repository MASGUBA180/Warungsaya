import {Check, Clock, Copy, ExternalLink, MapPin, Truck} from 'lucide-react';
import {useState} from 'react';
import type {StoreSettings} from '../types/store';
import {DeliveryMap} from './DeliveryMap';

const ORDER_STEPS = [
  {
    step: '01.',
    title: 'Pilih Barang di Katalog',
    text: 'Masukkan beras, minyak, telur, galon, atau keperluan rumah tangga ke keranjang belanja.',
  },
  {
    step: '02.',
    title: 'Isi Alamat Gang atau Patokan',
    text: 'Pilih antar langsung ke rumah sekitar Gang Makam & Gunung Batin Udik, atau ambil sendiri di toko.',
  },
  {
    step: '03.',
    title: 'Bayar Tunai saat Barang Tiba',
    text: 'Pantau kode pesanan Anda lewat menu Lacak Pesanan lalu bayar tunai di tempat (COD) saat barang sampai.',
  },
];

interface LocationSectionProps {
  settings: StoreSettings;
  onOpenTracker: () => void;
}

export function LocationSection({settings, onOpenTracker}: LocationSectionProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(settings.fullAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section id="lokasi" className="py-12 lg:py-16 bg-white border-t border-zinc-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          {/* Left: Store address & map route */}
          <div className="lg:col-span-6 space-y-5">
            <div>
              <p className="text-xs font-medium text-zinc-500">Lokasi Fisik & Area Layanan</p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 mt-1 [text-wrap:balance]">
                Alamat {settings.name}
              </h2>
            </div>

            <div className="p-6 rounded-xl bg-[#F3F4F2] border border-zinc-200 space-y-4">
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-[#14532D] shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-base font-semibold text-zinc-900">
                    {settings.streetAddress}
                  </p>
                  <p className="text-sm text-zinc-600 mt-0.5">
                    {settings.district}, {settings.province}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 pt-3 border-t border-zinc-200">
                <Clock className="w-5 h-5 text-[#14532D] shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-zinc-900">{settings.daysOpen}</p>
                  <p className="text-sm text-zinc-600 tabular-price">
                    Buka pukul {settings.hours}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 pt-3 border-t border-zinc-200">
                <Truck className="w-5 h-5 text-[#14532D] shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-zinc-900">Pengantaran Lokal</p>
                  <p className="text-sm text-zinc-600">{settings.deliveryArea}</p>
                </div>
              </div>

              <div className="pt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleCopyAddress}
                  className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[40px] rounded-lg border border-zinc-300 bg-white text-zinc-900 text-xs font-semibold hover:bg-zinc-50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#14532D]" aria-hidden="true" />
                      <span>Alamat Disalin</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Salin Alamat</span>
                    </>
                  )}
                </button>

                <a
                  href={settings.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[40px] rounded-lg bg-[#14532D] text-white text-xs font-semibold hover:bg-[#166534] transition-colors whitespace-nowrap"
                >
                  <span>Buka Petunjuk Arah</span>
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                </a>
              </div>
            </div>

            <DeliveryMap
              mapInstanceId="storefront-location-map"
              storeName={settings.name}
              storeAddress={settings.fullAddress}
              storeCoords={settings.storeCoords}
              mapsUrl={settings.mapsUrl}
              heightClass="h-52"
            />
          </div>

          {/* Right: Ordering guide & order tracking shortcut */}
          <div id="cara-pesan" className="lg:col-span-6 space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-zinc-500">Panduan Belanja Praktis</p>
                <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 mt-1 [text-wrap:balance]">
                  Cara Pesan & Lacak Pengiriman
                </h2>
              </div>

              <button
                type="button"
                onClick={onOpenTracker}
                className="px-3.5 py-2 min-h-[40px] rounded-lg border border-zinc-300 bg-white text-xs font-semibold text-zinc-900 hover:bg-zinc-50 transition-colors cursor-pointer whitespace-nowrap"
              >
                Lacak Kode Pesanan
              </button>
            </div>

            <div className="divide-y divide-zinc-200 border border-zinc-200 rounded-xl bg-white">
              {ORDER_STEPS.map((item) => (
                <div key={item.step} className="p-5 flex items-start gap-4">
                  <span className="font-mono text-xs font-medium text-[#14532D] tabular-price pt-0.5 shrink-0">
                    {item.step}
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900">{item.title}</h3>
                    <p className="text-sm text-zinc-600 mt-1 leading-relaxed">{item.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

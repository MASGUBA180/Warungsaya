import type {DivisionRole, OrderStatus, ProductCategory, StoreSettings} from '../types/store';

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  name: 'Toko Dimas Jaya',
  tagline: 'Sembako & Kebutuhan Harian Lengkap',
  streetAddress: 'Gang Makam, Kampung Gunung Batin Udik',
  district: 'Kecamatan Terusan Nunyai, Kabupaten Lampung Tengah',
  province: 'Lampung',
  fullAddress:
    'Gang Makam, Kampung Gunung Batin Udik, Kec. Terusan Nunyai, Kab. Lampung Tengah, Lampung',
  hours: '06.30 – 21.00 WIB',
  daysOpen: 'Buka Setiap Hari (Senin – Minggu)',
  deliveryArea: 'Gratis antar sekitar Gang Makam & Gunung Batin Udik (min. belanja Rp 50.000)',
  deliveryFee: 5000,
  freeDeliveryMin: 50000,
  mapsUrl:
    'https://www.google.com/maps/search/?api=1&query=Gunung+Batin+Udik+Terusan+Nunyai+Lampung+Tengah',
  heroImage: '/src/assets/images/hero_toko_dimas_jaya_1795680105174.jpg',
};

export const STORE_CATEGORIES: ProductCategory[] = [
  'Semua',
  'Sembako',
  'Kopi & Gula',
  'Dapur & Bumbu',
  'Kebersihan',
  'Galon & Minuman',
];

export const STORE_HIGHLIGHTS = [
  {
    index: '01.',
    title: 'Sembako Segar Harian',
    detail: 'Stok beras, telur, minyak, dan bumbu dapur selalu baru setiap pagi.',
  },
  {
    index: '02.',
    title: 'Antar Sekitar Gang Makam',
    detail: 'Pengantaran cepat langsung ke rumah warga Gunung Batin Udik.',
  },
  {
    index: '03.',
    title: 'Bayar Tunai atau COD',
    detail: 'Bayar di tempat saat barang diterima atau ambil langsung di toko.',
  },
  {
    index: '04.',
    title: 'Harga Ecer & Warung',
    detail: 'Melayani belanja rumah tangga harian maupun kulakan warung sekitar.',
  },
];

export const ROLE_LABELS: Record<DivisionRole, string> = {
  PEMILIK: 'Pemilik Toko',
  KASIR: 'Divisi Kasir',
  GUDANG: 'Divisi Gudang & Stok',
  KURIR: 'Divisi Pengantaran / Kurir',
  KEUANGAN: 'Divisi Keuangan & Kasbon',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  MENUNGGU: 'Menunggu Konfirmasi',
  DISIAPKAN: 'Sedang Disiapkan',
  DIANTAR: 'Sedang Diantar',
  SELESAI: 'Selesai',
  DIBATALKAN: 'Dibatalkan',
};

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

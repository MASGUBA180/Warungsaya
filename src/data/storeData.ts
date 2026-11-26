import type {
  DivisionRole,
  OrderStatus,
  Product,
  ProductCategory,
  StoreSettings,
} from '../types/store';

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

export const INITIAL_PUBLIC_PRODUCTS: Product[] = [
  {
    id: 'beras-pandan-wangi',
    name: 'Beras Pulen Pilihan',
    category: 'Sembako',
    unitSummary: '5 kg · 10 kg · 25 kg',
    availability: 'Stok Tersedia',
    description:
      'Beras putih bersih, pulen, tidak berbau apek, dan cocok untuk nasi harian keluarga maupun hajatan warga.',
    image: '/src/assets/images/produk_beras_minyak_telur_1795680105474.jpg',
    imageAlt: 'Karung beras putih pilihan di Toko Dimas Jaya',
    variants: [
      {id: 'beras-5kg', label: 'Karung 5 kg', price: 72000, stock: 24, minStock: 6},
      {id: 'beras-10kg', label: 'Karung 10 kg', price: 142000, stock: 16, minStock: 4},
      {id: 'beras-25kg', label: 'Karung 25 kg', price: 350000, stock: 8, minStock: 2},
    ],
  },
  {
    id: 'minyak-goreng-kemasan',
    name: 'Minyak Goreng Sawit Jernih',
    category: 'Sembako',
    unitSummary: '1 Liter · 2 Liter',
    availability: 'Stok Tersedia',
    description:
      'Minyak goreng kelapa sawit dua kali penyaringan. Jernih, hemat dipakai menggoreng lauk dan gorengan.',
    image: '/src/assets/images/produk_beras_minyak_telur_1795680105474.jpg',
    imageAlt: 'Minyak goreng sawit kemasan jernih',
    variants: [
      {id: 'minyak-1l', label: 'Pouch 1 Liter', price: 17500, stock: 36, minStock: 10},
      {id: 'minyak-2l', label: 'Pouch 2 Liter', price: 34500, stock: 22, minStock: 6},
    ],
  },
  {
    id: 'telur-ayam-negeri',
    name: 'Telur Ayam Negeri Segar',
    category: 'Sembako',
    unitSummary: '½ kg · 1 kg · 1 Karpet',
    availability: 'Stok Pagi Ini',
    description:
      'Telur ayam segar pilihan dengan cangkang tebal dan kuning telur pekat. Bisa beli ecer setengah kilo atau satu karpet.',
    image: '/src/assets/images/produk_beras_minyak_telur_1795680105474.jpg',
    imageAlt: 'Telur ayam negeri segar dalam wadah kayu',
    variants: [
      {id: 'telur-half', label: '½ kg (± 8 butir)', price: 14500, stock: 20, minStock: 5},
      {id: 'telur-1kg', label: '1 kg (± 16 butir)', price: 28000, stock: 18, minStock: 5},
      {id: 'telur-karpet', label: '1 Karpet (± 30 butir)', price: 52000, stock: 7, minStock: 3},
    ],
  },
  {
    id: 'kopi-bubuk-lampung',
    name: 'Kopi Robusta Asli Lampung',
    category: 'Kopi & Gula',
    unitSummary: '250 gr · 500 gr',
    availability: 'Stok Tersedia',
    description:
      'Kopi bubuk robusta sangrai gelap khas Lampung Tengah dengan aroma kuat dan rasa mantap untuk seduhan pagi.',
    image: '/src/assets/images/produk_kopi_lampung_gula_1795680105852.jpg',
    imageAlt: 'Kemasan kopi bubuk robusta asli Lampung',
    variants: [
      {id: 'kopi-250', label: 'Kemasan 250 gr', price: 22000, stock: 28, minStock: 6},
      {id: 'kopi-500', label: 'Kemasan 500 gr', price: 42000, stock: 14, minStock: 4},
    ],
  },
  {
    id: 'gula-pasir-putih',
    name: 'Gula Pasir & Gula Aren',
    category: 'Kopi & Gula',
    unitSummary: '1 kg · Paket Hemat',
    availability: 'Stok Tersedia',
    description:
      'Gula pasir kristal tebu manis alami dan gula merah batok pilihan untuk campuran kopi, teh, atau bumbu masak.',
    image: '/src/assets/images/produk_kopi_lampung_gula_1795680105852.jpg',
    imageAlt: 'Gula pasir tebu dan gula aren pilihan',
    variants: [
      {id: 'gula-pasir-1kg', label: 'Gula Pasir 1 kg', price: 17500, stock: 40, minStock: 10},
      {id: 'gula-aren-500g', label: 'Gula Aren 500 gr', price: 16000, stock: 15, minStock: 5},
      {id: 'paket-kopi-gula', label: 'Paket Kopi 250gr + Gula 1kg', price: 38000, stock: 12, minStock: 4},
    ],
  },
  {
    id: 'bumbu-dapur-harian',
    name: 'Bawang, Kecap & Bumbu Dapur',
    category: 'Dapur & Bumbu',
    unitSummary: 'Ecer & Paket Masak',
    availability: 'Stok Tersedia',
    description:
      'Paket kebutuhan masak harian berisi bawang merah, bawang putih pilihan, dan kecap manis botol untuk keperluan dapur.',
    image: '/src/assets/images/produk_bumbu_dapur_mie_1795680106723.jpg',
    imageAlt: 'Bawang merah, bawang putih, dan kecap untuk bumbu dapur',
    variants: [
      {id: 'bumbu-paket', label: 'Paket Bawang ½ kg + Kecap', price: 26000, stock: 18, minStock: 5},
      {id: 'bawang-merah-half', label: 'Bawang Merah ½ kg', price: 18000, stock: 22, minStock: 5},
      {id: 'kecap-sedang', label: 'Kecap Manis Botol', price: 14000, stock: 26, minStock: 6},
    ],
  },
  {
    id: 'mie-instan-paket',
    name: 'Mi Instan Goreng & Kuah',
    category: 'Dapur & Bumbu',
    unitSummary: '5 Bungkus · 1 Dus',
    availability: 'Stok Tersedia',
    description:
      'Stok mi instan goreng dan kuah favorit keluarga untuk persediaan di rumah, harga lebih hemat per paket maupun dus.',
    image: '/src/assets/images/produk_bumbu_dapur_mie_1795680106723.jpg',
    imageAlt: 'Tumpukan kemasan mi instan goreng dan kuah',
    variants: [
      {id: 'mie-5pcs', label: 'Paket 5 Bungkus Campur', price: 16000, stock: 34, minStock: 8},
      {id: 'mie-1dus', label: '1 Dus (40 Bungkus)', price: 118000, stock: 11, minStock: 3},
    ],
  },
  {
    id: 'deterjen-sabun-cuci',
    name: 'Deterjen & Sabun Cuci Piring',
    category: 'Kebersihan',
    unitSummary: '750 ml · 1,5 Liter',
    availability: 'Stok Tersedia',
    description:
      'Perlengkapan kebersihan rumah tangga: deterjen cair wangi bersih dan cairan pencuci piring ekstrak jeruk nipis.',
    image: '/src/assets/images/produk_sabun_deterjen_rumah_1795680106836.jpg',
    imageAlt: 'Deterjen cair dan sabun cuci piring keperluan rumah tangga',
    variants: [
      {id: 'sabun-piring-750', label: 'Sabun Cuci Piring 750 ml', price: 13500, stock: 25, minStock: 6},
      {id: 'deterjen-1500', label: 'Deterjen Cair 1,5 Liter', price: 29000, stock: 14, minStock: 4},
      {id: 'paket-bersih', label: 'Paket Deterjen + Sabun Piring', price: 40000, stock: 9, minStock: 3},
    ],
  },
  {
    id: 'air-galon-minuman',
    name: 'Air Mineral Galon & Teh Botol',
    category: 'Galon & Minuman',
    unitSummary: 'Isi Ulang · Segel · Dus',
    availability: 'Siap Antar',
    description:
      'Air mineral galon higienis siap antar ke rumah sekitar Gang Makam, tersedia juga minuman teh dan air kemasan dingin.',
    image: '/src/assets/images/produk_galon_gas_minuman_1795680107564.jpg',
    imageAlt: 'Air mineral galon dan minuman kemasan dingin',
    variants: [
      {id: 'galon-tukar', label: 'Galon Mineral Tukar Tabung (19 L)', price: 20000, stock: 20, minStock: 6},
      {id: 'air-dus-24', label: 'Air Mineral Gelas (1 Dus / 48 cup)', price: 22000, stock: 15, minStock: 4},
      {id: 'teh-dingin-6', label: 'Teh Kemasan Dingin (6 Botol)', price: 24000, stock: 18, minStock: 5},
    ],
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

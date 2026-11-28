import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AuditLogEntry,
  CashierShift,
  ComplaintRecord,
  DivisionRole,
  GeoPoint,
  KasbonRecord,
  LedgerEntry,
  Order,
  Product,
  StockMovement,
  StoreSettings,
  SupplierDelivery,
} from '../src/types/store.ts';

export interface StoredStaff {
  id: string;
  username: string;
  displayName: string;
  role: DivisionRole;
  passcodeHash: string;
  active: boolean;
  createdAt: string;
}

export interface StoredCustomer {
  id: string;
  name: string;
  phone: string;
  defaultAddress: string;
  savedCoords?: GeoPoint | null;
  passcodeHash: string;
  createdAt: string;
}

export interface TokoDatabase {
  settings: StoreSettings;
  products: Product[];
  orders: Order[];
  stockMovements: StockMovement[];
  ledger: LedgerEntry[];
  kasbon: KasbonRecord[];
  supplierDeliveries: SupplierDelivery[];
  complaints: ComplaintRecord[];
  shifts: CashierShift[];
  auditLogs: AuditLogEntry[];
  customers: StoredCustomer[];
  staff: StoredStaff[];
  orderSeq: number;
  complaintSeq: number;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.resolve(DATA_DIR, 'toko-db.json');

if (!DB_FILE.startsWith(DATA_DIR + path.sep)) {
  throw new Error('Invalid database path resolution');
}

export function hashPasscode(passcode: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(passcode, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPasscode(passcode: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuffer = Buffer.from(keyHex, 'hex');
  const derivedBuffer = crypto.scryptSync(passcode, salt, 64);
  if (keyBuffer.length !== derivedBuffer.length) return false;
  return crypto.timingSafeEqual(keyBuffer, derivedBuffer);
}

function createInitialDatabase(): TokoDatabase {
  const now = new Date().toISOString();

  return {
    settings: {
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
      whatsappNumber: '6281279008899',
      qrisMerchantName: 'TOKO DIMAS JAYA',
      qrisNmid: 'ID1020260000188',
    },
    products: [
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
          {id: 'beras-5kg', label: 'Karung 5 kg', price: 72000, costPrice: 64000, stock: 24, minStock: 6},
          {id: 'beras-10kg', label: 'Karung 10 kg', price: 142000, costPrice: 127000, stock: 16, minStock: 4},
          {id: 'beras-25kg', label: 'Karung 25 kg', price: 350000, costPrice: 318000, stock: 8, minStock: 2},
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
          {id: 'minyak-1l', label: 'Pouch 1 Liter', price: 17500, costPrice: 15200, stock: 36, minStock: 10},
          {id: 'minyak-2l', label: 'Pouch 2 Liter', price: 34500, costPrice: 30000, stock: 22, minStock: 6},
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
          {id: 'telur-half', label: '½ kg (± 8 butir)', price: 14500, costPrice: 12500, stock: 20, minStock: 5},
          {id: 'telur-1kg', label: '1 kg (± 16 butir)', price: 28000, costPrice: 24500, stock: 18, minStock: 5},
          {id: 'telur-karpet', label: '1 Karpet (± 30 butir)', price: 52000, costPrice: 46500, stock: 7, minStock: 3},
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
          {id: 'kopi-250', label: 'Kemasan 250 gr', price: 22000, costPrice: 18000, stock: 28, minStock: 6},
          {id: 'kopi-500', label: 'Kemasan 500 gr', price: 42000, costPrice: 35000, stock: 14, minStock: 4},
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
          {id: 'gula-pasir-1kg', label: 'Gula Pasir 1 kg', price: 17500, costPrice: 15500, stock: 40, minStock: 10},
          {id: 'gula-aren-500g', label: 'Gula Aren 500 gr', price: 16000, costPrice: 13000, stock: 15, minStock: 5},
          {id: 'paket-kopi-gula', label: 'Paket Kopi 250gr + Gula 1kg', price: 38000, costPrice: 33000, stock: 12, minStock: 4},
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
          {id: 'bumbu-paket', label: 'Paket Bawang ½ kg + Kecap', price: 26000, costPrice: 21500, stock: 18, minStock: 5},
          {id: 'bawang-merah-half', label: 'Bawang Merah ½ kg', price: 18000, costPrice: 15000, stock: 22, minStock: 5},
          {id: 'kecap-sedang', label: 'Kecap Manis Botol', price: 14000, costPrice: 11500, stock: 26, minStock: 6},
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
          {id: 'mie-5pcs', label: 'Paket 5 Bungkus Campur', price: 16000, costPrice: 13800, stock: 34, minStock: 8},
          {id: 'mie-1dus', label: '1 Dus (40 Bungkus)', price: 118000, costPrice: 108000, stock: 11, minStock: 3},
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
          {id: 'sabun-piring-750', label: 'Sabun Cuci Piring 750 ml', price: 13500, costPrice: 11000, stock: 25, minStock: 6},
          {id: 'deterjen-1500', label: 'Deterjen Cair 1,5 Liter', price: 29000, costPrice: 24500, stock: 14, minStock: 4},
          {id: 'paket-bersih', label: 'Paket Deterjen + Sabun Piring', price: 40000, costPrice: 35000, stock: 9, minStock: 3},
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
          {id: 'galon-tukar', label: 'Galon Mineral Tukar Tabung (19 L)', price: 20000, costPrice: 16500, stock: 20, minStock: 6},
          {id: 'air-dus-24', label: 'Air Mineral Gelas (1 Dus / 48 cup)', price: 22000, costPrice: 18500, stock: 15, minStock: 4},
          {id: 'teh-dingin-6', label: 'Teh Kemasan Dingin (6 Botol)', price: 24000, costPrice: 19500, stock: 18, minStock: 5},
        ],
      },
    ],
    orders: [
      {
        id: 'ord-seed-1001',
        orderNumber: 'DJ-1001',
        source: 'ONLINE',
        customerId: null,
        customerName: 'Ibu Rina',
        phone: '081379001122',
        deliveryMethod: 'cod',
        addressNote: 'Gang Makam RT 02, rumah pagar hijau',
        notes: 'Antar pagi ya mas',
        paymentMethod: 'COD',
        paymentStatus: 'BELUM_BAYAR',
        status: 'DIANTAR',
        items: [
          {
            productId: 'beras-pandan-wangi',
            productName: 'Beras Pulen Pilihan',
            variantId: 'beras-10kg',
            variantLabel: 'Karung 10 kg',
            unitPrice: 142000,
            costPrice: 127000,
            quantity: 1,
          },
          {
            productId: 'telur-ayam-negeri',
            productName: 'Telur Ayam Negeri Segar',
            variantId: 'telur-1kg',
            variantLabel: '1 kg (± 16 butir)',
            unitPrice: 28000,
            costPrice: 24500,
            quantity: 1,
          },
        ],
        subtotal: 170000,
        deliveryFee: 0,
        total: 170000,
        handledBy: 'Kasir Toko',
        courierName: 'Kurir Gang Makam',
        tracking: {
          checkpoint: 'MENUJU_LOKASI',
          locationNote: 'Kurir berangkat dari toko melewati simpang Gang Makam',
          progressPercent: 55,
          etaMinutes: 10,
          updatedAt: now,
        },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'ord-seed-1002',
        orderNumber: 'DJ-1002',
        source: 'POS',
        customerId: null,
        customerName: 'Pak Hendro',
        phone: '085268003344',
        deliveryMethod: 'instore',
        addressNote: 'Belanja langsung di Toko Dimas Jaya',
        notes: '',
        paymentMethod: 'TUNAI',
        paymentStatus: 'LUNAS',
        status: 'SELESAI',
        items: [
          {
            productId: 'kopi-bubuk-lampung',
            productName: 'Kopi Robusta Asli Lampung',
            variantId: 'kopi-500',
            variantLabel: 'Kemasan 500 gr',
            unitPrice: 42000,
            costPrice: 35000,
            quantity: 1,
          },
          {
            productId: 'gula-pasir-putih',
            productName: 'Gula Pasir & Gula Aren',
            variantId: 'gula-pasir-1kg',
            variantLabel: 'Gula Pasir 1 kg',
            unitPrice: 17500,
            costPrice: 15500,
            quantity: 2,
          },
        ],
        subtotal: 77000,
        deliveryFee: 0,
        total: 77000,
        handledBy: 'Kasir Toko',
        courierName: '',
        createdAt: now,
        updatedAt: now,
      },
    ],
    stockMovements: [
      {
        id: 'stk-seed-1',
        productId: 'beras-pandan-wangi',
        productName: 'Beras Pulen Pilihan',
        variantId: 'beras-5kg',
        variantLabel: 'Karung 5 kg',
        type: 'MASUK',
        quantityDelta: 24,
        note: 'Stok awal kiriman penggilingan Gunung Batin',
        actorName: 'Divisi Gudang',
        createdAt: now,
      },
      {
        id: 'stk-seed-2',
        productId: 'minyak-goreng-kemasan',
        productName: 'Minyak Goreng Sawit Jernih',
        variantId: 'minyak-1l',
        variantLabel: 'Pouch 1 Liter',
        type: 'MASUK',
        quantityDelta: 36,
        note: 'Stok masuk agen Bandar Jaya',
        actorName: 'Divisi Gudang',
        createdAt: now,
      },
    ],
    ledger: [
      {
        id: 'ldg-seed-1',
        type: 'MASUK',
        category: 'Penjualan Toko',
        description: 'Transaksi Kasir #DJ-1002 (Pak Hendro)',
        amount: 77000,
        paymentMethod: 'TUNAI',
        actorName: 'Kasir Toko',
        createdAt: now,
      },
      {
        id: 'ldg-seed-2',
        type: 'KELUAR',
        category: 'Operasional Toko',
        description: 'Bensin motor pengantaran & plastik belanja',
        amount: 35000,
        paymentMethod: 'TUNAI',
        actorName: 'Keuangan',
        createdAt: now,
      },
    ],
    kasbon: [
      {
        id: 'ksb-seed-1',
        customerName: 'Warung Bu Tini',
        phone: '082180994411',
        address: 'Gang Makam Ujung, Gunung Batin Udik',
        amountDue: 118000,
        totalPaid: 0,
        note: 'Ambil 1 dus mi instan, jatuh tempo akhir pekan',
        updatedAt: now,
      },
    ],
    supplierDeliveries: [
      {
        id: 'sup-seed-1',
        supplierId: 'seed-supplier',
        supplierName: 'Penggilingan Padi Gunung Batin',
        productId: 'beras-pandan-wangi',
        productName: 'Beras Pulen Pilihan',
        variantId: 'beras-5kg',
        variantLabel: 'Karung 5 kg',
        quantity: 10,
        unitCost: 64000,
        note: 'Surat Jalan SJ-014 (sudah masuk gudang)',
        status: 'DITERIMA',
        paymentStatus: 'LUNAS',
        receivedBy: 'Divisi Gudang',
        createdAt: now,
        receivedAt: now,
      },
    ],
    complaints: [],
    shifts: [],
    auditLogs: [],
    customers: [],
    staff: [],
    orderSeq: 1002,
    complaintSeq: 100,
  };
}

export function loadDatabase(): TokoDatabase {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, {recursive: true});
  }
  if (!fs.existsSync(DB_FILE)) {
    const initial = createInitialDatabase();
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as TokoDatabase;
    if (!Array.isArray(parsed.supplierDeliveries)) parsed.supplierDeliveries = [];
    if (!Array.isArray(parsed.complaints)) parsed.complaints = [];
    if (!Array.isArray(parsed.shifts)) parsed.shifts = [];
    if (!Array.isArray(parsed.auditLogs)) parsed.auditLogs = [];
    if (!Array.isArray(parsed.customers)) parsed.customers = [];
    if (typeof parsed.complaintSeq !== 'number') parsed.complaintSeq = 100;
    if (!parsed.settings.qrisMerchantName) parsed.settings.qrisMerchantName = 'TOKO DIMAS JAYA';
    if (!parsed.settings.qrisNmid) parsed.settings.qrisNmid = 'ID1020260000188';
    if (!parsed.settings.whatsappNumber) parsed.settings.whatsappNumber = '6281279008899';
    return parsed;
  } catch {
    const fallback = createInitialDatabase();
    fs.writeFileSync(DB_FILE, JSON.stringify(fallback, null, 2), 'utf8');
    return fallback;
  }
}

export function saveDatabase(db: TokoDatabase): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, {recursive: true});
  }
  const tmpFile = path.resolve(DATA_DIR, 'toko-db.tmp.json');
  if (!tmpFile.startsWith(DATA_DIR + path.sep)) {
    throw new Error('Invalid temp database path');
  }
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmpFile, DB_FILE);
}

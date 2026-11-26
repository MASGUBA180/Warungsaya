import {
  DEFAULT_STORE_SETTINGS,
  INITIAL_PUBLIC_PRODUCTS,
} from './storeData';
import type {
  AuthUser,
  DivisionRole,
  KasbonRecord,
  LedgerEntry,
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  Product,
  ProductCategory,
  StockMovement,
  StoreSettings,
} from '../types/store';

interface LocalStaffRecord {
  id: string;
  username: string;
  displayName: string;
  role: DivisionRole;
  passcodeHash: string;
  active: boolean;
  createdAt: string;
}

interface LocalStoreDb {
  settings: StoreSettings;
  products: Product[];
  orders: Order[];
  stockMovements: StockMovement[];
  ledger: LedgerEntry[];
  kasbon: KasbonRecord[];
  staff: LocalStaffRecord[];
  orderSeq: number;
}

export interface ApiResult<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  data: T;
  storageMode: 'server' | 'browser';
}

const LOCAL_DB_KEY = 'toko_dimas_jaya_db_v1';
const memorySessions = new Map<string, AuthUser>();
let detectedStaticMode = false;

function randomId(prefix: string): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}-${hex}`;
}

async function hashLocalPasscode(passcode: string): Promise<string> {
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const saltHex = Array.from(saltBytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passcode),
    {name: 'PBKDF2'},
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  const hashHex = Array.from(new Uint8Array(derivedBits), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('');
  return `pbkdf2:${saltHex}:${hashHex}`;
}

async function verifyLocalPasscode(
  passcode: string,
  stored: string
): Promise<boolean> {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'pbkdf2') return false;
  const [, saltHex, expectedHex] = parts;
  const saltBytes = new Uint8Array(
    (saltHex.match(/.{1,2}/g) || []).map((b) => parseInt(b, 16))
  );
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passcode),
    {name: 'PBKDF2'},
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  const actualHex = Array.from(new Uint8Array(derivedBits), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('');
  if (actualHex.length !== expectedHex.length) return false;
  let diff = 0;
  for (let i = 0; i < actualHex.length; i++) {
    diff |= actualHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  }
  return diff === 0;
}

function seedLocalDatabase(): LocalStoreDb {
  const now = new Date().toISOString();
  const products: Product[] = INITIAL_PUBLIC_PRODUCTS.map((p) => ({
    ...p,
    variants: p.variants.map((v) => ({
      ...v,
      costPrice: Math.round(v.price * 0.85),
    })),
  }));

  return {
    settings: {...DEFAULT_STORE_SETTINGS},
    products,
    orders: [
      {
        id: 'ord-seed-1001',
        orderNumber: 'DJ-1001',
        source: 'ONLINE',
        customerName: 'Ibu Rina',
        phone: '081379001122',
        deliveryMethod: 'cod',
        addressNote: 'Gang Makam RT 02, rumah pagar hijau',
        notes: 'Antar pagi ya mas',
        paymentMethod: 'COD',
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
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'ord-seed-1002',
        orderNumber: 'DJ-1002',
        source: 'POS',
        customerName: 'Pak Hendro',
        phone: '085268003344',
        deliveryMethod: 'instore',
        addressNote: 'Belanja langsung di Toko Dimas Jaya',
        notes: '',
        paymentMethod: 'TUNAI',
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
    staff: [],
    orderSeq: 1002,
  };
}

function readLocalDb(): LocalStoreDb {
  try {
    const raw = window.localStorage.getItem(LOCAL_DB_KEY);
    if (raw) {
      return JSON.parse(raw) as LocalStoreDb;
    }
  } catch {
    // ignore
  }
  const initial = seedLocalDatabase();
  writeLocalDb(initial);
  return initial;
}

function writeLocalDb(db: LocalStoreDb): void {
  try {
    window.localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(db));
  } catch {
    // ignore quota errors
  }
}

function syncProductAvailability(product: Product): void {
  const totalStock = product.variants.reduce((sum, v) => sum + v.stock, 0);
  if (totalStock <= 0) {
    product.availability = 'Stok Habis';
  } else if (product.variants.some((v) => v.stock <= v.minStock)) {
    product.availability = 'Stok Terbatas';
  } else {
    product.availability = 'Stok Tersedia';
  }
}

function getLocalAuthUser(headers?: HeadersInit): AuthUser | null {
  const h = new Headers(headers);
  const auth = h.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  const user = memorySessions.get(token);
  if (!user) return null;
  const db = readLocalDb();
  const staffRecord = db.staff.find((s) => s.id === user.id);
  if (!staffRecord || !staffRecord.active) return null;
  return {
    id: staffRecord.id,
    username: staffRecord.username,
    displayName: staffRecord.displayName,
    role: staffRecord.role,
  };
}

async function handleStaticFallback(
  url: string,
  options: RequestInit = {}
): Promise<ApiResult<any>> {
  const method = (options.method || 'GET').toUpperCase();
  const parsedUrl = new URL(url, window.location.origin);
  const path = parsedUrl.pathname;
  const body = options.body ? JSON.parse(String(options.body)) : {};

  const db = readLocalDb();

  // --- AUTH ---
  if (path === '/api/auth/status' && method === 'GET') {
    const ownerClaimed = db.staff.some((s) => s.role === 'PEMILIK' && s.active);
    return {
      ok: true,
      status: 200,
      storageMode: 'browser',
      data: {
        ownerClaimed,
        envPasscodeActive: false,
        staffCount: db.staff.filter((s) => s.active).length,
      },
    };
  }

  if (path === '/api/auth/bootstrap-owner' && method === 'POST') {
    if (db.staff.some((s) => s.role === 'PEMILIK')) {
      return {
        ok: false,
        status: 409,
        storageMode: 'browser',
        data: {error: 'Akun Pemilik sudah terdaftar. Silakan masuk dengan ID dan kata sandi Anda.'},
      };
    }
    const displayName = String(body.displayName || '').trim();
    const username = String(body.username || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '');
    const passcode = String(body.passcode || '');
    if (displayName.length < 2 || username.length < 3 || passcode.length < 6) {
      return {
        ok: false,
        status: 400,
        storageMode: 'browser',
        data: {
          error:
            'Nama minimal 2 karakter, ID/username minimal 3 karakter, dan kata sandi minimal 6 karakter.',
        },
      };
    }
    const ownerRecord: LocalStaffRecord = {
      id: randomId('stf'),
      username,
      displayName,
      role: 'PEMILIK',
      passcodeHash: await hashLocalPasscode(passcode),
      active: true,
      createdAt: new Date().toISOString(),
    };
    db.staff.push(ownerRecord);
    writeLocalDb(db);
    const authUser: AuthUser = {
      id: ownerRecord.id,
      username: ownerRecord.username,
      displayName: ownerRecord.displayName,
      role: ownerRecord.role,
    };
    const token = randomId('tok');
    memorySessions.set(token, authUser);
    return {
      ok: true,
      status: 201,
      storageMode: 'browser',
      data: {token, user: authUser},
    };
  }

  if (path === '/api/auth/login' && method === 'POST') {
    const username = String(body.username || '').trim().toLowerCase();
    const passcode = String(body.passcode || '');
    const member = db.staff.find(
      (s) => s.username.toLowerCase() === username && s.active
    );
    if (!member || !(await verifyLocalPasscode(passcode, member.passcodeHash))) {
      return {
        ok: false,
        status: 401,
        storageMode: 'browser',
        data: {error: 'ID/username atau kata sandi salah.'},
      };
    }
    const authUser: AuthUser = {
      id: member.id,
      username: member.username,
      displayName: member.displayName,
      role: member.role,
    };
    const token = randomId('tok');
    memorySessions.set(token, authUser);
    return {
      ok: true,
      status: 200,
      storageMode: 'browser',
      data: {token, user: authUser},
    };
  }

  // --- PUBLIC ---
  if (path === '/api/public/store' && method === 'GET') {
    return {
      ok: true,
      status: 200,
      storageMode: 'browser',
      data: {
        settings: db.settings,
        products: db.products.map((p) => ({
          ...p,
          variants: p.variants.map(({costPrice: _c, ...rest}) => rest),
        })),
      },
    };
  }

  if (path === '/api/public/orders' && method === 'POST') {
    const customerName = String(body.customerName || '').trim();
    const phone = String(body.phone || '').trim();
    const deliveryMethod = body.deliveryMethod === 'pickup' ? 'pickup' : 'cod';
    const addressNote = String(body.addressNote || '').trim();
    const notes = String(body.notes || '').trim();
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const verifiedItems: OrderItem[] = [];

    for (const raw of rawItems) {
      const product = db.products.find((p) => p.id === raw.productId);
      const variant = product?.variants.find((v) => v.id === raw.variantId);
      const qty = Math.floor(Number(raw.quantity || 0));
      if (!product || !variant || qty <= 0) {
        return {
          ok: false,
          status: 400,
          storageMode: 'browser',
          data: {error: 'Item pesanan tidak valid.'},
        };
      }
      if (variant.stock < qty) {
        return {
          ok: false,
          status: 409,
          storageMode: 'browser',
          data: {error: `Stok ${product.name} (${variant.label}) tinggal ${variant.stock}.`},
        };
      }
      verifiedItems.push({
        productId: product.id,
        productName: product.name,
        variantId: variant.id,
        variantLabel: variant.label,
        unitPrice: variant.price,
        costPrice: variant.costPrice ?? Math.round(variant.price * 0.85),
        quantity: qty,
      });
    }

    const now = new Date().toISOString();
    for (const item of verifiedItems) {
      const product = db.products.find((p) => p.id === item.productId)!;
      const variant = product.variants.find((v) => v.id === item.variantId)!;
      variant.stock -= item.quantity;
      syncProductAvailability(product);
      db.stockMovements.unshift({
        id: randomId('stk'),
        productId: product.id,
        productName: product.name,
        variantId: variant.id,
        variantLabel: variant.label,
        type: 'KELUAR',
        quantityDelta: -item.quantity,
        note: `Pesanan online pelanggan (${customerName})`,
        actorName: 'Etalase Online',
        createdAt: now,
      });
    }

    db.orderSeq += 1;
    const orderNumber = `DJ-${db.orderSeq}`;
    const subtotal = verifiedItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    const deliveryFee =
      deliveryMethod === 'cod' && subtotal < db.settings.freeDeliveryMin
        ? db.settings.deliveryFee
        : 0;

    const newOrder: Order = {
      id: randomId('ord'),
      orderNumber,
      source: 'ONLINE',
      customerName,
      phone,
      deliveryMethod,
      addressNote:
        deliveryMethod === 'cod'
          ? addressNote
          : 'Ambil langsung di Toko Dimas Jaya (Gang Makam)',
      notes,
      paymentMethod: deliveryMethod === 'cod' ? 'COD' : 'TUNAI',
      status: 'MENUNGGU',
      items: verifiedItems,
      subtotal,
      deliveryFee,
      total: subtotal + deliveryFee,
      handledBy: '',
      courierName: '',
      createdAt: now,
      updatedAt: now,
    };
    db.orders.unshift(newOrder);
    writeLocalDb(db);
    return {
      ok: true,
      status: 201,
      storageMode: 'browser',
      data: {order: newOrder},
    };
  }

  if (path === '/api/public/orders/track' && method === 'GET') {
    const code = String(parsedUrl.searchParams.get('code') || '').trim().toUpperCase();
    const phoneSuffix = String(parsedUrl.searchParams.get('phone') || '')
      .replace(/\D/g, '')
      .slice(-4);
    const order = db.orders.find(
      (o) =>
        o.orderNumber.toUpperCase() === code &&
        o.phone.replace(/\D/g, '').endsWith(phoneSuffix)
    );
    if (!order) {
      return {
        ok: false,
        status: 404,
        storageMode: 'browser',
        data: {error: 'Pesanan tidak ditemukan atau 4 digit terakhir nomor HP tidak cocok.'},
      };
    }
    return {ok: true, status: 200, storageMode: 'browser', data: {order}};
  }

  // --- AUTHENTICATED OPS ---
  const user = getLocalAuthUser(options.headers);
  if (!user) {
    return {
      ok: false,
      status: 401,
      storageMode: 'browser',
      data: {error: 'Silakan masuk ke Portal Staf terlebih dahulu.'},
    };
  }

  if (path === '/api/ops/bootstrap' && method === 'GET') {
    const totalRevenue = db.ledger
      .filter((l) => l.type === 'MASUK')
      .reduce((s, l) => s + l.amount, 0);
    const totalExpense = db.ledger
      .filter((l) => l.type === 'KELUAR')
      .reduce((s, l) => s + l.amount, 0);
    return {
      ok: true,
      status: 200,
      storageMode: 'browser',
      data: {
        user,
        settings: db.settings,
        overview: {
          totalRevenue,
          totalExpense,
          netCash: totalRevenue - totalExpense,
          pendingOrdersCount: db.orders.filter(
            (o) => o.status === 'MENUNGGU' || o.status === 'DISIAPKAN'
          ).length,
          activeDeliveriesCount: db.orders.filter((o) => o.status === 'DIANTAR').length,
          lowStockCount: db.products.reduce(
            (c, p) => c + p.variants.filter((v) => v.stock <= v.minStock).length,
            0
          ),
          totalKasbonOutstanding: db.kasbon.reduce(
            (s, k) => s + Math.max(0, k.amountDue - k.totalPaid),
            0
          ),
          totalOrders: db.orders.length,
        },
        products: db.products,
        orders: db.orders,
        stockMovements: db.stockMovements.slice(0, 60),
        ledger: db.ledger.slice(0, 80),
        kasbon: db.kasbon,
        staff:
          user.role === 'PEMILIK'
            ? db.staff.map(({passcodeHash: _h, ...rest}) => rest)
            : [],
      },
    };
  }

  if (path === '/api/ops/settings' && method === 'PATCH') {
    if (user.role !== 'PEMILIK') {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Khusus Pemilik.'}};
    }
    db.settings = {
      ...db.settings,
      hours: String(body.hours || db.settings.hours).trim(),
      daysOpen: String(body.daysOpen || db.settings.daysOpen).trim(),
      deliveryArea: String(body.deliveryArea || db.settings.deliveryArea).trim(),
      deliveryFee: Math.max(0, Number(body.deliveryFee ?? db.settings.deliveryFee)),
      freeDeliveryMin: Math.max(0, Number(body.freeDeliveryMin ?? db.settings.freeDeliveryMin)),
    };
    writeLocalDb(db);
    return {ok: true, status: 200, storageMode: 'browser', data: {settings: db.settings}};
  }

  if (path === '/api/ops/staff' && method === 'POST') {
    if (user.role !== 'PEMILIK') {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Khusus Pemilik.'}};
    }
    const displayName = String(body.displayName || '').trim();
    const username = String(body.username || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '');
    const role = body.role as DivisionRole;
    const passcode = String(body.passcode || '');
    if (displayName.length < 2 || username.length < 3 || passcode.length < 6) {
      return {
        ok: false,
        status: 400,
        storageMode: 'browser',
        data: {error: 'Lengkapi nama, username min. 3 karakter, dan sandi min. 6 karakter.'},
      };
    }
    if (db.staff.some((s) => s.username.toLowerCase() === username)) {
      return {
        ok: false,
        status: 409,
        storageMode: 'browser',
        data: {error: 'Username sudah dipakai oleh staf lain.'},
      };
    }
    const member: LocalStaffRecord = {
      id: randomId('stf'),
      username,
      displayName,
      role,
      passcodeHash: await hashLocalPasscode(passcode),
      active: true,
      createdAt: new Date().toISOString(),
    };
    db.staff.push(member);
    writeLocalDb(db);
    const {passcodeHash: _h, ...publicMember} = member;
    return {ok: true, status: 201, storageMode: 'browser', data: {staff: publicMember}};
  }

  if (path.startsWith('/api/ops/staff/') && method === 'PATCH') {
    if (user.role !== 'PEMILIK') {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Khusus Pemilik.'}};
    }
    const targetId = path.split('/').pop();
    const target = db.staff.find((s) => s.id === targetId);
    if (!target) {
      return {ok: false, status: 404, storageMode: 'browser', data: {error: 'Staf tidak ditemukan.'}};
    }
    if (typeof body.active === 'boolean') target.active = body.active;
    if (typeof body.passcode === 'string' && body.passcode.length >= 6) {
      target.passcodeHash = await hashLocalPasscode(body.passcode);
    }
    writeLocalDb(db);
    const {passcodeHash: _h, ...publicMember} = target;
    return {ok: true, status: 200, storageMode: 'browser', data: {staff: publicMember}};
  }

  if (path === '/api/ops/pos' && method === 'POST') {
    const customerName = String(body.customerName || 'Pembeli Toko').trim();
    const phone = String(body.phone || '-').trim();
    const paymentMethod = (body.paymentMethod || 'TUNAI') as PaymentMethod;
    const notes = String(body.notes || '').trim();
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const verifiedItems: OrderItem[] = [];

    for (const raw of rawItems) {
      const product = db.products.find((p) => p.id === raw.productId);
      const variant = product?.variants.find((v) => v.id === raw.variantId);
      const qty = Math.floor(Number(raw.quantity || 0));
      if (!product || !variant || qty <= 0 || variant.stock < qty) {
        return {
          ok: false,
          status: 400,
          storageMode: 'browser',
          data: {error: 'Stok barang kasir tidak mencukupi.'},
        };
      }
      verifiedItems.push({
        productId: product.id,
        productName: product.name,
        variantId: variant.id,
        variantLabel: variant.label,
        unitPrice: variant.price,
        costPrice: variant.costPrice ?? Math.round(variant.price * 0.85),
        quantity: qty,
      });
    }

    const now = new Date().toISOString();
    for (const item of verifiedItems) {
      const product = db.products.find((p) => p.id === item.productId)!;
      const variant = product.variants.find((v) => v.id === item.variantId)!;
      variant.stock -= item.quantity;
      syncProductAvailability(product);
      db.stockMovements.unshift({
        id: randomId('stk'),
        productId: product.id,
        productName: product.name,
        variantId: variant.id,
        variantLabel: variant.label,
        type: 'KELUAR',
        quantityDelta: -item.quantity,
        note: `Penjualan kasir (${customerName})`,
        actorName: user.displayName,
        createdAt: now,
      });
    }

    db.orderSeq += 1;
    const orderNumber = `DJ-${db.orderSeq}`;
    const total = verifiedItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    const posOrder: Order = {
      id: randomId('ord'),
      orderNumber,
      source: 'POS',
      customerName,
      phone,
      deliveryMethod: 'instore',
      addressNote: 'Belanja langsung di Toko Dimas Jaya',
      notes,
      paymentMethod,
      status: 'SELESAI',
      items: verifiedItems,
      subtotal: total,
      deliveryFee: 0,
      total,
      handledBy: user.displayName,
      courierName: '',
      createdAt: now,
      updatedAt: now,
    };
    db.orders.unshift(posOrder);

    if (paymentMethod === 'KASBON') {
      db.kasbon.unshift({
        id: randomId('ksb'),
        customerName,
        phone,
        address: notes || 'Warga Gunung Batin Udik',
        amountDue: total,
        totalPaid: 0,
        note: `Bon Kasir #${orderNumber}`,
        updatedAt: now,
      });
    } else {
      db.ledger.unshift({
        id: randomId('ldg'),
        type: 'MASUK',
        category: 'Penjualan Toko',
        description: `Kasir #${orderNumber} (${customerName})`,
        amount: total,
        paymentMethod,
        actorName: user.displayName,
        createdAt: now,
      });
    }
    writeLocalDb(db);
    return {ok: true, status: 201, storageMode: 'browser', data: {order: posOrder}};
  }

  if (path.startsWith('/api/ops/orders/') && path.endsWith('/status') && method === 'PATCH') {
    const segments = path.split('/');
    const orderId = segments[4];
    const nextStatus = body.status as OrderStatus;
    const order = db.orders.find((o) => o.id === orderId);
    if (!order) {
      return {ok: false, status: 404, storageMode: 'browser', data: {error: 'Pesanan tidak ditemukan.'}};
    }
    const prevStatus = order.status;
    const now = new Date().toISOString();
    order.status = nextStatus;
    order.updatedAt = now;
    if (nextStatus === 'DIANTAR' || (nextStatus === 'SELESAI' && order.deliveryMethod === 'cod')) {
      order.courierName = order.courierName || user.displayName;
    }
    if (nextStatus === 'DIBATALKAN' && prevStatus !== 'DIBATALKAN') {
      for (const item of order.items) {
        const product = db.products.find((p) => p.id === item.productId);
        const variant = product?.variants.find((v) => v.id === item.variantId);
        if (product && variant) {
          variant.stock += item.quantity;
          syncProductAvailability(product);
        }
      }
    }
    if (nextStatus === 'SELESAI' && prevStatus !== 'SELESAI') {
      if (!db.ledger.some((l) => l.description.includes(`#${order.orderNumber}`))) {
        db.ledger.unshift({
          id: randomId('ldg'),
          type: 'MASUK',
          category: order.deliveryMethod === 'cod' ? 'Penjualan COD' : 'Penjualan Toko',
          description: `Pesanan #${order.orderNumber} (${order.customerName})`,
          amount: order.total,
          paymentMethod: order.paymentMethod,
          actorName: user.displayName,
          createdAt: now,
        });
      }
    }
    writeLocalDb(db);
    return {ok: true, status: 200, storageMode: 'browser', data: {order}};
  }

  if (path === '/api/ops/products' && method === 'POST') {
    const name = String(body.name || '').trim();
    const category = body.category as Exclude<ProductCategory, 'Semua'>;
    const variantLabel = String(body.variantLabel || 'Satuan').trim();
    const price = Math.max(500, Math.round(Number(body.price || 0)));
    const costPrice = Math.max(0, Math.round(Number(body.costPrice || 0)));
    const stock = Math.max(0, Math.floor(Number(body.stock || 0)));
    const imageByCategory: Record<string, string> = {
      Sembako: '/src/assets/images/produk_beras_minyak_telur_1795680105474.jpg',
      'Kopi & Gula': '/src/assets/images/produk_kopi_lampung_gula_1795680105852.jpg',
      'Dapur & Bumbu': '/src/assets/images/produk_bumbu_dapur_mie_1795680106723.jpg',
      Kebersihan: '/src/assets/images/produk_sabun_deterjen_rumah_1795680106836.jpg',
      'Galon & Minuman': '/src/assets/images/produk_galon_gas_minuman_1795680107564.jpg',
    };
    const variantId = randomId('var');
    const newProduct: Product = {
      id: randomId('prd'),
      name,
      category,
      unitSummary: variantLabel,
      availability: stock > 0 ? 'Stok Tersedia' : 'Stok Habis',
      description: String(body.description || '').trim() || `${name} tersedia segar di Toko Dimas Jaya.`,
      image: imageByCategory[category] || imageByCategory.Sembako,
      imageAlt: name,
      variants: [
        {
          id: variantId,
          label: variantLabel,
          price,
          costPrice: costPrice || Math.round(price * 0.85),
          stock,
          minStock: 5,
        },
      ],
    };
    syncProductAvailability(newProduct);
    db.products.unshift(newProduct);
    writeLocalDb(db);
    return {ok: true, status: 201, storageMode: 'browser', data: {product: newProduct}};
  }

  if (path === '/api/ops/stock' && method === 'POST') {
    const product = db.products.find((p) => p.id === body.productId);
    const variant = product?.variants.find((v) => v.id === body.variantId);
    if (!product || !variant) {
      return {ok: false, status: 404, storageMode: 'browser', data: {error: 'Produk tidak ditemukan.'}};
    }
    const type = body.type === 'OPNAME' ? 'OPNAME' : 'MASUK';
    const quantity = Math.floor(Number(body.quantity || 0));
    const delta = type === 'MASUK' ? quantity : quantity - variant.stock;
    variant.stock = type === 'MASUK' ? variant.stock + quantity : quantity;
    syncProductAvailability(product);
    const now = new Date().toISOString();
    const movement: StockMovement = {
      id: randomId('stk'),
      productId: product.id,
      productName: product.name,
      variantId: variant.id,
      variantLabel: variant.label,
      type,
      quantityDelta: delta,
      note: String(body.note || '').trim() || (type === 'MASUK' ? 'Stok masuk' : 'Stok opname'),
      actorName: user.displayName,
      createdAt: now,
    };
    db.stockMovements.unshift(movement);
    if (type === 'MASUK' && body.recordExpense && variant.costPrice) {
      db.ledger.unshift({
        id: randomId('ldg'),
        type: 'KELUAR',
        category: 'Kulakan Barang',
        description: `Stok masuk ${product.name} (${variant.label}) x${quantity}`,
        amount: variant.costPrice * quantity,
        paymentMethod: 'TUNAI',
        actorName: user.displayName,
        createdAt: now,
      });
    }
    writeLocalDb(db);
    return {ok: true, status: 201, storageMode: 'browser', data: {product, movement}};
  }

  if (path === '/api/ops/ledger' && method === 'POST') {
    const entry: LedgerEntry = {
      id: randomId('ldg'),
      type: body.type === 'MASUK' ? 'MASUK' : 'KELUAR',
      category: String(body.category || 'Operasional Toko'),
      description: String(body.description || ''),
      amount: Math.round(Number(body.amount || 0)),
      paymentMethod: String(body.paymentMethod || 'TUNAI'),
      actorName: user.displayName,
      createdAt: new Date().toISOString(),
    };
    db.ledger.unshift(entry);
    writeLocalDb(db);
    return {ok: true, status: 201, storageMode: 'browser', data: {entry}};
  }

  if (path.startsWith('/api/ops/kasbon/') && path.endsWith('/pay') && method === 'POST') {
    const id = path.split('/')[4];
    const record = db.kasbon.find((k) => k.id === id);
    if (!record) {
      return {ok: false, status: 404, storageMode: 'browser', data: {error: 'Kasbon tidak ditemukan.'}};
    }
    const payAmount = Math.round(Number(body.amount || 0));
    record.totalPaid += payAmount;
    record.updatedAt = new Date().toISOString();
    db.ledger.unshift({
      id: randomId('ldg'),
      type: 'MASUK',
      category: 'Pelunasan Kasbon',
      description: `Bayar bon a/n ${record.customerName}`,
      amount: payAmount,
      paymentMethod: 'TUNAI',
      actorName: user.displayName,
      createdAt: record.updatedAt,
    });
    writeLocalDb(db);
    return {ok: true, status: 200, storageMode: 'browser', data: {kasbon: record}};
  }

  return {
    ok: false,
    status: 404,
    storageMode: 'browser',
    data: {error: 'Layanan tidak tersedia.'},
  };
}

export async function apiFetch<T = Record<string, any>>(
  url: string,
  options: RequestInit = {}
): Promise<ApiResult<T>> {
  if (detectedStaticMode) {
    return handleStaticFallback(url, options);
  }

  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';

    // Static hosts (e.g. Cloudflare Workers static assets) return HTML/404 for /api/*
    if (!contentType.includes('application/json')) {
      detectedStaticMode = true;
      return handleStaticFallback(url, options);
    }

    const data = (await res.json()) as T;
    return {
      ok: res.ok,
      status: res.status,
      data,
      storageMode: 'server',
    };
  } catch {
    detectedStaticMode = true;
    return handleStaticFallback(url, options);
  }
}

import {
  buildCourierWhatsappLink,
  buildOrderQrisInfo,
  normalizePhoneDigits,
} from './qrisHelpers';
import {isValidUploadedPhoto} from './imageHelpers';
import {
  DEFAULT_STORE_SETTINGS,
  INITIAL_PUBLIC_PRODUCTS,
} from './storeData';
import type {
  AuditLogEntry,
  AuthUser,
  CashierShift,
  ComplaintCategory,
  ComplaintRecord,
  ComplaintResolution,
  ComplaintStatus,
  CustomerProfile,
  DeliveryCheckpoint,
  DivisionRole,
  GeoPoint,
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
  SupplierDelivery,
  WhatsappNotification,
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

interface LocalCustomerRecord {
  id: string;
  name: string;
  phone: string;
  defaultAddress: string;
  savedCoords?: GeoPoint | null;
  passcodeHash: string;
  createdAt: string;
}

interface LocalStoreDb {
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
  customers: LocalCustomerRecord[];
  staff: LocalStaffRecord[];
  orderSeq: number;
  complaintSeq: number;
}

export interface ApiResult<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  data: T;
  storageMode: 'server' | 'browser';
}

const LOCAL_DB_KEY = 'toko_dimas_jaya_db_v1';
const memorySessions = new Map<string, AuthUser>();
const memoryCustomerSessions = new Map<string, string>();
let detectedStaticMode = false;

const VALID_ROLES: DivisionRole[] = [
  'PEMILIK',
  'DIREKTUR',
  'KASIR',
  'GUDANG',
  'PEMASOK',
  'KURIR',
  'KEUANGAN',
];

const DIRECTOR_MANAGED_ROLES: DivisionRole[] = [
  'KASIR',
  'GUDANG',
  'PEMASOK',
  'KURIR',
  'KEUANGAN',
];

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
        whatsappNotifications: [],
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

function readLocalDb(): LocalStoreDb {
  try {
    const raw = window.localStorage.getItem(LOCAL_DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LocalStoreDb;
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

function parseLocalGeoPoint(raw: unknown): GeoPoint | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as {lat?: unknown; lng?: unknown};
  const lat = Number(candidate.lat);
  const lng = Number(candidate.lng);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }
  return {
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
  };
}

function sanitizeOrderForLocalRole(order: Order): Order {
  return {
    ...order,
    items: order.items.map((i) => ({...i, costPrice: 0})),
  };
}

function sanitizeOrderForLocalPublic(order: Order) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    deliveryMethod: order.deliveryMethod,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus || (order.paymentMethod === 'QRIS' ? 'MENUNGGU_QRIS' : 'BELUM_BAYAR'),
    qris: order.qris,
    discountAmount: order.discountAmount || 0,
    addressNote: order.addressNote,
    notes: order.notes,
    status: order.status,
    items: order.items.map(({costPrice: _c, ...rest}) => rest),
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    total: order.total,
    handledBy: order.handledBy,
    courierName: order.courierName,
    assignedCourierId: order.assignedCourierId,
    assignedCourierName: order.assignedCourierName,
    customerCoords: order.customerCoords || null,
    tracking: order.tracking,
    whatsappNotifications: order.whatsappNotifications || [],
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
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

function recordLocalAuditLog(
  db: LocalStoreDb,
  actor: {id: string; displayName: string; role: string},
  action: string,
  target: string,
  detail: string
): void {
  db.auditLogs.unshift({
    id: randomId('aud'),
    actorId: actor.id,
    actorName: actor.displayName,
    actorRole: actor.role,
    action,
    target,
    detail,
    createdAt: new Date().toISOString(),
  });
  if (db.auditLogs.length > 200) db.auditLogs = db.auditLogs.slice(0, 200);
}

function appendLocalWhatsappNotification(
  order: Order,
  trigger: WhatsappNotification['trigger'],
  actorName: string,
  storeUrl?: string
): WhatsappNotification {
  const {waLink, message} = buildCourierWhatsappLink({
    phone: order.phone,
    customerName: order.customerName,
    orderNumber: order.orderNumber,
    courierName: order.courierName || actorName,
    etaMinutes: order.tracking?.etaMinutes,
    addressNote: order.addressNote,
    total: order.total,
    paymentStatus: order.paymentStatus,
    trigger,
    storeUrl:
      (storeUrl || '').trim() ||
      (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : ''),
  });
  const notif: WhatsappNotification = {
    id: randomId('wa'),
    trigger,
    recipientPhone: order.phone,
    message,
    waLink,
    actorName,
    sentAt: new Date().toISOString(),
  };
  if (!Array.isArray(order.whatsappNotifications)) order.whatsappNotifications = [];
  order.whatsappNotifications.unshift(notif);
  return notif;
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

function getLocalCustomer(headers: HeadersInit | undefined, db: LocalStoreDb): LocalCustomerRecord | null {
  const h = new Headers(headers);
  const auth = h.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  const custId = memoryCustomerSessions.get(token);
  if (!custId) return null;
  return db.customers.find((c) => c.id === custId) || null;
}

function doesCustomerOwnLocalOrder(customer: {id: string; phone: string}, order: Order): boolean {
  if (order.customerId && order.customerId === customer.id) return true;
  const cp = normalizePhoneDigits(customer.phone);
  const op = normalizePhoneDigits(order.phone);
  return Boolean(cp && op && cp === op);
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

  // --- STAFF AUTH ---
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
    recordLocalAuditLog(
      db,
      {id: ownerRecord.id, displayName: ownerRecord.displayName, role: ownerRecord.role},
      'CLAIM_PEMILIK',
      ownerRecord.username,
      'Aktivasi awal akun Pemilik Toko Dimas Jaya'
    );
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

  // --- CUSTOMER PORTAL ---
  if (path === '/api/customer/register' && method === 'POST') {
    const name = String(body.name || '').trim();
    const phone = normalizePhoneDigits(String(body.phone || ''));
    const defaultAddress = String(body.defaultAddress || '').trim();
    const passcode = String(body.passcode || '');
    if (name.length < 2 || phone.length < 8 || passcode.length < 6) {
      return {
        ok: false,
        status: 400,
        storageMode: 'browser',
        data: {error: 'Nama min. 2 karakter, nomor HP valid, dan kata sandi min. 6 karakter.'},
      };
    }
    if (db.customers.some((c) => normalizePhoneDigits(c.phone) === phone)) {
      return {
        ok: false,
        status: 409,
        storageMode: 'browser',
        data: {error: 'Nomor HP ini sudah terdaftar. Silakan masuk.'},
      };
    }
    const rec: LocalCustomerRecord = {
      id: randomId('cst'),
      name,
      phone,
      defaultAddress: defaultAddress || 'Gang Makam, Gunung Batin Udik',
      passcodeHash: await hashLocalPasscode(passcode),
      createdAt: new Date().toISOString(),
    };
    db.customers.push(rec);
    for (const o of db.orders) {
      if (!o.customerId && normalizePhoneDigits(o.phone) === phone) o.customerId = rec.id;
    }
    writeLocalDb(db);
    const customerToken = randomId('ctok');
    memoryCustomerSessions.set(customerToken, rec.id);
    const profile: CustomerProfile = {
      id: rec.id,
      name: rec.name,
      phone: rec.phone,
      defaultAddress: rec.defaultAddress,
      savedCoords: rec.savedCoords ?? null,
      createdAt: rec.createdAt,
    };
    return {ok: true, status: 201, storageMode: 'browser', data: {customerToken, customer: profile}};
  }

  if (path === '/api/customer/login' && method === 'POST') {
    const phone = normalizePhoneDigits(String(body.phone || ''));
    const passcode = String(body.passcode || '');
    const rec = db.customers.find((c) => normalizePhoneDigits(c.phone) === phone);
    if (!rec || !(await verifyLocalPasscode(passcode, rec.passcodeHash))) {
      return {
        ok: false,
        status: 401,
        storageMode: 'browser',
        data: {error: 'Nomor HP atau kata sandi salah.'},
      };
    }
    const customerToken = randomId('ctok');
    memoryCustomerSessions.set(customerToken, rec.id);
    const profile: CustomerProfile = {
      id: rec.id,
      name: rec.name,
      phone: rec.phone,
      defaultAddress: rec.defaultAddress,
      savedCoords: rec.savedCoords ?? null,
      createdAt: rec.createdAt,
    };
    return {ok: true, status: 200, storageMode: 'browser', data: {customerToken, customer: profile}};
  }

  if (path === '/api/customer/me' && method === 'GET') {
    const cust = getLocalCustomer(options.headers, db);
    if (!cust) {
      return {ok: false, status: 401, storageMode: 'browser', data: {error: 'Silakan masuk.'}};
    }
    const custPhoneDigits = normalizePhoneDigits(cust.phone);
    const profile: CustomerProfile = {
      id: cust.id,
      name: cust.name,
      phone: cust.phone,
      defaultAddress: cust.defaultAddress,
      savedCoords: cust.savedCoords ?? null,
      createdAt: cust.createdAt,
    };
    const orders = db.orders
      .filter((o) => doesCustomerOwnLocalOrder(cust, o))
      .map(sanitizeOrderForLocalPublic);
    const complaints = db.complaints.filter(
      (c) =>
        c.customerId === cust.id ||
        normalizePhoneDigits(c.phone) === custPhoneDigits
    );
    const kasbon = db.kasbon.filter((k) => {
      const kp = normalizePhoneDigits(k.phone);
      if (custPhoneDigits && kp) return kp === custPhoneDigits;
      return k.customerName.trim().toLowerCase() === cust.name.trim().toLowerCase();
    });
    return {ok: true, status: 200, storageMode: 'browser', data: {customer: profile, orders, complaints, kasbon}};
  }

  if (path === '/api/customer/profile' && method === 'PATCH') {
    const cust = getLocalCustomer(options.headers, db);
    if (!cust) {
      return {ok: false, status: 401, storageMode: 'browser', data: {error: 'Silakan masuk.'}};
    }
    if (String(body.name || '').trim().length >= 2) cust.name = String(body.name).trim();
    if (String(body.defaultAddress || '').trim().length >= 4) {
      cust.defaultAddress = String(body.defaultAddress).trim();
    }
    if (body.savedCoords === null) {
      cust.savedCoords = null;
    } else if (body.savedCoords !== undefined) {
      const parsed = parseLocalGeoPoint(body.savedCoords);
      if (parsed) cust.savedCoords = parsed;
    }
    writeLocalDb(db);
    return {
      ok: true,
      status: 200,
      storageMode: 'browser',
      data: {
        customer: {
          id: cust.id,
          name: cust.name,
          phone: cust.phone,
          defaultAddress: cust.defaultAddress,
          savedCoords: cust.savedCoords ?? null,
          createdAt: cust.createdAt,
        },
      },
    };
  }

  if (path === '/api/customer/password' && method === 'PATCH') {
    const cust = getLocalCustomer(options.headers, db);
    if (!cust) {
      return {ok: false, status: 401, storageMode: 'browser', data: {error: 'Silakan masuk.'}};
    }
    const currentPasscode = String(body.currentPasscode || '');
    const newPasscode = String(body.newPasscode || '');
    if (!(await verifyLocalPasscode(currentPasscode, cust.passcodeHash))) {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Kata sandi saat ini tidak cocok.'}};
    }
    if (newPasscode.length < 6) {
      return {ok: false, status: 400, storageMode: 'browser', data: {error: 'Kata sandi baru minimal 6 karakter.'}};
    }
    cust.passcodeHash = await hashLocalPasscode(newPasscode);
    writeLocalDb(db);
    return {ok: true, status: 200, storageMode: 'browser', data: {updated: true}};
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
    const loggedInCustomer = getLocalCustomer(options.headers, db);
    const customerName = String(body.customerName || loggedInCustomer?.name || '').trim();
    const phone = String(body.phone || loggedInCustomer?.phone || '').trim();
    const deliveryMethod = body.deliveryMethod === 'pickup' ? 'pickup' : 'cod';
    const addressNote = String(
      body.addressNote || (deliveryMethod === 'cod' ? loggedInCustomer?.defaultAddress : '') || ''
    ).trim();
    const notes = String(body.notes || '').trim();
    const paymentMethod: PaymentMethod =
      body.paymentMethod === 'QRIS' ? 'QRIS' : deliveryMethod === 'cod' ? 'COD' : 'TUNAI';
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
    const grandTotal = subtotal + deliveryFee;

    const customerCoords = parseLocalGeoPoint(body.customerCoords);
    const qris =
      paymentMethod === 'QRIS'
        ? buildOrderQrisInfo({
            orderNumber,
            amount: grandTotal,
            merchantName: db.settings.qrisMerchantName,
            nmid: db.settings.qrisNmid,
            gatewayStatus: 'PENDING',
            nowIso: now,
          })
        : undefined;

    const newOrder: Order = {
      id: randomId('ord'),
      orderNumber,
      source: 'ONLINE',
      customerId: loggedInCustomer?.id ?? null,
      customerName,
      phone,
      deliveryMethod,
      addressNote:
        deliveryMethod === 'cod'
          ? addressNote
          : 'Ambil langsung di Toko Dimas Jaya (Gang Makam)',
      notes,
      paymentMethod,
      paymentStatus: paymentMethod === 'QRIS' ? 'MENUNGGU_QRIS' : 'BELUM_BAYAR',
      qris,
      status: 'MENUNGGU',
      items: verifiedItems,
      subtotal,
      deliveryFee,
      total: grandTotal,
      handledBy: '',
      courierName: '',
      customerCoords: deliveryMethod === 'cod' ? customerCoords : null,
      tracking:
        deliveryMethod === 'cod'
          ? {
              checkpoint: 'PERSIAPAN_TOKO',
              locationNote: 'Pesanan masuk, menunggu disiapkan di Toko Dimas Jaya',
              progressPercent: 15,
              etaMinutes: 25,
              courierCoords: db.settings.storeCoords || null,
              updatedAt: now,
            }
          : undefined,
      whatsappNotifications: [],
      createdAt: now,
      updatedAt: now,
    };
    db.orders.unshift(newOrder);
    writeLocalDb(db);
    return {
      ok: true,
      status: 201,
      storageMode: 'browser',
      data: {order: sanitizeOrderForLocalPublic(newOrder)},
    };
  }

  if (
    path.startsWith('/api/public/orders/') &&
    path.endsWith('/qris-pay') &&
    method === 'POST'
  ) {
    const orderNumber = path.split('/')[4]?.toUpperCase();
    const loggedInCustomer = getLocalCustomer(options.headers, db);
    const phoneLast4 = String(body.phoneLast4 || '').replace(/\D/g, '').slice(-4);
    const order = db.orders.find((o) => o.orderNumber.toUpperCase() === orderNumber);
    if (!order) {
      return {ok: false, status: 404, storageMode: 'browser', data: {error: 'Pesanan tidak ditemukan.'}};
    }
    const ownsByToken = loggedInCustomer && doesCustomerOwnLocalOrder(loggedInCustomer, order);
    const ownsByPhone = phoneLast4.length === 4 && order.phone.replace(/\D/g, '').endsWith(phoneLast4);
    if (!ownsByToken && !ownsByPhone) {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Verifikasi pelanggan tidak cocok.'}};
    }
    if (order.paymentMethod !== 'QRIS' || !order.qris) {
      return {ok: false, status: 400, storageMode: 'browser', data: {error: 'Bukan pesanan QRIS.'}};
    }
    const now = new Date().toISOString();
    order.qris.gatewayStatus = 'PAID';
    order.qris.paidAt = now;
    order.paymentStatus = 'LUNAS';
    order.updatedAt = now;
    if (!db.ledger.some((l) => l.description.includes(`#${order.orderNumber}`))) {
      db.ledger.unshift({
        id: randomId('ldg'),
        type: 'MASUK',
        category: order.deliveryMethod === 'cod' ? 'Penjualan COD (QRIS)' : 'Penjualan QRIS',
        description: `Pembayaran QRIS #${order.orderNumber} (${order.customerName})`,
        amount: order.total,
        paymentMethod: 'QRIS',
        actorName: 'Payment Gateway QRIS',
        createdAt: now,
      });
    }
    appendLocalWhatsappNotification(order, 'QRIS_LUNAS', 'Sistem QRIS Otomatis', db.settings.storeUrl);
    writeLocalDb(db);
    return {ok: true, status: 200, storageMode: 'browser', data: {order: sanitizeOrderForLocalPublic(order)}};
  }

  if (path === '/api/public/orders/track' && method === 'GET') {
    const code = String(parsedUrl.searchParams.get('code') || '').trim().toUpperCase();
    const phoneSuffix = String(parsedUrl.searchParams.get('phone') || '')
      .replace(/\D/g, '')
      .slice(-4);
    const loggedInCustomer = getLocalCustomer(options.headers, db);
    const order = db.orders.find((o) => {
      if (o.orderNumber.toUpperCase() !== code) return false;
      if (loggedInCustomer && doesCustomerOwnLocalOrder(loggedInCustomer, o)) return true;
      return phoneSuffix.length >= 4 && o.phone.replace(/\D/g, '').endsWith(phoneSuffix);
    });
    if (!order) {
      return {
        ok: false,
        status: 404,
        storageMode: 'browser',
        data: {error: 'Pesanan tidak ditemukan atau 4 digit terakhir nomor HP tidak cocok.'},
      };
    }
    const complaints = db.complaints.filter((c) => c.orderId === order.id);
    return {
      ok: true,
      status: 200,
      storageMode: 'browser',
      data: {
        storeCoords: db.settings.storeCoords || null,
        order: sanitizeOrderForLocalPublic(order),
        complaints,
      },
    };
  }

  if (
    path.startsWith('/api/public/orders/') &&
    path.endsWith('/cancel') &&
    method === 'POST'
  ) {
    const orderNumber = path.split('/')[4]?.toUpperCase();
    const loggedInCustomer = getLocalCustomer(options.headers, db);
    const phoneLast4 = String(body.phoneLast4 || '').replace(/\D/g, '').slice(-4);
    const order = db.orders.find((o) => o.orderNumber.toUpperCase() === orderNumber);
    if (!order) {
      return {ok: false, status: 404, storageMode: 'browser', data: {error: 'Pesanan tidak ditemukan.'}};
    }
    const ownsByToken = loggedInCustomer && doesCustomerOwnLocalOrder(loggedInCustomer, order);
    const ownsByPhone = phoneLast4.length === 4 && order.phone.replace(/\D/g, '').endsWith(phoneLast4);
    if (!ownsByToken && !ownsByPhone) {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Verifikasi pemilik pesanan gagal.'}};
    }
    if (order.status !== 'MENUNGGU') {
      return {
        ok: false,
        status: 409,
        storageMode: 'browser',
        data: {error: 'Pesanan yang sudah disiapkan atau diantar tidak dapat dibatalkan mandiri.'},
      };
    }
    const now = new Date().toISOString();
    order.status = 'DIBATALKAN';
    order.updatedAt = now;
    if (body.reason) {
      order.notes = [order.notes, `Batal pelanggan: ${String(body.reason).trim()}`].filter(Boolean).join(' · ');
    }
    for (const item of order.items) {
      const product = db.products.find((p) => p.id === item.productId);
      const variant = product?.variants.find((v) => v.id === item.variantId);
      if (product && variant) {
        variant.stock += item.quantity;
        syncProductAvailability(product);
        db.stockMovements.unshift({
          id: randomId('stk'),
          productId: product.id,
          productName: product.name,
          variantId: variant.id,
          variantLabel: variant.label,
          type: 'MASUK',
          quantityDelta: item.quantity,
          note: `Pembatalan mandiri pelanggan #${order.orderNumber}`,
          actorName: order.customerName,
          createdAt: now,
        });
      }
    }
    writeLocalDb(db);
    return {ok: true, status: 200, storageMode: 'browser', data: {order: sanitizeOrderForLocalPublic(order)}};
  }

  if (path === '/api/public/complaints' && method === 'POST') {
    const loggedInCustomer = getLocalCustomer(options.headers, db);
    const orderNumber = String(body.orderNumber || '').trim().toUpperCase();
    const phoneLast4 = String(body.phoneLast4 || '').replace(/\D/g, '').slice(-4);
    const category = body.category as ComplaintCategory;
    const requestedResolution = body.requestedResolution as ComplaintResolution;
    const description = String(body.description || '').trim();
    const evidencePhoto = isValidUploadedPhoto(body.evidencePhoto)
      ? body.evidencePhoto.trim()
      : undefined;
    const order = db.orders.find((o) => o.orderNumber.toUpperCase() === orderNumber);
    if (!order) {
      return {ok: false, status: 404, storageMode: 'browser', data: {error: 'Pesanan tidak ditemukan.'}};
    }
    const ownsByToken = loggedInCustomer && doesCustomerOwnLocalOrder(loggedInCustomer, order);
    const ownsByPhone = phoneLast4.length === 4 && order.phone.replace(/\D/g, '').endsWith(phoneLast4);
    if (!ownsByToken && !ownsByPhone) {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Verifikasi pemilik pesanan gagal.'}};
    }
    if (description.length < 8) {
      return {ok: false, status: 400, storageMode: 'browser', data: {error: 'Keterangan komplain minimal 8 karakter.'}};
    }
    db.complaintSeq += 1;
    const now = new Date().toISOString();
    const complaint: ComplaintRecord = {
      id: randomId('cmp'),
      complaintNumber: `KMP-${db.complaintSeq}`,
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerId: loggedInCustomer?.id ?? order.customerId ?? null,
      customerName: order.customerName,
      phone: order.phone,
      category,
      description,
      evidencePhoto,
      requestedResolution,
      status: 'BARU',
      staffResponse: '',
      handledBy: '',
      createdAt: now,
      updatedAt: now,
    };
    db.complaints.unshift(complaint);
    writeLocalDb(db);
    return {ok: true, status: 201, storageMode: 'browser', data: {complaint}};
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

  const isLeadership = user.role === 'PEMILIK' || user.role === 'DIREKTUR';

  if (path === '/api/ops/bootstrap' && method === 'GET') {
    const role = user.role;
    const canSeeFinancialOverview = isLeadership || role === 'KEUANGAN';
    const totalRevenue = db.ledger.filter((l) => l.type === 'MASUK').reduce((s, l) => s + l.amount, 0);
    const totalExpense = db.ledger.filter((l) => l.type === 'KELUAR').reduce((s, l) => s + l.amount, 0);
    const estimatedProfit = db.orders
      .filter((o) => o.status === 'SELESAI')
      .reduce((os, ord) => {
        const g = ord.items.reduce((is, i) => is + (i.unitPrice - (i.costPrice || 0)) * i.quantity, 0);
        return os + g - (ord.discountAmount || 0);
      }, 0);

    let scopedProducts: Product[] = [];
    if (isLeadership || role === 'GUDANG') {
      scopedProducts = db.products;
    } else if (role === 'KASIR' || role === 'PEMASOK') {
      scopedProducts = db.products.map((p) => ({
        ...p,
        variants: p.variants.map(({costPrice: _c, ...rest}) => rest),
      }));
    }

    let scopedOrders: Order[] = [];
    if (isLeadership) scopedOrders = db.orders;
    else if (role === 'KASIR') scopedOrders = db.orders.map(sanitizeOrderForLocalRole);
    else if (role === 'GUDANG')
      scopedOrders = db.orders.filter((o) => o.source === 'ONLINE').map(sanitizeOrderForLocalRole);
    else if (role === 'KURIR')
      scopedOrders = db.orders.filter((o) => o.deliveryMethod === 'cod').map(sanitizeOrderForLocalRole);

    let scopedSupplierDeliveries: SupplierDelivery[] = [];
    if (isLeadership || role === 'GUDANG' || role === 'KEUANGAN') {
      scopedSupplierDeliveries = db.supplierDeliveries;
    } else if (role === 'PEMASOK') {
      scopedSupplierDeliveries = db.supplierDeliveries.filter((d) => d.supplierId === user.id);
    }

    return {
      ok: true,
      status: 200,
      storageMode: 'browser',
      data: {
        user,
        settings: db.settings,
        overview: {
          totalRevenue: canSeeFinancialOverview ? totalRevenue : 0,
          totalExpense: canSeeFinancialOverview ? totalExpense : 0,
          netCash: canSeeFinancialOverview ? totalRevenue - totalExpense : 0,
          estimatedProfit: isLeadership ? estimatedProfit : 0,
          pendingOrdersCount:
            isLeadership || role === 'KASIR' || role === 'GUDANG'
              ? db.orders.filter((o) => o.status === 'MENUNGGU' || o.status === 'DISIAPKAN').length
              : 0,
          activeDeliveriesCount:
            isLeadership || role === 'KURIR'
              ? db.orders.filter((o) => o.deliveryMethod === 'cod' && o.status === 'DIANTAR').length
              : 0,
          lowStockCount:
            isLeadership || role === 'GUDANG' || role === 'PEMASOK'
              ? db.products.reduce((c, p) => c + p.variants.filter((v) => v.stock <= v.minStock).length, 0)
              : 0,
          totalKasbonOutstanding: canSeeFinancialOverview
            ? db.kasbon.reduce((s, k) => s + Math.max(0, k.amountDue - k.totalPaid), 0)
            : 0,
          totalOrders: isLeadership || role === 'KASIR' ? db.orders.length : 0,
          pendingSupplierDeliveriesCount:
            isLeadership || role === 'GUDANG' || role === 'PEMASOK'
              ? db.supplierDeliveries.filter((d) => d.status === 'MENUNGGU_TERIMA').length
              : 0,
          pendingComplaintsCount:
            isLeadership || role === 'KASIR' || role === 'GUDANG'
              ? db.complaints.filter((c) => c.status === 'BARU' || c.status === 'DIPROSES').length
              : 0,
          openShiftsCount:
            isLeadership || role === 'KASIR'
              ? db.shifts.filter((s) => s.status === 'TERBUKA').length
              : 0,
        },
        products: scopedProducts,
        orders: scopedOrders,
        stockMovements: isLeadership || role === 'GUDANG' ? db.stockMovements.slice(0, 80) : [],
        ledger: canSeeFinancialOverview ? db.ledger.slice(0, 120) : [],
        kasbon: isLeadership || role === 'KEUANGAN' || role === 'KASIR' ? db.kasbon : [],
        supplierDeliveries: scopedSupplierDeliveries,
        complaints: isLeadership || role === 'KASIR' || role === 'GUDANG' ? db.complaints : [],
        shifts: isLeadership || role === 'KASIR' || role === 'KEUANGAN' ? db.shifts.slice(0, 30) : [],
        auditLogs: isLeadership ? db.auditLogs.slice(0, 80) : [],
        couriers:
          isLeadership || role === 'KASIR' || role === 'KURIR'
            ? db.staff
                .filter((s) => s.active && s.role === 'KURIR')
                .map(({passcodeHash: _h, ...rest}) => rest)
            : [],
        staff: isLeadership ? db.staff.map(({passcodeHash: _h, ...rest}) => rest) : [],
      },
    };
  }

  if (path === '/api/ops/me/password' && method === 'PATCH') {
    const currentPasscode = String(body.currentPasscode || '');
    const newPasscode = String(body.newPasscode || '');
    if (newPasscode.length < 6) {
      return {ok: false, status: 400, storageMode: 'browser', data: {error: 'Kata sandi baru minimal 6 karakter.'}};
    }
    const staffMember = db.staff.find((s) => s.id === user.id && s.active);
    if (!staffMember) {
      return {ok: false, status: 404, storageMode: 'browser', data: {error: 'Akun staf tidak ditemukan.'}};
    }
    if (!(await verifyLocalPasscode(currentPasscode, staffMember.passcodeHash))) {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Kata sandi saat ini tidak cocok.'}};
    }
    staffMember.passcodeHash = await hashLocalPasscode(newPasscode);
    recordLocalAuditLog(
      db,
      user,
      'GANTI_SANDI_SENDIRI',
      staffMember.username,
      'Staf memperbarui kata sandi akun sendiri'
    );
    writeLocalDb(db);
    return {ok: true, status: 200, storageMode: 'browser', data: {updated: true}};
  }

  if (path === '/api/ops/settings' && method === 'PATCH') {
    if (!isLeadership) {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Khusus Pemilik / Direktur.'}};
    }
    const parsedCoords = parseLocalGeoPoint(body.storeCoords);
    const isOwner = user.role === 'PEMILIK';
    const nextName = String(body.name ?? db.settings.name).trim();
    const rawMapsUrl = String(body.mapsUrl ?? db.settings.mapsUrl).trim();
    const safeMapsUrl = /^https?:\/\//i.test(rawMapsUrl) ? rawMapsUrl : db.settings.mapsUrl;
    const rawStoreUrl =
      body.storeUrl !== undefined ? String(body.storeUrl).trim() : db.settings.storeUrl || '';
    const safeStoreUrl = !rawStoreUrl
      ? ''
      : /^https?:\/\//i.test(rawStoreUrl)
        ? rawStoreUrl.replace(/\/+$/, '')
        : db.settings.storeUrl || '';
    const deliveryFee = Math.max(0, Number(body.deliveryFee ?? db.settings.deliveryFee));
    const freeDeliveryMin = Math.max(0, Number(body.freeDeliveryMin ?? db.settings.freeDeliveryMin));

    db.settings = {
      ...db.settings,
      name: nextName.length >= 2 ? nextName : db.settings.name,
      tagline: String(body.tagline ?? db.settings.tagline).trim() || db.settings.tagline,
      streetAddress: String(body.streetAddress ?? db.settings.streetAddress).trim() || db.settings.streetAddress,
      district: String(body.district ?? db.settings.district).trim() || db.settings.district,
      province: String(body.province ?? db.settings.province).trim() || db.settings.province,
      fullAddress: String(body.fullAddress ?? db.settings.fullAddress).trim() || db.settings.fullAddress,
      mapsUrl: safeMapsUrl,
      storeUrl: safeStoreUrl,
      hours: String(body.hours || db.settings.hours).trim(),
      daysOpen: String(body.daysOpen || db.settings.daysOpen).trim(),
      deliveryArea: String(body.deliveryArea || db.settings.deliveryArea).trim(),
      deliveryFee: Number.isFinite(deliveryFee) ? deliveryFee : db.settings.deliveryFee,
      freeDeliveryMin: Number.isFinite(freeDeliveryMin) ? freeDeliveryMin : db.settings.freeDeliveryMin,
      whatsappNumber: String(body.whatsappNumber ?? db.settings.whatsappNumber ?? '6281279008899').trim(),
      qrisMerchantName: isOwner
        ? String(body.qrisMerchantName ?? db.settings.qrisMerchantName ?? 'TOKO DIMAS JAYA').trim()
        : db.settings.qrisMerchantName,
      qrisNmid: isOwner
        ? String(body.qrisNmid ?? db.settings.qrisNmid ?? 'ID1020260000188').trim()
        : db.settings.qrisNmid,
      storeCoords:
        body.storeCoords === null ? null : parsedCoords ?? db.settings.storeCoords ?? null,
    };
    recordLocalAuditLog(db, user, 'UBAH_PENGATURAN', 'StoreSettings', 'Perbarui profil / jam buka / ongkir / koordinat / WA toko');
    writeLocalDb(db);
    return {ok: true, status: 200, storageMode: 'browser', data: {settings: db.settings}};
  }

  if (path === '/api/ops/staff' && method === 'POST') {
    if (!isLeadership) {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Khusus Pemilik / Direktur.'}};
    }
    const displayName = String(body.displayName || '').trim();
    const username = String(body.username || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '');
    const role = body.role as DivisionRole;
    const passcode = String(body.passcode || '');
    if (displayName.length < 2 || username.length < 3 || !VALID_ROLES.includes(role) || passcode.length < 6) {
      return {
        ok: false,
        status: 400,
        storageMode: 'browser',
        data: {error: 'Lengkapi nama, username min. 3 karakter, dan sandi min. 6 karakter.'},
      };
    }
    if (user.role === 'DIREKTUR' && !DIRECTOR_MANAGED_ROLES.includes(role)) {
      return {
        ok: false,
        status: 403,
        storageMode: 'browser',
        data: {error: 'Direktur hanya dapat membuat akun staf divisi di bawahnya.'},
      };
    }
    if (db.staff.some((s) => s.username.toLowerCase() === username)) {
      return {ok: false, status: 409, storageMode: 'browser', data: {error: 'Username sudah dipakai.'}};
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
    recordLocalAuditLog(db, user, 'TAMBAH_STAF', username, `Tambah ${displayName} (${role})`);
    writeLocalDb(db);
    const {passcodeHash: _h, ...publicMember} = member;
    return {ok: true, status: 201, storageMode: 'browser', data: {staff: publicMember}};
  }

  if (path.startsWith('/api/ops/staff/') && method === 'PATCH') {
    if (!isLeadership) {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Khusus Pemilik / Direktur.'}};
    }
    const targetId = path.split('/').pop();
    const target = db.staff.find((s) => s.id === targetId);
    if (!target) {
      return {ok: false, status: 404, storageMode: 'browser', data: {error: 'Staf tidak ditemukan.'}};
    }
    if (user.role === 'DIREKTUR' && !DIRECTOR_MANAGED_ROLES.includes(target.role)) {
      return {
        ok: false,
        status: 403,
        storageMode: 'browser',
        data: {error: 'Direktur tidak dapat mengubah akun Pemilik atau Direktur.'},
      };
    }
    if (typeof body.active === 'boolean') target.active = body.active;
    if (body.role && VALID_ROLES.includes(body.role)) {
      if (user.role === 'DIREKTUR' && !DIRECTOR_MANAGED_ROLES.includes(body.role)) {
        return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Akses role ditolak.'}};
      }
      target.role = body.role;
    }
    if (typeof body.displayName === 'string') {
      const nextName = body.displayName.trim();
      if (nextName.length < 2) {
        return {ok: false, status: 400, storageMode: 'browser', data: {error: 'Nama staf minimal 2 karakter.'}};
      }
      target.displayName = nextName;
    }
    if (typeof body.username === 'string') {
      const nextUsername = body.username
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, '');
      if (nextUsername.length < 3) {
        return {ok: false, status: 400, storageMode: 'browser', data: {error: 'Username minimal 3 karakter.'}};
      }
      if (db.staff.some((s) => s.id !== target.id && s.username.toLowerCase() === nextUsername)) {
        return {ok: false, status: 409, storageMode: 'browser', data: {error: 'Username sudah dipakai.'}};
      }
      target.username = nextUsername;
    }
    if (typeof body.passcode === 'string' && body.passcode.length >= 6) {
      target.passcodeHash = await hashLocalPasscode(body.passcode);
    }
    recordLocalAuditLog(db, user, 'UBAH_STAF', target.username, `Update ${target.displayName}`);
    writeLocalDb(db);
    const {passcodeHash: _h, ...publicMember} = target;
    return {ok: true, status: 200, storageMode: 'browser', data: {staff: publicMember}};
  }

  if (path.startsWith('/api/ops/staff/') && method === 'DELETE') {
    if (!isLeadership) {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Khusus Pemilik / Direktur.'}};
    }
    const targetId = path.split('/').pop();
    const idx = db.staff.findIndex((s) => s.id === targetId);
    if (idx === -1) {
      return {ok: false, status: 404, storageMode: 'browser', data: {error: 'Staf tidak ditemukan.'}};
    }
    const target = db.staff[idx];
    if (target.id === user.id) {
      return {ok: false, status: 400, storageMode: 'browser', data: {error: 'Tidak dapat menghapus akun sendiri.'}};
    }
    if (user.role === 'DIREKTUR' && !DIRECTOR_MANAGED_ROLES.includes(target.role)) {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Direktur tidak dapat menghapus akun Pemilik atau Direktur.'}};
    }
    if (target.role === 'PEMILIK' && db.staff.filter((s) => s.role === 'PEMILIK' && s.active).length <= 1) {
      return {ok: false, status: 400, storageMode: 'browser', data: {error: 'Minimal satu akun Pemilik aktif harus tersedia.'}};
    }
    db.staff.splice(idx, 1);
    recordLocalAuditLog(db, user, 'HAPUS_STAF', target.username, `Hapus ${target.displayName}`);
    writeLocalDb(db);
    return {ok: true, status: 200, storageMode: 'browser', data: {deletedId: target.id}};
  }

  if (path === '/api/ops/pos' && method === 'POST') {
    if (!isLeadership && user.role !== 'KASIR') {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Khusus Kasir / Pimpinan.'}};
    }
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

    const subtotal = verifiedItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    const discountAmount = Math.min(subtotal, Math.max(0, Math.round(Number(body.discountAmount || 0))));
    const total = Math.max(0, subtotal - discountAmount);

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
    const qris =
      paymentMethod === 'QRIS'
        ? buildOrderQrisInfo({
            orderNumber,
            amount: Math.max(100, total),
            merchantName: db.settings.qrisMerchantName,
            nmid: db.settings.qrisNmid,
            gatewayStatus: 'PAID',
            nowIso: now,
          })
        : undefined;

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
      paymentStatus: paymentMethod === 'KASBON' ? 'KASBON' : 'LUNAS',
      qris,
      discountAmount,
      status: 'SELESAI',
      items: verifiedItems,
      subtotal,
      deliveryFee: 0,
      total,
      handledBy: user.displayName,
      courierName: '',
      createdAt: now,
      updatedAt: now,
    };
    db.orders.unshift(posOrder);

    if (paymentMethod === 'KASBON') {
      const rawDue = String(body.kasbonDueDate || '').trim();
      const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDue) ? rawDue : undefined;
      db.kasbon.unshift({
        id: randomId('ksb'),
        customerName,
        phone,
        address: notes || 'Warga Gunung Batin Udik',
        amountDue: total,
        totalPaid: 0,
        dueDate,
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
      const activeShift = db.shifts.find((s) => s.status === 'TERBUKA');
      if (activeShift) {
        if (paymentMethod === 'QRIS') activeShift.qrisSalesTotal += total;
        else activeShift.expectedCash += total;
      }
    }
    writeLocalDb(db);
    return {ok: true, status: 201, storageMode: 'browser', data: {order: posOrder}};
  }

  if (path === '/api/ops/shifts/open' && method === 'POST') {
    if (!isLeadership && user.role !== 'KASIR') {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Akses ditolak.'}};
    }
    if (db.shifts.some((s) => s.status === 'TERBUKA')) {
      return {ok: false, status: 409, storageMode: 'browser', data: {error: 'Masih ada shift terbuka.'}};
    }
    const openingCash = Math.max(0, Math.round(Number(body.openingCash || 0)));
    const shift: CashierShift = {
      id: randomId('shf'),
      cashierId: user.id,
      cashierName: user.displayName,
      openedAt: new Date().toISOString(),
      openingCash,
      expectedCash: openingCash,
      qrisSalesTotal: 0,
      note: String(body.note || 'Buka laci kasir'),
      status: 'TERBUKA',
    };
    db.shifts.unshift(shift);
    writeLocalDb(db);
    return {ok: true, status: 201, storageMode: 'browser', data: {shift}};
  }

  if (path === '/api/ops/shifts/close' && method === 'POST') {
    if (!isLeadership && user.role !== 'KASIR') {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Akses ditolak.'}};
    }
    const shift = db.shifts.find((s) => s.status === 'TERBUKA');
    if (!shift) {
      return {ok: false, status: 404, storageMode: 'browser', data: {error: 'Tidak ada shift terbuka.'}};
    }
    const countedCash = Math.max(0, Math.round(Number(body.countedCash ?? shift.expectedCash)));
    shift.countedCash = countedCash;
    shift.discrepancy = countedCash - shift.expectedCash;
    shift.closedAt = new Date().toISOString();
    shift.status = 'DITUTUP';
    if (body.note) shift.note = `${shift.note} · Tutup: ${String(body.note)}`;
    writeLocalDb(db);
    return {ok: true, status: 200, storageMode: 'browser', data: {shift}};
  }

  if (path.startsWith('/api/ops/orders/') && path.endsWith('/status') && method === 'PATCH') {
    if (!['PEMILIK', 'DIREKTUR', 'KASIR', 'GUDANG', 'KURIR'].includes(user.role)) {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Akses ditolak.'}};
    }
    const orderId = path.split('/')[4];
    const nextStatus = body.status as OrderStatus;
    const order = db.orders.find((o) => o.id === orderId);
    if (!order) {
      return {ok: false, status: 404, storageMode: 'browser', data: {error: 'Pesanan tidak ditemukan.'}};
    }
    const prevStatus = order.status;
    if (user.role === 'GUDANG' && (order.source !== 'ONLINE' || prevStatus !== 'MENUNGGU' || nextStatus !== 'DISIAPKAN')) {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Gudang hanya menyiapkan pesanan online.'}};
    }
    if (user.role === 'KURIR' && (order.deliveryMethod !== 'cod' || !['DIANTAR', 'SELESAI'].includes(nextStatus))) {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Kurir hanya menangani pesanan COD.'}};
    }
    if (user.role === 'KASIR' && (nextStatus === 'DIANTAR' || (nextStatus === 'SELESAI' && order.deliveryMethod === 'cod'))) {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Pengantaran COD ditangani Divisi Kurir.'}};
    }
    const now = new Date().toISOString();
    order.status = nextStatus;
    order.updatedAt = now;
    if (nextStatus === 'DIANTAR' || (nextStatus === 'SELESAI' && order.deliveryMethod === 'cod')) {
      order.courierName = order.courierName || user.displayName;
    }
    if (order.deliveryMethod === 'cod') {
      if (nextStatus === 'DISIAPKAN') {
        order.tracking = {
          checkpoint: 'PERSIAPAN_TOKO',
          locationNote: 'Barang sedang dikemas di Toko Dimas Jaya',
          progressPercent: 25,
          etaMinutes: order.tracking?.etaMinutes ?? 20,
          courierCoords: order.tracking?.courierCoords ?? db.settings.storeCoords ?? null,
          updatedAt: now,
        };
      } else if (nextStatus === 'DIANTAR') {
        order.tracking = {
          checkpoint: 'MENUJU_LOKASI',
          locationNote:
            order.tracking?.locationNote || 'Kurir berangkat dari toko menuju lokasi pelanggan',
          progressPercent: Math.max(55, order.tracking?.progressPercent ?? 55),
          etaMinutes: order.tracking?.etaMinutes ?? 12,
          courierCoords: order.tracking?.courierCoords ?? db.settings.storeCoords ?? null,
          updatedAt: now,
        };
        appendLocalWhatsappNotification(order, 'DIANTAR', user.displayName, db.settings.storeUrl);
      } else if (nextStatus === 'SELESAI') {
        const uploadedProofPhoto = isValidUploadedPhoto(body.proofPhoto)
          ? body.proofPhoto.trim()
          : order.tracking?.proofPhoto;
        order.tracking = {
          checkpoint: 'SUDAH_TIBA',
          locationNote: 'Kurir sudah tiba & pesanan COD selesai diserahkan',
          progressPercent: 100,
          etaMinutes: 0,
          proofNote: String(body.proofNote || order.tracking?.proofNote || '').trim() || undefined,
          proofPhoto: uploadedProofPhoto,
          courierCoords:
            order.customerCoords ?? order.tracking?.courierCoords ?? db.settings.storeCoords ?? null,
          updatedAt: now,
        };
      }
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
      order.paymentStatus = 'LUNAS';
      if (order.qris && order.qris.gatewayStatus === 'PENDING') {
        order.qris.gatewayStatus = 'PAID';
        order.qris.paidAt = now;
      }
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

  if (path.startsWith('/api/ops/orders/') && path.endsWith('/qris-confirm') && method === 'PATCH') {
    if (!['PEMILIK', 'DIREKTUR', 'KASIR', 'KEUANGAN'].includes(user.role)) {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Akses ditolak.'}};
    }
    const orderId = path.split('/')[4];
    const order = db.orders.find((o) => o.id === orderId);
    if (!order) return {ok: false, status: 404, storageMode: 'browser', data: {error: 'Pesanan tidak ditemukan.'}};
    const now = new Date().toISOString();
    order.paymentStatus = 'LUNAS';
    if (order.qris) {
      order.qris.gatewayStatus = 'PAID';
      order.qris.paidAt = now;
    }
    if (!db.ledger.some((l) => l.description.includes(`#${order.orderNumber}`))) {
      db.ledger.unshift({
        id: randomId('ldg'),
        type: 'MASUK',
        category: 'Penjualan QRIS',
        description: `Verifikasi QRIS #${order.orderNumber} (${order.customerName})`,
        amount: order.total,
        paymentMethod: 'QRIS',
        actorName: user.displayName,
        createdAt: now,
      });
    }
    appendLocalWhatsappNotification(order, 'QRIS_LUNAS', user.displayName, db.settings.storeUrl);
    writeLocalDb(db);
    return {ok: true, status: 200, storageMode: 'browser', data: {order}};
  }

  if (path.startsWith('/api/ops/orders/') && path.endsWith('/whatsapp') && method === 'POST') {
    const orderId = path.split('/')[4];
    const order = db.orders.find((o) => o.id === orderId);
    if (!order) return {ok: false, status: 404, storageMode: 'browser', data: {error: 'Pesanan tidak ditemukan.'}};
    const notification = appendLocalWhatsappNotification(
      order,
      body.trigger || 'DIANTAR',
      user.displayName,
      db.settings.storeUrl
    );
    writeLocalDb(db);
    return {ok: true, status: 201, storageMode: 'browser', data: {notification, order}};
  }

  if (path.startsWith('/api/ops/orders/') && path.endsWith('/assign-courier') && method === 'PATCH') {
    if (!['PEMILIK', 'DIREKTUR', 'KASIR'].includes(user.role)) {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Khusus Kasir / Pimpinan.'}};
    }
    const orderId = path.split('/')[4];
    const order = db.orders.find((o) => o.id === orderId);
    if (!order || order.deliveryMethod !== 'cod') {
      return {ok: false, status: 404, storageMode: 'browser', data: {error: 'Pesanan COD tidak ditemukan.'}};
    }
    const courierId = String(body.courierId || '').trim();
    if (!courierId) {
      order.assignedCourierId = undefined;
      order.assignedCourierName = undefined;
    } else {
      const courier = db.staff.find((s) => s.id === courierId && s.active && s.role === 'KURIR');
      if (!courier) {
        return {ok: false, status: 404, storageMode: 'browser', data: {error: 'Kurir tidak ditemukan.'}};
      }
      order.assignedCourierId = courier.id;
      order.assignedCourierName = courier.displayName;
      if (!order.courierName) order.courierName = courier.displayName;
    }
    order.updatedAt = new Date().toISOString();
    writeLocalDb(db);
    return {ok: true, status: 200, storageMode: 'browser', data: {order}};
  }

  if (path.startsWith('/api/ops/orders/') && path.endsWith('/tracking') && method === 'PATCH') {
    if (!['PEMILIK', 'DIREKTUR', 'KURIR'].includes(user.role)) {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Khusus Kurir / Pimpinan.'}};
    }
    const orderId = path.split('/')[4];
    const order = db.orders.find((o) => o.id === orderId);
    if (!order || order.deliveryMethod !== 'cod') {
      return {ok: false, status: 404, storageMode: 'browser', data: {error: 'Pesanan COD tidak ditemukan.'}};
    }
    const checkpoint = (body.checkpoint || 'MENUJU_LOKASI') as DeliveryCheckpoint;
    const defaultProgress: Record<DeliveryCheckpoint, number> = {
      PERSIAPAN_TOKO: 20,
      MENUJU_LOKASI: 55,
      DEKAT_TUJUAN: 85,
      SUDAH_TIBA: 100,
    };
    const now = new Date().toISOString();
    const parsedCoords = parseLocalGeoPoint(body.courierCoords);
    const uploadedProofPhoto = isValidUploadedPhoto(body.proofPhoto)
      ? body.proofPhoto.trim()
      : order.tracking?.proofPhoto;
    order.courierName = order.courierName || user.displayName;
    order.updatedAt = now;
    let transitioned = false;
    if (
      (checkpoint === 'MENUJU_LOKASI' ||
        checkpoint === 'DEKAT_TUJUAN' ||
        checkpoint === 'SUDAH_TIBA') &&
      (order.status === 'MENUNGGU' || order.status === 'DISIAPKAN')
    ) {
      order.status = 'DIANTAR';
      transitioned = true;
    }
    order.tracking = {
      checkpoint,
      locationNote: String(body.locationNote || '').trim() || 'Posisi kurir diperbarui',
      progressPercent: Number.isFinite(Number(body.progressPercent))
        ? Math.min(100, Math.max(0, Math.round(Number(body.progressPercent))))
        : defaultProgress[checkpoint] ?? 55,
      etaMinutes: Number.isFinite(Number(body.etaMinutes))
        ? Math.max(0, Math.round(Number(body.etaMinutes)))
        : order.tracking?.etaMinutes,
      proofNote: String(body.proofNote || order.tracking?.proofNote || '').trim() || undefined,
      proofPhoto: uploadedProofPhoto,
      courierCoords:
        body.courierCoords === null ? null : parsedCoords ?? order.tracking?.courierCoords ?? null,
      updatedAt: now,
    };
    if (transitioned) appendLocalWhatsappNotification(order, 'DIANTAR', user.displayName, db.settings.storeUrl);
    writeLocalDb(db);
    return {ok: true, status: 200, storageMode: 'browser', data: {order}};
  }

  if (path === '/api/ops/products' && method === 'POST') {
    const name = String(body.name || '').trim();
    const category = body.category as Exclude<ProductCategory, 'Semua'>;
    const variantLabel = String(body.variantLabel || 'Satuan').trim();
    const sku = String(body.sku || '').trim() || undefined;
    const price = Math.max(500, Math.round(Number(body.price || 0)));
    const costPrice = Math.max(0, Math.round(Number(body.costPrice || 0)));
    const stock = Math.max(0, Math.floor(Number(body.stock || 0)));
    const expiryDate = String(body.expiryDate || '').trim() || undefined;
    const uploadedImage = isValidUploadedPhoto(body.image) ? body.image.trim() : undefined;
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
      image: uploadedImage || imageByCategory[category] || imageByCategory.Sembako,
      imageAlt: name,
      variants: [
        {
          id: variantId,
          label: variantLabel,
          sku,
          price,
          costPrice: costPrice || Math.round(price * 0.85),
          stock,
          minStock: 5,
          expiryDate,
        },
      ],
    };
    syncProductAvailability(newProduct);
    db.products.unshift(newProduct);
    writeLocalDb(db);
    return {ok: true, status: 201, storageMode: 'browser', data: {product: newProduct}};
  }

  if (path.startsWith('/api/ops/products/') && path.endsWith('/variants') && method === 'POST') {
    const productId = path.split('/')[4];
    const product = db.products.find((p) => p.id === productId);
    if (!product) return {ok: false, status: 404, storageMode: 'browser', data: {error: 'Produk tidak ditemukan.'}};
    const label = String(body.label || '').trim();
    const sku = String(body.sku || '').trim() || undefined;
    const price = Math.max(500, Math.round(Number(body.price || 0)));
    const costPrice = Math.max(0, Math.round(Number(body.costPrice || 0)));
    const stock = Math.max(0, Math.floor(Number(body.stock || 0)));
    const expiryDate = String(body.expiryDate || '').trim() || undefined;
    product.variants.push({
      id: randomId('var'),
      label,
      sku,
      price,
      costPrice: costPrice || Math.round(price * 0.85),
      stock,
      minStock: Math.max(1, Math.floor(Number(body.minStock || 5))),
      expiryDate,
    });
    product.unitSummary = product.variants.map((v) => v.label).join(' · ');
    syncProductAvailability(product);
    writeLocalDb(db);
    return {ok: true, status: 201, storageMode: 'browser', data: {product}};
  }

  if (path.startsWith('/api/ops/products/') && path.includes('/variant/') && method === 'PATCH') {
    const segments = path.split('/');
    const productId = segments[4];
    const variantId = segments[6];
    const product = db.products.find((p) => p.id === productId);
    const variant = product?.variants.find((v) => v.id === variantId);
    if (!product || !variant) return {ok: false, status: 404, storageMode: 'browser', data: {error: 'Tidak ditemukan.'}};
    if (body.label) {
      variant.label = String(body.label).trim();
      product.unitSummary = product.variants.map((v) => v.label).join(' · ');
    }
    if (body.sku !== undefined) variant.sku = String(body.sku || '').trim() || undefined;
    if (body.price !== undefined) variant.price = Math.max(500, Math.round(Number(body.price)));
    if (body.costPrice !== undefined) variant.costPrice = Math.max(0, Math.round(Number(body.costPrice)));
    if (body.minStock !== undefined) variant.minStock = Math.max(0, Math.floor(Number(body.minStock)));
    if (body.expiryDate !== undefined) variant.expiryDate = String(body.expiryDate || '').trim() || undefined;
    syncProductAvailability(product);
    writeLocalDb(db);
    return {ok: true, status: 200, storageMode: 'browser', data: {product}};
  }

  if (path.startsWith('/api/ops/products/') && path.includes('/variant/') && method === 'DELETE') {
    const segments = path.split('/');
    const productId = segments[4];
    const variantId = segments[6];
    const product = db.products.find((p) => p.id === productId);
    if (!product) return {ok: false, status: 404, storageMode: 'browser', data: {error: 'Produk tidak ditemukan.'}};
    if (product.variants.length <= 1) {
      return {ok: false, status: 400, storageMode: 'browser', data: {error: 'Minimal harus tersisa 1 varian kemasan.'}};
    }
    const idx = product.variants.findIndex((v) => v.id === variantId);
    if (idx === -1) return {ok: false, status: 404, storageMode: 'browser', data: {error: 'Varian tidak ditemukan.'}};
    product.variants.splice(idx, 1);
    product.unitSummary = product.variants.map((v) => v.label).join(' · ');
    syncProductAvailability(product);
    writeLocalDb(db);
    return {ok: true, status: 200, storageMode: 'browser', data: {product}};
  }

  if (path.startsWith('/api/ops/products/') && path.split('/').length === 5 && method === 'PATCH') {
    const productId = path.split('/')[4];
    const product = db.products.find((p) => p.id === productId);
    if (!product) return {ok: false, status: 404, storageMode: 'browser', data: {error: 'Produk tidak ditemukan.'}};
    if (String(body.name || '').trim().length >= 2) {
      product.name = String(body.name).trim();
      product.imageAlt = product.name;
    }
    if (body.category) product.category = body.category;
    if (String(body.description || '').trim()) product.description = String(body.description).trim();
    if (isValidUploadedPhoto(body.image)) product.image = body.image.trim();
    writeLocalDb(db);
    return {ok: true, status: 200, storageMode: 'browser', data: {product}};
  }

  if (path.startsWith('/api/ops/products/') && path.split('/').length === 5 && method === 'DELETE') {
    const productId = path.split('/')[4];
    const idx = db.products.findIndex((p) => p.id === productId);
    if (idx === -1) return {ok: false, status: 404, storageMode: 'browser', data: {error: 'Produk tidak ditemukan.'}};
    const [removed] = db.products.splice(idx, 1);
    writeLocalDb(db);
    return {ok: true, status: 200, storageMode: 'browser', data: {deletedId: removed.id}};
  }

  if (path === '/api/ops/stock' && method === 'POST') {
    const product = db.products.find((p) => p.id === body.productId);
    const variant = product?.variants.find((v) => v.id === body.variantId);
    if (!product || !variant) {
      return {ok: false, status: 404, storageMode: 'browser', data: {error: 'Produk tidak ditemukan.'}};
    }
    const type: 'MASUK' | 'OPNAME' | 'RUSAK' =
      body.type === 'OPNAME' ? 'OPNAME' : body.type === 'RUSAK' ? 'RUSAK' : 'MASUK';
    const quantity = Math.floor(Number(body.quantity || 0));
    let delta = 0;
    if (type === 'MASUK') {
      if (quantity <= 0) {
        return {ok: false, status: 400, storageMode: 'browser', data: {error: 'Jumlah stok masuk harus lebih dari 0.'}};
      }
      variant.stock += quantity;
      delta = quantity;
    } else if (type === 'RUSAK') {
      if (quantity <= 0 || quantity > variant.stock) {
        return {ok: false, status: 400, storageMode: 'browser', data: {error: 'Jumlah barang rusak melebihi stok.'}};
      }
      variant.stock -= quantity;
      delta = -quantity;
    } else {
      delta = quantity - variant.stock;
      variant.stock = Math.max(0, quantity);
    }
    syncProductAvailability(product);
    const now = new Date().toISOString();
    const defaultNote =
      type === 'MASUK'
        ? 'Stok masuk'
        : type === 'RUSAK'
          ? 'Barang rusak / kedaluwarsa / susut'
          : 'Stok opname';
    const movement: StockMovement = {
      id: randomId('stk'),
      productId: product.id,
      productName: product.name,
      variantId: variant.id,
      variantLabel: variant.label,
      type,
      quantityDelta: delta,
      note: String(body.note || '').trim() || defaultNote,
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

  if (path === '/api/ops/supplier/deliveries' && method === 'POST') {
    if (!['PEMILIK', 'DIREKTUR', 'PEMASOK'].includes(user.role)) {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Khusus Pemasok / Pimpinan.'}};
    }
    const rawItems = Array.isArray(body.items) && body.items.length > 0
      ? body.items
      : [{productId: body.productId, variantId: body.variantId, quantity: body.quantity, unitCost: body.unitCost}];
    const invoicePhoto = isValidUploadedPhoto(body.invoicePhoto) ? body.invoicePhoto.trim() : undefined;
    const batchCode =
      String(body.batchCode || '').trim() ||
      (rawItems.length > 1 ? `SJ-${String(Date.now()).slice(-4)}` : undefined);
    const created: SupplierDelivery[] = [];
    const now = new Date().toISOString();

    for (const rawItem of rawItems) {
      const product = db.products.find((p) => p.id === rawItem.productId);
      const variant = product?.variants.find((v) => v.id === rawItem.variantId);
      const quantity = Math.floor(Number(rawItem.quantity || 0));
      if (!product || !variant || quantity <= 0) {
        return {ok: false, status: 400, storageMode: 'browser', data: {error: 'Data suplai tidak valid.'}};
      }
      created.push({
        id: randomId('sup'),
        batchCode,
        supplierId: user.id,
        supplierName: user.displayName,
        productId: product.id,
        productName: product.name,
        variantId: variant.id,
        variantLabel: variant.label,
        quantity,
        unitCost: Math.max(0, Math.round(Number(rawItem.unitCost || 0))) || variant.costPrice || 0,
        note: String(body.note || '').trim() || 'Suplai barang masuk ke gudang',
        invoicePhoto,
        status: 'MENUNGGU_TERIMA',
        paymentStatus: body.paymentStatus === 'TEMPO' ? 'TEMPO' : 'TUNAI',
        dueDate: String(body.dueDate || '').trim() || undefined,
        createdAt: now,
      });
    }
    for (let i = created.length - 1; i >= 0; i -= 1) {
      db.supplierDeliveries.unshift(created[i]);
    }
    writeLocalDb(db);
    return {ok: true, status: 201, storageMode: 'browser', data: {delivery: created[0], deliveries: created}};
  }

  if (path.startsWith('/api/ops/supplier/deliveries/') && path.split('/').length === 6 && method === 'PATCH') {
    if (!['PEMILIK', 'DIREKTUR', 'PEMASOK'].includes(user.role)) {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Khusus Pemasok / Pimpinan.'}};
    }
    const id = path.split('/')[5];
    const delivery = db.supplierDeliveries.find((d) => d.id === id);
    if (!delivery) return {ok: false, status: 404, storageMode: 'browser', data: {error: 'Kiriman tidak ditemukan.'}};
    if (!isLeadership && delivery.supplierId !== user.id) {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Bukan kiriman Anda.'}};
    }
    if (delivery.status !== 'MENUNGGU_TERIMA') {
      return {ok: false, status: 409, storageMode: 'browser', data: {error: 'Sudah diterima gudang.'}};
    }
    if (body.quantity !== undefined && Number(body.quantity) > 0) delivery.quantity = Math.floor(Number(body.quantity));
    if (body.unitCost !== undefined && Number(body.unitCost) >= 0) delivery.unitCost = Math.round(Number(body.unitCost));
    if (typeof body.note === 'string') delivery.note = body.note.trim() || delivery.note;
    if (body.paymentStatus === 'TEMPO' || body.paymentStatus === 'TUNAI') delivery.paymentStatus = body.paymentStatus;
    if (body.dueDate !== undefined) delivery.dueDate = String(body.dueDate || '').trim() || undefined;
    if (isValidUploadedPhoto(body.invoicePhoto)) delivery.invoicePhoto = body.invoicePhoto.trim();
    writeLocalDb(db);
    return {ok: true, status: 200, storageMode: 'browser', data: {delivery}};
  }

  if (path.startsWith('/api/ops/supplier/deliveries/') && path.split('/').length === 6 && method === 'DELETE') {
    if (!['PEMILIK', 'DIREKTUR', 'PEMASOK'].includes(user.role)) {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Khusus Pemasok / Pimpinan.'}};
    }
    const id = path.split('/')[5];
    const idx = db.supplierDeliveries.findIndex((d) => d.id === id);
    if (idx === -1) return {ok: false, status: 404, storageMode: 'browser', data: {error: 'Kiriman tidak ditemukan.'}};
    const delivery = db.supplierDeliveries[idx];
    if (!isLeadership && delivery.supplierId !== user.id) {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Bukan kiriman Anda.'}};
    }
    if (delivery.status !== 'MENUNGGU_TERIMA') {
      return {ok: false, status: 409, storageMode: 'browser', data: {error: 'Sudah diterima gudang.'}};
    }
    db.supplierDeliveries.splice(idx, 1);
    writeLocalDb(db);
    return {ok: true, status: 200, storageMode: 'browser', data: {deletedId: delivery.id}};
  }

  if (
    path.startsWith('/api/ops/supplier/deliveries/') &&
    path.endsWith('/receive') &&
    method === 'PATCH'
  ) {
    if (!['PEMILIK', 'DIREKTUR', 'GUDANG'].includes(user.role)) {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Khusus Gudang / Pimpinan.'}};
    }
    const id = path.split('/')[5];
    const delivery = db.supplierDeliveries.find((d) => d.id === id);
    if (!delivery) {
      return {ok: false, status: 404, storageMode: 'browser', data: {error: 'Kiriman pemasok tidak ditemukan.'}};
    }
    if (delivery.status === 'DITERIMA') {
      return {ok: true, status: 200, storageMode: 'browser', data: {delivery}};
    }
    const product = db.products.find((p) => p.id === delivery.productId);
    const variant = product?.variants.find((v) => v.id === delivery.variantId);
    if (!product || !variant) {
      return {ok: false, status: 404, storageMode: 'browser', data: {error: 'Produk tidak ditemukan.'}};
    }
    const now = new Date().toISOString();
    delivery.status = 'DITERIMA';
    delivery.receivedBy = user.displayName;
    delivery.receivedAt = now;
    variant.stock += delivery.quantity;
    syncProductAvailability(product);
    db.stockMovements.unshift({
      id: randomId('stk'),
      productId: product.id,
      productName: product.name,
      variantId: variant.id,
      variantLabel: variant.label,
      type: 'MASUK',
      quantityDelta: delivery.quantity,
      note: `Terima kiriman pemasok ${delivery.supplierName}`,
      actorName: user.displayName,
      createdAt: now,
    });
    if (delivery.paymentStatus !== 'TEMPO' && body.recordExpense && delivery.unitCost > 0) {
      delivery.paymentStatus = 'LUNAS';
      db.ledger.unshift({
        id: randomId('ldg'),
        type: 'KELUAR',
        category: 'Kulakan Pemasok',
        description: `Suplai ${delivery.supplierName}: ${product.name} x${delivery.quantity}`,
        amount: delivery.unitCost * delivery.quantity,
        paymentMethod: 'TUNAI',
        actorName: user.displayName,
        createdAt: now,
      });
    }
    writeLocalDb(db);
    return {ok: true, status: 200, storageMode: 'browser', data: {delivery, product}};
  }

  if (
    path.startsWith('/api/ops/supplier/deliveries/') &&
    path.endsWith('/pay') &&
    method === 'PATCH'
  ) {
    if (!['PEMILIK', 'DIREKTUR', 'KEUANGAN'].includes(user.role)) {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Khusus Keuangan / Pimpinan.'}};
    }
    const id = path.split('/')[5];
    const delivery = db.supplierDeliveries.find((d) => d.id === id);
    if (!delivery) return {ok: false, status: 404, storageMode: 'browser', data: {error: 'Tagihan tidak ditemukan.'}};
    const totalBill = delivery.unitCost * delivery.quantity;
    delivery.paymentStatus = 'LUNAS';
    if (totalBill > 0) {
      db.ledger.unshift({
        id: randomId('ldg'),
        type: 'KELUAR',
        category: 'Bayar Hutang Pemasok',
        description: `Pelunasan suplai ${delivery.supplierName}: ${delivery.productName} x${delivery.quantity}`,
        amount: totalBill,
        paymentMethod: String(body.paymentMethod || 'TRANSFER'),
        actorName: user.displayName,
        createdAt: new Date().toISOString(),
      });
    }
    writeLocalDb(db);
    return {ok: true, status: 200, storageMode: 'browser', data: {delivery}};
  }

  if (path === '/api/ops/ledger' && method === 'POST') {
    if (!['PEMILIK', 'DIREKTUR', 'KEUANGAN'].includes(user.role)) {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Khusus Keuangan / Pimpinan.'}};
    }
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

  if (path.startsWith('/api/ops/ledger/') && path.split('/').length === 5 && method === 'DELETE') {
    if (!['PEMILIK', 'DIREKTUR', 'KEUANGAN'].includes(user.role)) {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Khusus Keuangan / Pimpinan.'}};
    }
    const id = path.split('/')[4];
    const idx = db.ledger.findIndex((l) => l.id === id);
    if (idx === -1) {
      return {ok: false, status: 404, storageMode: 'browser', data: {error: 'Catatan kas tidak ditemukan.'}};
    }
    const [removed] = db.ledger.splice(idx, 1);
    recordLocalAuditLog(
      db,
      user,
      'HAPUS_KAS',
      removed.category,
      `Hapus catatan ${removed.type} Rp ${removed.amount.toLocaleString('id-ID')}: ${removed.description}`
    );
    writeLocalDb(db);
    return {ok: true, status: 200, storageMode: 'browser', data: {deletedId: removed.id}};
  }

  if (path === '/api/ops/kasbon' && method === 'POST') {
    if (!['PEMILIK', 'DIREKTUR', 'KEUANGAN', 'KASIR'].includes(user.role)) {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Akses ditolak.'}};
    }
    const customerName = String(body.customerName || '').trim();
    const amountDue = Math.round(Number(body.amountDue || 0));
    if (customerName.length < 2 || amountDue <= 0) {
      return {ok: false, status: 400, storageMode: 'browser', data: {error: 'Nama dan nominal kasbon wajib valid.'}};
    }
    const record: KasbonRecord = {
      id: randomId('ksb'),
      customerName,
      phone: String(body.phone || '').trim(),
      address: String(body.address || '').trim() || 'Warga Gunung Batin Udik',
      amountDue,
      totalPaid: 0,
      dueDate: String(body.dueDate || '').trim() || undefined,
      note: String(body.note || '').trim() || 'Catatan bon / kasbon manual',
      updatedAt: new Date().toISOString(),
    };
    db.kasbon.unshift(record);
    writeLocalDb(db);
    return {ok: true, status: 201, storageMode: 'browser', data: {kasbon: record}};
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

  if (path.startsWith('/api/ops/complaints/') && method === 'PATCH') {
    if (!['PEMILIK', 'DIREKTUR', 'KASIR', 'GUDANG'].includes(user.role)) {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Akses ditolak.'}};
    }
    const id = path.split('/')[4];
    const complaint = db.complaints.find((c) => c.id === id);
    if (!complaint) return {ok: false, status: 404, storageMode: 'browser', data: {error: 'Komplain tidak ditemukan.'}};
    const nextStatus = body.status as ComplaintStatus;
    if (!isLeadership && ['DISETUJUI', 'DITOLAK'].includes(nextStatus)) {
      return {ok: false, status: 403, storageMode: 'browser', data: {error: 'Persetujuan akhir khusus Pemilik/Direktur.'}};
    }
    const prevStatus = complaint.status;
    const now = new Date().toISOString();
    complaint.status = nextStatus;
    complaint.handledBy = user.displayName;
    complaint.updatedAt = now;
    if (typeof body.staffResponse === 'string') complaint.staffResponse = body.staffResponse.trim();
    const refundAmount = Math.max(0, Math.round(Number(body.refundAmount || 0)));
    if (refundAmount > 0) complaint.refundAmount = refundAmount;
    const isFinalizing =
      (nextStatus === 'DISETUJUI' || nextStatus === 'SELESAI') &&
      prevStatus !== 'DISETUJUI' &&
      prevStatus !== 'SELESAI' &&
      (complaint.refundAmount || 0) > 0;
    if (
      isFinalizing &&
      complaint.requestedResolution === 'REFUND_DANA' &&
      !db.ledger.some((l) => l.description.includes(complaint.complaintNumber))
    ) {
      db.ledger.unshift({
        id: randomId('ldg'),
        type: 'KELUAR',
        category: 'Refund / Retur Pelanggan',
        description: `Refund ${complaint.complaintNumber} (${complaint.orderNumber})`,
        amount: complaint.refundAmount!,
        paymentMethod: 'TUNAI',
        actorName: user.displayName,
        createdAt: now,
      });
    }
    if (
      isFinalizing &&
      complaint.requestedResolution === 'POTONG_TAGIHAN' &&
      !db.ledger.some((l) => l.description.includes(complaint.complaintNumber))
    ) {
      const cmpPhone = normalizePhoneDigits(complaint.phone);
      const openKasbon = db.kasbon.find((k) => {
        const rem = Math.max(0, k.amountDue - k.totalPaid);
        if (rem <= 0) return false;
        const kp = normalizePhoneDigits(k.phone);
        if (cmpPhone && kp) return kp === cmpPhone;
        return k.customerName.trim().toLowerCase() === complaint.customerName.trim().toLowerCase();
      });
      let appliedCut = complaint.refundAmount!;
      if (openKasbon) {
        const rem = Math.max(0, openKasbon.amountDue - openKasbon.totalPaid);
        appliedCut = Math.min(rem, complaint.refundAmount!);
        if (appliedCut > 0) {
          openKasbon.totalPaid += appliedCut;
          openKasbon.updatedAt = now;
          openKasbon.note = `${openKasbon.note} · [Potongan ${complaint.complaintNumber}: Rp ${appliedCut.toLocaleString('id-ID')}]`;
        }
      }
      if (appliedCut > 0) {
        db.ledger.unshift({
          id: randomId('ldg'),
          type: 'KELUAR',
          category: 'Potongan / Retur Pelanggan',
          description: `Potong tagihan ${complaint.complaintNumber} (${complaint.orderNumber})`,
          amount: appliedCut,
          paymentMethod: 'KASBON',
          actorName: user.displayName,
          createdAt: now,
        });
      }
    }
    writeLocalDb(db);
    return {ok: true, status: 200, storageMode: 'browser', data: {complaint}};
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

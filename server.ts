import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import express, {type NextFunction, type Request, type Response} from 'express';
import {createServer as createViteServer} from 'vite';
import {
  hashPasscode,
  loadDatabase,
  saveDatabase,
  type StoredCustomer,
  type StoredStaff,
  type TokoDatabase,
  verifyPasscode,
} from './server/db.ts';
import {
  buildCourierWhatsappLink,
  buildOrderQrisInfo,
  normalizePhoneDigits,
} from './src/lib/qrisHelpers.ts';
import {isValidUploadedPhoto} from './src/lib/imageHelpers.ts';
import type {
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
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  Product,
  SupplierDelivery,
  WhatsappNotification,
} from './src/types/store.ts';

const PORT = 3000;
const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

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

const VALID_CATEGORIES = [
  'Sembako',
  'Kopi & Gula',
  'Dapur & Bumbu',
  'Kebersihan',
  'Galon & Minuman',
] as const;

const VALID_COMPLAINT_CATEGORIES: ComplaintCategory[] = [
  'BARANG_RUSAK',
  'KURANG_ITEM',
  'SALAH_VARIAN',
  'KEDALUWARSA',
  'LAINNYA',
];

const VALID_COMPLAINT_RESOLUTIONS: ComplaintResolution[] = [
  'GANTI_BARANG',
  'REFUND_DANA',
  'POTONG_TAGIHAN',
];

interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

interface CustomerAuthenticatedRequest extends Request {
  customer?: CustomerProfile;
}

function signToken(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${signature}`;
}

function verifyRawToken<T extends {exp?: number}>(token: string): T | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, providedSig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');

  const bufA = Buffer.from(providedSig, 'utf8');
  const bufB = Buffer.from(expectedSig, 'utf8');
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as T;
    if (!parsed.exp || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

function signSessionToken(user: AuthUser): string {
  return signToken({
    tokenKind: 'staff',
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    exp: Date.now() + 1000 * 60 * 60 * 12,
  });
}

function verifySessionToken(token: string): AuthUser | null {
  const parsed = verifyRawToken<AuthUser & {tokenKind?: string; exp: number}>(token);
  if (!parsed || (parsed.tokenKind && parsed.tokenKind !== 'staff')) return null;
  if (!VALID_ROLES.includes(parsed.role)) return null;
  return {
    id: parsed.id,
    username: parsed.username,
    displayName: parsed.displayName,
    role: parsed.role,
  };
}

function signCustomerToken(customer: CustomerProfile): string {
  return signToken({
    tokenKind: 'customer',
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
  });
}

function verifyCustomerToken(token: string): {id: string; phone: string} | null {
  const parsed = verifyRawToken<{
    tokenKind?: string;
    id?: string;
    phone?: string;
    exp: number;
  }>(token);
  if (!parsed || parsed.tokenKind !== 'customer' || !parsed.id) return null;
  return {id: parsed.id, phone: String(parsed.phone || '')};
}

function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({error: 'Silakan masuk ke Portal Staf terlebih dahulu.'});
    return;
  }
  const token = authHeader.slice(7).trim();
  const user = verifySessionToken(token);
  if (!user) {
    res.status(401).json({error: 'Sesi telah berakhir. Silakan masuk ulang.'});
    return;
  }

  if (user.id !== 'env-owner') {
    const db = loadDatabase();
    const staffRecord = db.staff.find((s) => s.id === user.id);
    if (!staffRecord || !staffRecord.active) {
      res.status(403).json({error: 'Akun staf tidak aktif atau tidak ditemukan.'});
      return;
    }
    req.user = {
      id: staffRecord.id,
      username: staffRecord.username,
      displayName: staffRecord.displayName,
      role: staffRecord.role,
    };
  } else {
    req.user = user;
  }

  next();
}

function extractCustomerFromHeader(req: Request, db: TokoDatabase): StoredCustomer | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  const claims = verifyCustomerToken(token);
  if (!claims) return null;
  return db.customers.find((c) => c.id === claims.id) || null;
}

function requireCustomerAuth(
  req: CustomerAuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const db = loadDatabase();
  const record = extractCustomerFromHeader(req, db);
  if (!record) {
    res.status(401).json({error: 'Silakan masuk ke akun pelanggan terlebih dahulu.'});
    return;
  }
  req.customer = {
    id: record.id,
    name: record.name,
    phone: record.phone,
    defaultAddress: record.defaultAddress,
    createdAt: record.createdAt,
  };
  next();
}

function requireRoles(allowedRoles: DivisionRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: 'Divisi Anda tidak memiliki izin untuk melakukan tindakan ini.',
      });
      return;
    }
    next();
  };
}

function sanitizeProductForPublic(product: Product): Product {
  return {
    ...product,
    variants: product.variants.map((v) => ({
      id: v.id,
      label: v.label,
      sku: v.sku,
      price: v.price,
      stock: v.stock,
      minStock: v.minStock,
      expiryDate: v.expiryDate,
    })),
  };
}

function sanitizeOrderForPublic(order: Order) {
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

function parseGeoPoint(raw: unknown): GeoPoint | null {
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

function sanitizeOrderItemsForRole(order: Order): Order {
  return {
    ...order,
    items: order.items.map((item) => ({
      ...item,
      costPrice: 0,
    })),
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

function recordAuditLog(
  db: TokoDatabase,
  actor: {id: string; displayName: string; role: string},
  action: string,
  target: string,
  detail: string
): void {
  db.auditLogs.unshift({
    id: `aud-${crypto.randomUUID().slice(0, 8)}`,
    actorId: actor.id,
    actorName: actor.displayName,
    actorRole: actor.role,
    action,
    target,
    detail,
    createdAt: new Date().toISOString(),
  });
  if (db.auditLogs.length > 200) {
    db.auditLogs = db.auditLogs.slice(0, 200);
  }
}

function appendWhatsappNotification(
  order: Order,
  trigger: WhatsappNotification['trigger'],
  actorName: string
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
  });

  const notif: WhatsappNotification = {
    id: `wa-${crypto.randomUUID().slice(0, 8)}`,
    trigger,
    recipientPhone: order.phone,
    message,
    waLink,
    actorName,
    sentAt: new Date().toISOString(),
  };

  if (!Array.isArray(order.whatsappNotifications)) {
    order.whatsappNotifications = [];
  }
  order.whatsappNotifications.unshift(notif);
  return notif;
}

function doesCustomerOwnOrder(customer: {id: string; phone: string}, order: Order): boolean {
  if (order.customerId && order.customerId === customer.id) return true;
  const custPhone = normalizePhoneDigits(customer.phone);
  const ordPhone = normalizePhoneDigits(order.phone);
  return Boolean(custPhone && ordPhone && custPhone === ordPhone);
}

async function startServer() {
  const app = express();
  app.use(express.json({limit: '8mb'}));

  function getConfiguredEnvOwnerPasscode(): string {
    const raw = (process.env.OWNER_PASSCODE || '').trim();
    if (!raw || raw.startsWith('MY_')) return '';
    return raw;
  }

  // --- STAFF AUTH ROUTES ---
  app.get('/api/auth/status', (_req, res) => {
    const db = loadDatabase();
    const envPasscodeActive = Boolean(getConfiguredEnvOwnerPasscode());
    const ownerClaimed = db.staff.some((s) => s.role === 'PEMILIK' && s.active);
    res.json({
      ownerClaimed,
      envPasscodeActive,
      staffCount: db.staff.filter((s) => s.active).length,
    });
  });

  app.post('/api/auth/bootstrap-owner', (req, res) => {
    const db = loadDatabase();
    const existingOwner = db.staff.some((s) => s.role === 'PEMILIK');
    if (existingOwner) {
      res.status(409).json({
        error: 'Akun Pemilik sudah terdaftar. Silakan masuk dengan ID dan kata sandi Anda.',
      });
      return;
    }

    const displayName = String(req.body?.displayName || '').trim();
    const username = String(req.body?.username || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '');
    const passcode = String(req.body?.passcode || '');

    if (displayName.length < 2 || username.length < 3 || passcode.length < 6) {
      res.status(400).json({
        error:
          'Nama minimal 2 karakter, ID/username minimal 3 karakter (huruf/angka), dan kata sandi minimal 6 karakter.',
      });
      return;
    }

    const ownerRecord: StoredStaff = {
      id: `stf-${crypto.randomUUID().slice(0, 8)}`,
      username,
      displayName,
      role: 'PEMILIK',
      passcodeHash: hashPasscode(passcode),
      active: true,
      createdAt: new Date().toISOString(),
    };

    db.staff.push(ownerRecord);
    recordAuditLog(
      db,
      {id: ownerRecord.id, displayName: ownerRecord.displayName, role: ownerRecord.role},
      'CLAIM_PEMILIK',
      ownerRecord.username,
      'Aktivasi awal akun Pemilik Toko Dimas Jaya'
    );
    saveDatabase(db);

    const authUser: AuthUser = {
      id: ownerRecord.id,
      username: ownerRecord.username,
      displayName: ownerRecord.displayName,
      role: ownerRecord.role,
    };

    res.status(201).json({
      token: signSessionToken(authUser),
      user: authUser,
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const passcode = String(req.body?.passcode || '');

    if (!username || !passcode) {
      res.status(400).json({error: 'ID/username dan kata sandi wajib diisi.'});
      return;
    }

    const envOwnerPasscode = getConfiguredEnvOwnerPasscode();
    if (
      envOwnerPasscode &&
      username === 'pemilik' &&
      passcode.length === envOwnerPasscode.length &&
      crypto.timingSafeEqual(
        Buffer.from(passcode, 'utf8'),
        Buffer.from(envOwnerPasscode, 'utf8')
      )
    ) {
      const envOwner: AuthUser = {
        id: 'env-owner',
        username: 'pemilik',
        displayName: 'Pemilik Toko Dimas Jaya',
        role: 'PEMILIK',
      };
      res.json({
        token: signSessionToken(envOwner),
        user: envOwner,
      });
      return;
    }

    const db = loadDatabase();
    const staffMember = db.staff.find(
      (s) => s.username.toLowerCase() === username && s.active
    );
    if (!staffMember || !verifyPasscode(passcode, staffMember.passcodeHash)) {
      res.status(401).json({error: 'Username atau kata sandi salah.'});
      return;
    }

    const authUser: AuthUser = {
      id: staffMember.id,
      username: staffMember.username,
      displayName: staffMember.displayName,
      role: staffMember.role,
    };

    res.json({
      token: signSessionToken(authUser),
      user: authUser,
    });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({user: req.user});
  });

  // --- CUSTOMER ACCOUNT & PORTAL ROUTES ---
  app.post('/api/customer/register', (req, res) => {
    const name = String(req.body?.name || '').trim();
    const rawPhone = String(req.body?.phone || '').trim();
    const normalizedPhone = normalizePhoneDigits(rawPhone);
    const defaultAddress = String(req.body?.defaultAddress || '').trim();
    const passcode = String(req.body?.passcode || '');

    if (name.length < 2 || normalizedPhone.length < 8 || passcode.length < 6) {
      res.status(400).json({
        error: 'Nama minimal 2 karakter, nomor HP valid, dan kata sandi minimal 6 karakter.',
      });
      return;
    }

    const db = loadDatabase();
    if (db.customers.some((c) => normalizePhoneDigits(c.phone) === normalizedPhone)) {
      res.status(409).json({
        error: 'Nomor HP ini sudah terdaftar. Silakan masuk dengan kata sandi Anda.',
      });
      return;
    }

    const now = new Date().toISOString();
    const newCustomer: StoredCustomer = {
      id: `cst-${crypto.randomUUID().slice(0, 8)}`,
      name,
      phone: normalizedPhone,
      defaultAddress: defaultAddress || 'Gang Makam, Gunung Batin Udik',
      passcodeHash: hashPasscode(passcode),
      createdAt: now,
    };

    db.customers.push(newCustomer);

    // Link historical orders with matching phone number automatically
    for (const order of db.orders) {
      if (!order.customerId && normalizePhoneDigits(order.phone) === normalizedPhone) {
        order.customerId = newCustomer.id;
      }
    }

    saveDatabase(db);

    const profile: CustomerProfile = {
      id: newCustomer.id,
      name: newCustomer.name,
      phone: newCustomer.phone,
      defaultAddress: newCustomer.defaultAddress,
      createdAt: newCustomer.createdAt,
    };

    res.status(201).json({
      customerToken: signCustomerToken(profile),
      customer: profile,
    });
  });

  app.post('/api/customer/login', (req, res) => {
    const normalizedPhone = normalizePhoneDigits(String(req.body?.phone || ''));
    const passcode = String(req.body?.passcode || '');

    if (!normalizedPhone || !passcode) {
      res.status(400).json({error: 'Nomor HP dan kata sandi wajib diisi.'});
      return;
    }

    const db = loadDatabase();
    const customer = db.customers.find(
      (c) => normalizePhoneDigits(c.phone) === normalizedPhone
    );

    if (!customer || !verifyPasscode(passcode, customer.passcodeHash)) {
      res.status(401).json({error: 'Nomor HP atau kata sandi salah.'});
      return;
    }

    const profile: CustomerProfile = {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      defaultAddress: customer.defaultAddress,
      createdAt: customer.createdAt,
    };

    res.json({
      customerToken: signCustomerToken(profile),
      customer: profile,
    });
  });

  app.get('/api/customer/me', requireCustomerAuth, (req: CustomerAuthenticatedRequest, res) => {
    const db = loadDatabase();
    const customer = req.customer!;
    const custPhoneDigits = normalizePhoneDigits(customer.phone);
    const myOrders = db.orders
      .filter((o) => doesCustomerOwnOrder(customer, o))
      .map(sanitizeOrderForPublic);
    const myComplaints = db.complaints.filter(
      (c) =>
        c.customerId === customer.id ||
        normalizePhoneDigits(c.phone) === custPhoneDigits
    );
    const myKasbon = db.kasbon.filter((k) => {
      const kp = normalizePhoneDigits(k.phone);
      if (custPhoneDigits && kp) return kp === custPhoneDigits;
      return k.customerName.trim().toLowerCase() === customer.name.trim().toLowerCase();
    });
    res.json({
      customer,
      orders: myOrders,
      complaints: myComplaints,
      kasbon: myKasbon,
    });
  });

  app.patch(
    '/api/customer/profile',
    requireCustomerAuth,
    (req: CustomerAuthenticatedRequest, res) => {
      const db = loadDatabase();
      const target = db.customers.find((c) => c.id === req.customer!.id);
      if (!target) {
        res.status(404).json({error: 'Akun pelanggan tidak ditemukan.'});
        return;
      }
      const nextName = String(req.body?.name || target.name).trim();
      const nextAddr = String(req.body?.defaultAddress || target.defaultAddress).trim();
      if (nextName.length >= 2) target.name = nextName;
      if (nextAddr.length >= 4) target.defaultAddress = nextAddr;

      saveDatabase(db);
      res.json({
        customer: {
          id: target.id,
          name: target.name,
          phone: target.phone,
          defaultAddress: target.defaultAddress,
          createdAt: target.createdAt,
        },
      });
    }
  );

  app.patch(
    '/api/customer/password',
    requireCustomerAuth,
    (req: CustomerAuthenticatedRequest, res) => {
      const db = loadDatabase();
      const target = db.customers.find((c) => c.id === req.customer!.id);
      if (!target) {
        res.status(404).json({error: 'Akun pelanggan tidak ditemukan.'});
        return;
      }
      const currentPasscode = String(req.body?.currentPasscode || '');
      const newPasscode = String(req.body?.newPasscode || '');
      if (!verifyPasscode(currentPasscode, target.passcodeHash)) {
        res.status(403).json({error: 'Kata sandi saat ini tidak cocok.'});
        return;
      }
      if (newPasscode.length < 6) {
        res.status(400).json({error: 'Kata sandi baru minimal 6 karakter.'});
        return;
      }
      target.passcodeHash = hashPasscode(newPasscode);
      saveDatabase(db);
      res.json({updated: true});
    }
  );

  // --- PUBLIC STOREFRONT ROUTES ---
  app.get('/api/public/store', (_req, res) => {
    const db = loadDatabase();
    res.json({
      settings: db.settings,
      products: db.products.map(sanitizeProductForPublic),
    });
  });

  app.post('/api/public/orders', (req, res) => {
    const db = loadDatabase();
    const loggedInCustomer = extractCustomerFromHeader(req, db);

    const customerName = String(req.body?.customerName || loggedInCustomer?.name || '').trim();
    const phone = String(req.body?.phone || loggedInCustomer?.phone || '').trim();
    const deliveryMethod =
      req.body?.deliveryMethod === 'pickup' ? 'pickup' : 'cod';
    const addressNote = String(
      req.body?.addressNote || (deliveryMethod === 'cod' ? loggedInCustomer?.defaultAddress : '') || ''
    ).trim();
    const notes = String(req.body?.notes || '').trim();
    const requestedPayment = req.body?.paymentMethod;
    const paymentMethod: PaymentMethod =
      requestedPayment === 'QRIS'
        ? 'QRIS'
        : deliveryMethod === 'cod'
          ? 'COD'
          : 'TUNAI';

    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];

    if (customerName.length < 2 || phone.length < 6) {
      res.status(400).json({
        error: 'Nama pemesan dan nomor HP/WhatsApp wajib diisi dengan benar.',
      });
      return;
    }

    if (deliveryMethod === 'cod' && addressNote.length < 4) {
      res.status(400).json({
        error: 'Alamat atau patokan pengantaran wajib diisi untuk pesanan COD.',
      });
      return;
    }

    if (rawItems.length === 0) {
      res.status(400).json({error: 'Keranjang belanja masih kosong.'});
      return;
    }

    const verifiedItems: OrderItem[] = [];

    for (const raw of rawItems) {
      const productId = String(raw?.productId || '');
      const variantId = String(raw?.variantId || '');
      const qty = Math.floor(Number(raw?.quantity || 0));

      if (!productId || !variantId || qty <= 0 || qty > 100) {
        res.status(400).json({error: 'Jumlah atau item pesanan tidak valid.'});
        return;
      }

      const product = db.products.find((p) => p.id === productId);
      const variant = product?.variants.find((v) => v.id === variantId);
      if (!product || !variant) {
        res.status(404).json({error: 'Salah satu produk tidak ditemukan.'});
        return;
      }

      if (variant.stock < qty) {
        res.status(409).json({
          error: `Stok ${product.name} (${variant.label}) hanya tersisa ${variant.stock}.`,
        });
        return;
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
        id: `stk-${crypto.randomUUID().slice(0, 8)}`,
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
    const subtotal = verifiedItems.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0
    );
    const deliveryFee =
      deliveryMethod === 'cod' && subtotal < db.settings.freeDeliveryMin
        ? db.settings.deliveryFee
        : 0;
    const grandTotal = subtotal + deliveryFee;

    const customerCoords = parseGeoPoint(req.body?.customerCoords);
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
      id: `ord-${crypto.randomUUID().slice(0, 8)}`,
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
    saveDatabase(db);

    res.status(201).json({
      order: sanitizeOrderForPublic(newOrder),
    });
  });

  // Dynamic QRIS automatic settlement check/webhook simulation for public order
  app.post('/api/public/orders/:orderNumber/qris-pay', (req, res) => {
    const db = loadDatabase();
    const orderNumber = String(req.params.orderNumber || '').trim().toUpperCase();
    const loggedInCustomer = extractCustomerFromHeader(req, db);
    const phoneLast4 = String(req.body?.phoneLast4 || '')
      .replace(/\D/g, '')
      .slice(-4);

    const order = db.orders.find((o) => o.orderNumber.toUpperCase() === orderNumber);
    if (!order) {
      res.status(404).json({error: 'Pesanan tidak ditemukan.'});
      return;
    }

    const ownsByToken = loggedInCustomer && doesCustomerOwnOrder(loggedInCustomer, order);
    const ownsByPhone =
      phoneLast4.length === 4 && order.phone.replace(/\D/g, '').endsWith(phoneLast4);
    if (!ownsByToken && !ownsByPhone) {
      res.status(403).json({
        error: 'Verifikasi pelanggan tidak cocok. Masukkan 4 digit akhir nomor HP pemesan.',
      });
      return;
    }

    if (order.paymentMethod !== 'QRIS' || !order.qris) {
      res.status(400).json({error: 'Pesanan ini tidak menggunakan pembayaran QRIS.'});
      return;
    }

    if (order.qris.gatewayStatus === 'PAID' || order.paymentStatus === 'LUNAS') {
      res.json({order: sanitizeOrderForPublic(order)});
      return;
    }

    const now = new Date().toISOString();
    if (Date.now() > new Date(order.qris.expiresAt).getTime()) {
      order.qris.gatewayStatus = 'EXPIRED';
      saveDatabase(db);
      res.status(410).json({error: 'QRIS telah kedaluwarsa. Silakan buat pesanan baru atau bayar di tempat.'});
      return;
    }

    order.qris.gatewayStatus = 'PAID';
    order.qris.paidAt = now;
    order.paymentStatus = 'LUNAS';
    order.updatedAt = now;

    if (!db.ledger.some((l) => l.description.includes(`#${order.orderNumber}`))) {
      db.ledger.unshift({
        id: `ldg-${crypto.randomUUID().slice(0, 8)}`,
        type: 'MASUK',
        category: order.deliveryMethod === 'cod' ? 'Penjualan COD (QRIS)' : 'Penjualan QRIS',
        description: `Pembayaran QRIS #${order.orderNumber} (${order.customerName})`,
        amount: order.total,
        paymentMethod: 'QRIS',
        actorName: 'Payment Gateway QRIS',
        createdAt: now,
      });
    }

    appendWhatsappNotification(order, 'QRIS_LUNAS', 'Sistem QRIS Otomatis');
    recordAuditLog(
      db,
      {id: 'gateway-qris', displayName: 'Payment Gateway QRIS', role: 'SISTEM'},
      'QRIS_LUNAS',
      order.orderNumber,
      `Pembayaran QRIS otomatis Rp ${order.total.toLocaleString('id-ID')} a/n ${order.customerName}`
    );

    saveDatabase(db);
    res.json({order: sanitizeOrderForPublic(order)});
  });

  app.get('/api/public/orders/track', (req, res) => {
    const db = loadDatabase();
    const code = String(req.query?.code || '').trim().toUpperCase();
    const phoneSuffix = String(req.query?.phone || '')
      .replace(/\D/g, '')
      .slice(-4);
    const loggedInCustomer = extractCustomerFromHeader(req, db);

    if (!code) {
      res.status(400).json({error: 'Masukkan kode pesanan (contoh: DJ-1001).'});
      return;
    }

    const order = db.orders.find((o) => {
      if (o.orderNumber.toUpperCase() !== code) return false;
      if (loggedInCustomer && doesCustomerOwnOrder(loggedInCustomer, o)) return true;
      const orderDigits = o.phone.replace(/\D/g, '');
      return phoneSuffix.length >= 4 && orderDigits.endsWith(phoneSuffix);
    });

    if (!order) {
      res.status(404).json({
        error: 'Pesanan tidak ditemukan atau 4 digit terakhir nomor HP tidak cocok.',
      });
      return;
    }

    const complaints = db.complaints.filter((c) => c.orderId === order.id);

    res.json({
      storeCoords: db.settings.storeCoords || null,
      order: sanitizeOrderForPublic(order),
      complaints,
    });
  });

  // Public order cancellation (only while status is MENUNGGU)
  app.post('/api/public/orders/:orderNumber/cancel', (req, res) => {
    const db = loadDatabase();
    const orderNumber = String(req.params.orderNumber || '').trim().toUpperCase();
    const loggedInCustomer = extractCustomerFromHeader(req, db);
    const phoneLast4 = String(req.body?.phoneLast4 || '')
      .replace(/\D/g, '')
      .slice(-4);

    const order = db.orders.find((o) => o.orderNumber.toUpperCase() === orderNumber);
    if (!order) {
      res.status(404).json({error: 'Pesanan tidak ditemukan.'});
      return;
    }

    const ownsByToken = loggedInCustomer && doesCustomerOwnOrder(loggedInCustomer, order);
    const ownsByPhone =
      phoneLast4.length === 4 && order.phone.replace(/\D/g, '').endsWith(phoneLast4);
    if (!ownsByToken && !ownsByPhone) {
      res.status(403).json({
        error: 'Verifikasi pemilik pesanan gagal. Masukkan 4 digit akhir nomor HP pemesan.',
      });
      return;
    }

    if (order.status !== 'MENUNGGU') {
      res.status(409).json({
        error: 'Pesanan yang sudah disiapkan atau dalam pengantaran tidak dapat dibatalkan mandiri. Hubungi toko.',
      });
      return;
    }

    const now = new Date().toISOString();
    order.status = 'DIBATALKAN';
    order.updatedAt = now;
    if (req.body?.reason) {
      order.notes = [order.notes, `Batal pelanggan: ${String(req.body.reason).trim()}`]
        .filter(Boolean)
        .join(' · ');
    }

    for (const item of order.items) {
      const product = db.products.find((p) => p.id === item.productId);
      const variant = product?.variants.find((v) => v.id === item.variantId);
      if (product && variant) {
        variant.stock += item.quantity;
        syncProductAvailability(product);
        db.stockMovements.unshift({
          id: `stk-${crypto.randomUUID().slice(0, 8)}`,
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

    recordAuditLog(
      db,
      {
        id: loggedInCustomer?.id || 'customer-guest',
        displayName: order.customerName,
        role: 'PELANGGAN',
      },
      'BATAL_PESANAN',
      order.orderNumber,
      `Pelanggan membatalkan pesanan #${order.orderNumber}`
    );
    saveDatabase(db);
    res.json({order: sanitizeOrderForPublic(order)});
  });

  // Public complaint submission (verified by customer token or orderNumber + phoneLast4)
  app.post('/api/public/complaints', (req, res) => {
    const db = loadDatabase();
    const loggedInCustomer = extractCustomerFromHeader(req, db);

    const orderNumber = String(req.body?.orderNumber || '').trim().toUpperCase();
    const phoneLast4 = String(req.body?.phoneLast4 || '')
      .replace(/\D/g, '')
      .slice(-4);
    const category = req.body?.category as ComplaintCategory;
    const requestedResolution = req.body?.requestedResolution as ComplaintResolution;
    const description = String(req.body?.description || '').trim();
    const evidencePhoto = isValidUploadedPhoto(req.body?.evidencePhoto)
      ? req.body.evidencePhoto.trim()
      : undefined;

    if (
      !orderNumber ||
      !VALID_COMPLAINT_CATEGORIES.includes(category) ||
      !VALID_COMPLAINT_RESOLUTIONS.includes(requestedResolution) ||
      description.length < 8
    ) {
      res.status(400).json({
        error: 'Lengkapi kode pesanan, kategori kendala, solusi yang diinginkan, dan keterangan (min. 8 karakter).',
      });
      return;
    }

    const order = db.orders.find((o) => o.orderNumber.toUpperCase() === orderNumber);
    if (!order) {
      res.status(404).json({error: 'Pesanan tidak ditemukan.'});
      return;
    }

    const ownsByToken = loggedInCustomer && doesCustomerOwnOrder(loggedInCustomer, order);
    const ownsByPhone =
      phoneLast4.length === 4 && order.phone.replace(/\D/g, '').endsWith(phoneLast4);
    if (!ownsByToken && !ownsByPhone) {
      res.status(403).json({
        error: 'Verifikasi pemilik pesanan gagal. Pastikan 4 digit akhir nomor HP sesuai.',
      });
      return;
    }

    db.complaintSeq += 1;
    const now = new Date().toISOString();
    const complaint: ComplaintRecord = {
      id: `cmp-${crypto.randomUUID().slice(0, 8)}`,
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
    recordAuditLog(
      db,
      {
        id: loggedInCustomer?.id || 'customer-guest',
        displayName: order.customerName,
        role: 'PELANGGAN',
      },
      'AJUKAN_KOMPLAIN',
      complaint.complaintNumber,
      `Komplain untuk #${order.orderNumber}: ${category}`
    );
    saveDatabase(db);

    res.status(201).json({complaint});
  });

  // --- PROTECTED OPERATIONAL ROUTES ---
  app.get('/api/ops/bootstrap', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = loadDatabase();
    const role = req.user!.role;
    const isLeadership = role === 'PEMILIK' || role === 'DIREKTUR';

    const totalRevenue = db.ledger
      .filter((l) => l.type === 'MASUK')
      .reduce((sum, l) => sum + l.amount, 0);
    const totalExpense = db.ledger
      .filter((l) => l.type === 'KELUAR')
      .reduce((sum, l) => sum + l.amount, 0);

    // Gross profit estimate across completed orders
    const estimatedProfit = db.orders
      .filter((o) => o.status === 'SELESAI')
      .reduce((orderSum, ord) => {
        const orderGross = ord.items.reduce(
          (itemSum, i) => itemSum + (i.unitPrice - (i.costPrice || 0)) * i.quantity,
          0
        );
        return orderSum + orderGross - (ord.discountAmount || 0);
      }, 0);

    const pendingOrdersCount = db.orders.filter(
      (o) => o.status === 'MENUNGGU' || o.status === 'DISIAPKAN'
    ).length;
    const activeDeliveriesCount = db.orders.filter(
      (o) => o.deliveryMethod === 'cod' && o.status === 'DIANTAR'
    ).length;
    const lowStockCount = db.products.reduce(
      (count, p) => count + p.variants.filter((v) => v.stock <= v.minStock).length,
      0
    );
    const totalKasbonOutstanding = db.kasbon.reduce(
      (sum, k) => sum + Math.max(0, k.amountDue - k.totalPaid),
      0
    );
    const pendingSupplierDeliveriesCount = db.supplierDeliveries.filter(
      (d) => d.status === 'MENUNGGU_TERIMA'
    ).length;
    const pendingComplaintsCount = db.complaints.filter(
      (c) => c.status === 'BARU' || c.status === 'DIPROSES'
    ).length;
    const openShiftsCount = db.shifts.filter((s) => s.status === 'TERBUKA').length;

    const canSeeFinancialOverview = isLeadership || role === 'KEUANGAN';

    let scopedProducts: Product[] = [];
    if (isLeadership || role === 'GUDANG') {
      scopedProducts = db.products;
    } else if (role === 'KASIR' || role === 'PEMASOK') {
      scopedProducts = db.products.map(sanitizeProductForPublic);
    }

    let scopedOrders: Order[] = [];
    if (isLeadership) {
      scopedOrders = db.orders;
    } else if (role === 'KASIR') {
      scopedOrders = db.orders.map(sanitizeOrderItemsForRole);
    } else if (role === 'GUDANG') {
      scopedOrders = db.orders
        .filter((o) => o.source === 'ONLINE')
        .map(sanitizeOrderItemsForRole);
    } else if (role === 'KURIR') {
      scopedOrders = db.orders
        .filter((o) => o.deliveryMethod === 'cod')
        .map(sanitizeOrderItemsForRole);
    }

    let scopedSupplierDeliveries: SupplierDelivery[] = [];
    if (isLeadership || role === 'GUDANG' || role === 'KEUANGAN') {
      scopedSupplierDeliveries = db.supplierDeliveries;
    } else if (role === 'PEMASOK') {
      scopedSupplierDeliveries = db.supplierDeliveries
        .filter((d) => d.supplierId === req.user!.id)
        .map((d) => ({...d}));
    }

    let scopedComplaints: ComplaintRecord[] = [];
    if (isLeadership || role === 'KASIR' || role === 'GUDANG') {
      scopedComplaints = db.complaints;
    }

    let scopedShifts: CashierShift[] = [];
    if (isLeadership || role === 'KASIR' || role === 'KEUANGAN') {
      scopedShifts = db.shifts.slice(0, 30);
    }

    res.json({
      user: req.user,
      settings: db.settings,
      overview: {
        totalRevenue: canSeeFinancialOverview ? totalRevenue : 0,
        totalExpense: canSeeFinancialOverview ? totalExpense : 0,
        netCash: canSeeFinancialOverview ? totalRevenue - totalExpense : 0,
        estimatedProfit: isLeadership ? estimatedProfit : 0,
        pendingOrdersCount:
          isLeadership || role === 'KASIR' || role === 'GUDANG' ? pendingOrdersCount : 0,
        activeDeliveriesCount: isLeadership || role === 'KURIR' ? activeDeliveriesCount : 0,
        lowStockCount:
          isLeadership || role === 'GUDANG' || role === 'PEMASOK' ? lowStockCount : 0,
        totalKasbonOutstanding: canSeeFinancialOverview ? totalKasbonOutstanding : 0,
        totalOrders: isLeadership || role === 'KASIR' ? db.orders.length : 0,
        pendingSupplierDeliveriesCount:
          isLeadership || role === 'GUDANG' || role === 'PEMASOK'
            ? pendingSupplierDeliveriesCount
            : 0,
        pendingComplaintsCount:
          isLeadership || role === 'KASIR' || role === 'GUDANG' ? pendingComplaintsCount : 0,
        openShiftsCount: isLeadership || role === 'KASIR' ? openShiftsCount : 0,
      },
      products: scopedProducts,
      orders: scopedOrders,
      stockMovements: isLeadership || role === 'GUDANG' ? db.stockMovements.slice(0, 80) : [],
      ledger: canSeeFinancialOverview ? db.ledger.slice(0, 120) : [],
      kasbon: isLeadership || role === 'KEUANGAN' || role === 'KASIR' ? db.kasbon : [],
      supplierDeliveries: scopedSupplierDeliveries,
      complaints: scopedComplaints,
      shifts: scopedShifts,
      auditLogs: isLeadership ? db.auditLogs.slice(0, 80) : [],
      couriers:
        isLeadership || role === 'KASIR' || role === 'KURIR'
          ? db.staff
              .filter((s) => s.active && s.role === 'KURIR')
              .map((s) => ({
                id: s.id,
                username: s.username,
                displayName: s.displayName,
                role: s.role,
                active: s.active,
                createdAt: s.createdAt,
              }))
          : [],
      staff: isLeadership
        ? db.staff.map((s) => ({
            id: s.id,
            username: s.username,
            displayName: s.displayName,
            role: s.role,
            active: s.active,
            createdAt: s.createdAt,
          }))
        : [],
    });
  });

  // Pemilik & Direktur: Update Store Settings (Merchant QRIS reserved to PEMILIK)
  app.patch(
    '/api/ops/settings',
    requireAuth,
    requireRoles(['PEMILIK', 'DIREKTUR']),
    (req: AuthenticatedRequest, res) => {
      const db = loadDatabase();
      const isOwner = req.user!.role === 'PEMILIK';
      const hours = String(req.body?.hours || db.settings.hours).trim();
      const daysOpen = String(req.body?.daysOpen || db.settings.daysOpen).trim();
      const deliveryArea = String(
        req.body?.deliveryArea || db.settings.deliveryArea
      ).trim();
      const deliveryFee = Math.max(0, Number(req.body?.deliveryFee ?? db.settings.deliveryFee));
      const freeDeliveryMin = Math.max(
        0,
        Number(req.body?.freeDeliveryMin ?? db.settings.freeDeliveryMin)
      );
      const whatsappNumber = String(
        req.body?.whatsappNumber ?? db.settings.whatsappNumber ?? '6281279008899'
      ).trim();
      const parsedCoords = parseGeoPoint(req.body?.storeCoords);

      const qrisMerchantName = isOwner
        ? String(req.body?.qrisMerchantName ?? db.settings.qrisMerchantName ?? 'TOKO DIMAS JAYA').trim()
        : db.settings.qrisMerchantName;
      const qrisNmid = isOwner
        ? String(req.body?.qrisNmid ?? db.settings.qrisNmid ?? 'ID1020260000188').trim()
        : db.settings.qrisNmid;

      db.settings = {
        ...db.settings,
        hours,
        daysOpen,
        deliveryArea,
        deliveryFee: Number.isFinite(deliveryFee) ? deliveryFee : db.settings.deliveryFee,
        freeDeliveryMin: Number.isFinite(freeDeliveryMin)
          ? freeDeliveryMin
          : db.settings.freeDeliveryMin,
        whatsappNumber,
        qrisMerchantName,
        qrisNmid,
        storeCoords:
          req.body?.storeCoords === null
            ? null
            : parsedCoords ?? db.settings.storeCoords ?? null,
      };
      recordAuditLog(
        db,
        req.user!,
        'UBAH_PENGATURAN',
        'StoreSettings',
        `Perbarui jam buka / ongkir / koordinat / WA toko`
      );
      saveDatabase(db);
      res.json({settings: db.settings});
    }
  );

  // Pemilik & Direktur: Staff & Division Management (with strict hierarchical boundaries)
  app.post(
    '/api/ops/staff',
    requireAuth,
    requireRoles(['PEMILIK', 'DIREKTUR']),
    (req: AuthenticatedRequest, res) => {
      const displayName = String(req.body?.displayName || '').trim();
      const username = String(req.body?.username || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, '');
      const role = req.body?.role as DivisionRole;
      const passcode = String(req.body?.passcode || '');

      if (
        displayName.length < 2 ||
        username.length < 3 ||
        !VALID_ROLES.includes(role) ||
        passcode.length < 6
      ) {
        res.status(400).json({
          error:
            'Data staf tidak lengkap (nama, username min. 3 karakter, divisi valid, dan sandi min. 6 karakter).',
        });
        return;
      }

      if (req.user!.role === 'DIREKTUR' && !DIRECTOR_MANAGED_ROLES.includes(role)) {
        res.status(403).json({
          error:
            'Direktur hanya dapat membuat akun staf divisi di bawahnya (Kasir, Gudang, Pemasok, Kurir, Keuangan).',
        });
        return;
      }

      const db = loadDatabase();
      if (db.staff.some((s) => s.username.toLowerCase() === username)) {
        res.status(409).json({error: 'Username sudah dipakai oleh staf lain.'});
        return;
      }

      const newStaff: StoredStaff = {
        id: `stf-${crypto.randomUUID().slice(0, 8)}`,
        username,
        displayName,
        role,
        passcodeHash: hashPasscode(passcode),
        active: true,
        createdAt: new Date().toISOString(),
      };

      db.staff.push(newStaff);
      recordAuditLog(
        db,
        req.user!,
        'TAMBAH_STAF',
        newStaff.username,
        `Tambah akun ${newStaff.displayName} (${newStaff.role})`
      );
      saveDatabase(db);

      res.status(201).json({
        staff: {
          id: newStaff.id,
          username: newStaff.username,
          displayName: newStaff.displayName,
          role: newStaff.role,
          active: newStaff.active,
          createdAt: newStaff.createdAt,
        },
      });
    }
  );

  app.patch(
    '/api/ops/staff/:id',
    requireAuth,
    requireRoles(['PEMILIK', 'DIREKTUR']),
    (req: AuthenticatedRequest, res) => {
      const db = loadDatabase();
      const target = db.staff.find((s) => s.id === req.params.id);
      if (!target) {
        res.status(404).json({error: 'Akun staf tidak ditemukan.'});
        return;
      }

      if (req.user!.role === 'DIREKTUR' && !DIRECTOR_MANAGED_ROLES.includes(target.role)) {
        res.status(403).json({
          error: 'Direktur tidak memiliki izin mengubah akun Pemilik atau sesama Direktur.',
        });
        return;
      }

      if (typeof req.body?.active === 'boolean') {
        if (target.id === req.user!.id && !req.body.active) {
          res
            .status(400)
            .json({error: 'Tidak dapat menonaktifkan akun Anda yang sedang aktif.'});
          return;
        }
        target.active = req.body.active;
      }

      if (req.body?.role && VALID_ROLES.includes(req.body.role)) {
        if (
          req.user!.role === 'DIREKTUR' &&
          !DIRECTOR_MANAGED_ROLES.includes(req.body.role)
        ) {
          res.status(403).json({
            error: 'Direktur tidak dapat menaikkan jabatan menjadi Direktur atau Pemilik.',
          });
          return;
        }
        target.role = req.body.role;
      }

      if (typeof req.body?.displayName === 'string') {
        const nextName = req.body.displayName.trim();
        if (nextName.length < 2) {
          res.status(400).json({error: 'Nama staf minimal 2 karakter.'});
          return;
        }
        target.displayName = nextName;
      }

      if (typeof req.body?.username === 'string') {
        const nextUsername = req.body.username
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9._-]/g, '');
        if (nextUsername.length < 3) {
          res.status(400).json({error: 'Username staf minimal 3 karakter.'});
          return;
        }
        if (
          db.staff.some(
            (s) => s.id !== target.id && s.username.toLowerCase() === nextUsername
          )
        ) {
          res.status(409).json({error: 'Username sudah dipakai oleh staf lain.'});
          return;
        }
        target.username = nextUsername;
      }

      if (typeof req.body?.passcode === 'string' && req.body.passcode.length >= 6) {
        target.passcodeHash = hashPasscode(req.body.passcode);
      }

      recordAuditLog(
        db,
        req.user!,
        'UBAH_STAF',
        target.username,
        `Update akun ${target.displayName} (${target.role}, aktif=${target.active})`
      );
      saveDatabase(db);
      res.json({
        staff: {
          id: target.id,
          username: target.username,
          displayName: target.displayName,
          role: target.role,
          active: target.active,
          createdAt: target.createdAt,
        },
      });
    }
  );

  app.delete(
    '/api/ops/staff/:id',
    requireAuth,
    requireRoles(['PEMILIK', 'DIREKTUR']),
    (req: AuthenticatedRequest, res) => {
      const db = loadDatabase();
      const idx = db.staff.findIndex((s) => s.id === req.params.id);
      if (idx === -1) {
        res.status(404).json({error: 'Akun staf tidak ditemukan.'});
        return;
      }
      const target = db.staff[idx];
      if (target.id === req.user!.id) {
        res.status(400).json({error: 'Tidak dapat menghapus akun yang sedang aktif dipakai.'});
        return;
      }
      if (req.user!.role === 'DIREKTUR' && !DIRECTOR_MANAGED_ROLES.includes(target.role)) {
        res.status(403).json({
          error: 'Direktur tidak dapat menghapus akun Pemilik atau sesama Direktur.',
        });
        return;
      }
      if (
        target.role === 'PEMILIK' &&
        db.staff.filter((s) => s.role === 'PEMILIK' && s.active).length <= 1
      ) {
        res.status(400).json({error: 'Minimal satu akun Pemilik aktif harus tetap tersedia.'});
        return;
      }
      const [removed] = db.staff.splice(idx, 1);
      recordAuditLog(
        db,
        req.user!,
        'HAPUS_STAF',
        removed.username,
        `Hapus akun ${removed.displayName} (${removed.role})`
      );
      saveDatabase(db);
      res.json({deletedId: removed.id});
    }
  );

  // Kasir, Direktur & Pemilik: Point of Sale (with discount, dynamic QRIS & shift tracking)
  app.post(
    '/api/ops/pos',
    requireAuth,
    requireRoles(['PEMILIK', 'DIREKTUR', 'KASIR']),
    (req: AuthenticatedRequest, res) => {
      const customerName = String(req.body?.customerName || 'Pembeli Toko').trim();
      const phone = String(req.body?.phone || '-').trim();
      const paymentMethod = (
        ['TUNAI', 'QRIS', 'KASBON'].includes(req.body?.paymentMethod)
          ? req.body.paymentMethod
          : 'TUNAI'
      ) as PaymentMethod;
      const notes = String(req.body?.notes || '').trim();
      const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];

      if (rawItems.length === 0) {
        res.status(400).json({error: 'Belum ada barang di daftar kasir.'});
        return;
      }

      if (paymentMethod === 'KASBON' && customerName === 'Pembeli Toko') {
        res.status(400).json({
          error: 'Nama pelanggan wajib diisi jika menggunakan metode Bon / Kasbon.',
        });
        return;
      }

      const db = loadDatabase();
      const verifiedItems: OrderItem[] = [];

      for (const raw of rawItems) {
        const productId = String(raw?.productId || '');
        const variantId = String(raw?.variantId || '');
        const qty = Math.floor(Number(raw?.quantity || 0));
        if (!productId || !variantId || qty <= 0) {
          res.status(400).json({error: 'Item kasir tidak valid.'});
          return;
        }
        const product = db.products.find((p) => p.id === productId);
        const variant = product?.variants.find((v) => v.id === variantId);
        if (!product || !variant) {
          res.status(404).json({error: 'Produk tidak ditemukan.'});
          return;
        }
        if (variant.stock < qty) {
          res.status(409).json({
            error: `Stok ${product.name} (${variant.label}) tinggal ${variant.stock}.`,
          });
          return;
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

      const subtotal = verifiedItems.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0
      );
      const rawDiscount = Math.max(0, Math.round(Number(req.body?.discountAmount || 0)));
      const discountAmount = Math.min(subtotal, Number.isFinite(rawDiscount) ? rawDiscount : 0);
      const total = Math.max(0, subtotal - discountAmount);

      const now = new Date().toISOString();
      for (const item of verifiedItems) {
        const product = db.products.find((p) => p.id === item.productId)!;
        const variant = product.variants.find((v) => v.id === item.variantId)!;
        variant.stock -= item.quantity;
        syncProductAvailability(product);
        db.stockMovements.unshift({
          id: `stk-${crypto.randomUUID().slice(0, 8)}`,
          productId: product.id,
          productName: product.name,
          variantId: variant.id,
          variantLabel: variant.label,
          type: 'KELUAR',
          quantityDelta: -item.quantity,
          note: `Penjualan kasir (${customerName})`,
          actorName: req.user!.displayName,
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
        id: `ord-${crypto.randomUUID().slice(0, 8)}`,
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
        handledBy: req.user!.displayName,
        courierName: '',
        createdAt: now,
        updatedAt: now,
      };

      db.orders.unshift(posOrder);

      if (paymentMethod === 'KASBON') {
        db.kasbon.unshift({
          id: `ksb-${crypto.randomUUID().slice(0, 8)}`,
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
          id: `ldg-${crypto.randomUUID().slice(0, 8)}`,
          type: 'MASUK',
          category: 'Penjualan Toko',
          description: `Kasir #${orderNumber} (${customerName})`,
          amount: total,
          paymentMethod,
          actorName: req.user!.displayName,
          createdAt: now,
        });

        // Update currently open shift
        const activeShift =
          db.shifts.find((s) => s.status === 'TERBUKA' && s.cashierId === req.user!.id) ||
          db.shifts.find((s) => s.status === 'TERBUKA');
        if (activeShift) {
          if (paymentMethod === 'QRIS') {
            activeShift.qrisSalesTotal += total;
          } else {
            activeShift.expectedCash += total;
          }
        }
      }

      saveDatabase(db);
      res.status(201).json({order: posOrder});
    }
  );

  // Cashier Shift Open / Close
  app.post(
    '/api/ops/shifts/open',
    requireAuth,
    requireRoles(['PEMILIK', 'DIREKTUR', 'KASIR']),
    (req: AuthenticatedRequest, res) => {
      const openingCash = Math.max(0, Math.round(Number(req.body?.openingCash || 0)));
      const note = String(req.body?.note || '').trim();
      const db = loadDatabase();

      if (db.shifts.some((s) => s.status === 'TERBUKA')) {
        res.status(409).json({
          error: 'Masih ada shift kasir yang terbuka. Tutup shift sebelumnya terlebih dahulu.',
        });
        return;
      }

      const shift: CashierShift = {
        id: `shf-${crypto.randomUUID().slice(0, 8)}`,
        cashierId: req.user!.id,
        cashierName: req.user!.displayName,
        openedAt: new Date().toISOString(),
        openingCash,
        expectedCash: openingCash,
        qrisSalesTotal: 0,
        note: note || 'Buka laci kasir',
        status: 'TERBUKA',
      };

      db.shifts.unshift(shift);
      recordAuditLog(
        db,
        req.user!,
        'BUKA_SHIFT',
        shift.id,
        `Modal awal laci Rp ${openingCash.toLocaleString('id-ID')}`
      );
      saveDatabase(db);
      res.status(201).json({shift});
    }
  );

  app.post(
    '/api/ops/shifts/close',
    requireAuth,
    requireRoles(['PEMILIK', 'DIREKTUR', 'KASIR']),
    (req: AuthenticatedRequest, res) => {
      const db = loadDatabase();
      const shift = db.shifts.find((s) => s.status === 'TERBUKA');
      if (!shift) {
        res.status(404).json({error: 'Tidak ada shift kasir yang sedang terbuka.'});
        return;
      }
      const countedCash = Math.max(0, Math.round(Number(req.body?.countedCash ?? shift.expectedCash)));
      const note = String(req.body?.note || '').trim();

      shift.countedCash = countedCash;
      shift.discrepancy = countedCash - shift.expectedCash;
      shift.closedAt = new Date().toISOString();
      shift.status = 'DITUTUP';
      if (note) shift.note = `${shift.note} · Tutup: ${note}`;

      recordAuditLog(
        db,
        req.user!,
        'TUTUP_SHIFT',
        shift.id,
        `Fisik laci Rp ${countedCash.toLocaleString('id-ID')} (selisih ${shift.discrepancy})`
      );
      saveDatabase(db);
      res.json({shift});
    }
  );

  // Order status progression (strict per-role workflow guards + auto WA notification on DIANTAR)
  app.patch(
    '/api/ops/orders/:id/status',
    requireAuth,
    requireRoles(['PEMILIK', 'DIREKTUR', 'KASIR', 'GUDANG', 'KURIR']),
    (req: AuthenticatedRequest, res) => {
      const nextStatus = req.body?.status as OrderStatus;
      const validStatuses: OrderStatus[] = [
        'MENUNGGU',
        'DISIAPKAN',
        'DIANTAR',
        'SELESAI',
        'DIBATALKAN',
      ];
      if (!validStatuses.includes(nextStatus)) {
        res.status(400).json({error: 'Status pesanan tidak valid.'});
        return;
      }

      const db = loadDatabase();
      const order = db.orders.find((o) => o.id === req.params.id);
      if (!order) {
        res.status(404).json({error: 'Pesanan tidak ditemukan.'});
        return;
      }

      const role = req.user!.role;
      const prevStatus = order.status;
      if (prevStatus === nextStatus) {
        res.json({order});
        return;
      }

      if (role === 'GUDANG') {
        if (order.source !== 'ONLINE' || prevStatus !== 'MENUNGGU' || nextStatus !== 'DISIAPKAN') {
          res.status(403).json({
            error: 'Divisi Gudang hanya dapat menandai pesanan online menjadi Sedang Disiapkan.',
          });
          return;
        }
      } else if (role === 'KURIR') {
        if (
          order.deliveryMethod !== 'cod' ||
          !['DIANTAR', 'SELESAI'].includes(nextStatus) ||
          prevStatus === 'DIBATALKAN'
        ) {
          res.status(403).json({
            error: 'Divisi Kurir hanya dapat mengantar dan menyelesaikan pesanan COD.',
          });
          return;
        }
      } else if (role === 'KASIR') {
        if (
          nextStatus === 'DIANTAR' ||
          (nextStatus === 'SELESAI' && order.deliveryMethod === 'cod')
        ) {
          res.status(403).json({
            error: 'Pengantaran & penyelesaian pesanan COD dikelola oleh Divisi Kurir.',
          });
          return;
        }
      }

      const now = new Date().toISOString();
      order.status = nextStatus;
      order.updatedAt = now;
      if (!order.handledBy) {
        order.handledBy = req.user!.displayName;
      }
      if (nextStatus === 'DIANTAR' || (nextStatus === 'SELESAI' && order.deliveryMethod === 'cod')) {
        order.courierName =
          String(req.body?.courierName || '').trim() ||
          order.courierName ||
          req.user!.displayName;
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
              order.tracking?.locationNote ||
              'Kurir berangkat dari toko menuju lokasi pelanggan',
            progressPercent: Math.max(55, order.tracking?.progressPercent ?? 55),
            etaMinutes: order.tracking?.etaMinutes ?? 12,
            courierCoords: order.tracking?.courierCoords ?? db.settings.storeCoords ?? null,
            updatedAt: now,
          };
          appendWhatsappNotification(order, 'DIANTAR', req.user!.displayName);
        } else if (nextStatus === 'SELESAI') {
          const uploadedProofPhoto = isValidUploadedPhoto(req.body?.proofPhoto)
            ? req.body.proofPhoto.trim()
            : order.tracking?.proofPhoto;
          order.tracking = {
            checkpoint: 'SUDAH_TIBA',
            locationNote: 'Kurir sudah tiba & pesanan COD selesai diserahkan',
            progressPercent: 100,
            etaMinutes: 0,
            proofNote: String(req.body?.proofNote || order.tracking?.proofNote || '').trim() || undefined,
            proofPhoto: uploadedProofPhoto,
            courierCoords:
              order.customerCoords ??
              order.tracking?.courierCoords ??
              db.settings.storeCoords ??
              null,
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
            db.stockMovements.unshift({
              id: `stk-${crypto.randomUUID().slice(0, 8)}`,
              productId: product.id,
              productName: product.name,
              variantId: variant.id,
              variantLabel: variant.label,
              type: 'MASUK',
              quantityDelta: item.quantity,
              note: `Pembatalan pesanan #${order.orderNumber}`,
              actorName: req.user!.displayName,
              createdAt: now,
            });
          }
        }
      }

      if (nextStatus === 'SELESAI' && prevStatus !== 'SELESAI') {
        order.paymentStatus = 'LUNAS';
        if (order.qris && order.qris.gatewayStatus === 'PENDING') {
          order.qris.gatewayStatus = 'PAID';
          order.qris.paidAt = now;
        }
        const alreadyLogged = db.ledger.some((l) =>
          l.description.includes(`#${order.orderNumber}`)
        );
        if (!alreadyLogged) {
          db.ledger.unshift({
            id: `ldg-${crypto.randomUUID().slice(0, 8)}`,
            type: 'MASUK',
            category: order.deliveryMethod === 'cod' ? 'Penjualan COD' : 'Penjualan Toko',
            description: `Pesanan #${order.orderNumber} (${order.customerName})`,
            amount: order.total,
            paymentMethod: order.paymentMethod,
            actorName: req.user!.displayName,
            createdAt: now,
          });
        }
        const activeShift = db.shifts.find((s) => s.status === 'TERBUKA');
        if (activeShift && order.paymentMethod !== 'QRIS') {
          activeShift.expectedCash += order.total;
        }
      }

      saveDatabase(db);
      res.json({order});
    }
  );

  // Confirm Online QRIS payment from Ops Portal
  app.patch(
    '/api/ops/orders/:id/qris-confirm',
    requireAuth,
    requireRoles(['PEMILIK', 'DIREKTUR', 'KASIR', 'KEUANGAN']),
    (req: AuthenticatedRequest, res) => {
      const db = loadDatabase();
      const order = db.orders.find((o) => o.id === req.params.id);
      if (!order) {
        res.status(404).json({error: 'Pesanan tidak ditemukan.'});
        return;
      }
      if (order.paymentMethod !== 'QRIS') {
        res.status(400).json({error: 'Pesanan ini tidak memakai QRIS.'});
        return;
      }
      const now = new Date().toISOString();
      order.paymentStatus = 'LUNAS';
      if (order.qris) {
        order.qris.gatewayStatus = 'PAID';
        order.qris.paidAt = now;
      }
      order.updatedAt = now;

      if (!db.ledger.some((l) => l.description.includes(`#${order.orderNumber}`))) {
        db.ledger.unshift({
          id: `ldg-${crypto.randomUUID().slice(0, 8)}`,
          type: 'MASUK',
          category: 'Penjualan QRIS',
          description: `Verifikasi QRIS #${order.orderNumber} (${order.customerName})`,
          amount: order.total,
          paymentMethod: 'QRIS',
          actorName: req.user!.displayName,
          createdAt: now,
        });
      }

      appendWhatsappNotification(order, 'QRIS_LUNAS', req.user!.displayName);
      recordAuditLog(
        db,
        req.user!,
        'KONFIRMASI_QRIS',
        order.orderNumber,
        `Verifikasi QRIS Rp ${order.total.toLocaleString('id-ID')}`
      );
      saveDatabase(db);
      res.json({order});
    }
  );

  // Send / log WhatsApp dispatch notification
  app.post(
    '/api/ops/orders/:id/whatsapp',
    requireAuth,
    requireRoles(['PEMILIK', 'DIREKTUR', 'KURIR', 'KASIR']),
    (req: AuthenticatedRequest, res) => {
      const db = loadDatabase();
      const order = db.orders.find((o) => o.id === req.params.id);
      if (!order) {
        res.status(404).json({error: 'Pesanan tidak ditemukan.'});
        return;
      }
      const trigger = (
        ['DISIAPKAN', 'DIANTAR', 'SELESAI', 'QRIS_LUNAS'].includes(req.body?.trigger)
          ? req.body.trigger
          : 'DIANTAR'
      ) as WhatsappNotification['trigger'];

      const notification = appendWhatsappNotification(order, trigger, req.user!.displayName);
      order.updatedAt = new Date().toISOString();
      saveDatabase(db);
      res.status(201).json({notification, order});
    }
  );

  // Assign courier to COD order
  app.patch(
    '/api/ops/orders/:id/assign-courier',
    requireAuth,
    requireRoles(['PEMILIK', 'DIREKTUR', 'KASIR']),
    (req: AuthenticatedRequest, res) => {
      const db = loadDatabase();
      const order = db.orders.find((o) => o.id === req.params.id);
      if (!order) {
        res.status(404).json({error: 'Pesanan tidak ditemukan.'});
        return;
      }
      if (order.deliveryMethod !== 'cod') {
        res.status(400).json({error: 'Penugasan kurir hanya untuk pesanan COD.'});
        return;
      }
      const courierId = String(req.body?.courierId || '').trim();
      if (!courierId) {
        order.assignedCourierId = undefined;
        order.assignedCourierName = undefined;
      } else {
        const courier = db.staff.find(
          (s) => s.id === courierId && s.active && s.role === 'KURIR'
        );
        if (!courier) {
          res.status(404).json({error: 'Akun kurir aktif tidak ditemukan.'});
          return;
        }
        order.assignedCourierId = courier.id;
        order.assignedCourierName = courier.displayName;
        if (!order.courierName) {
          order.courierName = courier.displayName;
        }
      }
      order.updatedAt = new Date().toISOString();
      recordAuditLog(
        db,
        req.user!,
        'TUGAS_KURIR',
        order.orderNumber,
        order.assignedCourierName
          ? `Tugaskan kurir ${order.assignedCourierName}`
          : 'Kosongkan penugasan kurir'
      );
      saveDatabase(db);
      res.json({order});
    }
  );

  // Kurir, Direktur & Pemilik: Update Live Courier Tracking & Map Position
  app.patch(
    '/api/ops/orders/:id/tracking',
    requireAuth,
    requireRoles(['PEMILIK', 'DIREKTUR', 'KURIR']),
    (req: AuthenticatedRequest, res) => {
      const db = loadDatabase();
      const order = db.orders.find((o) => o.id === req.params.id);
      if (!order) {
        res.status(404).json({error: 'Pesanan tidak ditemukan.'});
        return;
      }
      if (order.deliveryMethod !== 'cod') {
        res.status(400).json({error: 'Pelacakan kurir hanya berlaku untuk pesanan COD.'});
        return;
      }

      const validCheckpoints: DeliveryCheckpoint[] = [
        'PERSIAPAN_TOKO',
        'MENUJU_LOKASI',
        'DEKAT_TUJUAN',
        'SUDAH_TIBA',
      ];
      const checkpoint = validCheckpoints.includes(req.body?.checkpoint)
        ? (req.body.checkpoint as DeliveryCheckpoint)
        : order.tracking?.checkpoint || 'MENUJU_LOKASI';

      const defaultProgress: Record<DeliveryCheckpoint, number> = {
        PERSIAPAN_TOKO: 20,
        MENUJU_LOKASI: 55,
        DEKAT_TUJUAN: 85,
        SUDAH_TIBA: 100,
      };
      const defaultNotes: Record<DeliveryCheckpoint, string> = {
        PERSIAPAN_TOKO: 'Pesanan sedang disiapkan di Toko Dimas Jaya',
        MENUJU_LOKASI: 'Kurir sedang dalam perjalanan menuju alamat tujuan',
        DEKAT_TUJUAN: 'Kurir sudah dekat lokasi rumah pemesan',
        SUDAH_TIBA: 'Kurir sudah tiba di lokasi tujuan',
      };

      const rawProgress = Number(req.body?.progressPercent);
      const progressPercent = Number.isFinite(rawProgress)
        ? Math.min(100, Math.max(0, Math.round(rawProgress)))
        : defaultProgress[checkpoint];

      const locationNote =
        String(req.body?.locationNote || '').trim() || defaultNotes[checkpoint];

      const rawEta = Number(req.body?.etaMinutes);
      const etaMinutes =
        Number.isFinite(rawEta) && rawEta >= 0
          ? Math.round(rawEta)
          : checkpoint === 'SUDAH_TIBA'
            ? 0
            : order.tracking?.etaMinutes;

      const parsedCourierCoords =
        req.body?.courierCoords === null
          ? null
          : parseGeoPoint(req.body?.courierCoords) ??
            order.tracking?.courierCoords ??
            null;

      const uploadedProofPhoto = isValidUploadedPhoto(req.body?.proofPhoto)
        ? req.body.proofPhoto.trim()
        : order.tracking?.proofPhoto;

      const now = new Date().toISOString();
      order.courierName = order.courierName || req.user!.displayName;
      order.updatedAt = now;

      let transitionedToDelivery = false;
      if (
        (checkpoint === 'MENUJU_LOKASI' ||
          checkpoint === 'DEKAT_TUJUAN' ||
          checkpoint === 'SUDAH_TIBA') &&
        (order.status === 'MENUNGGU' || order.status === 'DISIAPKAN')
      ) {
        order.status = 'DIANTAR';
        transitionedToDelivery = true;
      }

      order.tracking = {
        checkpoint,
        locationNote,
        progressPercent,
        etaMinutes,
        proofNote:
          String(req.body?.proofNote || order.tracking?.proofNote || '').trim() || undefined,
        proofPhoto: uploadedProofPhoto,
        courierCoords: parsedCourierCoords,
        updatedAt: now,
      };

      if (transitionedToDelivery) {
        appendWhatsappNotification(order, 'DIANTAR', req.user!.displayName);
      }

      saveDatabase(db);
      res.json({order});
    }
  );

  // Gudang, Direktur & Pemilik: Create Product
  app.post(
    '/api/ops/products',
    requireAuth,
    requireRoles(['PEMILIK', 'DIREKTUR', 'GUDANG']),
    (req: AuthenticatedRequest, res) => {
      const name = String(req.body?.name || '').trim();
      const category = req.body?.category;
      const description = String(req.body?.description || '').trim();
      const variantLabel = String(req.body?.variantLabel || 'Satuan').trim();
      const price = Math.max(500, Math.round(Number(req.body?.price || 0)));
      const costPrice = Math.max(0, Math.round(Number(req.body?.costPrice || 0)));
      const stock = Math.max(0, Math.floor(Number(req.body?.stock || 0)));
      const minStock = Math.max(1, Math.floor(Number(req.body?.minStock || 5)));
      const expiryDate = String(req.body?.expiryDate || '').trim() || undefined;
      const sku = String(req.body?.sku || '').trim() || undefined;
      const uploadedImage = isValidUploadedPhoto(req.body?.image)
        ? req.body.image.trim()
        : undefined;

      if (
        name.length < 2 ||
        !VALID_CATEGORIES.includes(category) ||
        !Number.isFinite(price)
      ) {
        res.status(400).json({error: 'Nama produk, kategori, dan harga wajib valid.'});
        return;
      }

      const imageByCategory: Record<string, string> = {
        Sembako: '/src/assets/images/produk_beras_minyak_telur_1795680105474.jpg',
        'Kopi & Gula': '/src/assets/images/produk_kopi_lampung_gula_1795680105852.jpg',
        'Dapur & Bumbu': '/src/assets/images/produk_bumbu_dapur_mie_1795680106723.jpg',
        Kebersihan: '/src/assets/images/produk_sabun_deterjen_rumah_1795680106836.jpg',
        'Galon & Minuman': '/src/assets/images/produk_galon_gas_minuman_1795680107564.jpg',
      };

      const db = loadDatabase();
      const idSlug = `${name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 24)}-${crypto.randomUUID().slice(0, 4)}`;
      const variantId = `var-${crypto.randomUUID().slice(0, 6)}`;
      const now = new Date().toISOString();

      const newProduct: Product = {
        id: idSlug,
        name,
        category,
        unitSummary: variantLabel,
        availability: stock > 0 ? 'Stok Tersedia' : 'Stok Habis',
        description:
          description || `${name} tersedia segar setiap hari di Toko Dimas Jaya.`,
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
            minStock,
            expiryDate,
          },
        ],
      };

      syncProductAvailability(newProduct);
      db.products.unshift(newProduct);

      if (stock > 0) {
        db.stockMovements.unshift({
          id: `stk-${crypto.randomUUID().slice(0, 8)}`,
          productId: newProduct.id,
          productName: newProduct.name,
          variantId,
          variantLabel,
          type: 'MASUK',
          quantityDelta: stock,
          note: 'Tambah produk baru ke katalog',
          actorName: req.user!.displayName,
          createdAt: now,
        });
      }

      recordAuditLog(db, req.user!, 'TAMBAH_PRODUK', newProduct.name, `${variantLabel} Rp ${price}`);
      saveDatabase(db);
      res.status(201).json({product: newProduct});
    }
  );

  // Edit product details
  app.patch(
    '/api/ops/products/:id',
    requireAuth,
    requireRoles(['PEMILIK', 'DIREKTUR', 'GUDANG']),
    (req: AuthenticatedRequest, res) => {
      const db = loadDatabase();
      const product = db.products.find((p) => p.id === req.params.id);
      if (!product) {
        res.status(404).json({error: 'Produk tidak ditemukan.'});
        return;
      }
      const nextName = String(req.body?.name || '').trim();
      if (nextName.length >= 2) {
        product.name = nextName;
        product.imageAlt = nextName;
      }
      if (req.body?.category && VALID_CATEGORIES.includes(req.body.category)) {
        product.category = req.body.category;
      }
      if (typeof req.body?.description === 'string' && req.body.description.trim()) {
        product.description = req.body.description.trim();
      }
      if (isValidUploadedPhoto(req.body?.image)) {
        product.image = req.body.image.trim();
      }
      syncProductAvailability(product);
      recordAuditLog(db, req.user!, 'EDIT_PRODUK', product.name, `Update info produk`);
      saveDatabase(db);
      res.json({product});
    }
  );

  // Add new variant to existing product
  app.post(
    '/api/ops/products/:id/variants',
    requireAuth,
    requireRoles(['PEMILIK', 'DIREKTUR', 'GUDANG']),
    (req: AuthenticatedRequest, res) => {
      const db = loadDatabase();
      const product = db.products.find((p) => p.id === req.params.id);
      if (!product) {
        res.status(404).json({error: 'Produk tidak ditemukan.'});
        return;
      }
      const label = String(req.body?.label || '').trim();
      const sku = String(req.body?.sku || '').trim() || undefined;
      const price = Math.max(500, Math.round(Number(req.body?.price || 0)));
      const costPrice = Math.max(0, Math.round(Number(req.body?.costPrice || 0)));
      const stock = Math.max(0, Math.floor(Number(req.body?.stock || 0)));
      const minStock = Math.max(1, Math.floor(Number(req.body?.minStock || 5)));
      const expiryDate = String(req.body?.expiryDate || '').trim() || undefined;

      if (label.length < 1 || !Number.isFinite(price)) {
        res.status(400).json({error: 'Nama kemasan dan harga jual wajib valid.'});
        return;
      }

      const variantId = `var-${crypto.randomUUID().slice(0, 6)}`;
      product.variants.push({
        id: variantId,
        label,
        sku,
        price,
        costPrice: costPrice || Math.round(price * 0.85),
        stock,
        minStock,
        expiryDate,
      });
      product.unitSummary = product.variants.map((v) => v.label).join(' · ');
      syncProductAvailability(product);
      recordAuditLog(db, req.user!, 'TAMBAH_VARIAN', product.name, `${label} Rp ${price}`);
      saveDatabase(db);
      res.status(201).json({product});
    }
  );

  // Update Product Variant Price, Cost, MinStock, Expiry, SKU
  app.patch(
    '/api/ops/products/:id/variant/:variantId',
    requireAuth,
    requireRoles(['PEMILIK', 'DIREKTUR', 'GUDANG']),
    (req: AuthenticatedRequest, res) => {
      const db = loadDatabase();
      const product = db.products.find((p) => p.id === req.params.id);
      const variant = product?.variants.find((v) => v.id === req.params.variantId);
      if (!product || !variant) {
        res.status(404).json({error: 'Produk atau varian tidak ditemukan.'});
        return;
      }

      if (req.body?.label && String(req.body.label).trim()) {
        variant.label = String(req.body.label).trim();
        product.unitSummary = product.variants.map((v) => v.label).join(' · ');
      }
      if (req.body?.sku !== undefined) {
        variant.sku = String(req.body.sku || '').trim() || undefined;
      }
      if (req.body?.price !== undefined) {
        const nextPrice = Math.round(Number(req.body.price));
        if (Number.isFinite(nextPrice) && nextPrice >= 500) {
          variant.price = nextPrice;
        }
      }
      if (req.body?.costPrice !== undefined) {
        const nextCost = Math.round(Number(req.body.costPrice));
        if (Number.isFinite(nextCost) && nextCost >= 0) {
          variant.costPrice = nextCost;
        }
      }
      if (req.body?.minStock !== undefined) {
        const nextMin = Math.floor(Number(req.body.minStock));
        if (Number.isFinite(nextMin) && nextMin >= 0) {
          variant.minStock = nextMin;
        }
      }
      if (req.body?.expiryDate !== undefined) {
        variant.expiryDate = String(req.body.expiryDate || '').trim() || undefined;
      }

      syncProductAvailability(product);
      saveDatabase(db);
      res.json({product});
    }
  );

  // Delete specific variant (requires > 1 variant remaining)
  app.delete(
    '/api/ops/products/:id/variant/:variantId',
    requireAuth,
    requireRoles(['PEMILIK', 'DIREKTUR', 'GUDANG']),
    (req: AuthenticatedRequest, res) => {
      const db = loadDatabase();
      const product = db.products.find((p) => p.id === req.params.id);
      if (!product) {
        res.status(404).json({error: 'Produk tidak ditemukan.'});
        return;
      }
      if (product.variants.length <= 1) {
        res.status(400).json({error: 'Minimal harus tersisa 1 varian kemasan. Hapus produk jika ingin menghapus seluruhnya.'});
        return;
      }
      const idx = product.variants.findIndex((v) => v.id === req.params.variantId);
      if (idx === -1) {
        res.status(404).json({error: 'Varian kemasan tidak ditemukan.'});
        return;
      }
      const [removedVar] = product.variants.splice(idx, 1);
      product.unitSummary = product.variants.map((v) => v.label).join(' · ');
      syncProductAvailability(product);
      recordAuditLog(db, req.user!, 'HAPUS_VARIAN', product.name, `Hapus varian ${removedVar.label}`);
      saveDatabase(db);
      res.json({product});
    }
  );

  // Delete product
  app.delete(
    '/api/ops/products/:id',
    requireAuth,
    requireRoles(['PEMILIK', 'DIREKTUR', 'GUDANG']),
    (req: AuthenticatedRequest, res) => {
      const db = loadDatabase();
      const idx = db.products.findIndex((p) => p.id === req.params.id);
      if (idx === -1) {
        res.status(404).json({error: 'Produk tidak ditemukan.'});
        return;
      }
      const [removed] = db.products.splice(idx, 1);
      recordAuditLog(db, req.user!, 'HAPUS_PRODUK', removed.name, `Hapus dari katalog toko`);
      saveDatabase(db);
      res.json({deletedId: removed.id});
    }
  );

  // Gudang, Direktur & Pemilik: Stock Movement (Masuk / Opname / Rusak)
  app.post(
    '/api/ops/stock',
    requireAuth,
    requireRoles(['PEMILIK', 'DIREKTUR', 'GUDANG']),
    (req: AuthenticatedRequest, res) => {
      const productId = String(req.body?.productId || '');
      const variantId = String(req.body?.variantId || '');
      const rawType = req.body?.type;
      const type: 'MASUK' | 'OPNAME' | 'RUSAK' =
        rawType === 'OPNAME' ? 'OPNAME' : rawType === 'RUSAK' ? 'RUSAK' : 'MASUK';
      const quantity = Math.floor(Number(req.body?.quantity || 0));
      const note = String(req.body?.note || '').trim();
      const recordExpense = Boolean(req.body?.recordExpense);

      const db = loadDatabase();
      const product = db.products.find((p) => p.id === productId);
      const variant = product?.variants.find((v) => v.id === variantId);

      if (!product || !variant || !Number.isFinite(quantity)) {
        res.status(400).json({error: 'Data stok tidak valid.'});
        return;
      }

      const now = new Date().toISOString();
      let delta = 0;

      if (type === 'MASUK') {
        if (quantity <= 0) {
          res.status(400).json({error: 'Jumlah stok masuk harus lebih dari 0.'});
          return;
        }
        variant.stock += quantity;
        delta = quantity;
      } else if (type === 'RUSAK') {
        if (quantity <= 0 || quantity > variant.stock) {
          res.status(400).json({
            error: `Jumlah barang rusak/kedaluwarsa harus antara 1 dan ${variant.stock}.`,
          });
          return;
        }
        variant.stock -= quantity;
        delta = -quantity;
      } else {
        if (quantity < 0) {
          res.status(400).json({error: 'Hasil opname stok tidak boleh negatif.'});
          return;
        }
        delta = quantity - variant.stock;
        variant.stock = quantity;
      }

      syncProductAvailability(product);

      const defaultNote =
        type === 'MASUK'
          ? 'Kulakan stok masuk'
          : type === 'RUSAK'
            ? 'Barang rusak / kedaluwarsa / susut'
            : 'Penyesuaian stok opname';

      const movement = {
        id: `stk-${crypto.randomUUID().slice(0, 8)}`,
        productId: product.id,
        productName: product.name,
        variantId: variant.id,
        variantLabel: variant.label,
        type,
        quantityDelta: delta,
        note: note || defaultNote,
        actorName: req.user!.displayName,
        createdAt: now,
      } as const;

      db.stockMovements.unshift({...movement});

      if (type === 'MASUK' && recordExpense && variant.costPrice) {
        db.ledger.unshift({
          id: `ldg-${crypto.randomUUID().slice(0, 8)}`,
          type: 'KELUAR',
          category: 'Kulakan Barang',
          description: `Stok masuk ${product.name} (${variant.label}) x${quantity}`,
          amount: variant.costPrice * quantity,
          paymentMethod: 'TUNAI',
          actorName: req.user!.displayName,
          createdAt: now,
        });
      }

      saveDatabase(db);
      res.status(201).json({product, movement});
    }
  );

  // Pemasok, Direktur & Pemilik: Submit incoming supplier restock delivery (single or multi-item batch)
  app.post(
    '/api/ops/supplier/deliveries',
    requireAuth,
    requireRoles(['PEMILIK', 'DIREKTUR', 'PEMASOK']),
    (req: AuthenticatedRequest, res) => {
      const rawItems = Array.isArray(req.body?.items) && req.body.items.length > 0
        ? req.body.items
        : [
            {
              productId: req.body?.productId,
              variantId: req.body?.variantId,
              quantity: req.body?.quantity,
              unitCost: req.body?.unitCost,
            },
          ];

      const note = String(req.body?.note || '').trim();
      const paymentStatus = req.body?.paymentStatus === 'TEMPO' ? 'TEMPO' : 'TUNAI';
      const dueDate = String(req.body?.dueDate || '').trim() || undefined;
      const invoicePhoto = isValidUploadedPhoto(req.body?.invoicePhoto)
        ? req.body.invoicePhoto.trim()
        : undefined;
      const batchCode =
        String(req.body?.batchCode || '').trim() ||
        (rawItems.length > 1 ? `SJ-${crypto.randomUUID().slice(0, 4).toUpperCase()}` : undefined);

      const db = loadDatabase();
      const preparedDeliveries: SupplierDelivery[] = [];
      const now = new Date().toISOString();

      for (const rawItem of rawItems) {
        const productId = String(rawItem?.productId || '');
        const variantId = String(rawItem?.variantId || '');
        const quantity = Math.floor(Number(rawItem?.quantity || 0));
        const unitCost = Math.max(0, Math.round(Number(rawItem?.unitCost || 0)));

        if (!productId || !variantId || !Number.isFinite(quantity) || quantity <= 0) {
          res.status(400).json({error: 'Pilih produk, varian, dan jumlah suplai lebih dari 0.'});
          return;
        }
        const product = db.products.find((p) => p.id === productId);
        const variant = product?.variants.find((v) => v.id === variantId);
        if (!product || !variant) {
          res.status(404).json({error: 'Produk atau varian barang tidak ditemukan.'});
          return;
        }

        preparedDeliveries.push({
          id: `sup-${crypto.randomUUID().slice(0, 8)}`,
          batchCode,
          supplierId: req.user!.id,
          supplierName: req.user!.displayName,
          productId: product.id,
          productName: product.name,
          variantId: variant.id,
          variantLabel: variant.label,
          quantity,
          unitCost: unitCost || variant.costPrice || Math.round(variant.price * 0.85),
          note: note || 'Pengiriman suplai barang ke gudang Toko Dimas Jaya',
          invoicePhoto,
          status: 'MENUNGGU_TERIMA',
          paymentStatus,
          dueDate,
          createdAt: now,
        });
      }

      for (let i = preparedDeliveries.length - 1; i >= 0; i -= 1) {
        db.supplierDeliveries.unshift(preparedDeliveries[i]);
      }
      saveDatabase(db);
      res.status(201).json({
        delivery: preparedDeliveries[0],
        deliveries: preparedDeliveries,
      });
    }
  );

  // Edit pending supplier delivery
  app.patch(
    '/api/ops/supplier/deliveries/:id',
    requireAuth,
    requireRoles(['PEMILIK', 'DIREKTUR', 'PEMASOK']),
    (req: AuthenticatedRequest, res) => {
      const db = loadDatabase();
      const delivery = db.supplierDeliveries.find((d) => d.id === req.params.id);
      if (!delivery) {
        res.status(404).json({error: 'Catatan kiriman pemasok tidak ditemukan.'});
        return;
      }
      const isLeadership = req.user!.role === 'PEMILIK' || req.user!.role === 'DIREKTUR';
      if (!isLeadership && delivery.supplierId !== req.user!.id) {
        res.status(403).json({error: 'Anda hanya dapat mengubah kiriman milik Anda sendiri.'});
        return;
      }
      if (delivery.status !== 'MENUNGGU_TERIMA') {
        res.status(409).json({error: 'Kiriman yang sudah diterima gudang tidak dapat diubah lagi.'});
        return;
      }

      if (req.body?.quantity !== undefined) {
        const qty = Math.floor(Number(req.body.quantity));
        if (!Number.isFinite(qty) || qty <= 0) {
          res.status(400).json({error: 'Jumlah kiriman harus lebih dari 0.'});
          return;
        }
        delivery.quantity = qty;
      }
      if (req.body?.unitCost !== undefined) {
        const cost = Math.round(Number(req.body.unitCost));
        if (Number.isFinite(cost) && cost >= 0) {
          delivery.unitCost = cost;
        }
      }
      if (typeof req.body?.note === 'string') {
        delivery.note = req.body.note.trim() || delivery.note;
      }
      if (req.body?.paymentStatus === 'TEMPO' || req.body?.paymentStatus === 'TUNAI') {
        delivery.paymentStatus = req.body.paymentStatus;
      }
      if (req.body?.dueDate !== undefined) {
        delivery.dueDate = String(req.body.dueDate || '').trim() || undefined;
      }
      if (isValidUploadedPhoto(req.body?.invoicePhoto)) {
        delivery.invoicePhoto = req.body.invoicePhoto.trim();
      }

      saveDatabase(db);
      res.json({delivery});
    }
  );

  // Cancel/delete pending supplier delivery
  app.delete(
    '/api/ops/supplier/deliveries/:id',
    requireAuth,
    requireRoles(['PEMILIK', 'DIREKTUR', 'PEMASOK']),
    (req: AuthenticatedRequest, res) => {
      const db = loadDatabase();
      const idx = db.supplierDeliveries.findIndex((d) => d.id === req.params.id);
      if (idx === -1) {
        res.status(404).json({error: 'Catatan kiriman pemasok tidak ditemukan.'});
        return;
      }
      const delivery = db.supplierDeliveries[idx];
      const isLeadership = req.user!.role === 'PEMILIK' || req.user!.role === 'DIREKTUR';
      if (!isLeadership && delivery.supplierId !== req.user!.id) {
        res.status(403).json({error: 'Anda hanya dapat membatalkan kiriman milik Anda sendiri.'});
        return;
      }
      if (delivery.status !== 'MENUNGGU_TERIMA') {
        res.status(409).json({error: 'Kiriman yang sudah diterima gudang tidak dapat dibatalkan.'});
        return;
      }
      db.supplierDeliveries.splice(idx, 1);
      saveDatabase(db);
      res.json({deletedId: delivery.id});
    }
  );

  // Gudang, Direktur & Pemilik: Verify & receive supplier delivery into stock
  app.patch(
    '/api/ops/supplier/deliveries/:id/receive',
    requireAuth,
    requireRoles(['PEMILIK', 'DIREKTUR', 'GUDANG']),
    (req: AuthenticatedRequest, res) => {
      const db = loadDatabase();
      const delivery = db.supplierDeliveries.find((d) => d.id === req.params.id);
      if (!delivery) {
        res.status(404).json({error: 'Catatan kiriman pemasok tidak ditemukan.'});
        return;
      }
      if (delivery.status === 'DITERIMA') {
        res.json({delivery});
        return;
      }

      const product = db.products.find((p) => p.id === delivery.productId);
      const variant = product?.variants.find((v) => v.id === delivery.variantId);
      if (!product || !variant) {
        res.status(404).json({error: 'Produk tujuan di gudang tidak ditemukan.'});
        return;
      }

      const now = new Date().toISOString();
      delivery.status = 'DITERIMA';
      delivery.receivedBy = req.user!.displayName;
      delivery.receivedAt = now;

      variant.stock += delivery.quantity;
      syncProductAvailability(product);

      db.stockMovements.unshift({
        id: `stk-${crypto.randomUUID().slice(0, 8)}`,
        productId: product.id,
        productName: product.name,
        variantId: variant.id,
        variantLabel: variant.label,
        type: 'MASUK',
        quantityDelta: delivery.quantity,
        note: `Terima kiriman pemasok ${delivery.supplierName} (${delivery.note})`,
        actorName: req.user!.displayName,
        createdAt: now,
      });

      if (delivery.paymentStatus !== 'TEMPO' && req.body?.recordExpense && delivery.unitCost > 0) {
        delivery.paymentStatus = 'LUNAS';
        db.ledger.unshift({
          id: `ldg-${crypto.randomUUID().slice(0, 8)}`,
          type: 'KELUAR',
          category: 'Kulakan Pemasok',
          description: `Suplai ${delivery.supplierName}: ${product.name} (${variant.label}) x${delivery.quantity}`,
          amount: delivery.unitCost * delivery.quantity,
          paymentMethod: 'TUNAI',
          actorName: req.user!.displayName,
          createdAt: now,
        });
      }

      saveDatabase(db);
      res.json({delivery, product});
    }
  );

  // Keuangan, Direktur & Pemilik: Settle TEMPO supplier payable
  app.patch(
    '/api/ops/supplier/deliveries/:id/pay',
    requireAuth,
    requireRoles(['PEMILIK', 'DIREKTUR', 'KEUANGAN']),
    (req: AuthenticatedRequest, res) => {
      const db = loadDatabase();
      const delivery = db.supplierDeliveries.find((d) => d.id === req.params.id);
      if (!delivery) {
        res.status(404).json({error: 'Tagihan suplai pemasok tidak ditemukan.'});
        return;
      }
      if (delivery.paymentStatus === 'LUNAS') {
        res.json({delivery});
        return;
      }
      const totalBill = delivery.unitCost * delivery.quantity;
      const now = new Date().toISOString();
      delivery.paymentStatus = 'LUNAS';

      if (totalBill > 0) {
        db.ledger.unshift({
          id: `ldg-${crypto.randomUUID().slice(0, 8)}`,
          type: 'KELUAR',
          category: 'Bayar Hutang Pemasok',
          description: `Pelunasan suplai ${delivery.supplierName}: ${delivery.productName} x${delivery.quantity}`,
          amount: totalBill,
          paymentMethod: String(req.body?.paymentMethod || 'TRANSFER'),
          actorName: req.user!.displayName,
          createdAt: now,
        });
      }

      recordAuditLog(
        db,
        req.user!,
        'BAYAR_PEMASOK',
        delivery.supplierName,
        `Pelunasan suplai ${delivery.productName} Rp ${totalBill.toLocaleString('id-ID')}`
      );
      saveDatabase(db);
      res.json({delivery});
    }
  );

  // Keuangan, Direktur & Pemilik: Ledger Entry
  app.post(
    '/api/ops/ledger',
    requireAuth,
    requireRoles(['PEMILIK', 'DIREKTUR', 'KEUANGAN']),
    (req: AuthenticatedRequest, res) => {
      const type = req.body?.type === 'MASUK' ? 'MASUK' : 'KELUAR';
      const category = String(req.body?.category || 'Operasional Toko').trim();
      const description = String(req.body?.description || '').trim();
      const amount = Math.round(Number(req.body?.amount || 0));
      const paymentMethod = String(req.body?.paymentMethod || 'TUNAI').trim();

      if (description.length < 3 || !Number.isFinite(amount) || amount <= 0) {
        res.status(400).json({error: 'Keterangan dan nominal kas wajib diisi dengan benar.'});
        return;
      }

      const db = loadDatabase();
      const entry = {
        id: `ldg-${crypto.randomUUID().slice(0, 8)}`,
        type,
        category,
        description,
        amount,
        paymentMethod,
        actorName: req.user!.displayName,
        createdAt: new Date().toISOString(),
      } as const;

      db.ledger.unshift({...entry});
      saveDatabase(db);
      res.status(201).json({entry});
    }
  );

  // Keuangan, Kasir, Direktur & Pemilik: Create manual Kasbon record
  app.post(
    '/api/ops/kasbon',
    requireAuth,
    requireRoles(['PEMILIK', 'DIREKTUR', 'KEUANGAN', 'KASIR']),
    (req: AuthenticatedRequest, res) => {
      const customerName = String(req.body?.customerName || '').trim();
      const phone = String(req.body?.phone || '').trim();
      const address = String(req.body?.address || '').trim() || 'Warga Gunung Batin Udik';
      const amountDue = Math.round(Number(req.body?.amountDue || 0));
      const dueDate = String(req.body?.dueDate || '').trim() || undefined;
      const note = String(req.body?.note || '').trim() || 'Catatan bon / kasbon manual';

      if (customerName.length < 2 || !Number.isFinite(amountDue) || amountDue <= 0) {
        res.status(400).json({error: 'Nama warga/warung dan nominal tagihan wajib valid.'});
        return;
      }

      const db = loadDatabase();
      const now = new Date().toISOString();
      const record = {
        id: `ksb-${crypto.randomUUID().slice(0, 8)}`,
        customerName,
        phone,
        address,
        amountDue,
        totalPaid: 0,
        dueDate,
        note,
        updatedAt: now,
      };
      db.kasbon.unshift(record);
      recordAuditLog(
        db,
        req.user!,
        'TAMBAH_KASBON',
        customerName,
        `Catat kasbon Rp ${amountDue.toLocaleString('id-ID')}`
      );
      saveDatabase(db);
      res.status(201).json({kasbon: record});
    }
  );

  // Keuangan, Kasir, Direktur & Pemilik: Kasbon Payment
  app.post(
    '/api/ops/kasbon/:id/pay',
    requireAuth,
    requireRoles(['PEMILIK', 'DIREKTUR', 'KEUANGAN', 'KASIR']),
    (req: AuthenticatedRequest, res) => {
      const paymentAmount = Math.round(Number(req.body?.amount || 0));
      const db = loadDatabase();
      const record = db.kasbon.find((k) => k.id === req.params.id);
      if (!record) {
        res.status(404).json({error: 'Catatan kasbon tidak ditemukan.'});
        return;
      }

      const remaining = Math.max(0, record.amountDue - record.totalPaid);
      if (!Number.isFinite(paymentAmount) || paymentAmount <= 0 || paymentAmount > remaining) {
        res.status(400).json({
          error: `Nominal cicilan harus antara Rp 1 dan Rp ${remaining.toLocaleString('id-ID')}.`,
        });
        return;
      }

      const now = new Date().toISOString();
      record.totalPaid += paymentAmount;
      record.updatedAt = now;

      db.ledger.unshift({
        id: `ldg-${crypto.randomUUID().slice(0, 8)}`,
        type: 'MASUK',
        category: 'Pelunasan Kasbon',
        description: `Bayar bon a/n ${record.customerName}`,
        amount: paymentAmount,
        paymentMethod: 'TUNAI',
        actorName: req.user!.displayName,
        createdAt: now,
      });

      saveDatabase(db);
      res.json({kasbon: record});
    }
  );

  // Complaints & Returns resolution (scoped by role)
  app.patch(
    '/api/ops/complaints/:id',
    requireAuth,
    requireRoles(['PEMILIK', 'DIREKTUR', 'KASIR', 'GUDANG']),
    (req: AuthenticatedRequest, res) => {
      const db = loadDatabase();
      const complaint = db.complaints.find((c) => c.id === req.params.id);
      if (!complaint) {
        res.status(404).json({error: 'Laporan komplain tidak ditemukan.'});
        return;
      }

      const nextStatus = req.body?.status as ComplaintStatus;
      const validStatuses: ComplaintStatus[] = [
        'BARU',
        'DIPROSES',
        'DISETUJUI',
        'SELESAI',
        'DITOLAK',
      ];
      if (!validStatuses.includes(nextStatus)) {
        res.status(400).json({error: 'Status komplain tidak valid.'});
        return;
      }

      const isLeadership = req.user!.role === 'PEMILIK' || req.user!.role === 'DIREKTUR';
      if (!isLeadership && ['DISETUJUI', 'DITOLAK'].includes(nextStatus)) {
        res.status(403).json({
          error: 'Persetujuan akhir atau penolakan retur/refund dilakukan oleh Pemilik atau Direktur.',
        });
        return;
      }

      const prevStatus = complaint.status;
      const now = new Date().toISOString();
      complaint.status = nextStatus;
      complaint.handledBy = req.user!.displayName;
      complaint.updatedAt = now;
      if (typeof req.body?.staffResponse === 'string') {
        complaint.staffResponse = req.body.staffResponse.trim();
      }

      const refundAmount = Math.max(0, Math.round(Number(req.body?.refundAmount || 0)));
      if (refundAmount > 0) {
        complaint.refundAmount = refundAmount;
      }

      const isFinalizingResolution =
        (nextStatus === 'DISETUJUI' || nextStatus === 'SELESAI') &&
        prevStatus !== 'DISETUJUI' &&
        prevStatus !== 'SELESAI' &&
        (complaint.refundAmount || 0) > 0;

      // Record refund expense in ledger when REFUND_DANA is finalized
      if (
        isFinalizingResolution &&
        complaint.requestedResolution === 'REFUND_DANA' &&
        !db.ledger.some((l) => l.description.includes(complaint.complaintNumber))
      ) {
        db.ledger.unshift({
          id: `ldg-${crypto.randomUUID().slice(0, 8)}`,
          type: 'KELUAR',
          category: 'Refund / Retur Pelanggan',
          description: `Refund ${complaint.complaintNumber} (${complaint.orderNumber} a/n ${complaint.customerName})`,
          amount: complaint.refundAmount!,
          paymentMethod: 'TUNAI',
          actorName: req.user!.displayName,
          createdAt: now,
        });
      }

      // Deduct open Kasbon balance automatically when POTONG_TAGIHAN is approved/finalized
      if (
        isFinalizingResolution &&
        complaint.requestedResolution === 'POTONG_TAGIHAN' &&
        !db.ledger.some((l) => l.description.includes(complaint.complaintNumber))
      ) {
        const cmpPhone = normalizePhoneDigits(complaint.phone);
        const openKasbon = db.kasbon.find((k) => {
          const remaining = Math.max(0, k.amountDue - k.totalPaid);
          if (remaining <= 0) return false;
          const kp = normalizePhoneDigits(k.phone);
          if (cmpPhone && kp) return kp === cmpPhone;
          return k.customerName.trim().toLowerCase() === complaint.customerName.trim().toLowerCase();
        });
        let appliedCut = complaint.refundAmount!;
        if (openKasbon) {
          const remaining = Math.max(0, openKasbon.amountDue - openKasbon.totalPaid);
          appliedCut = Math.min(remaining, complaint.refundAmount!);
          if (appliedCut > 0) {
            openKasbon.totalPaid += appliedCut;
            openKasbon.updatedAt = now;
            openKasbon.note = `${openKasbon.note} · [Potongan ${complaint.complaintNumber}: Rp ${appliedCut.toLocaleString('id-ID')}]`;
          }
        }
        if (appliedCut > 0) {
          db.ledger.unshift({
            id: `ldg-${crypto.randomUUID().slice(0, 8)}`,
            type: 'KELUAR',
            category: 'Potongan / Retur Pelanggan',
            description: `Potong tagihan ${complaint.complaintNumber} (${complaint.orderNumber} a/n ${complaint.customerName})`,
            amount: appliedCut,
            paymentMethod: 'KASBON',
            actorName: req.user!.displayName,
            createdAt: now,
          });
        }
      }

      // Optional stock return recording when product/variant specified
      if (req.body?.returnProductId && req.body?.returnVariantId && Number(req.body?.returnQty) > 0) {
        const retProduct = db.products.find((p) => p.id === req.body.returnProductId);
        const retVariant = retProduct?.variants.find((v) => v.id === req.body.returnVariantId);
        const retQty = Math.floor(Number(req.body.returnQty));
        if (retProduct && retVariant && retQty > 0) {
          retVariant.stock += retQty;
          syncProductAvailability(retProduct);
          db.stockMovements.unshift({
            id: `stk-${crypto.randomUUID().slice(0, 8)}`,
            productId: retProduct.id,
            productName: retProduct.name,
            variantId: retVariant.id,
            variantLabel: retVariant.label,
            type: 'RETUR',
            quantityDelta: retQty,
            note: `Retur masuk ${complaint.complaintNumber} (#${complaint.orderNumber})`,
            actorName: req.user!.displayName,
            createdAt: now,
          });
        }
      }

      recordAuditLog(
        db,
        req.user!,
        'TANGANI_KOMPLAIN',
        complaint.complaintNumber,
        `Status -> ${nextStatus}: ${complaint.staffResponse || '-'}`
      );
      saveDatabase(db);
      res.json({complaint});
    }
  );

  // --- VITE / STATIC FRONTEND ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Toko Dimas Jaya server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

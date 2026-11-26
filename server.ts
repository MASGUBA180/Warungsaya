import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import express, {type NextFunction, type Request, type Response} from 'express';
import {createServer as createViteServer} from 'vite';
import {
  hashPasscode,
  loadDatabase,
  saveDatabase,
  type StoredStaff,
  verifyPasscode,
} from './server/db.ts';
import type {
  AuthUser,
  DivisionRole,
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  Product,
} from './src/types/store.ts';

const PORT = 3000;
const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

const VALID_ROLES: DivisionRole[] = [
  'PEMILIK',
  'KASIR',
  'GUDANG',
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

interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

function signSessionToken(user: AuthUser): string {
  const payload = {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    exp: Date.now() + 1000 * 60 * 60 * 12,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${signature}`;
}

function verifySessionToken(token: string): AuthUser | null {
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
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    ) as AuthUser & {exp: number};
    if (!parsed.exp || Date.now() > parsed.exp) return null;
    if (!VALID_ROLES.includes(parsed.role)) return null;
    return {
      id: parsed.id,
      username: parsed.username,
      displayName: parsed.displayName,
      role: parsed.role,
    };
  } catch {
    return null;
  }
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

  // Verify active staff status unless env-configured owner
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
      price: v.price,
      stock: v.stock,
      minStock: v.minStock,
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

async function startServer() {
  const app = express();
  app.use(express.json({limit: '1mb'}));

  function getConfiguredEnvOwnerPasscode(): string {
    const raw = (process.env.OWNER_PASSCODE || '').trim();
    if (!raw || raw.startsWith('MY_')) return '';
    return raw;
  }

  // --- AUTH ROUTES ---
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

  // --- PUBLIC STOREFRONT ROUTES ---
  app.get('/api/public/store', (_req, res) => {
    const db = loadDatabase();
    res.json({
      settings: db.settings,
      products: db.products.map(sanitizeProductForPublic),
    });
  });

  app.post('/api/public/orders', (req, res) => {
    const customerName = String(req.body?.customerName || '').trim();
    const phone = String(req.body?.phone || '').trim();
    const deliveryMethod =
      req.body?.deliveryMethod === 'pickup' ? 'pickup' : 'cod';
    const addressNote = String(req.body?.addressNote || '').trim();
    const notes = String(req.body?.notes || '').trim();
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

    const db = loadDatabase();
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

    // Deduct stock & log movement
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

    const newOrder: Order = {
      id: `ord-${crypto.randomUUID().slice(0, 8)}`,
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
    saveDatabase(db);

    res.status(201).json({
      order: {
        orderNumber: newOrder.orderNumber,
        customerName: newOrder.customerName,
        deliveryMethod: newOrder.deliveryMethod,
        addressNote: newOrder.addressNote,
        notes: newOrder.notes,
        status: newOrder.status,
        items: newOrder.items,
        subtotal: newOrder.subtotal,
        deliveryFee: newOrder.deliveryFee,
        total: newOrder.total,
        createdAt: newOrder.createdAt,
      },
    });
  });

  app.get('/api/public/orders/track', (req, res) => {
    const code = String(req.query?.code || '').trim().toUpperCase();
    const phoneSuffix = String(req.query?.phone || '')
      .replace(/\D/g, '')
      .slice(-4);

    if (!code || phoneSuffix.length < 4) {
      res.status(400).json({
        error: 'Masukkan kode pesanan (contoh: DJ-1001) dan 4 digit terakhir nomor HP.',
      });
      return;
    }

    const db = loadDatabase();
    const order = db.orders.find((o) => {
      const orderDigits = o.phone.replace(/\D/g, '');
      return (
        o.orderNumber.toUpperCase() === code && orderDigits.endsWith(phoneSuffix)
      );
    });

    if (!order) {
      res.status(404).json({
        error: 'Pesanan tidak ditemukan atau 4 digit terakhir nomor HP tidak cocok.',
      });
      return;
    }

    res.json({
      order: {
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        deliveryMethod: order.deliveryMethod,
        addressNote: order.addressNote,
        status: order.status,
        items: order.items.map((i) => ({
          productName: i.productName,
          variantLabel: i.variantLabel,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
        subtotal: order.subtotal,
        deliveryFee: order.deliveryFee,
        total: order.total,
        courierName: order.courierName,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      },
    });
  });

  // --- PROTECTED OPERATIONAL ROUTES ---
  app.get('/api/ops/bootstrap', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = loadDatabase();
    const role = req.user!.role;

    const totalRevenue = db.ledger
      .filter((l) => l.type === 'MASUK')
      .reduce((sum, l) => sum + l.amount, 0);
    const totalExpense = db.ledger
      .filter((l) => l.type === 'KELUAR')
      .reduce((sum, l) => sum + l.amount, 0);
    const pendingOrdersCount = db.orders.filter(
      (o) => o.status === 'MENUNGGU' || o.status === 'DISIAPKAN'
    ).length;
    const activeDeliveriesCount = db.orders.filter(
      (o) => o.status === 'DIANTAR'
    ).length;
    const lowStockCount = db.products.reduce(
      (count, p) =>
        count + p.variants.filter((v) => v.stock <= v.minStock).length,
      0
    );
    const totalKasbonOutstanding = db.kasbon.reduce(
      (sum, k) => sum + Math.max(0, k.amountDue - k.totalPaid),
      0
    );

    res.json({
      user: req.user,
      settings: db.settings,
      overview: {
        totalRevenue,
        totalExpense,
        netCash: totalRevenue - totalExpense,
        pendingOrdersCount,
        activeDeliveriesCount,
        lowStockCount,
        totalKasbonOutstanding,
        totalOrders: db.orders.length,
      },
      products:
        role === 'PEMILIK' || role === 'GUDANG' || role === 'KEUANGAN'
          ? db.products
          : db.products.map(sanitizeProductForPublic),
      orders: db.orders,
      stockMovements:
        role === 'PEMILIK' || role === 'GUDANG'
          ? db.stockMovements.slice(0, 60)
          : [],
      ledger:
        role === 'PEMILIK' || role === 'KEUANGAN' || role === 'KASIR'
          ? db.ledger.slice(0, 80)
          : [],
      kasbon:
        role === 'PEMILIK' || role === 'KEUANGAN' || role === 'KASIR'
          ? db.kasbon
          : [],
      staff:
        role === 'PEMILIK'
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

  // Pemilik: Update Store Settings
  app.patch(
    '/api/ops/settings',
    requireAuth,
    requireRoles(['PEMILIK']),
    (req, res) => {
      const db = loadDatabase();
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

      db.settings = {
        ...db.settings,
        hours,
        daysOpen,
        deliveryArea,
        deliveryFee: Number.isFinite(deliveryFee) ? deliveryFee : db.settings.deliveryFee,
        freeDeliveryMin: Number.isFinite(freeDeliveryMin)
          ? freeDeliveryMin
          : db.settings.freeDeliveryMin,
      };
      saveDatabase(db);
      res.json({settings: db.settings});
    }
  );

  // Pemilik: Staff & Division Management
  app.post(
    '/api/ops/staff',
    requireAuth,
    requireRoles(['PEMILIK']),
    (req, res) => {
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
    requireRoles(['PEMILIK']),
    (req: AuthenticatedRequest, res) => {
      const db = loadDatabase();
      const target = db.staff.find((s) => s.id === req.params.id);
      if (!target) {
        res.status(404).json({error: 'Akun staf tidak ditemukan.'});
        return;
      }

      if (typeof req.body?.active === 'boolean') {
        if (target.id === req.user!.id && !req.body.active) {
          res
            .status(400)
            .json({error: 'Tidak dapat menonaktifkan akun Pemilik yang sedang aktif.'});
          return;
        }
        target.active = req.body.active;
      }

      if (req.body?.role && VALID_ROLES.includes(req.body.role)) {
        target.role = req.body.role;
      }

      if (typeof req.body?.passcode === 'string' && req.body.passcode.length >= 6) {
        target.passcodeHash = hashPasscode(req.body.passcode);
      }

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

  // Kasir & Pemilik: Point of Sale (Transaksi Langsung di Toko)
  app.post(
    '/api/ops/pos',
    requireAuth,
    requireRoles(['PEMILIK', 'KASIR']),
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
      const total = verifiedItems.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0
      );

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
        status: 'SELESAI',
        items: verifiedItems,
        subtotal: total,
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
      }

      saveDatabase(db);
      res.status(201).json({order: posOrder});
    }
  );

  // Order status progression (Kasir, Gudang, Kurir, Pemilik)
  app.patch(
    '/api/ops/orders/:id/status',
    requireAuth,
    requireRoles(['PEMILIK', 'KASIR', 'GUDANG', 'KURIR']),
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

      const prevStatus = order.status;
      if (prevStatus === nextStatus) {
        res.json({order});
        return;
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

      // Restore stock if cancelled from an active status
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

      // Record income in ledger when online/COD order completes
      if (nextStatus === 'SELESAI' && prevStatus !== 'SELESAI') {
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
      }

      saveDatabase(db);
      res.json({order});
    }
  );

  // Gudang & Pemilik: Create Product
  app.post(
    '/api/ops/products',
    requireAuth,
    requireRoles(['PEMILIK', 'GUDANG']),
    (req: AuthenticatedRequest, res) => {
      const name = String(req.body?.name || '').trim();
      const category = req.body?.category;
      const description = String(req.body?.description || '').trim();
      const variantLabel = String(req.body?.variantLabel || 'Satuan').trim();
      const price = Math.max(500, Math.round(Number(req.body?.price || 0)));
      const costPrice = Math.max(0, Math.round(Number(req.body?.costPrice || 0)));
      const stock = Math.max(0, Math.floor(Number(req.body?.stock || 0)));
      const minStock = Math.max(1, Math.floor(Number(req.body?.minStock || 5)));

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
        image: imageByCategory[category] || imageByCategory.Sembako,
        imageAlt: name,
        variants: [
          {
            id: variantId,
            label: variantLabel,
            price,
            costPrice: costPrice || Math.round(price * 0.85),
            stock,
            minStock,
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

      saveDatabase(db);
      res.status(201).json({product: newProduct});
    }
  );

  // Gudang & Pemilik: Update Product Variant Price
  app.patch(
    '/api/ops/products/:id/variant/:variantId',
    requireAuth,
    requireRoles(['PEMILIK', 'GUDANG']),
    (req, res) => {
      const db = loadDatabase();
      const product = db.products.find((p) => p.id === req.params.id);
      const variant = product?.variants.find((v) => v.id === req.params.variantId);
      if (!product || !variant) {
        res.status(404).json({error: 'Produk atau varian tidak ditemukan.'});
        return;
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

      syncProductAvailability(product);
      saveDatabase(db);
      res.json({product});
    }
  );

  // Gudang & Pemilik: Stock Movement (Masuk / Opname)
  app.post(
    '/api/ops/stock',
    requireAuth,
    requireRoles(['PEMILIK', 'GUDANG']),
    (req: AuthenticatedRequest, res) => {
      const productId = String(req.body?.productId || '');
      const variantId = String(req.body?.variantId || '');
      const type = req.body?.type === 'OPNAME' ? 'OPNAME' : 'MASUK';
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
      } else {
        if (quantity < 0) {
          res.status(400).json({error: 'Hasil opname stok tidak boleh negatif.'});
          return;
        }
        delta = quantity - variant.stock;
        variant.stock = quantity;
      }

      syncProductAvailability(product);

      const movement = {
        id: `stk-${crypto.randomUUID().slice(0, 8)}`,
        productId: product.id,
        productName: product.name,
        variantId: variant.id,
        variantLabel: variant.label,
        type,
        quantityDelta: delta,
        note: note || (type === 'MASUK' ? 'Kulakan stok masuk' : 'Penyesuaian stok opname'),
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

  // Keuangan, Kasir & Pemilik: Ledger Entry
  app.post(
    '/api/ops/ledger',
    requireAuth,
    requireRoles(['PEMILIK', 'KEUANGAN']),
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

  // Keuangan, Kasir & Pemilik: Kasbon Payment / Entry
  app.post(
    '/api/ops/kasbon/:id/pay',
    requireAuth,
    requireRoles(['PEMILIK', 'KEUANGAN', 'KASIR']),
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

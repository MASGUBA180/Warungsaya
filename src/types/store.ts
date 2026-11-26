export type DivisionRole = 'PEMILIK' | 'KASIR' | 'GUDANG' | 'KURIR' | 'KEUANGAN';

export type ProductCategory =
  | 'Semua'
  | 'Sembako'
  | 'Kopi & Gula'
  | 'Dapur & Bumbu'
  | 'Kebersihan'
  | 'Galon & Minuman';

export type OrderStatus =
  | 'MENUNGGU'
  | 'DISIAPKAN'
  | 'DIANTAR'
  | 'SELESAI'
  | 'DIBATALKAN';

export type PaymentMethod = 'COD' | 'TUNAI' | 'QRIS' | 'KASBON';

export interface ProductVariant {
  id: string;
  label: string;
  price: number;
  costPrice?: number;
  stock: number;
  minStock: number;
}

export interface Product {
  id: string;
  name: string;
  category: Exclude<ProductCategory, 'Semua'>;
  unitSummary: string;
  availability: string;
  description: string;
  image: string;
  imageAlt: string;
  variants: ProductVariant[];
}

export interface StoreSettings {
  name: string;
  tagline: string;
  streetAddress: string;
  district: string;
  province: string;
  fullAddress: string;
  hours: string;
  daysOpen: string;
  deliveryArea: string;
  deliveryFee: number;
  freeDeliveryMin: number;
  mapsUrl: string;
  heroImage: string;
}

export interface OrderItem {
  productId: string;
  productName: string;
  variantId: string;
  variantLabel: string;
  unitPrice: number;
  costPrice: number;
  quantity: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  source: 'ONLINE' | 'POS';
  customerName: string;
  phone: string;
  deliveryMethod: 'cod' | 'pickup' | 'instore';
  addressNote: string;
  notes: string;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  handledBy: string;
  courierName: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  variantId: string;
  variantLabel: string;
  type: 'MASUK' | 'KELUAR' | 'OPNAME';
  quantityDelta: number;
  note: string;
  actorName: string;
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  type: 'MASUK' | 'KELUAR';
  category: string;
  description: string;
  amount: number;
  paymentMethod: string;
  actorName: string;
  createdAt: string;
}

export interface KasbonRecord {
  id: string;
  customerName: string;
  phone: string;
  address: string;
  amountDue: number;
  totalPaid: number;
  note: string;
  updatedAt: string;
}

export interface PublicStaffProfile {
  id: string;
  username: string;
  displayName: string;
  role: DivisionRole;
  active: boolean;
  createdAt: string;
}

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: DivisionRole;
}

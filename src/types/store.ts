export type DivisionRole =
  | 'PEMILIK'
  | 'DIREKTUR'
  | 'KASIR'
  | 'GUDANG'
  | 'PEMASOK'
  | 'KURIR'
  | 'KEUANGAN';

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

export type DeliveryCheckpoint =
  | 'PERSIAPAN_TOKO'
  | 'MENUJU_LOKASI'
  | 'DEKAT_TUJUAN'
  | 'SUDAH_TIBA';

export type PaymentMethod = 'COD' | 'TUNAI' | 'QRIS' | 'KASBON';

export type PaymentStatus = 'BELUM_BAYAR' | 'MENUNGGU_QRIS' | 'LUNAS' | 'KASBON';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface DeliveryTrackingInfo {
  checkpoint: DeliveryCheckpoint;
  locationNote: string;
  progressPercent: number;
  etaMinutes?: number;
  courierCoords?: GeoPoint | null;
  proofNote?: string;
  proofPhoto?: string;
  updatedAt: string;
}

export interface QrisPaymentInfo {
  reference: string;
  nmid: string;
  merchantName: string;
  payload: string;
  amount: number;
  expiresAt: string;
  paidAt?: string;
  gatewayStatus: 'PENDING' | 'PAID' | 'EXPIRED';
}

export interface WhatsappNotification {
  id: string;
  trigger: 'DISIAPKAN' | 'DIANTAR' | 'SELESAI' | 'QRIS_LUNAS';
  recipientPhone: string;
  message: string;
  waLink: string;
  actorName: string;
  sentAt: string;
}

export interface ProductVariant {
  id: string;
  label: string;
  sku?: string;
  price: number;
  costPrice?: number;
  stock: number;
  minStock: number;
  expiryDate?: string;
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
  storeUrl?: string;
  heroImage: string;
  storeCoords?: GeoPoint | null;
  whatsappNumber?: string;
  qrisMerchantName?: string;
  qrisNmid?: string;
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
  customerId?: string | null;
  customerName: string;
  phone: string;
  deliveryMethod: 'cod' | 'pickup' | 'instore';
  addressNote: string;
  notes: string;
  paymentMethod: PaymentMethod;
  paymentStatus?: PaymentStatus;
  qris?: QrisPaymentInfo;
  discountAmount?: number;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  handledBy: string;
  courierName: string;
  assignedCourierId?: string;
  assignedCourierName?: string;
  customerCoords?: GeoPoint | null;
  tracking?: DeliveryTrackingInfo;
  whatsappNotifications?: WhatsappNotification[];
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  variantId: string;
  variantLabel: string;
  type: 'MASUK' | 'KELUAR' | 'OPNAME' | 'RETUR' | 'RUSAK';
  quantityDelta: number;
  note: string;
  actorName: string;
  createdAt: string;
}

export interface SupplierDelivery {
  id: string;
  batchCode?: string;
  supplierId: string;
  supplierName: string;
  productId: string;
  productName: string;
  variantId: string;
  variantLabel: string;
  quantity: number;
  unitCost: number;
  note: string;
  invoicePhoto?: string;
  status: 'MENUNGGU_TERIMA' | 'DITERIMA';
  paymentStatus?: 'TUNAI' | 'TEMPO' | 'LUNAS';
  dueDate?: string;
  receivedBy?: string;
  createdAt: string;
  receivedAt?: string;
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
  dueDate?: string;
  note: string;
  updatedAt: string;
}

export type ComplaintCategory =
  | 'BARANG_RUSAK'
  | 'KURANG_ITEM'
  | 'SALAH_VARIAN'
  | 'KEDALUWARSA'
  | 'LAINNYA';

export type ComplaintResolution =
  | 'GANTI_BARANG'
  | 'REFUND_DANA'
  | 'POTONG_TAGIHAN';

export type ComplaintStatus =
  | 'BARU'
  | 'DIPROSES'
  | 'DISETUJUI'
  | 'SELESAI'
  | 'DITOLAK';

export interface ComplaintRecord {
  id: string;
  complaintNumber: string;
  orderId: string;
  orderNumber: string;
  customerId?: string | null;
  customerName: string;
  phone: string;
  category: ComplaintCategory;
  description: string;
  evidencePhoto?: string;
  requestedResolution: ComplaintResolution;
  refundAmount?: number;
  status: ComplaintStatus;
  staffResponse: string;
  handledBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CashierShift {
  id: string;
  cashierId: string;
  cashierName: string;
  openedAt: string;
  closedAt?: string;
  openingCash: number;
  expectedCash: number;
  countedCash?: number;
  qrisSalesTotal: number;
  discrepancy?: number;
  note: string;
  status: 'TERBUKA' | 'DITUTUP';
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  target: string;
  detail: string;
  createdAt: string;
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

export interface CustomerProfile {
  id: string;
  name: string;
  phone: string;
  defaultAddress: string;
  savedCoords?: GeoPoint | null;
  createdAt: string;
}

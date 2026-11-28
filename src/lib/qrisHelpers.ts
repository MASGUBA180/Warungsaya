import type {QrisPaymentInfo} from '../types/store';

function formatTlv(tag: string, value: string): string {
  const len = String(value.length).padStart(2, '0');
  return `${tag}${len}${value}`;
}

export function crc16Ccitt(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function buildDynamicQrisPayload(params: {
  merchantName: string;
  nmid: string;
  amount: number;
  reference: string;
}): string {
  const cleanMerchant = (params.merchantName || 'TOKO DIMAS JAYA')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .slice(0, 25);
  const cleanNmid = (params.nmid || 'ID1020260000188')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 19);
  const cleanRef = params.reference.replace(/[^A-Z0-9-]/gi, '').slice(0, 20);
  const amountStr = String(Math.max(100, Math.round(params.amount)));

  const merchantInfo =
    formatTlv('00', 'ID.CO.QRIS.WWW') +
    formatTlv('01', cleanNmid) +
    formatTlv('02', 'UMI');

  const bodyWithoutCrc =
    formatTlv('00', '01') +
    formatTlv('01', '12') + // 12 = Dynamic QRIS
    formatTlv('51', merchantInfo) +
    formatTlv('52', '5411') + // Grocery / Sembako
    formatTlv('53', '360') + // IDR
    formatTlv('54', amountStr) +
    formatTlv('58', 'ID') +
    formatTlv('59', cleanMerchant) +
    formatTlv('60', 'LAMPUNG TENGAH') +
    formatTlv('61', '34167') +
    formatTlv('62', formatTlv('05', cleanRef)) +
    '6304';

  return bodyWithoutCrc + crc16Ccitt(bodyWithoutCrc);
}

export function buildOrderQrisInfo(params: {
  orderNumber: string;
  amount: number;
  merchantName?: string;
  nmid?: string;
  gatewayStatus?: 'PENDING' | 'PAID';
  nowIso?: string;
}): QrisPaymentInfo {
  const now = params.nowIso ? new Date(params.nowIso) : new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
  const merchantName = (params.merchantName || 'TOKO DIMAS JAYA').trim();
  const nmid = (params.nmid || 'ID1020260000188').trim();
  const reference = `QR-${params.orderNumber}-${now.getTime().toString().slice(-4)}`;

  return {
    reference,
    nmid,
    merchantName,
    payload: buildDynamicQrisPayload({
      merchantName,
      nmid,
      amount: params.amount,
      reference,
    }),
    amount: Math.max(100, Math.round(params.amount)),
    expiresAt,
    paidAt: params.gatewayStatus === 'PAID' ? now.toISOString() : undefined,
    gatewayStatus: params.gatewayStatus || 'PENDING',
  };
}

export function normalizePhoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('62')) return `0${digits.slice(2)}`;
  if (digits.startsWith('8')) return `0${digits}`;
  return digits;
}

export function normalizeWhatsappNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('8')) return `62${digits}`;
  return digits;
}

export function buildOrderTrackingUrl(
  storeUrl: string | undefined,
  orderNumber: string
): string {
  const rawBase =
    (storeUrl || '').trim() ||
    (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '');
  if (!/^https?:\/\//i.test(rawBase)) return '';
  const cleanBase = rawBase.replace(/\/+$/, '');
  const code = (orderNumber || '').trim();
  return code ? `${cleanBase}/?lacak=${encodeURIComponent(code)}` : cleanBase;
}

export function buildCourierWhatsappMessage(params: {
  customerName: string;
  orderNumber: string;
  courierName: string;
  etaMinutes?: number;
  addressNote: string;
  total: number;
  paymentStatus?: string;
  trigger?: 'DISIAPKAN' | 'DIANTAR' | 'SELESAI' | 'QRIS_LUNAS';
  storeUrl?: string;
}): string {
  const totalStr = `Rp ${params.total.toLocaleString('id-ID')}`;
  const trackUrl = buildOrderTrackingUrl(params.storeUrl, params.orderNumber);

  if (params.trigger === 'QRIS_LUNAS') {
    return [
      `Halo ${params.customerName},`,
      `Pembayaran QRIS untuk pesanan *${params.orderNumber}* sebesar *${totalStr}* di *Toko Dimas Jaya* telah *LUNAS* terverifikasi.`,
      `Pesanan Anda segera kami siapkan.`,
      ...(trackUrl ? [`Cek status pesanan di web: ${trackUrl}`] : []),
    ].join('\n');
  }
  if (params.trigger === 'SELESAI') {
    return [
      `Halo ${params.customerName},`,
      `Pesanan *${params.orderNumber}* dari *Toko Dimas Jaya* telah selesai diserahkan.`,
      `Terima kasih telah berbelanja! Jika ada kendala barang, gunakan menu Akun Saya / Lacak Pesanan untuk pengajuan retur.`,
      ...(trackUrl ? [`Link pesanan: ${trackUrl}`] : []),
    ].join('\n');
  }

  const etaText =
    params.etaMinutes && params.etaMinutes > 0
      ? `Estimasi tiba ±${params.etaMinutes} menit.`
      : 'Sedang dalam perjalanan menuju rumah Anda.';
  const payText =
    params.paymentStatus === 'LUNAS'
      ? 'Status pembayaran: LUNAS (QRIS).'
      : `Tagihan COD saat terima: ${totalStr}.`;

  return [
    `Halo ${params.customerName},`,
    `Pesanan *${params.orderNumber}* dari *Toko Dimas Jaya* sedang *DIANTAR* oleh kurir *${params.courierName}*.`,
    `Tujuan: ${params.addressNote}`,
    etaText,
    payText,
    trackUrl
      ? `Pantau posisi kurir & status pesanan di web:\n${trackUrl}`
      : `Pantau posisi kurir di peta lewat menu Lacak Pesanan.`,
  ].join('\n');
}

export function buildCourierWhatsappLink(params: {
  phone: string;
  customerName: string;
  orderNumber: string;
  courierName: string;
  etaMinutes?: number;
  addressNote: string;
  total: number;
  paymentStatus?: string;
  trigger?: 'DISIAPKAN' | 'DIANTAR' | 'SELESAI' | 'QRIS_LUNAS';
  storeUrl?: string;
}): {waLink: string; message: string} {
  const waNum = normalizeWhatsappNumber(params.phone);
  const message = buildCourierWhatsappMessage(params);
  if (!waNum) return {waLink: '', message};
  return {
    waLink: `https://wa.me/${waNum}?text=${encodeURIComponent(message)}`,
    message,
  };
}

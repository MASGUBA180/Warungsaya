import {Check, CheckCircle2, Copy, QrCode} from 'lucide-react';
import {useEffect, useState} from 'react';
import {renderQrSvg} from '../lib/qris';
import {formatRupiah, formatShortDate} from '../lib/storeData';
import type {QrisPaymentInfo} from '../types/store';

interface QrisCardProps {
  qris: QrisPaymentInfo;
  orderNumber: string;
  onConfirmPayment?: () => Promise<void>;
  confirming?: boolean;
  confirmLabel?: string;
}

export function QrisCard({
  qris,
  orderNumber,
  onConfirmPayment,
  confirming = false,
  confirmLabel = 'Simulasi / Konfirmasi Sudah Bayar QRIS',
}: QrisCardProps) {
  const [svgMarkup, setSvgMarkup] = useState<string>('');
  const [copiedPayload, setCopiedPayload] = useState(false);

  useEffect(() => {
    let active = true;
    renderQrSvg(qris.payload)
      .then((svg) => {
        if (active) setSvgMarkup(svg);
      })
      .catch(() => {
        if (active) setSvgMarkup('');
      });
    return () => {
      active = false;
    };
  }, [qris.payload]);

  const handleCopyPayload = async () => {
    try {
      await navigator.clipboard.writeText(qris.payload);
      setCopiedPayload(true);
      window.setTimeout(() => setCopiedPayload(false), 2000);
    } catch {
      setCopiedPayload(false);
    }
  };

  const isPaid = qris.gatewayStatus === 'PAID';

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-zinc-900 flex items-center gap-1.5">
            <QrCode className="w-4 h-4 text-[#14532D]" aria-hidden="true" />
            <span>QRIS Dinamis · {qris.merchantName}</span>
          </p>
          <p className="text-[11px] font-mono text-zinc-500 mt-0.5">
            NMID: {qris.nmid} · Ref: {qris.reference}
          </p>
        </div>

        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
            isPaid
              ? 'bg-emerald-50 border-emerald-200 text-[#14532D]'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          {isPaid ? 'LUNAS' : 'Menunggu Scan'}
        </span>
      </div>

      {isPaid ? (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 flex items-center gap-2.5 text-xs text-[#14532D]">
          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">
              Pembayaran QRIS {formatRupiah(qris.amount)} telah diterima ({orderNumber})
            </p>
            {qris.paidAt && (
              <p className="text-[11px] text-emerald-800 mt-0.5">
                Terverifikasi pada {formatShortDate(qris.paidAt)}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row items-center gap-4 pt-1">
          <div className="p-2 bg-white border border-zinc-200 rounded-lg shrink-0">
            {svgMarkup ? (
              <div
                className="w-40 h-40 [&>svg]:w-full [&>svg]:h-full"
                dangerouslySetInnerHTML={{__html: svgMarkup}}
              />
            ) : (
              <div className="w-40 h-40 flex items-center justify-center bg-zinc-50 text-xs text-zinc-400">
                Memuat QR...
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-2 text-xs text-zinc-600 w-full">
            <div>
              <p className="text-zinc-500">Nominal Pembayaran Otomatis</p>
              <p className="text-lg font-bold text-zinc-900 tabular-price">
                {formatRupiah(qris.amount)}
              </p>
            </div>
            <p className="leading-relaxed">
              Scan menggunakan GoPay, OVO, DANA, ShopeePay, atau Mobile Banking. Nominal otomatis terisi sesuai tagihan.
            </p>
            <p className="text-[11px] text-zinc-500 tabular-price">
              Berlaku s/d {formatShortDate(qris.expiresAt)}
            </p>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={handleCopyPayload}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-300 bg-white text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 cursor-pointer"
              >
                {copiedPayload ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#14532D]" />
                    <span>Kode QRIS Disalin</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Salin String QRIS</span>
                  </>
                )}
              </button>

              {onConfirmPayment && (
                <button
                  type="button"
                  disabled={confirming}
                  onClick={onConfirmPayment}
                  className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-[#14532D] text-white text-[11px] font-semibold hover:bg-[#166534] disabled:opacity-60 cursor-pointer"
                >
                  {confirming ? 'Memverifikasi...' : confirmLabel}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

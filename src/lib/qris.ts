import QRCode from 'qrcode';

export * from './qrisHelpers';

export async function renderQrSvg(payload: string): Promise<string> {
  return QRCode.toString(payload, {
    type: 'svg',
    margin: 1,
    width: 220,
    color: {
      dark: '#18181b',
      light: '#ffffff',
    },
  });
}

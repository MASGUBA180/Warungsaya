export async function compressImageFileToDataUrl(
  file: File,
  maxWidth = 720,
  quality = 0.72
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Pilih file gambar (JPG, PNG, atau WebP).');
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Format gambar tidak dapat dimuat.'));
    el.src = rawDataUrl;
  });

  const scale = img.width > maxWidth ? maxWidth / img.width : 1;
  const targetWidth = Math.max(1, Math.round(img.width * scale));
  const targetHeight = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return rawDataUrl;

  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
  return canvas.toDataURL('image/jpeg', quality);
}

export function isValidUploadedPhoto(val: unknown): val is string {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (!trimmed || trimmed.length > 1_200_000) return false;
  return (
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('/src/assets/images/') ||
    trimmed.startsWith('/assets/')
  );
}

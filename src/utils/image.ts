/** Prepares a map image for upload: PNG/JPG are scaled down and re-encoded to fit the 1 MB limit; SVG is sent as is. */
export const MAX_IMAGE_BYTES = 1_000_000;

const readAsDataUrl = (f: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(r.error);
  r.readAsDataURL(f);
});
const approxBytes = (dataUrl: string) => Math.floor((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);

export async function prepareMapImage(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|svg\+xml)$/.test(file.type)) throw new Error('type');
  if (file.type === 'image/svg+xml') {
    if (file.size > MAX_IMAGE_BYTES) throw new Error('size');
    return readAsDataUrl(file);
  }
  if (file.size <= MAX_IMAGE_BYTES * 0.9) return readAsDataUrl(file);
  const bmp = await createImageBitmap(file);
  for (const [maxSide, quality] of [[1800, 0.85], [1500, 0.8], [1200, 0.75], [900, 0.7]] as const) {
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL('image/jpeg', quality);
    if (approxBytes(url) <= MAX_IMAGE_BYTES * 0.95) return url;
  }
  throw new Error('size');
}

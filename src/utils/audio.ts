/** Short voice clip of one passage, recorded in the browser (MediaRecorder). Never sent to any AI service. */

export interface Clip { blob: Blob; mime: string; ms: number }

export const MAX_CLIP_MS = 6000;
const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

export const canRecordAudio = () =>
  typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

export interface ClipRecorder { stop: () => Promise<Clip | null>; cancel: () => void }

/** Starts recording; the clip stops by itself after MAX_CLIP_MS. Rejects when the microphone is not available. */
export async function startClip(onAutoStop?: (c: Clip | null) => void): Promise<ClipRecorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const type = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
  const rec = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 24_000 });
  const chunks: Blob[] = [];
  const started = Date.now();
  let finished: Promise<Clip | null> | null = null;
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const release = () => stream.getTracks().forEach((t) => t.stop());

  const finish = () => {
    finished ??= new Promise<Clip | null>((resolve) => {
      rec.onstop = () => {
        release();
        const mime = (rec.mimeType || type || 'audio/webm').split(';')[0];
        const blob = new Blob(chunks, { type: mime });
        resolve(blob.size > 200 && blob.size <= 190_000 ? { blob, mime, ms: Math.min(Date.now() - started, 30_000) } : null);
      };
      if (rec.state !== 'inactive') rec.stop(); else rec.onstop?.(new Event('stop'));
    });
    return finished;
  };
  const timer = setTimeout(() => { void finish().then((c) => onAutoStop?.(c)); }, MAX_CLIP_MS);
  rec.start();
  return { stop: () => { clearTimeout(timer); return finish(); }, cancel: () => { clearTimeout(timer); chunks.length = 0; if (rec.state !== 'inactive') rec.stop(); release(); } };
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

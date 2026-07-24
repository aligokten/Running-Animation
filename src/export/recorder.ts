import { ArrayBufferTarget, Muxer } from 'mp4-muxer';

export interface RecordOptions {
  canvas: HTMLCanvasElement;
  fps: number;
  duration: number;
  /** bits per second */
  bitrate: number;
  /** draws the given moment of the animation onto the canvas */
  renderFrame: (time: number) => void;
  onProgress?: (ratio: number, note: string) => void;
  signal?: AbortSignal;
}

export interface RecordResult {
  blob: Blob;
  extension: string;
  /** 'webcodecs' is frame accurate, 'mediarecorder' records in real time */
  method: 'webcodecs' | 'mediarecorder';
  /** human readable codec name, for the confirmation message */
  codec: string;
}

export class AbortedError extends Error {
  constructor() {
    super('Dışa aktarma iptal edildi.');
    this.name = 'AbortedError';
  }
}

const nextTick = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new AbortedError();
}

export function supportsWebCodecs(): boolean {
  return typeof window !== 'undefined' && 'VideoEncoder' in window && 'VideoFrame' in window;
}

/**
 * H.264 first: it is what every social platform ingests without re-encoding.
 * VP9 and AV1 are the fallbacks for browsers built without the proprietary
 * codecs — still frame accurate, still an MP4, just a different stream.
 */
const CODECS: { codec: string; muxer: 'avc' | 'vp9' | 'av1'; name: string }[] = [
  { codec: 'avc1.640034', muxer: 'avc', name: 'H.264' }, // High 5.2
  { codec: 'avc1.640033', muxer: 'avc', name: 'H.264' }, // High 5.1
  { codec: 'avc1.4d0034', muxer: 'avc', name: 'H.264' }, // Main 5.2
  { codec: 'avc1.42003c', muxer: 'avc', name: 'H.264' }, // Baseline 6.0
  { codec: 'vp09.00.10.08', muxer: 'vp9', name: 'VP9' },
  { codec: 'av01.0.08M.08', muxer: 'av1', name: 'AV1' },
];

async function pickCodec(width: number, height: number, bitrate: number, framerate: number) {
  for (const candidate of CODECS) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec: candidate.codec,
        width,
        height,
        bitrate,
        framerate,
      });
      if (support.supported) return candidate;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/**
 * Frame accurate export. Every frame is rendered, handed to the hardware
 * encoder with an explicit timestamp and muxed into an MP4, so the output runs
 * at exactly the requested duration no matter how slow the rendering is.
 */
async function recordWithWebCodecs(o: RecordOptions): Promise<RecordResult> {
  const width = o.canvas.width;
  const height = o.canvas.height;
  const totalFrames = Math.max(1, Math.round(o.duration * o.fps));

  const codec = await pickCodec(width, height, o.bitrate, o.fps);
  if (!codec) throw new Error('Bu tarayıcı donanımsal video kodlamayı desteklemiyor.');

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: codec.muxer, width, height },
    fastStart: 'in-memory',
  });

  let encoderError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (err) => {
      encoderError = err instanceof Error ? err : new Error(String(err));
    },
  });
  encoder.configure({
    codec: codec.codec,
    width,
    height,
    bitrate: o.bitrate,
    framerate: o.fps,
    latencyMode: 'quality',
  });

  const frameDuration = 1_000_000 / o.fps;

  try {
    for (let i = 0; i < totalFrames; i++) {
      throwIfAborted(o.signal);
      if (encoderError) throw encoderError;

      o.renderFrame((i / o.fps));

      const frame = new VideoFrame(o.canvas, {
        timestamp: Math.round(i * frameDuration),
        duration: Math.round(frameDuration),
      });
      // a keyframe every two seconds keeps the file seekable
      encoder.encode(frame, { keyFrame: i % (o.fps * 2) === 0 });
      frame.close();

      // let the encoder drain so memory stays flat on long exports
      while (encoder.encodeQueueSize > 6) {
        await nextTick();
        throwIfAborted(o.signal);
      }
      if (i % 3 === 0) await nextTick();
      o.onProgress?.(i / totalFrames, `Kare ${i + 1} / ${totalFrames}`);
    }

    o.onProgress?.(1, 'Video paketleniyor…');
    await encoder.flush();
    if (encoderError) throw encoderError;
    muxer.finalize();

    const { buffer } = muxer.target as ArrayBufferTarget;
    return {
      blob: new Blob([buffer], { type: 'video/mp4' }),
      extension: 'mp4',
      method: 'webcodecs',
      codec: codec.name,
    };
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
}

function pickRecorderMime(): string {
  const candidates = [
    'video/mp4;codecs=avc1.640034',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
}

/**
 * Fallback for browsers without WebCodecs. MediaRecorder timestamps frames
 * against the wall clock, so this plays the animation back in real time and
 * captures it as it goes.
 */
async function recordWithMediaRecorder(o: RecordOptions): Promise<RecordResult> {
  const mime = pickRecorderMime();
  const stream = o.canvas.captureStream(o.fps);
  const recorder = new MediaRecorder(stream, {
    mimeType: mime || undefined,
    videoBitsPerSecond: o.bitrate,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };

  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error('Kayıt sırasında hata oluştu.'));
  });

  recorder.start();
  const startedAt = performance.now();

  try {
    for (;;) {
      throwIfAborted(o.signal);
      const elapsed = (performance.now() - startedAt) / 1000;
      if (elapsed >= o.duration) break;
      o.renderFrame(elapsed);
      o.onProgress?.(elapsed / o.duration, 'Gerçek zamanlı kayıt…');
      await nextTick();
    }
    o.renderFrame(o.duration);
    await nextTick();
  } finally {
    if (recorder.state !== 'inactive') recorder.stop();
    for (const track of stream.getTracks()) track.stop();
  }

  await stopped;
  const type = mime || 'video/webm';
  return {
    blob: new Blob(chunks, { type }),
    extension: type.includes('mp4') ? 'mp4' : 'webm',
    method: 'mediarecorder',
    codec: type.includes('vp9') ? 'VP9' : type.includes('mp4') ? 'H.264' : 'VP8',
  };
}

export async function recordVideo(o: RecordOptions): Promise<RecordResult> {
  if (supportsWebCodecs()) {
    try {
      return await recordWithWebCodecs(o);
    } catch (err) {
      if (err instanceof AbortedError) throw err;
      // fall through to the real-time recorder rather than failing outright
      console.warn('WebCodecs dışa aktarma başarısız, MediaRecorder deneniyor:', err);
    }
  }
  return recordWithMediaRecorder(o);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function safeFileName(name: string): string {
  const map: Record<string, string> = {
    ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I',
    ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U',
  };
  return (
    name
      .replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => map[c] ?? c)
      .replace(/[^\w-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'one-more-step'
  );
}

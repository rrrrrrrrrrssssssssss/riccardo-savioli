// Browser-side conversion of uploaded files into web formats sized for the carousel
// (images are shown 294px tall, see --image-height in app/globals.css).

// Photos: 3× the display height keeps them sharp on high-density screens.
const IMAGE_MAX_HEIGHT = 900;
const IMAGE_MAX_WIDTH = 2400;
const IMAGE_QUALITY = 0.85;

// Videos: H.264 MP4 without audio. The bitrate follows the resolution (VIDEO_BITS_PER_PIXEL per
// pixel per frame at 30 fps, enough at the sizes they are shown), so files stay light; and since
// uploads go through a Vercel function (4.5 MB body limit) it never exceeds what fits the whole
// clip in VIDEO_MAX_BYTES.
const VIDEO_MAX_HEIGHT = 720;
const VIDEO_MAX_WIDTH = 1280;
const VIDEO_MAX_BYTES = 4 * 1024 * 1024;
const VIDEO_BITS_PER_PIXEL = 0.07;
const VIDEO_MIN_BITRATE = 400_000;

export type Converted = {
  blob: Blob;
  ext: "webp" | "jpg" | "mp4";
  width: number;
  height: number;
  video: boolean;
};

const ext = (file: File) => file.name.split(".").pop()?.toLowerCase() ?? "";
const HEIC = ["heic", "heif", "hif"];
const TIFF = ["tif", "tiff"];
const VIDEO = ["mp4", "mov", "m4v", "webm", "mkv", "avi", "3gp"];

export const ACCEPT = "image/*,video/*,.heic,.heif,.hif,.tif,.tiff,.mov,.mkv";

export function isMedia(file: File) {
  return (
    file.type.startsWith("image/") ||
    file.type.startsWith("video/") ||
    [...HEIC, ...TIFF, ...VIDEO].includes(ext(file))
  );
}

export function isVideo(file: File) {
  return file.type.startsWith("video/") || VIDEO.includes(ext(file));
}

export async function convert(file: File, onProgress?: (p: number) => void): Promise<Converted> {
  return isVideo(file) ? convertVideo(file, onProgress) : convertImage(file);
}

async function decodeImage(
  file: File,
): Promise<CanvasImageSource & { width: number; height: number }> {
  const type = file.type.toLowerCase();
  if (HEIC.includes(ext(file)) || type === "image/heic" || type === "image/heif") {
    // Safari decodes HEIC natively; other browsers need libheif (loaded only when needed).
    try {
      return await createImageBitmap(file);
    } catch {
      const { heicTo } = await import("heic-to/next");
      return heicTo({ blob: file, type: "bitmap" });
    }
  }
  if (TIFF.includes(ext(file)) || type === "image/tiff") {
    const UTIF = (await import("utif2")).default;
    const buffer = await file.arrayBuffer();
    const [ifd] = UTIF.decode(buffer);
    UTIF.decodeImage(buffer, ifd);
    const rgba = new Uint8ClampedArray(UTIF.toRGBA8(ifd));
    return createImageBitmap(new ImageData(rgba, ifd.width, ifd.height));
  }
  return createImageBitmap(file);
}

async function convertImage(file: File): Promise<Converted> {
  const source = await decodeImage(file);
  const scale = Math.min(1, IMAGE_MAX_HEIGHT / source.height, IMAGE_MAX_WIDTH / source.width);
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);
  if ("close" in source && typeof source.close === "function") source.close();

  // WebP where the browser can encode it (keeps transparency), JPEG otherwise.
  const webp = await toBlob(canvas, "image/webp");
  if (webp?.type === "image/webp") return { blob: webp, ext: "webp", width, height, video: false };

  // JPEG has no transparency: put transparent areas on the page's white.
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  const jpeg = await toBlob(canvas, "image/jpeg");
  if (!jpeg) throw new Error("Conversione dell'immagine non riuscita");
  return { blob: jpeg, ext: "jpg", width, height, video: false };
}

const toBlob = (canvas: HTMLCanvasElement, type: string) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, IMAGE_QUALITY));

async function convertVideo(file: File, onProgress?: (p: number) => void): Promise<Converted> {
  const { Input, Output, Conversion, BlobSource, BufferTarget, Mp4OutputFormat, ALL_FORMATS } =
    await import("mediabunny");

  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error("Nel file non c'è nessun video");
  const duration = await input.computeDuration();

  const budget = Math.floor((VIDEO_MAX_BYTES * 8 * 0.9) / duration);
  if (budget < VIDEO_MIN_BITRATE) {
    const max = Math.floor((VIDEO_MAX_BYTES * 8 * 0.9) / VIDEO_MIN_BITRATE);
    throw new Error(`Video troppo lungo (${Math.round(duration)} s): il massimo è circa ${max} s`);
  }

  // Long clips get a small budget, which looks better at a lower resolution.
  const maxHeight = budget < 1_000_000 ? 480 : VIDEO_MAX_HEIGHT;
  const scale = Math.min(1, maxHeight / track.displayHeight, VIDEO_MAX_WIDTH / track.displayWidth);
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  const width = even(track.displayWidth * scale);
  const height = even(track.displayHeight * scale);
  const bitrate = Math.min(budget, Math.round(width * height * 30 * VIDEO_BITS_PER_PIXEL));

  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new BufferTarget(),
  });
  const conversion = await Conversion.init({
    input,
    output,
    video: { width, height, fit: "fill", codec: "avc", bitrate, forceTranscode: true },
    audio: { discard: true },
    showWarnings: false,
  });
  if (!conversion.isValid) throw new Error("Questo browser non riesce a convertire il video");
  if (onProgress) conversion.onProgress = onProgress;
  await conversion.execute();

  const buffer = output.target.buffer;
  if (!buffer) throw new Error("Conversione del video non riuscita");
  if (buffer.byteLength > VIDEO_MAX_BYTES) throw new Error("Il video convertito è troppo pesante");
  return {
    blob: new Blob([buffer], { type: "video/mp4" }),
    ext: "mp4",
    width,
    height,
    video: true,
  };
}

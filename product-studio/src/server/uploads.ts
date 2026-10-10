import "server-only";
import sharp, { type Metadata } from "sharp";
import { HttpError } from "./http";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ACCEPTED = new Set(["jpeg", "png", "webp", "avif", "tiff", "heif", "gif"]);

/**
 * Validates an uploaded image by decoding it (not trusting the extension or
 * MIME type) and normalizes it: EXIF orientation applied, sRGB, bounded size,
 * and all metadata (including GPS location) stripped for privacy.
 */
export async function normalizeUpload(file: File, maxEdge = 6000) {
  if (!file || typeof file.arrayBuffer !== "function") throw new HttpError(400, "No file was uploaded.");
  if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, "That image is larger than 25 MB. Please upload a smaller file.");
  if (file.size === 0) throw new HttpError(400, "The uploaded file is empty.");
  const input = Buffer.from(await file.arrayBuffer());
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: 100_000_000 }).metadata();
  } catch {
    throw new HttpError(415, "We couldn't read that file. Please upload a JPG, PNG or WebP photo.");
  }
  if (!meta.format || !ACCEPTED.has(meta.format)) {
    throw new HttpError(415, "Unsupported image format. Please upload a JPG, PNG or WebP photo.");
  }
  if ((meta.width ?? 0) < 64 || (meta.height ?? 0) < 64) {
    throw new HttpError(422, "This image is too small. Please upload a photo at least 64×64 pixels (ideally 1000px or more).");
  }
  const hasAlpha = Boolean(meta.hasAlpha);
  try {
    const pipeline = sharp(input, { limitInputPixels: 100_000_000, animated: false })
      .rotate()
      .resize(maxEdge, maxEdge, { fit: "inside", withoutEnlargement: true })
      .toColourspace("srgb");
    const data = hasAlpha
      ? await pipeline.png({ compressionLevel: 8 }).toBuffer()
      : await pipeline.jpeg({ quality: 95, mozjpeg: true, chromaSubsampling: "4:4:4" }).toBuffer();
    const out = await sharp(data).metadata();
    return {
      data,
      mime: hasAlpha ? ("image/png" as const) : ("image/jpeg" as const),
      width: out.width ?? 0,
      height: out.height ?? 0,
      originalName: file.name?.slice(0, 200) ?? "photo",
    };
  } catch {
    throw new HttpError(415, "We couldn't process that image. If it's a HEIC photo, please export it as JPG first.");
  }
}

export function nameFromFile(filename: string) {
  const base = filename.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
  if (!base || /^(img|dsc|image|photo|pxl)\s?\d+/i.test(base)) return "Untitled product";
  return base.slice(0, 80);
}

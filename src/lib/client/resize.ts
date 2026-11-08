export interface DecodedImage {
  width: number;
  height: number;
  source: unknown;
}

/** The two canvas steps, kept apart so the size maths can be tested without a real canvas. */
export interface CanvasFactory {
  decode(file: Blob): Promise<DecodedImage>;
  render(source: unknown, width: number, height: number, quality: number): Promise<Blob>;
}

/** Fits the longest edge into `maxEdge`, keeps the aspect ratio, never upscales. */
export function scaledSize(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) {
    return { width, height };
  }
  const ratio = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}

export const browserCanvas: CanvasFactory = {
  async decode(file) {
    const bitmap = await createImageBitmap(file);
    return { width: bitmap.width, height: bitmap.height, source: bitmap };
  },
  async render(source, width, height, quality) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (context === null) {
      throw new Error('This browser cannot resize photos');
    }
    context.drawImage(source as ImageBitmap, 0, 0, width, height);
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not prepare the photo'))), 'image/jpeg', quality);
    });
  },
};

/** Scales a photo down to a JPEG whose longest edge is at most `maxEdge`. */
export async function resizeToJpeg(
  file: Blob,
  maxEdge = 1600,
  quality = 0.85,
  factory: CanvasFactory = browserCanvas,
): Promise<Blob> {
  const decoded = await factory.decode(file);
  if (!(decoded.width > 0 && decoded.height > 0)) {
    throw new Error('Could not read the photo');
  }
  const size = scaledSize(decoded.width, decoded.height, maxEdge);
  return factory.render(decoded.source, size.width, size.height, quality);
}

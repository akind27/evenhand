// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { resizeToJpeg, scaledSize, type CanvasFactory } from '@/lib/client/resize';

/** A fake canvas: it reports a fixed source size and remembers what size it was asked to draw. */
function fakeFactory(width: number, height: number) {
  const calls: Array<{ width: number; height: number; quality: number }> = [];
  const factory: CanvasFactory = {
    async decode() {
      return { width, height, source: {} };
    },
    async render(_source, outWidth, outHeight, quality) {
      calls.push({ width: outWidth, height: outHeight, quality });
      return new Blob(['jpeg'], { type: 'image/jpeg' });
    },
  };
  return { factory, calls };
}

describe('resizeToJpeg', () => {
  it('never upscales an 800px image', async () => {
    const { factory, calls } = fakeFactory(800, 600);
    const out = await resizeToJpeg(new Blob(['x']), 1600, 0.85, factory);
    expect(calls).toEqual([{ width: 800, height: 600, quality: 0.85 }]);
    expect(out.type).toBe('image/jpeg');
  });

  it('scales 4000x3000 to 1600x1200', async () => {
    const { factory, calls } = fakeFactory(4000, 3000);
    await resizeToJpeg(new Blob(['x']), 1600, 0.85, factory);
    expect(calls).toEqual([{ width: 1600, height: 1200, quality: 0.85 }]);
  });

  it('keeps the aspect ratio of a tall photo', () => {
    expect(scaledSize(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it('never returns a zero-sized edge', () => {
    expect(scaledSize(10000, 1, 1600)).toEqual({ width: 1600, height: 1 });
  });

  it('rejects a source with no size', async () => {
    const { factory } = fakeFactory(0, 0);
    await expect(resizeToJpeg(new Blob(['x']), 1600, 0.85, factory)).rejects.toThrow(/read the photo/i);
  });
});

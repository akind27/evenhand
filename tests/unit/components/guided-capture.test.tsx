// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GuidedCapture } from '@/components/shop/GuidedCapture';
import type { PhotoRef } from '@/lib/domain/types';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const photo: PhotoRef = { id: 'p1', phase: 'pickup', angle: 'front', url: '/p1.jpg', sha256: 'a'.repeat(64), takenAt: '2026-11-08T10:00:00Z', source: 'camera' };

vi.mock('@/lib/client/use-mode', () => ({
  useMode: () => ({ payments: 'fake', ai: 'recorded', storage: 'local' }),
  isDemo: () => true,
}));

describe('GuidedCapture sample photos', () => {
  it('uploads a sample photo byte for byte, so its fingerprint matches the recorded AI answers', async () => {
    const original = new Uint8Array([255, 216, 255, 224, 1, 2, 3, 4, 5, 250, 251, 255, 217]);
    const calls: Array<[string, RequestInit | undefined]> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push([url, init]);
        if (url.startsWith('/demo/')) {
          // A browser-realm Blob, as a real fetch would give (FormData in jsdom rejects Node's own Blob).
          return { ok: true, blob: async () => new Blob([original], { type: 'image/jpeg' }) } as unknown as Response;
        }
        return new Response(JSON.stringify({ ok: true, data: { photo: { id: 'p9' }, check: { usable: true, reason: 'ok' } } }), { status: 200 });
      }),
    );
    render(<GuidedCapture handoverId="h1" phase="pickup" existing={[]} sampleSet="pickup" demoShop />);
    fireEvent.click(screen.getByRole('button', { name: 'Use sample photo' }));
    await waitFor(() => expect(calls.some(([url]) => url.includes('/photos'))).toBe(true));
    const upload = calls.find(([url]) => url.includes('/photos'));
    const sent = (upload?.[1]?.body as FormData).get('file') as Blob;
    const bytes = await new Promise<Uint8Array>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.readAsArrayBuffer(sent);
    });
    expect(Array.from(bytes)).toEqual(Array.from(original));
  });
});

describe('GuidedCapture: one primary action', () => {
  const four = (['front', 'back', 'left', 'right'] as const).map((angle) => ({ ...photo, id: `p-${angle}`, angle }));
  const okChecks = Object.fromEntries(four.map((p) => [p.id, { usable: true, reason: 'Clear', overridden: false, recorded: false, personVisible: false }]));

  it('while a side is still missing, taking the photo is the one primary button', () => {
    const { container } = render(<GuidedCapture handoverId="h1" phase="pickup" existing={[]} />);
    expect(container.querySelectorAll('.btn-primary')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Take front photo' }).className).toContain('btn-primary');
  });

  it('after all four photos it collapses to the thumbnails and "Retake a side", with no primary button', () => {
    const { container } = render(<GuidedCapture handoverId="h1" phase="pickup" existing={four} checks={okChecks} />);
    expect(container.querySelectorAll('.btn-primary')).toHaveLength(0);
    expect(screen.queryByText('All four photos are done')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Retake front/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Retake a side' })).toBeTruthy();
    expect(container.querySelectorAll('ol button')).toHaveLength(4);
  });

  it('retaking a side shows a plain, not primary, retake button', () => {
    const { container } = render(<GuidedCapture handoverId="h1" phase="pickup" existing={four} checks={okChecks} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retake a side' }));
    expect(screen.getByRole('button', { name: 'Retake front' }).className).not.toContain('btn-primary');
    expect(container.querySelectorAll('.btn-primary')).toHaveLength(0);
  });
});

describe('GuidedCapture', () => {
  it('says when a photo check was a recorded answer for a sample photo (C1)', () => {
    const sample = { ...photo, source: 'sample' as const };
    render(
      <GuidedCapture
        handoverId="h1"
        phase="pickup"
        existing={[sample]}
        checks={{ p1: { usable: false, reason: 'Too dark', overridden: false, recorded: true, personVisible: false } }}
      />,
    );
    expect(within(screen.getByRole('status')).getByText('Recorded AI answer for the sample photos (claude-opus-5-5)')).toBeTruthy();
  });

  it('offers "Use anyway" after two failed tries as the server counts them, also after a reload (M13)', () => {
    render(
      <GuidedCapture
        handoverId="h1"
        phase="pickup"
        existing={[photo]}
        checks={{ p1: { usable: false, reason: 'Too dark', overridden: false, recorded: false, personVisible: false } }}
        photoTries={{ 'pickup:front': 2 }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Use anyway' })).toBeTruthy();
  });

  it('never offers "Use anyway" for a photo with a person as the main subject (M13)', () => {
    render(
      <GuidedCapture
        handoverId="h1"
        phase="pickup"
        existing={[photo]}
        checks={{ p1: { usable: false, reason: 'Please photograph only the vehicle.', overridden: false, recorded: false, personVisible: true } }}
        photoTries={{ 'pickup:front': 5 }}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Use anyway' })).toBeNull();
  });

  it('announces the photo check result inside a status region', () => {
    render(
      <GuidedCapture
        handoverId="h1"
        phase="pickup"
        existing={[photo]}
        checks={{ p1: { usable: false, reason: 'The photo is blurry', overridden: false, recorded: false, personVisible: false } }}
      />,
    );
    const region = screen.getByRole('status');
    expect(within(region).getByText(/This photo cannot be used/)).toBeTruthy();
    expect(within(region).getByText(/The photo is blurry/)).toBeTruthy();
  });

  it('says "Not checked by AI" for a photo accepted without a check', () => {
    render(
      <GuidedCapture
        handoverId="h1"
        phase="pickup"
        existing={[photo]}
        checks={{ p1: { usable: true, reason: 'Demo mode: photo accepted without an AI check', overridden: false, recorded: false, personVisible: false } }}
      />,
    );
    // The accepted front photo moves the flow on to the next side; tap the front box to look at it again.
    fireEvent.click(screen.getByRole('button', { name: /^Front, done$/ }));
    expect(within(screen.getByRole('status')).getByText('Not checked by AI')).toBeTruthy();
  });
});

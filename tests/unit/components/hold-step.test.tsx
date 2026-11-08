// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HoldStep } from '@/components/renter/HoldStep';
import * as api from '@/lib/client/api';

vi.mock('@/lib/client/api', async (original) => ({
  ...(await original<typeof import('@/lib/client/api')>()),
  createHoldOrder: vi.fn(),
  authorizeHold: vi.fn(),
}));

// The real PayPal script is never loaded in tests. These stand-ins record what HoldStep hands to the SDK.
const sdk = vi.hoisted(() => ({
  options: null as Record<string, unknown> | null,
  buttons: null as Record<string, (...args: never[]) => unknown> | null,
}));
vi.mock('@paypal/react-paypal-js', () => ({
  PayPalScriptProvider: ({ options, children }: { options: Record<string, unknown>; children: ReactNode }) => {
    sdk.options = options;
    return <div data-testid="paypal-provider">{children}</div>;
  },
  PayPalButtons: (props: Record<string, (...args: never[]) => unknown>) => {
    sdk.buttons = props;
    return <div data-testid="paypal-buttons" />;
  },
}));

const base = { handoverId: 'h1', amountCents: 15000, token: 'tok', lang: 'en' as const };

beforeEach(() => {
  sdk.options = null;
  sdk.buttons = null;
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('HoldStep in demo mode (no client id)', () => {
  it('shows the demo button, the demo stamp and the money line, and loads no PayPal script', () => {
    render(<HoldStep {...base} clientId={null} onDone={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Simulate PayPal hold (demo mode)' })).toBeTruthy();
    expect(screen.getByRole('img', { name: /demo mode/i })).toBeTruthy();
    expect(screen.queryByTestId('paypal-provider')).toBeNull();
  });

  it('puts the demo hold button in the bottom action bar as the one primary action', () => {
    const { container } = render(<HoldStep {...base} clientId={null} onDone={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Simulate PayPal hold (demo mode)' });
    expect(button.className).toContain('btn-primary');
    expect(button.closest('.action-bar')).not.toBeNull();
    expect(container.querySelectorAll('.btn-primary')).toHaveLength(1);
  });

  it('creates the order, then authorizes that order, then tells the page', async () => {
    vi.mocked(api.createHoldOrder).mockResolvedValue({ orderId: 'order-1' });
    vi.mocked(api.authorizeHold).mockResolvedValue({} as api.HandoverView);
    const onDone = vi.fn();
    render(<HoldStep {...base} clientId={null} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Simulate PayPal hold (demo mode)' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(api.createHoldOrder).toHaveBeenCalledWith('h1', 'tok');
    expect(api.authorizeHold).toHaveBeenCalledWith('h1', 'tok', 'order-1');
  });

  it('stays disabled after success, so a second tap does not create another order', async () => {
    vi.mocked(api.createHoldOrder).mockResolvedValue({ orderId: 'order-1' });
    vi.mocked(api.authorizeHold).mockResolvedValue({} as api.HandoverView);
    const onDone = vi.fn();
    render(<HoldStep {...base} clientId={null} onDone={onDone} />);
    const button = screen.getByRole('button') as HTMLButtonElement;
    fireEvent.click(button);
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    const after = screen.getByRole('button') as HTMLButtonElement;
    expect(after.disabled).toBe(true);
    fireEvent.click(after);
    expect(api.createHoldOrder).toHaveBeenCalledTimes(1);
  });

  it('HoldStep shows nothing charged message on error', async () => {
    vi.mocked(api.createHoldOrder).mockRejectedValue(new api.ApiError('boom', 502, 'PAYMENT'));
    const onDone = vi.fn();
    render(<HoldStep {...base} clientId={null} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Simulate PayPal hold (demo mode)' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('PayPal could not complete the hold. Nothing was charged.');
    expect(onDone).not.toHaveBeenCalled();
  });

  it('says the link is not valid on a 403', async () => {
    vi.mocked(api.createHoldOrder).mockRejectedValue(new api.ApiError('You are not allowed to do this', 403, 'FORBIDDEN'));
    render(<HoldStep {...base} clientId={null} onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Simulate PayPal hold (demo mode)' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('This link is not valid on this device. Ask the shop to show the QR code again.');
  });

  it('writes the demo stamp in the renter language', () => {
    render(<HoldStep {...base} lang="de" clientId={null} onDone={vi.fn()} />);
    expect(screen.getByRole('img', { name: 'DEMO-MODUS' })).toBeTruthy();
  });

  it('writes the hold button in the renter language', () => {
    render(<HoldStep {...base} lang="de" clientId={null} onDone={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'PayPal-Reservierung simulieren (Demo-Modus)' })).toBeTruthy();
  });
});

describe('HoldStep in real mode', () => {
  it('gives PayPal the client id, euro and authorize, and hides the demo button', () => {
    render(<HoldStep {...base} clientId="client-123" onDone={vi.fn()} />);
    expect(sdk.options).toEqual({ clientId: 'client-123', currency: 'EUR', intent: 'authorize' });
    expect(screen.getByTestId('paypal-buttons')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /simulate/i })).toBeNull();
  });

  it('createOrder asks our server for the order id; onApprove authorizes it', async () => {
    vi.mocked(api.createHoldOrder).mockResolvedValue({ orderId: 'order-9' });
    vi.mocked(api.authorizeHold).mockResolvedValue({} as api.HandoverView);
    const onDone = vi.fn();
    render(<HoldStep {...base} clientId="client-123" onDone={onDone} />);
    const buttons = sdk.buttons as unknown as {
      createOrder: () => Promise<string>;
      onApprove: (data: { orderID: string }) => Promise<void>;
    };
    await expect(buttons.createOrder()).resolves.toBe('order-9');
    await act(async () => {
      await buttons.onApprove({ orderID: 'order-9' });
    });
    expect(api.authorizeHold).toHaveBeenCalledWith('h1', 'tok', 'order-9');
    expect(onDone).toHaveBeenCalled();
  });

  it('clears an old error when a new order starts', async () => {
    vi.mocked(api.createHoldOrder).mockResolvedValue({ orderId: 'order-2' });
    render(<HoldStep {...base} clientId="client-123" onDone={vi.fn()} />);
    const buttons = sdk.buttons as unknown as { onError: (e: object) => void; createOrder: () => Promise<string> };
    act(() => buttons.onError({}));
    expect(await screen.findByRole('alert')).toBeTruthy();
    await act(async () => {
      await (sdk.buttons as unknown as typeof buttons).createOrder();
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the nothing-charged message when PayPal errors or the buyer cancels', async () => {
    render(<HoldStep {...base} clientId="client-123" onDone={vi.fn()} />);
    const buttons = sdk.buttons as unknown as { onError: (e: object) => void; onCancel: () => void };
    act(() => buttons.onError({}));
    expect((await screen.findByRole('alert')).textContent).toBe('PayPal could not complete the hold. Nothing was charged.');
    cleanup();
    render(<HoldStep {...base} clientId="client-123" onDone={vi.fn()} />);
    const again = sdk.buttons as unknown as { onCancel: () => void };
    act(() => again.onCancel());
    expect((await screen.findByRole('alert')).textContent).toBe('PayPal could not complete the hold. Nothing was charged.');
  });
});

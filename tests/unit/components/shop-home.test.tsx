// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShopHome } from '@/components/shop/ShopHome';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/client/use-mode', () => ({
  useMode: () => ({ payments: 'fake', ai: 'recorded', storage: 'local' }),
  isDemo: () => true,
}));
vi.mock('@/lib/client/use-polling', () => ({
  usePolling: (url: string) =>
    url.endsWith('/handovers')
      ? { data: { handovers: [] }, error: null, refresh: vi.fn() }
      : { data: { shop: { name: 'Demo Rentals', depositRules: [{ itemType: '125cc scooter' }] } }, error: null, refresh: vi.fn() },
}));

afterEach(cleanup);

describe('ShopHome: the empty-list line', () => {
  it('shows "No handovers yet" on the empty list and hides it while the new-handover form is open', () => {
    render(<ShopHome shopId="s1" />);
    expect(screen.getByText('No handovers yet. Tap New handover to start.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'New handover' }));
    expect(screen.queryByText('No handovers yet. Tap New handover to start.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('No handovers yet. Tap New handover to start.')).toBeTruthy();
  });
});

describe('ShopHome: one primary action per state', () => {
  it('shows New handover as the only primary button before the form is open', () => {
    const { container } = render(<ShopHome shopId="s1" />);
    expect(container.querySelectorAll('.btn-primary')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'New handover' }).closest('.action-bar')).not.toBeNull();
  });

  it('with the form open, Start handover is the pinned primary tied to the form, and Cancel is plain', () => {
    const { container } = render(<ShopHome shopId="s1" />);
    fireEvent.click(screen.getByRole('button', { name: 'New handover' }));
    const start = screen.getByRole('button', { name: 'Start handover' });
    expect(start.closest('.action-bar')).not.toBeNull();
    expect(start.className).toContain('btn-primary');
    expect(start.getAttribute('type')).toBe('submit');
    expect(start.getAttribute('form')).toBe('new-handover');
    expect(document.getElementById('new-handover')?.tagName).toBe('FORM');
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel.className).not.toContain('btn-primary');
    expect(container.querySelectorAll('.btn-primary')).toHaveLength(1);
  });
});

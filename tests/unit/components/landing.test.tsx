// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Home from '@/app/page';
import HowItWorks from '@/app/how-it-works/page';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { SealedRecord } from '@/components/landing/LandingSections';
import { SOURCE_URL } from '@/lib/site';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/client/use-mode', () => ({
  useMode: () => ({ payments: 'fake', ai: 'recorded', storage: 'local' }),
  isDemo: () => true,
}));

afterEach(cleanup);

describe('landing sample record (M12)', () => {
  it('labels the value in the sample strip as the photo fingerprint, not a record seal', () => {
    const fingerprint = 'c90fdffbe8f0f70ce4d3eca6d57517b096093de09a87df4615633d6f3ec4b157';
    render(<SealedRecord fingerprint={fingerprint} />);
    expect(screen.getByText('The strip ends with the photo fingerprint, not a record seal.')).toBeTruthy();
    expect(screen.getByRole('note').getAttribute('aria-label')).toContain('C90FDFFBE8F0F70C');
  });
});

describe('landing page', () => {
  it('has the headline, the demo button and a way to the how-it-works page', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Keep your passport. Keep the peace.');
    expect(screen.getByRole('button', { name: 'Try the demo' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'How it works' }).getAttribute('href')).toBe('/how-it-works');
  });

  it('has a labelled comparison slider that works with the keyboard and says what it shows', () => {
    render(<Home />);
    const slider = screen.getByLabelText('Compare pickup and return') as HTMLInputElement;
    expect(slider.type).toBe('range');
    expect(slider.getAttribute('aria-valuetext')).toMatch(/pickup/i);
    fireEvent.change(slider, { target: { value: '40' } });
    expect(slider.getAttribute('aria-valuetext')).toMatch(/40/);
  });

  it('opens in the middle with the new mark, its box and the charge stamp already in view', () => {
    render(<Home />);
    const slider = screen.getByLabelText('Compare pickup and return') as HTMLInputElement;
    expect(slider.value).toBe('50');
    expect(screen.getByTestId('proof-box')).toBeTruthy();
    expect(screen.getByRole('img', { name: /charged €20\.00/i })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/New mark revealed.*€20\.00/);
  });

  it('hides the charge stamp when the divider covers the box, and shows it again when it is uncovered', () => {
    render(<Home />);
    const slider = screen.getByLabelText('Compare pickup and return') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '90' } });
    expect(screen.queryByRole('img', { name: /charged €20\.00/i })).toBeNull();
    fireEvent.change(slider, { target: { value: '20' } });
    expect(screen.getByRole('img', { name: /charged €20\.00/i })).toBeTruthy();
  });

  it('says the example is an example, and keeps the heading and the eyebrow short on a phone', () => {
    render(<Home />);
    expect(screen.getByText(/^Example: new since pickup/)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).className).toContain('text-4xl');
    expect(screen.getByRole('heading', { level: 1 }).className).toContain('sm:text-5xl');
    expect(document.querySelector('.field-label')?.textContent).toBe('Deposit / ΕΓΓΥΗΣΗ');
  });

  it('keeps the demo stamp out of the row that holds the name and the headline', () => {
    render(<Home />);
    const stamp = screen.getByRole('img', { name: /demo mode/i });
    expect(stamp.closest('[data-testid="hero-stamp"]')?.className).toContain('absolute');
  });

  it('labels the demo photos and the AI', () => {
    render(<Home />);
    expect(screen.getAllByText(/AI-generated demo photo/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/AI-assisted — a person decides any charge/).length).toBeGreaterThan(0);
  });

  it('links the three sources safely and in the exact places given', () => {
    render(<Home />);
    const hrefs = [
      'https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/778664/Holidaying_In_GREECE_pdfA.pdf',
      'https://motorbike.tcs.ch/en/rental/piaggio-beverly-300-gaios-greece-y0933p58we',
      'https://skootnow.pages.dev/guide/scooter-rental-scams-thailand',
    ];
    for (const href of hrefs) {
      const link = document.querySelector(`a[href="${href}"]`);
      expect(link, href).not.toBeNull();
      expect(link?.getAttribute('rel')).toContain('noopener');
    }
  });

  it('says plainly that PayPal is sandbox only and marks the next steps as next', () => {
    render(<Home />);
    expect(screen.getAllByText(/PayPal sandbox only/).length).toBeGreaterThan(0);
    expect(screen.getByText('Next steps for the same flow. None of these are live yet.')).toBeTruthy();
    expect(screen.getByText('Rental listings still accept a passport as the deposit.')).toBeTruthy();
  });
});

describe('landing footer', () => {
  it('links the public repository, and hides the Source code link when the address is empty', () => {
    expect(SOURCE_URL).toBe('https://github.com/akind27/evenhand');
    const { rerender } = render(<LandingFooter sourceUrl="" />);
    expect(screen.queryByRole('link', { name: 'Source code' })).toBeNull();
    expect(screen.getByText(/MIT licence/)).toBeTruthy();
    rerender(<LandingFooter sourceUrl="https://example.com/evenhand" />);
    const link = screen.getByRole('link', { name: 'Source code' });
    expect(link.getAttribute('href')).toBe('https://example.com/evenhand');
    expect(link.getAttribute('rel')).toContain('noopener');
  });
});

describe('how it works page', () => {
  it('numbers its steps once: by the field labels, not also in the headings', () => {
    render(<HowItWorks />);
    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent ?? '');
    expect(headings.some((text) => /^\d\./.test(text))).toBe(false);
    expect(headings).toContain('The shop photographs the item');
  });

  it('explains the AI limits and the PayPal flow', () => {
    render(<HowItWorks />);
    expect(screen.getByRole('heading', { name: 'What the AI does / does not do' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'What the AI does not do' })).toBeTruthy();
    expect(screen.getAllByText(/29 days/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/3 days/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Try the demo' })).toBeTruthy();
  });
});

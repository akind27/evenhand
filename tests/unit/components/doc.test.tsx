// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Guilloche, guillochePaths } from '@/components/doc/Guilloche';
import { MachineStrip, machineLines } from '@/components/doc/MachineStrip';
import { Stamp } from '@/components/doc/Stamp';
import { isNotChecked } from '@/lib/client/photo-check';

afterEach(cleanup);

describe('Stamp', () => {
  it('shows its label and is announced as one image with a label', () => {
    render(<Stamp kind="charged" label="CHARGED €20.00" at="2026-11-08T10:15:00Z" />);
    const stamp = screen.getByRole('img');
    expect(stamp.getAttribute('aria-label')).toContain('CHARGED €20.00');
    expect(stamp.textContent).toContain('CHARGED €20.00');
    expect(stamp.textContent).toContain('08 NOV 2026');
  });

  it('may break a label only at a space or after a hyphen (DEMO-MODUS), never in the middle of a word', () => {
    const { container } = render(<Stamp kind="demo" label="DEMO-MODUS" round />);
    const label = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(label.innerHTML).toBe('DEMO-<wbr>MODUS');
    expect(label.textContent).toBe('DEMO-MODUS');
    cleanup();
    const plain = render(<Stamp kind="held" label="HELD" />);
    expect((plain.container.querySelector('[aria-hidden="true"]') as HTMLElement).innerHTML).toBe('HELD');
  });

  it('the round stamp keeps its shape: a wide variant only for a very long word', () => {
    const short = render(<Stamp kind="demo" label="DEMO MODE" round />);
    expect(short.container.firstElementChild?.className).toContain('stamp-round');
    expect(short.container.firstElementChild?.className).not.toContain('stamp-round-wide');
    cleanup();
    const long = render(<Stamp kind="demo" label="ΛΕΙΤΟΥΡΓΙΑ ΕΠΙΔΕΙΞΗΣ" round />);
    expect(long.container.firstElementChild?.className).toContain('stamp-round-wide');
  });

  it('turns the same way every time for the same label', () => {
    const { container, rerender } = render(<Stamp kind="held" label="HELD" />);
    const first = (container.firstElementChild as HTMLElement).style.transform;
    rerender(<Stamp kind="held" label="HELD" />);
    expect((container.firstElementChild as HTMLElement).style.transform).toBe(first);
  });
});

describe('MachineStrip', () => {
  const data = { id: 'ab12-cd', itemRef: 'abc 123', depositCents: 15000, status: 'active', lastHash: '0123456789abcdef0123456789abcdef' };

  it('builds two uppercase lines from the given data only', () => {
    const lines = machineLines(data);
    expect(lines).toHaveLength(2);
    expect(lines[0].startsWith('EH<<HANDOVER<<<AB12-CD<<<ABC<123<<<')).toBe(true);
    expect(lines[1].startsWith('15000EUR<ACTIVE<0123456789ABCDEF<<<')).toBe(true);
    for (const line of lines) {
      expect(line).toBe(line.toUpperCase());
      expect(line.endsWith('<')).toBe(true);
    }
    expect(lines[0].length).toBe(lines[1].length);
  });

  it('sizes its text from the width of its box, with normal letter spacing, so a whole line fits on a phone', () => {
    const { container } = render(<MachineStrip {...data} />);
    const note = screen.getByRole('note');
    expect(note.style.fontSize).toContain('cqw');
    expect(note.className).toContain('tracking-normal');
    expect(note.parentElement?.className).toContain('container-type:inline-size');
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
  });

  it('renders both lines', () => {
    const { container } = render(<MachineStrip {...data} />);
    expect(container.textContent).toContain('EH<<HANDOVER<<<AB12-CD');
    expect(container.textContent).toContain('15000EUR<ACTIVE');
  });
});

describe('Guilloche', () => {
  it('draws the same curves for the same seed and different curves for another seed', () => {
    expect(guillochePaths('h1')).toEqual(guillochePaths('h1'));
    expect(guillochePaths('h1')).not.toEqual(guillochePaths('h2'));
  });

  it('draws four curves by default and as many as asked for the landing rosette, all closed curves', () => {
    expect(guillochePaths('h1')).toHaveLength(4);
    const rosette = guillochePaths('evenhand-landing', 9);
    expect(rosette).toHaveLength(9);
    for (const path of rosette) {
      expect(path.d.startsWith('M')).toBe(true);
      expect(path.d.endsWith('Z')).toBe(true);
      // Curves only: every segment is a line to a point of the curve, never a drawn border or key pattern.
      expect(path.d).not.toMatch(/[HVhv]/);
    }
  });

  it('is decoration only', () => {
    const { container } = render(<Guilloche seed="h1" />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('isNotChecked', () => {
  it('flags photos accepted without an AI check', () => {
    expect(isNotChecked('AI limit reached — photo accepted without a check')).toBe(true);
    expect(isNotChecked('AI check unavailable — photo accepted without a check')).toBe(true);
    expect(isNotChecked('Demo mode: photo accepted without an AI check')).toBe(true);
    expect(isNotChecked('The photo is blurry')).toBe(false);
  });
});

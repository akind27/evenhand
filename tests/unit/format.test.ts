import { describe, expect, it } from 'vitest';
import { euro, euroIn, eurosToCents } from '@/lib/client/format';
import { greekUpper } from '@/lib/client/greek';

describe('euroIn', () => {
  it('writes Greek amounts the Greek way and keeps shop screens in en-IE', () => {
    expect(euroIn(5000, 'el').replace(/[  ]/g, ' ')).toBe('50,00 €');
    expect(euroIn(5000, 'de').replace(/[  ]/g, ' ')).toBe('50,00 €');
    expect(euroIn(5000, 'en')).toBe('€50.00');
    expect(euro(5000)).toBe('€50.00');
  });
});

describe('greekUpper', () => {
  it('drops the accents on capitals', () => {
    expect(greekUpper('Κατάστημα')).toBe('ΚΑΤΑΣΤΗΜΑ');
    expect(greekUpper('Εγγύηση')).toBe('ΕΓΓΥΗΣΗ');
    expect(greekUpper('Αντικείμενο')).toBe('ΑΝΤΙΚΕΙΜΕΝΟ');
  });

  it('keeps the diaeresis, which is not an accent', () => {
    expect(greekUpper('προϊόν')).toBe('ΠΡΟΪΟΝ');
    expect(greekUpper('Κατάστημα')).toBe('ΚΑΤΑΣΤΗΜΑ');
    // acute and diaeresis together on one letter become a plain diaeresis
    expect(greekUpper('ΐ')).toBe('Ϊ');
    expect(greekUpper('ΰ')).toBe('Ϋ');
  });

  it('leaves accents on non-Greek letters alone', () => {
    expect(greekUpper('café')).toBe('CAFÉ');
  });
});

describe('eurosToCents', () => {
  it('reads plain amounts with a point or a comma', () => {
    expect(eurosToCents('12,50')).toBe(1250);
    expect(eurosToCents('12.5')).toBe(1250);
    expect(eurosToCents('150')).toBe(15000);
  });

  it('rejects anything else', () => {
    for (const text of ['12abc', '', '-3', '1.234', '1e3', ' 12']) {
      expect(eurosToCents(text)).toBeNaN();
    }
  });
});

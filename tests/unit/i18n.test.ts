import { describe, expect, it } from 'vitest';
import { detectLang, LANGS, RENTER_KEYS, t, tf } from '@/lib/i18n';

describe('renter translations', () => {
  it('every key exists in all five languages and none is empty', () => {
    expect(LANGS).toEqual(['en', 'el', 'de', 'it', 'fr']);
    for (const lang of LANGS) {
      for (const key of RENTER_KEYS) {
        expect(t(lang, key).trim(), `${lang}.${key}`).not.toBe('');
      }
    }
  });

  it('uses the same placeholders in every language', () => {
    const names = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of RENTER_KEYS) {
      for (const lang of LANGS) {
        expect(names(t(lang, key)), `${lang}.${key}`).toEqual(names(t('en', key)));
      }
    }
  });

  it('has a space after every full stop, comma, semicolon, question mark and exclamation mark', () => {
    for (const lang of LANGS) {
      for (const key of RENTER_KEYS) {
        expect(t(lang, key), `${lang}.${key}`).not.toMatch(/[.,;?!](?=\p{L})/u);
      }
    }
  });

  it('keeps the exact English lines the product promises', () => {
    expect(t('en', 'holdIntro')).toBe('Your money stays in your account. PayPal only reserves it.');
    expect(t('en', 'resultClean')).toBe('No new damage. Your deposit is released.');
    expect(t('en', 'holdError')).toBe('PayPal could not complete the hold. Nothing was charged.');
    expect(t('en', 'statusReviewing')).toBe('The shop is checking the photos');
  });

  it('fills placeholders', () => {
    expect(tf('en', 'acceptButton', { amount: '€20.00' })).toBe('Accept €20.00');
    expect(tf('de', 'acceptButton', { amount: '€20.00' })).toBe('€20.00 akzeptieren');
  });

  it('picks the browser language only when it is supported', () => {
    expect(detectLang('el-GR')).toBe('el');
    expect(detectLang('de')).toBe('de');
    expect(detectLang('ja-JP')).toBe('en');
    expect(detectLang(undefined)).toBe('en');
  });
});

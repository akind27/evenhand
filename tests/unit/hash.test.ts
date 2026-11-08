import { describe, expect, it } from 'vitest';
import { canonicalJson, randomToken, sha256Hex } from '@/lib/evidence/hash';

describe('canonicalJson', () => {
  it('sorts object keys recursively and removes whitespace', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it('keeps array order and encodes strings, booleans and null', () => {
    expect(canonicalJson([3, 'x', true, null])).toBe('[3,"x",true,null]');
  });

  it('throws on undefined inside an object', () => {
    expect(() => canonicalJson({ a: undefined })).toThrow();
  });

  it('throws on undefined inside an array', () => {
    expect(() => canonicalJson([1, undefined])).toThrow();
  });

  it('throws on non-finite numbers', () => {
    expect(() => canonicalJson({ n: NaN })).toThrow();
    expect(() => canonicalJson([Infinity])).toThrow();
  });
});

describe('sha256Hex', () => {
  it('matches the known SHA-256 test vector for "abc"', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('accepts bytes as well as strings', () => {
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(sha256Hex('abc'));
  });
});

describe('randomToken', () => {
  it('returns a base64url string of 32 characters by default', () => {
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it('returns different values on each call', () => {
    expect(randomToken()).not.toBe(randomToken());
  });
});

import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '@/lib/config';

const PAYPAL_KEYS = { PAYPAL_CLIENT_ID: 'test-client-id', PAYPAL_CLIENT_SECRET: 'test-client-secret' };

describe('loadConfig', () => {
  it('uses fake payments and recorded AI when keys are missing', () => {
    const config = loadConfig({});
    expect(config.mode).toEqual({ payments: 'fake', ai: 'recorded', storage: 'local' });
    expect(config.paypal).toBeUndefined();
    expect(config.anthropicApiKey).toBeUndefined();
  });

  it('uses PayPal sandbox when both PayPal keys are set', () => {
    const config = loadConfig({ ...PAYPAL_KEYS });
    expect(config.mode.payments).toBe('paypal-sandbox');
    expect(config.paypal?.baseUrl).toBe('https://api-m.sandbox.paypal.com');
    expect(config.paypal?.clientId).toBe('test-client-id');
  });

  it('refuses a live PayPal environment', () => {
    expect(() =>
      loadConfig({ PAYPAL_ENV: 'live', PAYPAL_CLIENT_ID: 'a', PAYPAL_CLIENT_SECRET: 'b' }),
    ).toThrow(ConfigError);
    expect(() =>
      loadConfig({ PAYPAL_ENV: 'live', PAYPAL_CLIENT_ID: 'a', PAYPAL_CLIENT_SECRET: 'b' }),
    ).toThrow(/sandbox/);
  });

  it('refuses only one of the two PayPal keys', () => {
    expect(() => loadConfig({ PAYPAL_CLIENT_ID: 'a' })).toThrow(ConfigError);
    expect(() => loadConfig({ PAYPAL_CLIENT_SECRET: 'b' })).toThrow(ConfigError);
  });

  it('uses blob storage only when BLOB_READ_WRITE_TOKEN is set', () => {
    expect(loadConfig({}).mode.storage).toBe('local');
    const config = loadConfig({ BLOB_READ_WRITE_TOKEN: 'test-blob-token' });
    expect(config.mode.storage).toBe('blob');
    expect(config.blobToken).toBe('test-blob-token');
  });

  it('defaults aiDailyCallLimit to 300 and rejects non-numbers', () => {
    expect(loadConfig({}).aiDailyCallLimit).toBe(300);
    expect(loadConfig({ AI_DAILY_CALL_LIMIT: '50' }).aiDailyCallLimit).toBe(50);
    expect(() => loadConfig({ AI_DAILY_CALL_LIMIT: 'lots' })).toThrow(ConfigError);
  });

  it('treats empty values from .env.example as unset', () => {
    const config = loadConfig({ PAYPAL_CLIENT_ID: '', PAYPAL_CLIENT_SECRET: '', ANTHROPIC_API_KEY: '' });
    expect(config.mode).toEqual({ payments: 'fake', ai: 'recorded', storage: 'local' });
  });

  it('switches AI to Claude when ANTHROPIC_API_KEY is set', () => {
    const config = loadConfig({ ANTHROPIC_API_KEY: 'test-anthropic-key' });
    expect(config.mode.ai).toBe('claude');
    expect(config.anthropicApiKey).toBe('test-anthropic-key');
  });

  it('leaves the public base URL unset when PUBLIC_BASE_URL is missing, so links use the request origin (I6a)', () => {
    expect(loadConfig({}).publicBaseUrl).toBeNull();
    expect(loadConfig({ PUBLIC_BASE_URL: 'https://evenhand.example' }).publicBaseUrl).toBe('https://evenhand.example');
    // A trailing slash would make "//r/<id>" links.
    expect(loadConfig({ PUBLIC_BASE_URL: 'https://evenhand.example/' }).publicBaseUrl).toBe('https://evenhand.example');
  });

  it('trims pasted values, such as a key copied with a trailing newline (M9)', () => {
    const config = loadConfig({
      PAYPAL_CLIENT_ID: '  test-client-id\n',
      PAYPAL_CLIENT_SECRET: 'test-client-secret ',
      ANTHROPIC_API_KEY: '\ttest-anthropic-key ',
      BLOB_READ_WRITE_TOKEN: ' test-blob-token\r\n',
      PUBLIC_BASE_URL: ' https://evenhand.example ',
      AI_DAILY_CALL_LIMIT: ' 50 ',
    });
    expect(config.paypal).toMatchObject({ clientId: 'test-client-id', clientSecret: 'test-client-secret' });
    expect(config.anthropicApiKey).toBe('test-anthropic-key');
    expect(config.blobToken).toBe('test-blob-token');
    expect(config.publicBaseUrl).toBe('https://evenhand.example');
    expect(config.aiDailyCallLimit).toBe(50);
  });

  it('on Vercel, refuses fake payments and local storage with a clear message (I6b, I6c)', () => {
    const hosted = { VERCEL: '1' };
    expect(() => loadConfig(hosted)).toThrow(ConfigError);
    expect(() => loadConfig({ ...hosted, BLOB_READ_WRITE_TOKEN: 'test-blob-token' })).toThrow(/PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET/);
    expect(() => loadConfig({ ...hosted, ...PAYPAL_KEYS })).toThrow(/BLOB_READ_WRITE_TOKEN/);
    expect(() => loadConfig(hosted)).toThrow(/keyless demo mode is for local runs/);
    const ok = loadConfig({ ...hosted, ...PAYPAL_KEYS, BLOB_READ_WRITE_TOKEN: 'test-blob-token' });
    expect(ok.mode).toEqual({ payments: 'paypal-sandbox', ai: 'recorded', storage: 'blob' });
  });
});

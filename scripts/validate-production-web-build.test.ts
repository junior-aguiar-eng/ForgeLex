import { describe, expect, it } from 'vitest';
import { validateBuildConfig, validateBundleContent } from './validate-production-web-build.mjs';

const config = {
  VITE_SUPABASE_URL: 'https://abcdefghijabcdefghij.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_public-example',
  EXPECTED_SUPABASE_PROJECT_REF: 'abcdefghijabcdefghij',
};

describe('production web build validation', () => {
  it('requires an HTTPS Supabase project and matching expected project ref', () => {
    expect(validateBuildConfig(config).projectRef).toBe('abcdefghijabcdefghij');
    expect(() => validateBuildConfig({ ...config, VITE_SUPABASE_URL: '' })).toThrow('VITE_SUPABASE_URL');
    expect(() => validateBuildConfig({ ...config, VITE_SUPABASE_URL: 'http://localhost:54321' })).toThrow(
      'VITE_SUPABASE_URL',
    );
    expect(() =>
      validateBuildConfig({ ...config, VITE_SUPABASE_URL: 'https://user:pass@abcdefghijabcdefghij.supabase.co' }),
    ).toThrow('VITE_SUPABASE_URL');
    expect(() =>
      validateBuildConfig({ ...config, VITE_SUPABASE_URL: 'https://abcdefghijabcdefghij.supabase.co:8443' }),
    ).toThrow('VITE_SUPABASE_URL');
    expect(() => validateBuildConfig({ ...config, EXPECTED_SUPABASE_PROJECT_REF: 'other' })).toThrow('project ref');
  });

  it('accepts only a publishable key and does not reveal rejected values', () => {
    expect(() =>
      validateBuildConfig({ ...config, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_sensitive-value' }),
    ).toThrow('publishable');
    expect(() => validateBuildConfig({ ...config, VITE_SUPABASE_PUBLISHABLE_KEY: '' })).toThrow('publishable');
  });

  it('requires URL and publishable key in the built bundle', () => {
    const js = `const url="${config.VITE_SUPABASE_URL}";const key="${config.VITE_SUPABASE_PUBLISHABLE_KEY}";`;
    expect(() => validateBundleContent(js, validateBuildConfig(config))).not.toThrow();
    expect(() => validateBundleContent('const app=true;', validateBuildConfig(config))).toThrow('bundle');
  });

  it('rejects secret keys and service_role JWTs in the built bundle', () => {
    const valid = validateBuildConfig(config);
    const js = `${config.VITE_SUPABASE_URL} ${config.VITE_SUPABASE_PUBLISHABLE_KEY}`;
    expect(() => validateBundleContent(`${js} sb_secret_sensitive-value`, valid)).toThrow('secret');
    const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
    expect(() => validateBundleContent(`${js} aaa.${payload}.bbb`, valid)).toThrow('service_role');
  });
});

import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Exercise the actual transitive dependency used by the frontend build.
const webRequire = createRequire(resolve('apps/web/package.json'));
const tailwindRequire = createRequire(webRequire.resolve('tailwindcss/package.json'));
const globRequire = createRequire(tailwindRequire.resolve('fast-glob/package.json'));
const matcherRequire = createRequire(globRequire.resolve('micromatch/package.json'));
const braces = matcherRequire('braces');
const deepPattern = '{'.repeat(4_000) + 'a' + '}'.repeat(4_000);

describe('build dependency brace depth protection', () => {
  // Removing the local depth guard would expose uncontrolled recursion again.
  it.each(['compile', 'expand', 'stringify'])('rejects deep strings in %s before stack exhaustion', (method) => {
    expect(() => braces[method](deepPattern)).toThrow(/maximum depth/);
  });

  it.each(['compile', 'expand', 'stringify'])('rejects deep AST input in %s', (method) => {
    const ast = braces.parse(deepPattern);
    expect(() => braces[method](ast)).toThrow(/maximum depth/);
  });

  it('protects the default entry point and expansion mode', () => {
    expect(() => braces(deepPattern)).toThrow(/maximum depth/);
    expect(() => braces(deepPattern, { expand: true })).toThrow(/maximum depth/);
  });

  it('preserves ordinary globs, nesting, ranges and escaped braces', () => {
    expect(braces.compile('src/**/*.{ts,tsx}')).toBe('src/**/*.(ts|tsx)');
    expect(braces.expand('a/{b,{c,d}}')).toEqual(['a/b', 'a/c', 'a/d']);
    expect(braces.expand('item-{1..3}')).toEqual(['item-1', 'item-2', 'item-3']);
    expect(braces.compile('literal\\{a,b\\}')).toBe('literal{a,b}');
  });

  it('accepts shallow patterns with many sibling braces', () => {
    expect(braces.compile('{a,b}'.repeat(200))).toBe('(a|b)'.repeat(200));
  });

  it('does not permit increasing maxLength to bypass the depth guard', () => {
    expect(() => braces.compile(deepPattern, { maxLength: 100_000 })).toThrow(/maximum depth/);
  });
});

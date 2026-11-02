import { describe, expect, it } from 'vitest';
import { reportRequestSchema } from './index';

const valid = { need: 'validate forms', framework: 'React' };

describe('reportRequestSchema', () => {
  it('accepts need and framework without dependencies', () => {
    expect(reportRequestSchema.parse(valid)).toEqual(valid);
  });

  it('accepts dependencies with names and ranges', () => {
    const request = { ...valid, dependencies: [{ name: 'react', range: '^19.0.0' }] };
    expect(reportRequestSchema.parse(request)).toEqual(request);
  });

  it('trims the need', () => {
    expect(reportRequestSchema.parse({ ...valid, need: '  validate forms  ' }).need).toBe(
      'validate forms',
    );
  });

  it('rejects an empty need', () => {
    expect(reportRequestSchema.safeParse({ ...valid, need: '   ' }).success).toBe(false);
  });

  it('rejects a need over 500 characters', () => {
    expect(reportRequestSchema.safeParse({ ...valid, need: 'a'.repeat(501) }).success).toBe(false);
    expect(reportRequestSchema.safeParse({ ...valid, need: 'a'.repeat(500) }).success).toBe(true);
  });

  it.each([
    'Next.js',
    'React Native',
    'Nuxt',
    'Solid',
    'Express',
    'Fastify',
    'NestJS',
    'No framework',
  ])('accepts %s', (framework) => {
    expect(reportRequestSchema.safeParse({ ...valid, framework }).success).toBe(true);
  });

  it.each(['Ember', 'None'])('rejects the framework %s', (framework) => {
    expect(reportRequestSchema.safeParse({ ...valid, framework }).success).toBe(false);
  });

  it('rejects more than 200 dependencies', () => {
    const dependencies = Array.from({ length: 201 }, (_, i) => ({ name: `pkg${i}`, range: '1' }));
    expect(reportRequestSchema.safeParse({ ...valid, dependencies }).success).toBe(false);
    expect(
      reportRequestSchema.safeParse({ ...valid, dependencies: dependencies.slice(0, 200) }).success,
    ).toBe(true);
  });

  it('rejects oversized dependency names and ranges', () => {
    const longName = [{ name: 'a'.repeat(215), range: '1' }];
    const longRange = [{ name: 'react', range: '1'.repeat(101) }];
    expect(reportRequestSchema.safeParse({ ...valid, dependencies: longName }).success).toBe(false);
    expect(reportRequestSchema.safeParse({ ...valid, dependencies: longRange }).success).toBe(
      false,
    );
  });
});

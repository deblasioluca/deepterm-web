import { describe, it, expect } from 'vitest';
import { getApplePlan } from '../apple-plan';

describe('getApplePlan', () => {
  it('maps monthly pro product ID to "pro"', () => {
    expect(getApplePlan('com.deepterm.pro.monthly')).toBe('pro');
  });

  it('maps yearly pro product ID to "pro"', () => {
    expect(getApplePlan('com.deepterm.pro.yearly')).toBe('pro');
  });

  it('maps monthly team product ID to "team"', () => {
    expect(getApplePlan('com.deepterm.team.monthly')).toBe('team');
  });

  it('maps yearly team product ID to "team"', () => {
    expect(getApplePlan('com.deepterm.team.yearly')).toBe('team');
  });

  it('returns "pro" as default for unknown product ID', () => {
    expect(getApplePlan('com.deepterm.unknown')).toBe('pro');
  });

  it('returns "pro" for empty string', () => {
    expect(getApplePlan('')).toBe('pro');
  });

  it('returns "pro" for arbitrary string', () => {
    expect(getApplePlan('some.random.product')).toBe('pro');
  });
});

import { describe, it, expect } from 'vitest';
import { isPlausibleEmail, passwordStrength } from '../../packages/shared-firebase/src/auth';

describe('isPlausibleEmail', () => {
  it('accepts real-shaped emails', () => {
    expect(isPlausibleEmail('person@example.com')).toBe(true);
    expect(isPlausibleEmail('first.last+tag@sub.example.co')).toBe(true);
  });

  it('rejects obviously-fake input', () => {
    expect(isPlausibleEmail('asdf')).toBe(false);
    expect(isPlausibleEmail('no-at-sign.com')).toBe(false);
    expect(isPlausibleEmail('missing@domain')).toBe(false);
    expect(isPlausibleEmail('spaces in@email.com')).toBe(false);
    expect(isPlausibleEmail('')).toBe(false);
    expect(isPlausibleEmail('   ')).toBe(false);
  });

  it('trims surrounding whitespace before checking', () => {
    expect(isPlausibleEmail('  person@example.com  ')).toBe(true);
  });
});

describe('passwordStrength', () => {
  it('rates short, simple passwords weak', () => {
    expect(passwordStrength('abcdef')).toBe('weak');
    expect(passwordStrength('123456')).toBe('weak');
  });

  it('rates longer, mixed-case-and-digit passwords medium', () => {
    expect(passwordStrength('Password1')).toBe('medium');
  });

  it('rates long passwords with case, digit, and symbol variety strong', () => {
    expect(passwordStrength('C0rrect-Horse-Battery!')).toBe('strong');
  });

  it('never crashes on an empty password', () => {
    expect(passwordStrength('')).toBe('weak');
  });
});

import { describe, expect, it } from 'vitest';
import { comparePassword, hashPassword } from '../server/lib/auth';

describe('password hashing', () => {
  it('hashes a password and verifies the same password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(hash).toBeTypeOf('string');
    expect(hash.length).toBeGreaterThan(20);
    expect(hash).not.toBe('correct-horse-battery-staple');
    expect(await comparePassword('correct-horse-battery-staple', hash)).toBe(true);
  });

  it('rejects a mismatched password', async () => {
    const hash = await hashPassword('original-password');
    expect(await comparePassword('different-password', hash)).toBe(false);
  });

  it('is case sensitive', async () => {
    const hash = await hashPassword('MyPassword');
    expect(await comparePassword('mypassword', hash)).toBe(false);
    expect(await comparePassword('MyPassword', hash)).toBe(true);
  });

  it('produces a different hash for the same password each time (salt)', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    expect(a).not.toBe(b);
    expect(await comparePassword('same-password', a)).toBe(true);
    expect(await comparePassword('same-password', b)).toBe(true);
  });
});

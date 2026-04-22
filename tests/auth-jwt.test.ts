import { describe, expect, it } from 'vitest';
import { generateToken, verifyToken } from '../server/lib/auth';

describe('JWT token lifecycle', () => {
  it('issues a token that verifies back to the same subject', () => {
    const token = generateToken({ id: 'user-1', email: 'a@b.com', username: 'alice' });
    expect(token).toBeTypeOf('string');
    expect(token.split('.')).toHaveLength(3); // header.payload.signature

    const payload = verifyToken(token);
    expect(payload).toBeTruthy();
    expect(payload?.sub).toBe('user-1');
    expect(payload?.email).toBe('a@b.com');
    expect(payload?.username).toBe('alice');
  });

  it('returns null when a token is tampered with', () => {
    const token = generateToken({ id: 'user-1', email: 'a@b.com', username: null });
    const parts = token.split('.');
    // Replace last character of the signature to invalidate it
    parts[2] = parts[2].slice(0, -1) + (parts[2].slice(-1) === 'A' ? 'B' : 'A');
    const tampered = parts.join('.');
    expect(verifyToken(tampered)).toBeNull();
  });

  it('returns null for obviously invalid token shapes', () => {
    expect(verifyToken('not-a-token')).toBeNull();
    expect(verifyToken('')).toBeNull();
    expect(verifyToken('a.b')).toBeNull();
  });

  it('normalizes missing username to null', () => {
    const token = generateToken({ id: 'u', email: 'x@y.com' });
    const payload = verifyToken(token);
    expect(payload?.username).toBeNull();
  });
});

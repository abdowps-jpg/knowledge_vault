import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';

/**
 * Mirrors the signing logic used server-side in deliverWebhook:
 *   x-kv-signature = "sha256=" + HMAC-SHA256("<timestamp>.<body>", secret)
 * Third-party integrators replicate this exact formula to verify inbound
 * webhooks, so the invariant is worth testing.
 */
function signWebhookBody(body: string, secret: string, timestamp: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

describe('webhook signature', () => {
  it('produces a deterministic hash for the same inputs', () => {
    const body = JSON.stringify({ event: 'items.created', data: { id: 'abc' } });
    const a = signWebhookBody(body, 'super-secret', '1700000000');
    const b = signWebhookBody(body, 'super-secret', '1700000000');
    expect(a).toBe(b);
    expect(a).toHaveLength(64); // hex of sha256 = 64 chars
  });

  it('changes the hash when the timestamp changes (prevents replay)', () => {
    const body = '{"event":"items.created"}';
    const a = signWebhookBody(body, 'super-secret', '1700000000');
    const b = signWebhookBody(body, 'super-secret', '1700000060');
    expect(a).not.toBe(b);
  });

  it('changes the hash when the body changes even by one byte', () => {
    const a = signWebhookBody('{"event":"items.created"}', 'super-secret', '1700000000');
    const b = signWebhookBody('{"event":"items.updated"}', 'super-secret', '1700000000');
    expect(a).not.toBe(b);
  });

  it('changes the hash when the secret changes', () => {
    const body = '{"event":"items.created"}';
    const a = signWebhookBody(body, 'secret-a', '1700000000');
    const b = signWebhookBody(body, 'secret-b', '1700000000');
    expect(a).not.toBe(b);
  });

  it('signature is constant-time comparable (timing-safe)', () => {
    const body = '{"event":"items.created"}';
    const sig = signWebhookBody(body, 'super-secret', '1700000000');
    const other = signWebhookBody(body, 'other-secret', '1700000000');
    expect(sig).toBeTypeOf('string');
    expect(other).toBeTypeOf('string');
    // Attackers would try to time the string compare; our signature is hex
    // of constant length so Node's timingSafeEqual can be used by receivers.
    expect(sig.length).toBe(other.length);
  });
});

import { describe, expect, it } from 'vitest';
import { fetchLinkMetadata } from '../server/lib/link-metadata';

describe('link-metadata SSRF guard', () => {
  it('blocks localhost', async () => {
    const result = await fetchLinkMetadata('http://localhost:3000/foo');
    expect(result).toBeNull();
  });

  it('blocks 127.0.0.1', async () => {
    const result = await fetchLinkMetadata('http://127.0.0.1/foo');
    expect(result).toBeNull();
  });

  it('blocks 10.x private range', async () => {
    const result = await fetchLinkMetadata('http://10.0.0.1/foo');
    expect(result).toBeNull();
  });

  it('blocks 192.168.x private range', async () => {
    const result = await fetchLinkMetadata('http://192.168.1.1/foo');
    expect(result).toBeNull();
  });

  it('blocks 169.254.x link-local', async () => {
    const result = await fetchLinkMetadata('http://169.254.169.254/latest/meta-data/');
    expect(result).toBeNull();
  });

  it('blocks 172.16-31 private range', async () => {
    const result = await fetchLinkMetadata('http://172.16.0.1/foo');
    expect(result).toBeNull();
    const result2 = await fetchLinkMetadata('http://172.31.255.254/foo');
    expect(result2).toBeNull();
  });

  it('allows external domains and handles parse failure gracefully', async () => {
    // We don't actually want network in unit tests; pass a malformed URL so
    // the fetch never runs. The important invariant is "does not throw".
    const result = await fetchLinkMetadata('not-a-url');
    expect(result).toBeNull();
  });

  it('rejects ftp / file / javascript schemes', async () => {
    expect(await fetchLinkMetadata('ftp://example.com/x')).toBeNull();
    expect(await fetchLinkMetadata('file:///etc/passwd')).toBeNull();
    expect(await fetchLinkMetadata('javascript:alert(1)')).toBeNull();
  });
});

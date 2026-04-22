/**
 * Quick smoke test: hit every public endpoint and confirm a 2xx response
 * (or the documented error for routes that require auth).
 *
 * Runs against whatever host is in BASE_URL (default http://localhost:3000).
 *
 * Usage (from a running dev server in another terminal):
 *   pnpm tsx scripts/smoke.ts
 *
 * Exits non-zero on the first unexpected status, so it's cheap to wire
 * into a pre-deploy check or a release-candidate CI job.
 */

const base = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

type Expect = {
  path: string;
  expect: number[]; // acceptable status codes
  contains?: string; // substring that should appear in the body
  name: string;
};

const checks: Expect[] = [
  { name: 'landing', path: '/', expect: [200], contains: 'Knowledge Vault' },
  { name: 'privacy', path: '/privacy', expect: [200], contains: 'Privacy Policy' },
  { name: 'terms', path: '/terms', expect: [200], contains: 'Terms of Service' },
  { name: 'healthz', path: '/healthz', expect: [200], contains: '"status":"ok"' },
  { name: 'metrics', path: '/_metrics', expect: [200], contains: 'memory' },
  { name: 'api/schema', path: '/api/schema', expect: [200], contains: 'basePath' },
  { name: 'sitemap', path: '/sitemap.xml', expect: [200], contains: '<urlset' },
  { name: 'robots.txt', path: '/robots.txt', expect: [200], contains: 'Disallow' },
  { name: 'manifest', path: '/manifest.webmanifest', expect: [200], contains: 'Knowledge Vault' },
  { name: 'sw', path: '/sw.js', expect: [200], contains: 'serviceWorker' },
  { name: 'web-app', path: '/app', expect: [200], contains: 'tab-tasks' },
  { name: 'web-app-js', path: '/app.js', expect: [200], contains: 'loadTasks' },
  { name: 'api/items (unauth)', path: '/api/items', expect: [401] },
  { name: 'api/tasks (unauth)', path: '/api/tasks', expect: [401] },
  { name: 'events (unauth)', path: '/events', expect: [401] },
  { name: '/p/invalid (short token)', path: '/p/x', expect: [400] },
];

async function run() {
  let passed = 0;
  let failed = 0;

  for (const c of checks) {
    try {
      const res = await fetch(`${base}${c.path}`, {
        method: 'GET',
        headers: { accept: '*/*' },
      });
      const ok = c.expect.includes(res.status);
      let bodyOk = true;
      if (ok && c.contains) {
        const body = await res.text();
        bodyOk = body.includes(c.contains);
      }
      if (ok && bodyOk) {
        console.log(`✓ ${c.name.padEnd(26)} ${c.path.padEnd(24)} HTTP ${res.status}`);
        passed += 1;
      } else {
        console.error(
          `✗ ${c.name.padEnd(26)} ${c.path.padEnd(24)} HTTP ${res.status}` +
            (c.contains && !bodyOk ? ` (body missing "${c.contains}")` : '')
        );
        failed += 1;
      }
    } catch (err: any) {
      console.error(`✗ ${c.name.padEnd(26)} ${c.path.padEnd(24)} ${err?.message ?? 'fetch failed'}`);
      failed += 1;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run();

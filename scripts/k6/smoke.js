// k6 smoke test — confirms the deployed server responds to public endpoints.
//
// Usage:
//   k6 run scripts/k6/smoke.js
//   BASE_URL=https://knowledgevault.app k6 run scripts/k6/smoke.js
//
// Install k6 from https://k6.io. This script is a thin health-check and
// finishes in under 10 seconds — safe to run from a pre-deploy hook.

import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');

export const options = {
  vus: 1,
  duration: '5s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

const paths = [
  '/',
  '/healthz',
  '/privacy',
  '/terms',
  '/robots.txt',
  '/sitemap.xml',
  '/api/schema',
  '/manifest.webmanifest',
  '/sw.js',
];

export default function () {
  for (const p of paths) {
    const res = http.get(`${BASE}${p}`);
    check(res, {
      [`${p} 200`]: (r) => r.status === 200,
    });
  }
  sleep(1);
}

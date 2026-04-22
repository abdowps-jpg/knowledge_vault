import { publicProcedure, router } from '../trpc';

export const integrationsRouter = router({
  discover: publicProcedure.query(() => ({
    rest: {
      baseUrl: '/api',
      versioned: '/api/v1',
      authHeader: 'X-Api-Key',
      scopes: ['read', 'write', 'admin'],
      docsUrl: '/api/schema',
    },
    webhooks: {
      events: [
        'items.created',
        'items.updated',
        'items.deleted',
        'tasks.created',
        'tasks.updated',
        'tasks.deleted',
      ],
      signature: 'HMAC-SHA256 over "<timestamp>.<raw body>"',
      headers: ['x-kv-webhook-id', 'x-kv-timestamp', 'x-kv-signature'],
    },
    browserExtension: {
      name: 'Knowledge Vault Clipper',
      manifest: 3,
      source: 'extension/',
      features: ['popup capture', 'context menu', 'Alt+Shift+S quick-save'],
    },
    inbound: {
      emailToTask: {
        path: '/email/inbound',
        description:
          'POST an email envelope (from, to, subject, text, html) with the configured EMAIL_WEBHOOK_SECRET. Creates a task under the user whose inbox address matches "to".',
      },
    },
  })),
});

import { publicProcedure, router } from '../trpc';
import { z } from 'zod';

/**
 * SSO discovery + session-link scaffolding.
 *
 * Real OIDC handshake (callback, code exchange, attribute mapping) lives in
 * `server/_core/oauth.ts` and is triggered from the auth flow. This router
 * exposes the configured providers to the UI so the login screen can render
 * the right buttons without hard-coding anything.
 *
 * Enterprise SAML/OIDC binding is driven by env vars at deploy time.
 */

type ProviderKind = 'google' | 'github' | 'apple' | 'microsoft' | 'okta' | 'custom-oidc';

type Provider = {
  id: ProviderKind;
  label: string;
  configured: boolean;
  authorizationUrl?: string;
};

function readEnvProviders(): Provider[] {
  const env = (key: string) => process.env[key]?.trim();
  const base = process.env.APP_BASE_URL?.replace(/\/+$/, '') ?? '';
  const redirectFor = (id: string) => (base ? `${base}/oauth/${id}/callback` : undefined);

  const providers: Provider[] = [
    {
      id: 'google',
      label: 'Sign in with Google',
      configured: Boolean(env('GOOGLE_OAUTH_CLIENT_ID') && env('GOOGLE_OAUTH_CLIENT_SECRET')),
      authorizationUrl: redirectFor('google'),
    },
    {
      id: 'github',
      label: 'Sign in with GitHub',
      configured: Boolean(env('GITHUB_OAUTH_CLIENT_ID') && env('GITHUB_OAUTH_CLIENT_SECRET')),
      authorizationUrl: redirectFor('github'),
    },
    {
      id: 'apple',
      label: 'Sign in with Apple',
      configured: Boolean(env('APPLE_CLIENT_ID') && env('APPLE_PRIVATE_KEY')),
      authorizationUrl: redirectFor('apple'),
    },
    {
      id: 'microsoft',
      label: 'Sign in with Microsoft',
      configured: Boolean(env('MICROSOFT_CLIENT_ID') && env('MICROSOFT_CLIENT_SECRET')),
      authorizationUrl: redirectFor('microsoft'),
    },
    {
      id: 'okta',
      label: 'Sign in with Okta (SAML)',
      configured: Boolean(env('OKTA_ISSUER') && env('OKTA_CLIENT_ID')),
      authorizationUrl: redirectFor('okta'),
    },
    {
      id: 'custom-oidc',
      label: env('OIDC_PROVIDER_LABEL') ?? 'Sign in with enterprise SSO',
      configured: Boolean(env('OIDC_ISSUER_URL') && env('OIDC_CLIENT_ID')),
      authorizationUrl: redirectFor('custom-oidc'),
    },
  ];
  return providers;
}

export const ssoRouter = router({
  listProviders: publicProcedure.query(() => readEnvProviders().filter((p) => p.configured)),

  allProviders: publicProcedure.query(() => readEnvProviders()),

  discovery: publicProcedure
    .input(z.object({ issuerUrl: z.string().url() }))
    .query(async ({ input }) => {
      try {
        const url = new URL(input.issuerUrl);
        const wellKnown = `${url.origin}${url.pathname.replace(/\/$/, '')}/.well-known/openid-configuration`;
        const response = await fetch(wellKnown, {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) {
          return { ok: false, status: response.status };
        }
        const config = await response.json();
        return {
          ok: true,
          issuer: (config as any).issuer ?? null,
          authorizationEndpoint: (config as any).authorization_endpoint ?? null,
          tokenEndpoint: (config as any).token_endpoint ?? null,
          userinfoEndpoint: (config as any).userinfo_endpoint ?? null,
          jwksUri: (config as any).jwks_uri ?? null,
          scopesSupported: (config as any).scopes_supported ?? [],
        };
      } catch (err: any) {
        return { ok: false, error: err?.message ?? 'fetch_failed' };
      }
    }),
});

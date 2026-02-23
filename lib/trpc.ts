import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink, loggerLink } from '@trpc/client';
import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';
import type { AppRouter } from '../server/_core/index';

export const trpc = createTRPCReact<AppRouter>();

type GetTokenFn = () => Promise<string | null>;
type UnauthorizedHandler = () => void | Promise<void>;

let getTokenHandler: GetTokenFn | null = null;
let unauthorizedHandler: UnauthorizedHandler | null = null;
let lastAuthToken: string | null = null;
let sharedClient: ReturnType<typeof trpc.createClient> | null = null;

export function configureTRPCAuth(opts: { getToken?: GetTokenFn; onUnauthorized?: UnauthorizedHandler }) {
  getTokenHandler = opts.getToken ?? null;
  unauthorizedHandler = opts.onUnauthorized ?? null;
}

export function createTRPCClient() {
  if (sharedClient) return sharedClient;

  const isLikelyTunnelHost = (value: string): boolean => {
    return /exp\.direct|expo\.dev|ngrok|tunnel/i.test(value);
  };

  const resolveBaseUrl = (): string => {
    const envUrl = process.env.EXPO_PUBLIC_API_URL;
    if (envUrl) return envUrl;

    if (Platform.OS === 'web') {
      return 'http://localhost:3000';
    }

    const hostUri =
      (Constants.expoConfig as any)?.hostUri ??
      (Constants as any)?.manifest2?.extra?.expoClient?.hostUri ??
      (Constants as any)?.manifest?.debuggerHost;

    if (typeof hostUri === 'string' && hostUri.length > 0) {
      const host = hostUri.split(':')[0];
      if (isLikelyTunnelHost(host)) {
        console.warn(
          '[tRPC] Tunnel host detected. Set EXPO_PUBLIC_API_URL to your LAN API URL (example: http://192.168.1.10:3000).'
        );
      }
      return `http://${host}:3000`;
    }

    // Expo Go fallback: extract host from Metro script URL.
    const scriptURL = (NativeModules as any)?.SourceCode?.scriptURL as string | undefined;
    if (scriptURL) {
      const match = scriptURL.match(/https?:\/\/([^/:]+):\d+/);
      if (match?.[1]) {
        if (isLikelyTunnelHost(match[1])) {
          console.warn(
            '[tRPC] Tunnel scriptURL detected. Set EXPO_PUBLIC_API_URL to your LAN API URL (example: http://192.168.1.10:3000).'
          );
        }
        return `http://${match[1]}:3000`;
      }
    }

    return 'http://localhost:3000';
  };

  const baseUrl = resolveBaseUrl();
  const hasBearerToken = (headers: unknown): boolean => {
    if (!headers) return false;
    if (headers instanceof Headers) {
      const value = headers.get('authorization') ?? headers.get('Authorization');
      return !!value && value.toLowerCase().startsWith('bearer ');
    }
    if (Array.isArray(headers)) {
      const match = headers.find(([k]) => k.toLowerCase() === 'authorization');
      return !!match?.[1] && String(match[1]).toLowerCase().startsWith('bearer ');
    }
    if (typeof headers === 'object') {
      const record = headers as Record<string, string | undefined>;
      const value = record.authorization ?? record.Authorization;
      return !!value && value.toLowerCase().startsWith('bearer ');
    }
    return false;
  };

  sharedClient = trpc.createClient({
    links: [
      loggerLink({
        enabled: (opts) => process.env.NODE_ENV === 'development' || (opts.direction === 'down' && opts.result instanceof Error),
      }),
      httpBatchLink({
        url: `${baseUrl}/trpc`,
        headers: async () => {
          const token = getTokenHandler ? await getTokenHandler() : null;
          lastAuthToken = token;
          return {
            authorization: token ? `Bearer ${token}` : '',
          };
        },
        fetch: async (url, options) => {
          const response = await fetch(url, options);
          const sentAuthHeader = hasBearerToken(options?.headers);
          if (response.status === 401 && sentAuthHeader) {
            console.warn('[tRPC] Received 401 from API:', url);
            await unauthorizedHandler?.();
          } else if (response.status === 401) {
            console.warn('[tRPC] Received 401 without auth header (public request):', url);
          }
          return response;
        },
      }),
    ],
  });
  return sharedClient;
}

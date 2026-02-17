import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../server/_core/index';

export const trpc = createTRPCReact<AppRouter>();

type GetTokenFn = () => Promise<string | null>;
type UnauthorizedHandler = () => void;

let getTokenHandler: GetTokenFn | null = null;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export function configureTRPCAuth(opts: { getToken?: GetTokenFn; onUnauthorized?: UnauthorizedHandler }) {
  getTokenHandler = opts.getToken ?? null;
  unauthorizedHandler = opts.onUnauthorized ?? null;
}

export function createTRPCClient() {
  const baseUrl = 'http://localhost:3000';

  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${baseUrl}/trpc`,
        headers: async () => {
          const token = getTokenHandler ? await getTokenHandler() : null;
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
        fetch: async (url, options) => {
          const response = await fetch(url, options);
          if (response.status === 401) {
            unauthorizedHandler?.();
          }
          return response;
        },
      }),
    ],
  });
}

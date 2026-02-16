import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../server/_core/index';

export const trpc = createTRPCReact<AppRouter>();

export function createTRPCClient() {
  const baseUrl = 'http://localhost:3000';

  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${baseUrl}/trpc`,
      }),
    ],
  });
}

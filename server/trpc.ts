import { initTRPC } from '@trpc/server';

export const createTRPCContext = () => ({});
type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

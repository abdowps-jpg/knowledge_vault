import { initTRPC } from '@trpc/server';
import { TRPCError } from '@trpc/server';
import superjson from 'superjson';
import type { Request, Response } from 'express';

type CoreContext = {
  req: Request;
  res: Response;
  user: {
    id?: string | null;
    openId?: string;
    email?: string | null;
    name?: string | null;
  } | null;
};

const t = initTRPC.context<CoreContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
export const adminProcedure = protectedProcedure;

import { initTRPC } from '@trpc/server';
import { TRPCError } from '@trpc/server';
import type { Request, Response } from 'express';

export type AuthenticatedUser = {
  id: string;
  email: string;
  username?: string | null;
};

export const createTRPCContext = (opts: { req: Request; res: Response; user?: AuthenticatedUser | null }) => ({
  req: opts.req,
  res: opts.res,
  user: opts.user ?? null,
});
type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './server/schema/index.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: './local.db'
  },
  verbose: true,
  strict: true,
});
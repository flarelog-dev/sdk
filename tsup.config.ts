import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/frameworks/react.tsx',
    'src/frameworks/express.ts',
    'src/frameworks/hono.ts',
    'src/frameworks/next.ts',
    'src/frameworks/cf-workers.ts',
    'src/frameworks/tanstack-start.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  splitting: true,
  sourcemap: true,
});

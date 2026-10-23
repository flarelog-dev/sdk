import { defineConfig } from 'tsup';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string };

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/ai/index.ts',
    'src/frameworks/react.tsx',
    'src/frameworks/express.ts',
    'src/frameworks/hono.ts',
    'src/frameworks/next.ts',
    'src/frameworks/cf-workers.ts',
    'src/frameworks/vercel.ts',
    'src/frameworks/tanstack-start.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  splitting: true,
  sourcemap: true,
  // Reported as telemetry.sdk.version on every batch.
  define: { __FLARELOG_SDK_VERSION__: JSON.stringify(version) },
});

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { compileModule } from 'svelte/compiler';
import { transformWithEsbuild } from 'vite';

const uiRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    {
      name: 'svelte-runes-tests',
      enforce: 'pre',
      async transform(source, id) {
        if (!id.endsWith('.svelte.ts')) return;
        const { code } = await transformWithEsbuild(source, id, { loader: 'ts' });
        return compileModule(code, { filename: id, generate: 'client' }).js;
      },
    },
  ],
  resolve: {
    alias: {
      $lib: path.resolve(uiRoot, 'src/lib'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

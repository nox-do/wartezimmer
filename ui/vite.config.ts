import { sveltekit } from '@sveltejs/kit/vite';
import type { IncomingMessage } from 'node:http';
import type { ClientRequest } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '');

  process.env.VITE_API_BASE ??= env.VITE_API_BASE ?? '';

  const devApiProxy =
    process.env.VITE_DEV_API_PROXY ?? env.VITE_DEV_API_PROXY ?? 'http://127.0.0.1:8080';

  const sseProxy = {
    target: devApiProxy,
    changeOrigin: true,
    timeout: 0,
    proxyTimeout: 0,
    configure: (proxy: {
      on(
        event: 'proxyReq',
        listener: (proxyReq: ClientRequest, req: IncomingMessage) => void,
      ): void;
      on(
        event: 'proxyRes',
        listener: (proxyRes: IncomingMessage, req: IncomingMessage) => void,
      ): void;
    }) => {
      proxy.on('proxyReq', (proxyReq) => {
        proxyReq.setHeader('Accept-Encoding', 'identity');
      });
      proxy.on('proxyRes', (proxyRes, req) => {
        if (!(req.url ?? '').includes('/stream')) {
          return;
        }

        delete proxyRes.headers['content-length'];
        proxyRes.headers['cache-control'] = 'no-cache, no-transform';
        proxyRes.headers['x-accel-buffering'] = 'no';
      });
    },
  };

  return {
    envDir: repoRoot,
    plugins: [sveltekit()],
    server: {
      port: 5180,
      proxy: {
        '/api/v1/queue/stream': sseProxy,
        '/api/v1/ops/stream': sseProxy,
        '/api/v1/ops/device/stream': sseProxy,
        '/api': {
          target: devApiProxy,
          changeOrigin: true,
        },
        '/internal': {
          target: devApiProxy,
          changeOrigin: true,
        },
      },
    },
  };
});

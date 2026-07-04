import { buildApp } from './app.js';
import { registerUiStaticRoutes } from './routes/ui-static-routes.js';

const host = process.env.HOST ?? '0.0.0.0';
const port = Number(process.env.PORT ?? 8080);

async function start(): Promise<void> {
  try {
    const app = await buildApp();
    await registerUiStaticRoutes(app);
    await app.listen({ host, port });
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

void start();

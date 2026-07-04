import { buildSandboxApp } from './app.js';
import { getSandboxConfig } from './sandbox-config.js';

const config = getSandboxConfig();
const app = buildSandboxApp(config);

async function start(): Promise<void> {
  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void start();

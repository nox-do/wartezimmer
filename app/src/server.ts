import { buildApp } from './app.js';
import { buildMaintenanceApp } from './maintenance-app.js';
import { registerUiStaticRoutes } from './routes/ui-static-routes.js';

const host = process.env.HOST ?? '0.0.0.0';
const port = Number(process.env.PORT ?? 8080);
const maintenanceHost = process.env.MAINTENANCE_HOST ?? '127.0.0.1';
const maintenancePort = Number(process.env.MAINTENANCE_PORT ?? 8082);
const maintenanceEnabled = process.env.MAINTENANCE_ENABLED?.trim() !== 'false';
// Direct/local start: bind maintenance to loopback. Docker Compose sets MAINTENANCE_HOST=0.0.0.0
// so port publish reaches the listener. LAN boundary: host publish 127.0.0.1:8082:8082 only
// (other compose containers may reach 0.0.0.0:8082 internally — acceptable for this stack).

async function start(): Promise<void> {
  try {
    const app = await buildApp();
    await registerUiStaticRoutes(app);
    await app.listen({ host, port });

    if (maintenanceEnabled) {
      const maintenanceApp = await buildMaintenanceApp();
      await maintenanceApp.listen({ host: maintenanceHost, port: maintenancePort });
      console.log(`Maintenance API: http://${maintenanceHost}:${maintenancePort}`);
    }
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

void start();

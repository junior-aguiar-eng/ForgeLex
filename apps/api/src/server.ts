import { buildApp } from './app.js';
import { resolveProductionRuntime, startupErrorForLog } from './config/production-runtime.js';
import { installGracefulShutdown } from './graceful-shutdown.js';

const runtime = process.env.NODE_ENV === 'production'
  ? resolveProductionRuntime(process.env)
  : {
      port: Number.parseInt(process.env.PORT ?? '3001', 10),
      host: process.env.HOST ?? '0.0.0.0',
    };

async function start() {
  try {
    const app = await buildApp();
    await app.listen({ port: runtime.port, host: runtime.host });
    installGracefulShutdown(app);
    console.log(`[FORGELEX API] Servidor iniciado com sucesso em http://${runtime.host}:${runtime.port}`);
  } catch (err) {
    console.error('[FORGELEX API] Erro fatal ao iniciar:', startupErrorForLog(err));
    process.exit(1);
  }
}

start();

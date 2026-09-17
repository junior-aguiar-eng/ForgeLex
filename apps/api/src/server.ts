import { buildApp } from './app.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

async function start() {
  const app = await buildApp();
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`[FORGELEX API] Servidor iniciado com sucesso em http://${HOST}:${PORT}`);
  } catch (err) {
    console.error('[FORGELEX API] Erro fatal ao iniciar:', err);
    process.exit(1);
  }
}

start();

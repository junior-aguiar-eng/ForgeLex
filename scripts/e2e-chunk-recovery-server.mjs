import Fastify from '../apps/api/node_modules/fastify/fastify.js';
import { resolve } from 'node:path';
import { registerStaticWeb } from '../apps/api/dist/static-web.js';

const app = Fastify();
await registerStaticWeb(app, resolve('apps/web/dist'));
await app.listen({ host: '127.0.0.1', port: 3141 });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
}

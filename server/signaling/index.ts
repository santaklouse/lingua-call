import { createSignalingServer } from './signaling';

const port = Number(process.env.PORT ?? 8787);
const server = createSignalingServer(port);
console.info(`[signal] listening on :${server.port}`);

const shutdown = (): void => {
  server.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

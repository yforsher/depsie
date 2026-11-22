import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { openDatabase } from './db/client.js';
import { log } from './log.js';
import { cloudTraceExport, startTracing } from './tracing.js';

const port = Number(process.env.PORT ?? 3000);
// Same relative path from src/ (dev) and dist/ (built).
const clientDir = fileURLToPath(new URL('../../client/dist', import.meta.url));

const { spanProcessors, attributes } = cloudTraceExport(process.env);
const tracing = startTracing(spanProcessors, attributes);
// Cloud Run sends SIGTERM before stopping an instance: send the spans still waiting in the batch.
process.on('SIGTERM', () => {
  void tracing.shutdown().finally(() => process.exit(0));
});

await openDatabase();
createApp(clientDir).listen(port, (error) => {
  if (error) throw error;
  log(`Server listening on http://localhost:${port}`);
});

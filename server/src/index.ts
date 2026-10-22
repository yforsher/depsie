import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3000);
// Same relative path from src/ (dev) and dist/ (built).
const clientDir = fileURLToPath(new URL('../../client/dist', import.meta.url));

createApp(clientDir).listen(port, (error) => {
  if (error) throw error;
  console.log(`Server listening on http://localhost:${port}`);
});

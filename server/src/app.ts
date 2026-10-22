import express from 'express';

export function createApp(clientDir: string) {
  const app = express();

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(express.static(clientDir));

  // Client routes get the app shell; unknown API paths fall through to a 404.
  app.get('/{*splat}', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile('index.html', { root: clientDir });
  });

  return app;
}

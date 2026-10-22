import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3000);

createApp().listen(port, (error) => {
  if (error) throw error;
  console.log(`Server listening on http://localhost:${port}`);
});

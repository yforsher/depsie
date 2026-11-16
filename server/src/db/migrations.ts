import { fileURLToPath } from 'node:url';

// server/drizzle, resolved from this file so it works from src/ (tsx) and dist/ (node).
export const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

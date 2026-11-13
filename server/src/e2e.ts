import { fakeFetch } from './fixtureResponses.js';

// The e2e smoke test server: the real server, with every outside call (npm, deps.dev, OSV,
// GitHub, jsDelivr, OpenRouter) answered from the fixtures, so CI needs no keys and costs nothing.
// Excluded from the build, so it is never compiled or run in production.
globalThis.fetch = fakeFetch as typeof fetch;
await import('./index.js');

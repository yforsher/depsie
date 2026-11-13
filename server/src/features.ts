import { type Feature, features } from 'shared';

// FEATURE_<NAME>=on turns a flag on; unset or any other value leaves it off, so production stays
// off unless a flag is set on purpose. Local development turns them on in .env.
// createApp() registers a flagged route only when its flag is on, so while it is off the route
// does not exist and gets the same 404 as any unknown path, however it is mounted.
export function enabledFeatures(env: Record<string, string | undefined>): Feature[] {
  return features.filter(
    (name) => env[`FEATURE_${name.toUpperCase().replaceAll('-', '_')}`] === 'on',
  );
}

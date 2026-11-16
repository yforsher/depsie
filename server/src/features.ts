import { type Feature, features } from 'shared';

// true: on for everyone; false: off; a list: on only for signed-in users with those GitHub logins.
export type FlagValue = boolean | string[];
export type Flags = Record<Feature, FlagValue>;

// FEATURE_<NAME>=on turns a flag on; unset, empty or off leaves it off, so production stays off
// unless a flag is set on purpose. Local development turns them on in .env. Any other value of
// FEATURE_ACCOUNTS is a comma-separated list of logins, so sign-in can be tried on the live URL by
// a few users first; any other value of other flags leaves them off.
// createApp() registers a flagged route only when its flag is not off, so while it is off the
// route does not exist and gets the same 404 as any unknown path, however it is mounted.
export function readFlags(env: Record<string, string | undefined>): Flags {
  return Object.fromEntries(
    features.map((name) => {
      const value = env[`FEATURE_${name.toUpperCase().replaceAll('-', '_')}`] ?? '';
      if (value === 'on') return [name, true];
      if (name !== 'accounts' || value === '' || value === 'off') return [name, false];
      return [name, value.split(',').map((login) => login.trim().toLowerCase())];
    }),
  ) as Flags;
}

export function isOn(value: FlagValue, login?: string) {
  return Array.isArray(value) ? !!login && value.includes(login.toLowerCase()) : value;
}

export function enabledFor(flags: Flags, login?: string): Feature[] {
  return features.filter((name) => isOn(flags[name], login));
}

import { betterAuth, type BetterAuthPlugin } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { GithubProfile } from 'better-auth/social-providers';
import { db } from './db/client.js';
import * as schema from './db/schema.js';
import { isOn, readFlags } from './features.js';

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

async function github<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'depsie' },
  });
  if (!res.ok) throw new Error(`GitHub ${path} failed with status ${res.status}`);
  return res.json() as Promise<T>;
}

// Replaces Better Auth's GitHub lookup: the same two calls, keeping only the verified primary
// email and the login. The profile is returned as data, whose id Better Auth uses as the
// account's identity.
async function gitHubUserInfo({ accessToken }: { accessToken?: string }) {
  const profile = await github<GithubProfile>('/user', accessToken!);
  // While accounts is a list of logins, anyone else is refused here, before Better Auth creates a
  // user or a session.
  if (!isOn(readFlags(process.env).accounts, profile.login)) return null;
  const emails = await github<GitHubEmail[]>('/user/emails', accessToken!);
  const primary = emails.find((email) => email.primary && email.verified);
  if (!primary) return null;
  return {
    user: {
      name: profile.name || profile.login,
      email: primary.email,
      image: profile.avatar_url,
      emailVerified: true,
      githubLogin: profile.login,
    },
    data: profile,
  };
}

// Depsie never calls GitHub for the user after sign-in, so the tokens are not kept.
const withoutTokens = async <T extends object>(account: T) => ({
  data: {
    ...account,
    accessToken: null,
    refreshToken: null,
    idToken: null,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
  },
});

// Built only when the accounts flag is on or a list of logins (see app.ts), so with the flag off
// Better Auth and its secrets are not needed. Tests pass Better Auth's testUtils plugin.
export function createAuth(plugins: BetterAuthPlugin[] = []) {
  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db(), { provider: 'pg', schema }),
    // No profile editing in Depsie; githubLogin, which decides the login-list flag, must only
    // come from GitHub at sign-in.
    disabledPaths: ['/update-user'],
    user: {
      additionalFields: {
        githubLogin: { type: 'string', required: false },
      },
      deleteUser: { enabled: true },
    },
    socialProviders: {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        // Only the email addresses: name, login and avatar are public profile data, readable with
        // any token. No private profile data and no repository access, even if Better Auth's
        // defaults change.
        disableDefaultScope: true,
        scope: ['user:email'],
        getUserInfo: gitHubUserInfo,
        // Refresh the profile at each sign-in, so a GitHub rename reaches the account page and the
        // login the accounts flag checks.
        overrideUserInfoOnSignIn: true,
      },
    },
    databaseHooks: {
      account: {
        create: { before: withoutTokens },
        update: { before: withoutTokens },
      },
      // No IP addresses are stored, and no browser details either. Better Auth still reads the IP
      // for its rate limit; this only keeps it out of the session row.
      session: {
        create: {
          before: async (session) => ({ data: { ...session, ipAddress: null, userAgent: null } }),
        },
      },
    },
    plugins,
  });
}

export type Auth = ReturnType<typeof createAuth>;

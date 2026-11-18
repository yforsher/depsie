import { testUtils } from 'better-auth/plugins';
import { createAuth } from './auth.js';

// A signed-in user created directly with Better Auth's test helpers: no GitHub round trip.
export async function signedInUser(login = 'alice') {
  const { test } = await createAuth([testUtils()]).$context;
  const user = test.createUser({ name: 'Alice', email: `${login}@example.com` });
  await test.saveUser({ ...user, githubLogin: login, image: 'https://avatars.example/a.png' });
  const { headers } = await test.login({ userId: user.id });
  return { id: user.id, cookie: headers.get('cookie')! };
}

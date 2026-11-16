FROM node:22-slim

WORKDIR /app
COPY . .

RUN corepack enable
RUN pnpm install --frozen-lockfile
RUN pnpm build
RUN CI=true pnpm install --prod --frozen-lockfile

# Only after the build, which needs the dev dependencies. Turns on Better Auth's rate limit on the
# sign-in routes and its refusal to start without BETTER_AUTH_SECRET, and keeps error details out of
# Express's error pages.
ENV NODE_ENV=production

CMD ["node", "server/dist/index.js"]

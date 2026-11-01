FROM node:22-slim

WORKDIR /app
COPY . .

RUN corepack enable
RUN pnpm install --frozen-lockfile
RUN pnpm build
RUN CI=true pnpm install --prod --frozen-lockfile

CMD ["node", "server/dist/index.js"]

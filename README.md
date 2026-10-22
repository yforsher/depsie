# dependency-decision

Helps developers pick the right npm package: describe the need, pick a framework, and get a ranked
comparison of candidates grounded in fetched public data.

## Run

Requires Node 22+ and pnpm.

```sh
pnpm install
cp .env.example .env   # then fill in the keys
pnpm dev
```

To run the built app, as in production:

```sh
pnpm build
pnpm --filter server start   # http://localhost:3000
```

## Test

```sh
pnpm lint
pnpm test
```

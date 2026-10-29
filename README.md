# Depsie

Helps developers pick the right npm package: describe the need, pick a framework, and get a ranked
comparison of candidates grounded in fetched public data.

## Run

Requires Node 22+ and pnpm.

```sh
pnpm install
cp .env.example .env   # then fill in the keys
pnpm dev
```

Analytics are written to a Neon Postgres database: create the table once by running
`server/sql/schema.sql` in the Neon SQL editor. Without `DATABASE_URL` the app still works and
logs each failed analytics write.

To run the built app, as in production:

```sh
pnpm build
pnpm --filter server start   # http://localhost:3000
```

## Privacy

The server stores anonymous usage counts only: visits and reports with the time, country,
framework, status, and AI tokens and cost. Unique visitors per day come from a hash of the IP with a
salt that is replaced daily and never stored. No cookies, no IP addresses, and never the need text,
dependency names or the report. See `server/sql/schema.sql`.

This product includes GeoLite2 data created by MaxMind, available from https://www.maxmind.com.

## Test

```sh
pnpm lint
pnpm test
```

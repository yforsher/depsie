# Hosting

Chosen: Google Cloud Run. The database is Neon Postgres, outside the host.

## Cloud Run service settings

Deploy with continuous deployment from GitHub (Cloud Build, Google Cloud Buildpacks). The Node.js
buildpack installs with pnpm from `pnpm-lock.yaml`, runs the root `build` script, then starts the
root `start` script (`node server/dist/index.js`), which reads the keys from environment variables
instead of `.env`. Cloud Run sets `PORT` (8080).

| Setting           | Value                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Source            | This GitHub repo, branch `master`; build type Google Cloud Buildpacks                                                          |
| Region            | A Tier 1 region (for example `europe-west1` or `us-central1`); Tier 2 costs about 1.4 times more                               |
| Authentication    | Allow public access                                                                                                            |
| Billing           | Instance-based, so the analytics writes after a response still get CPU (request-based billing gives CPU only during a request) |
| Minimum instances | 0 scales to zero, with a cold start of a few seconds; 1 keeps an instance warm                                                 |
| Maximum instances | 1, so every request reaches the instance that holds the in-memory rate limit and salt                                          |
| Startup CPU boost | On, for shorter cold starts                                                                                                    |
| CPU and memory    | 1 vCPU, 512 MiB                                                                                                                |
| Request timeout   | Default 300 seconds, above the 90 second report deadline                                                                       |
| Secrets           | `OPENROUTER_API_KEY`, `GITHUB_TOKEN`, `DATABASE_URL` (Neon `main` branch), from Secret Manager                                 |
| Health check      | Startup probe on HTTP `/api/health`                                                                                            |
| Budget alert      | In Cloud Billing, since pay-as-you-go has no hard cap                                                                          |

Cost: with minimum instances 0, usage at this traffic stays within Cloud Run's monthly allowance
(240,000 vCPU-seconds and 450,000 GiB-seconds with instance-based billing). Minimum instances 1
adds about $8 to $10 a month. The OpenRouter key should be used only for this app and have a
spending cap, so a leaked key can only cost a fixed amount.

The client IP: Google's front end appends it as the last `X-Forwarded-For` entry, so Express
`trust proxy` is `1` (community sources; confirm on the live URL that a spoofed `X-Forwarded-For`
does not change the rate limit).

## Sources

- [Cloud Run pricing](https://cloud.google.com/run/pricing)
- [Cloud Run billing settings](https://docs.cloud.google.com/run/docs/configuring/billing-settings)
- [Cloud Run container runtime contract](https://docs.cloud.google.com/run/docs/container-contract)
- [Cloud Run request timeout](https://docs.cloud.google.com/run/docs/configuring/request-timeout)
- [Cloud Run continuous deployment](https://docs.cloud.google.com/run/docs/continuous-deployment)
- [Cloud Run release notes (build script runs by default)](https://docs.cloud.google.com/run/docs/release-notes?hl=en)
- [Express trust proxy on Cloud Run (community pull request)](https://github.com/Menshawy97/FORJD/pull/192)

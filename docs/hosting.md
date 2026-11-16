# Hosting

Chosen: Google Cloud Run. The database is Neon Postgres, outside the host.

## Cloud Run service settings

Deploy with continuous deployment from GitHub (Cloud Build). Cloud Build builds the root
`Dockerfile`: Node 22, pnpm install, build, then production dependencies only. The container runs
`node server/dist/index.js`, which reads the keys from environment variables instead of `.env`.
Cloud Run sets `PORT` (8080). Buildpacks do not work here: the image they built had no server
packages (`Cannot find package 'express'`) and ran Node 26.

The trigger runs `cloudbuild.yaml`: build, push, migrate, deploy. The migrate step runs
`server/dist/db/migrate.js` in the image just built, with `DATABASE_URL` from Secret Manager, so
pending migrations reach the Neon `production` branch before the new revision; a failed
migration ends the build and the previous revision keeps serving. The trigger was first created
by Cloud Run with an inline build; to point it at the file, in Cloud Build, Triggers, edit the
trigger and set Configuration to "Cloud Build configuration file", location `cloudbuild.yaml`.
The trigger's service account (the default compute account, also used by the Cloud Run service)
already reads the `DATABASE_URL` secret.

| Setting           | Value                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Source            | This GitHub repo, branch `master`; build type Dockerfile                                                                       |
| Region            | A Tier 1 region (for example `europe-west1` or `us-central1`); Tier 2 costs about 1.4 times more                               |
| Authentication    | Allow public access                                                                                                            |
| Billing           | Instance-based, so the analytics writes after a response still get CPU (request-based billing gives CPU only during a request) |
| Minimum instances | 0 scales to zero, with a cold start of a few seconds; 1 keeps an instance warm                                                 |
| Maximum instances | 1, so every request reaches the instance that holds the in-memory rate limit and salt                                          |
| Startup CPU boost | On, for shorter cold starts                                                                                                    |
| CPU and memory    | 1 vCPU, 512 MiB                                                                                                                |
| Request timeout   | Default 300 seconds, above the 90 second report deadline                                                                       |
| Secrets           | `OPENROUTER_API_KEY`, `GITHUB_TOKEN`, `DATABASE_URL` (Neon `production` branch), from Secret Manager                           |
| Health check      | Startup probe on HTTP `/api/health`                                                                                            |
| Budget alert      | Monthly alert in Cloud Billing, since pay-as-you-go has no hard cap                                                            |

Cost: with minimum instances 0, usage at this traffic stays within Cloud Run's monthly allowance
(240,000 vCPU-seconds and 450,000 GiB-seconds with instance-based billing). Minimum instances 1
adds about $8 to $10 a month. The OpenRouter key should be used only for this app and have a
spending cap, so a leaked key can only cost a fixed amount.

The client IP: Google's front end appends it as the last `X-Forwarded-For` entry, so Express
`trust proxy` is `1`. Confirmed on the live URL: requests with different spoofed values shared
one rate limit.

Uptime: `.github/workflows/uptime.yml` calls `/api/health` every 6 hours, and GitHub emails when it
fails. Cloud Monitoring uptime checks are not used: they run at least every 15 minutes, which would
keep the instance up and billed all month.

## Sources

- [Cloud Run pricing](https://cloud.google.com/run/pricing)
- [Cloud Run billing settings](https://docs.cloud.google.com/run/docs/configuring/billing-settings)
- [Cloud Run container runtime contract](https://docs.cloud.google.com/run/docs/container-contract)
- [Cloud Run request timeout](https://docs.cloud.google.com/run/docs/configuring/request-timeout)
- [Cloud Run continuous deployment](https://docs.cloud.google.com/run/docs/continuous-deployment)
- [Cloud Run release notes (build script runs by default)](https://docs.cloud.google.com/run/docs/release-notes?hl=en)
- [Express trust proxy on Cloud Run (community pull request)](https://github.com/Menshawy97/FORJD/pull/192)

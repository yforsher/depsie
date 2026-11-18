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

| Setting           | Value                                                                                                                                                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source            | This GitHub repo, branch `master`; build type Dockerfile                                                                                                                                                                     |
| Region            | A Tier 1 region (for example `europe-west1` or `us-central1`); Tier 2 costs about 1.4 times more                                                                                                                             |
| Authentication    | Allow public access                                                                                                                                                                                                          |
| Billing           | Instance-based, so the analytics writes after a response still get CPU (request-based billing gives CPU only during a request)                                                                                               |
| Minimum instances | 0 scales to zero, with a cold start of a few seconds; 1 keeps an instance warm                                                                                                                                               |
| Maximum instances | 1, so every request reaches the instance that holds the in-memory rate limit and salt                                                                                                                                        |
| Startup CPU boost | On, for shorter cold starts                                                                                                                                                                                                  |
| CPU and memory    | 1 vCPU, 512 MiB                                                                                                                                                                                                              |
| Request timeout   | Default 300 seconds, above the 90 second report deadline                                                                                                                                                                     |
| Secrets           | `OPENROUTER_API_KEY`, `GITHUB_TOKEN`, `DATABASE_URL` (Neon `production` branch), `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, from Secret Manager; `BETTER_AUTH_URL` (the live URL) as a plain variable |
| Health check      | Startup probe on HTTP `/api/health`                                                                                                                                                                                          |
| Budget alert      | Monthly alert in Cloud Billing, since pay-as-you-go has no hard cap                                                                                                                                                          |

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

## Report cleanup job

Expired reports are deleted by the Cloud Run job `depsie-cleanup`, not by an endpoint: it runs
`node /app/server/dist/cleanup.js` in the service image with `DATABASE_URL` from Secret Manager,
deletes every report past `expires_at` (versions go with it) and logs the count. Cloud Scheduler
starts it daily. Both run as the default compute account, which already has `roles/run.admin` and
reads the secret. The last `cloudbuild.yaml` step points the job at each new image, so the job must
exist before the first deploy that has that step.

Created once (region `europe-west1`, 2026-11-17, with the scheduler paused until the first deploy
that has `cleanup.js`). Run these from PowerShell: Git Bash rewrites `/app/...` into a Windows
path before gcloud sees it.

```sh
gcloud services enable cloudscheduler.googleapis.com
gcloud run jobs create depsie-cleanup --region=europe-west1 --image=<the current service image> \
  --command=node --args=/app/server/dist/cleanup.js \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest --max-retries=0 --task-timeout=5m
gcloud scheduler jobs create http depsie-cleanup-daily --location=europe-west1 \
  --schedule="0 3 * * *" --time-zone=UTC \
  --uri="https://run.googleapis.com/v2/projects/<project id>/locations/europe-west1/jobs/depsie-cleanup:run" \
  --http-method=POST \
  --oauth-service-account-email=<project number>-compute@developer.gserviceaccount.com
```

To run it by hand: `gcloud run jobs execute depsie-cleanup --region=europe-west1 --wait`; the
count is in the execution's logs. A missed day only keeps expired reports in the table a day
longer: every read already ignores them.

## Sign-in (GitHub OAuth)

Sign-in exists while `FEATURE_ACCOUNTS` is `on` or a list of GitHub logins; with it unset, none of
this is read. Two GitHub OAuth apps (GitHub, Settings, Developer settings, OAuth Apps), since each
has one callback URL:

| App        | Homepage URL               | Authorization callback URL                          |
| ---------- | -------------------------- | --------------------------------------------------- |
| Local      | `http://localhost:5173`    | `http://localhost:5173/api/auth/callback/github`    |
| Production | `https://depsie.cloud.run` | `https://depsie.cloud.run/api/auth/callback/github` |

The local app's ID and secret go in `.env`; the production app's in Secret Manager as
`GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`, with a new random `BETTER_AUTH_SECRET` (at least
32 characters; changing it signs everyone out). `BETTER_AUTH_URL` is the origin the browser uses:
the live URL in production, the Vite dev server locally. As a backstop to the daily cost caps in
`server/src/limits.ts`, the OpenRouter account holds a small prepaid balance with auto top-up off
(a credit limit on the key would do the same).

Sign-in works only on the URL in `BETTER_AUTH_URL` and the production OAuth app's callback,
`https://depsie.cloud.run`. The service also answers at its Cloud Run address
(`https://depsie-kud34vyt4q-ew.a.run.app`, the default of the "Smoke live" workflow); there the app
works, but sign-in fails Better Auth's origin check, so use `depsie.cloud.run` to sign in.

To try sign-in on the live URL before it opens to everyone, set `FEATURE_ACCOUNTS=<your login>` on
the service and open `/signin`; no sign-in button is shown to anyone else. Set it back to `off` (or empty)
afterwards.

## Sources

- [Cloud Run pricing](https://cloud.google.com/run/pricing)
- [Cloud Run billing settings](https://docs.cloud.google.com/run/docs/configuring/billing-settings)
- [Cloud Run container runtime contract](https://docs.cloud.google.com/run/docs/container-contract)
- [Cloud Run request timeout](https://docs.cloud.google.com/run/docs/configuring/request-timeout)
- [Cloud Run continuous deployment](https://docs.cloud.google.com/run/docs/continuous-deployment)
- [Cloud Run release notes (build script runs by default)](https://docs.cloud.google.com/run/docs/release-notes?hl=en)
- [Express trust proxy on Cloud Run (community pull request)](https://github.com/Menshawy97/FORJD/pull/192)

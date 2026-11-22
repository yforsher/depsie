# Hosting

Chosen: Google Cloud Run. The database is Neon Postgres, outside the host.

## Cloud Run service settings

Deploy with continuous deployment from GitHub (Cloud Build). Cloud Build builds the root
`Dockerfile`: Node 22, pnpm install, build, then production dependencies only. The container runs
`node server/dist/index.js`, which reads the keys from environment variables instead of `.env`.
Cloud Run sets `PORT` (8080). Buildpacks do not work here: the image they built had no server
packages (`Cannot find package 'express'`) and ran Node 26.

The trigger runs `cloudbuild.yaml`: build, push, migrate, deploy with no traffic, smoke, promote,
update the cleanup job (see Releases). The migrate step runs `server/dist/db/migrate.js` in the
image just built, with `DATABASE_URL` from Secret Manager, so pending migrations reach the Neon
`production` branch before the new revision; a failed migration ends the build and the previous
revision keeps serving. The trigger was first created
by Cloud Run with an inline build; to point it at the file, in Cloud Build, Triggers, edit the
trigger and set Configuration to "Cloud Build configuration file", location `cloudbuild.yaml`.
The trigger's service account (the default compute account, also used by the Cloud Run service)
already reads the `DATABASE_URL` secret.

## Releases

A deploy creates the new revision with no traffic and the tag `candidate`, at
`https://candidate---depsie-kud34vyt4q-ew.a.run.app` (a tag's URL is `https://<tag>---<service
host>`). The Smoke step runs `pnpm e2e` against it in the official Playwright image (its tag
follows `@playwright/test`), and Promote moves all traffic to it with `update-traffic
--to-tags=candidate=100`. A failed smoke test ends the build: Promote and the cleanup job update do
not run, users keep the previous revision, and the build log names the failed test. The candidate
uses the service's secrets, variables, database and scaling, and runs on its own instance. Since
the first such deploy, traffic is pinned to a revision rather than following the latest, so only
Promote or the commands below move it. A full build with smoke takes about 4 to 5 minutes.

Merge one pull request at a time and wait until its deploy ends (`pnpm release` reports it): the
trigger cannot be limited to one build at a time, and two overlapping builds share the
`candidate` tag, so one could promote the other's revision.

Migrations run before the candidate and stay applied when the smoke test fails. That is safe only
under the forward-only rule (add first, remove in a later deploy), so the revision still serving
keeps working with the new schema. A failed smoke leaves `master` ahead of what is live; fix it
with a revert or a fix pull request, which deploys through the same gate.

To turn a flag on (or change any variable), the same way by hand. Pass the serving revision's
image: the service template keeps the image of the last deploy, which after a failed smoke test or
a rollback is not the code users have.

```sh
gcloud run services describe depsie --region=europe-west1 --format="value(status.traffic)"
gcloud run revisions describe <serving revision> --region=europe-west1 --format="value(image)"
gcloud run services update depsie --region=europe-west1 --image=<that image> \
  --update-env-vars=FEATURE_<NAME>=on --no-traffic --tag=candidate
gh workflow run smoke-live.yml -f url=https://candidate---depsie-kud34vyt4q-ew.a.run.app
gcloud run services update-traffic depsie --region=europe-west1 --to-tags=candidate=100
```

Promote only after the "Smoke live" run passes (`gh run watch`).

To roll back, with no rebuild: find the previous revision, then send all traffic to it.

```sh
gcloud run revisions list --service=depsie --region=europe-west1
gcloud run services update-traffic depsie --region=europe-west1 --to-revisions=<previous>=100
```

Smoke runs are recorded as anonymous use: each writes 2 visits and 1 `React` report in `events`,
with country `US`, plus its `ai_usage` rows. They can be about half of all reports. To leave them
out of a count, drop `US` rows whose time falls inside a build's Smoke step (`gcloud builds list`
for the times); country alone is not enough, since real visitors and "Smoke live" runs also come
from the US.

Merges that change only files outside the app do not build or deploy: the trigger's ignored files
are `docs/**`, `openspec/**`, `.github/**`, `.claude/**`, `**/*.md` and `LICENSE`. Files that
change the image or the smoke test (`e2e/**`, `playwright.config.ts`, `cloudbuild.yaml`, lock and
config files) are not ignored, so every other merge runs the full deploy with its smoke test. Set
2026-11-22 with a full update of the trigger (GET it, add `ignoredFiles`, PATCH it back with no
`updateMask`): this trigger rejects every masked update with `INVALID_ARGUMENT`, which is what
`gcloud builds triggers update github --ignored-files` sends.

`gcloud builds submit` (to try `cloudbuild.yaml` by hand) needs the compute account to read the
uploaded source: it has `roles/storage.objectViewer` on the `<project id>_cloudbuild` bucket.

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

## Logs and traces

The server writes one JSON line per log entry on stdout, which Cloud Run sends to Cloud Logging,
and exports a trace of every request to Cloud Trace (`server/AGENTS.md`, `src/log.ts` and
`src/tracing.ts`). Both are operator-only and kept 30 days by Google Cloud.

Setup, once per project (the Telemetry API was already enabled on 2026-11-22):

```sh
gcloud services enable telemetry.googleapis.com
gcloud projects add-iam-policy-binding <project id> \
  --member=serviceAccount:<project number>-compute@developer.gserviceaccount.com \
  --role=roles/telemetry.tracesWriter
```

The Deploy step sets `GOOGLE_CLOUD_PROJECT`, which the export (`gcp.project_id`, required by the
endpoint) and the log lines' trace field need. Spans go to
`https://telemetry.googleapis.com/v1/traces` in batches after the response: billing is
instance-based, so CPU stays allocated between requests (`gcloud run services describe depsie`
shows `run.googleapis.com/cpu-throttling: 'false'`, checked 2026-11-22). With request-based
billing the batch could wait unsent until the next request; the fix would be
`--no-cpu-throttling`, not a flush in the request path. Spans still waiting are sent on `SIGTERM`
before an instance stops. Export failures are logged by the SDK and never fail a request.

Finding a report:

- Trace: Trace Explorer, filter bar, "Add attribute filter", key `report.id`, value the report
  id. The trace shows the request span, the four stages, each outside call and each AI call with
  its tokens and cost.
- Logs: Logs Explorer, `jsonPayload.message="report saved: <id>"`; the line's trace link opens
  the trace, and "Show entries for this trace" lists every line of the request.

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
the service (as in Releases) and open `/signin`; no sign-in button is shown to anyone else. Set it back to `off` (or empty)
afterwards.

## Sources

- [Cloud Run pricing](https://cloud.google.com/run/pricing)
- [Cloud Run billing settings](https://docs.cloud.google.com/run/docs/configuring/billing-settings)
- [Cloud Run container runtime contract](https://docs.cloud.google.com/run/docs/container-contract)
- [Cloud Run request timeout](https://docs.cloud.google.com/run/docs/configuring/request-timeout)
- [Cloud Run rollouts, rollbacks and traffic migration](https://docs.cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration)
- [Cloud Run continuous deployment](https://docs.cloud.google.com/run/docs/continuous-deployment)
- [Cloud Run release notes (build script runs by default)](https://docs.cloud.google.com/run/docs/release-notes?hl=en)
- [OTLP export to Google Cloud (MIGRATION.md)](https://github.com/GoogleCloudPlatform/opentelemetry-operations-js/blob/main/MIGRATION.md)
- [Telemetry API OTLP overview](https://docs.cloud.google.com/stackdriver/docs/otlp/overview)
- [Telemetry API roles](https://docs.cloud.google.com/iam/docs/roles-permissions/telemetry)
- [Structured logging](https://docs.cloud.google.com/logging/docs/structured-logging)
- [Find and explore traces](https://docs.cloud.google.com/trace/docs/finding-traces)
- [Express trust proxy on Cloud Run (community pull request)](https://github.com/Menshawy97/FORJD/pull/192)

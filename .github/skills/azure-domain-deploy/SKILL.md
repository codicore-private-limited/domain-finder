---
name: azure-domain-deploy
description: 'Use when: deploying the domain-finder monorepo to Azure App Service, diagnosing old/stale Azure builds, GitHub Actions deployment failures, missing frontend updates, broken live hunter/domain discovery, LLM provider issues, Telegram alert issues, or production environment variables.'
argument-hint: 'Azure deploy or live hunter problem to diagnose'
---

# Azure Domain Finder Deploy

## When to Use

Use this workflow when the user says Azure is still showing an old version, pushed GitHub changes are not live, the frontend looks stale, the live hunter is idle, no domains are being found, Telegram alerts stopped, or production deploys are failing.

This repo deploys through `.github/workflows/azure-deploy.yml`. The production API serves the built frontend from `artifacts/domain-hunter/dist/public`, and the root `pnpm run start` script runs Drizzle schema sync before starting `artifacts/api-server/dist/index.mjs`.

## Key Facts

- The deploy workflow is `Deploy to Azure` in `.github/workflows/azure-deploy.yml`.
- It runs on pushes to `main` and can also be run manually with `workflow_dispatch`.
- The Azure App Service name is controlled by `AZURE_WEBAPP_NAME` inside the workflow.
- GitHub Actions needs the repository secret `AZURE_WEBAPP_PUBLISH_PROFILE`.
- Azure App Service must have `PORT=8080`, `DATABASE_URL`, and at least one LLM key: `GITHUB_MODELS_TOKEN` or `GROQ_API_KEY`.
- Frontend changes require `pnpm run build`, because the API serves the built Vite bundle from `artifacts/domain-hunter/dist/public`.
- No new domains can be an honest result if the quality pool is exhausted, but `news_driven` discovery needs a working LLM provider.

## Procedure

1. Confirm the local code is on the intended branch.
   - Run `git status -sb`.
   - Run `git branch --show-current`.
   - If the deployment workflow triggers on `main`, make sure the pushed commits are on `main`.

2. Confirm GitHub has the latest code.
   - Run `git log --oneline -5` locally.
   - Compare with GitHub repo `codicore-private-limited/domain-finder` on branch `main`.
   - If commits are local only, push them with `git push origin main`.

3. Check the deploy workflow.
   - Open GitHub repo -> Actions -> `Deploy to Azure`.
   - Confirm a run started after the last push.
   - If no run started, the workflow may be disabled, the push went to another branch, or GitHub Actions is disabled.
   - If needed, run it manually: Actions -> `Deploy to Azure` -> `Run workflow` -> branch `main`.

4. Check workflow configuration.
   - In `.github/workflows/azure-deploy.yml`, verify `AZURE_WEBAPP_NAME` matches the real Azure App Service name.
   - Verify GitHub secret `AZURE_WEBAPP_PUBLISH_PROFILE` exists and is current.
   - If the publish profile was regenerated or disabled in Azure, download a fresh profile and update the GitHub secret.

5. Check Azure App Service settings.
   - Azure Portal -> App Service -> Configuration -> Application settings:
     - `WEBSITE_NODE_DEFAULT_VERSION=~24`
     - `SCM_DO_BUILD_DURING_DEPLOYMENT=false`
     - `NPM_CONFIG_PRODUCTION=false`
     - `PORT=8080`
     - `DATABASE_URL=<production database connection string>`
     - `DIAMOND_THRESHOLD=88`
     - `GROQ_API_KEY=<secret>` or `GITHUB_MODELS_TOKEN=<secret>`
     - `TELEGRAM_BOT_TOKEN=<secret>` if alerts are expected
     - `TELEGRAM_CHAT_ID=<secret>` if alerts are expected
   - Azure Portal -> App Service -> Configuration -> General settings:
     - Startup command: `pnpm run start`
     - This matters because it runs `drizzle-kit push` before boot so new DB columns exist before the API queries them.

6. Validate the build locally when making code changes.
   - Run `pnpm install --frozen-lockfile --prod=false` if dependencies changed or node_modules is missing.
   - Run `pnpm run typecheck`.
   - Run `pnpm run build`.
   - If only checking the API bundle, run `pnpm --filter @workspace/api-server run build`.
   - If checking the frontend bundle, run `pnpm --filter @workspace/domain-hunter run build`.

7. Deploy.
   - Commit changes if needed.
   - Push to `main`: `git push origin main`.
   - Watch GitHub Actions until `Deploy to Azure` succeeds.
   - In Azure Portal, restart the App Service after a successful deploy if the app still looks stale.

8. Verify production.
   - Use the `App Service Application URL` printed by the successful GitHub Actions deploy log.
   - Open `https://<actual-app-host>/api/healthz` and confirm it responds.
   - Open the app UI and hard refresh the browser.
   - Check Azure Log Stream for:
     - `Server listening`
     - `Serving frontend SPA`
     - `Hunter auto-armed`
     - `News ingest started`
   - If `Frontend build not found` appears, the deploy package did not include `artifacts/domain-hunter/dist/public`.

9. Diagnose no domain activity.
   - Confirm the server is alive with `/api/healthz`.
   - Check `/api/hunter/status`, `/api/hunter/insights`, `/api/discoveries`, and `/api/diamonds`.
   - Check Azure logs for DNS/RDAP errors, database errors, or LLM 401/403/429 responses.
   - If `/api/discoveries` or `/api/diamonds` returns 500 while `/api/healthz` works, suspect discoveries table schema drift and run the DB schema sync.
   - If all current quality pool names are already checked, no new finds can be normal until taken names expire.
   - If `news_driven` finds are zero, focus on LLM keys. Prefer `GROQ_API_KEY` or set `LLM_PROVIDER=groq` if GitHub Models is rate-limited.
   - If Telegram is silent, remember only strict `verdict=diamond` plus `score >= DIAMOND_THRESHOLD` should alert.

## Completion Checks

The task is not complete until:

- The latest commit on GitHub `main` matches the intended code.
- GitHub Actions `Deploy to Azure` completed successfully.
- Azure App Service logs show the new process started.
- `/api/healthz` works on the production URL.
- The frontend is not stale after a hard refresh.
- `/api/discoveries` and `/api/diamonds` return JSON, not 500.
- Logs confirm the hunter and news ingest are started.
- Required production secrets are present without printing their values.

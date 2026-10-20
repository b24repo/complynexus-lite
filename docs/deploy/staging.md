# Staging runbook (Render + MongoDB Atlas M0)

1. **Render web service.** Either deploy the GHCR image `ghcr.io/b24repo/complynexus-lite:latest` (make the package public, or add a GHCR credential in Render) and put the service's deploy hook URL in the repo secret `RENDER_DEPLOY_HOOK_URL`, or build from the repo `Dockerfile` with Render auto-deploy on `main`. Set the health check path to `/healthz`.
2. **MongoDB Atlas M0.** Create a free cluster, a database user, and a network access entry that allows Render's outbound IPs (or 0.0.0.0/0 for staging). The URI looks like `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority`.
3. **Environment variables.**
   - `PORT` (Render sets it)
   - `MONGODB_URI`
   - `MONGODB_DB=complynexus_lite`
   - `ADMIN_KEY`
   - `ANTHROPIC_API_KEY` (optional) and `ANTHROPIC_MODEL`
   - `PUBLIC_BASE_URL=https://<service>.onrender.com` (required when `NODE_ENV=production`: the server refuses to boot without it, because magic links must never be built from the request Host header)
   - `TRUST_PROXY=1` (required behind Render's proxy, otherwise the `/verify` rate limit is global)
   - `LOG_LEVEL=info`
   - `RESEND_API_KEY` and `MAIL_FROM`
4. **Cron job.** Placeholder: a Render cron job for the time-transition and reminder sweep arrives with S1-03b.
5. **Smoke check.** `curl -s $BASE/healthz` should return `"status":"ok"` and `"db":"ok"`. Then run `BASE_URL=$BASE ADMIN_KEY=... npm run uat` (the script arrives with PR #4).
6. **GitHub secrets.** Only `RENDER_DEPLOY_HOOK_URL`; GHCR uses `GITHUB_TOKEN`.

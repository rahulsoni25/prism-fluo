# Vercel Duplicate Project Cleanup — Safe Runbook

The PRISM repo is auto-deploying to **8 separate Vercel projects** from the same `main` branch. Every push triggers 8 builds. This runbook consolidates them down to one canonical project (`prism-fluo`) without breaking anything live.

## TL;DR

1. Run the audit script to see which duplicates are safe vs. need action.
2. For each unsafe duplicate, copy its env vars + custom domains over to `prism-fluo` first.
3. Disconnect each safe duplicate from Git.
4. Wait 1 week.
5. Delete the disconnected duplicates.

## The 8 projects (from your dashboard)

| Project | Action |
|---|---|
| **prism-fluo** ← canonical | Keep. This is the URL we test against (`prism-fluo.vercel.app`). |
| prism-fluo-main | Audit → disconnect → delete |
| prism-fluo-insights | Audit → disconnect → delete |
| prism-insights-app | Audit → disconnect → delete |
| prism-fluo-fv91 | Audit → disconnect → delete |
| prism-fluo-omni | Audit → disconnect → delete |
| prism-fluo-insight-finder | Audit → disconnect → delete |
| quantum-heights | Audit → disconnect → delete |

## Step 1 — Run the audit (read-only, no risk)

### Create a Vercel API token (one-time, ~30 seconds)

1. Open https://vercel.com/account/tokens
2. Click **Create Token**
3. Name: `prism-audit` (or anything)
4. Scope: `Read` is enough — **do not grant write** for this script
5. Expiration: 24 hours (auto-cleanup)
6. Copy the token

### Run the audit

From your project directory:

**Bash / WSL:**
```bash
VERCEL_TOKEN=xxxxxxx node scripts/vercel_audit.mjs
```

**PowerShell:**
```powershell
$env:VERCEL_TOKEN="xxxxxxx"; node scripts/vercel_audit.mjs
```

If your projects are under a Vercel team (not your personal account):
```bash
VERCEL_TOKEN=xxxxxxx node scripts/vercel_audit.mjs --team rahul-sonis-projects-94160bba
```

(replace with the team slug from your Vercel URL: `vercel.com/<TEAM-SLUG>/...`)

### What the output looks like

```
🔍 Fetching projects…
   Found 14 total projects.

✅ Canonical: prism-fluo (prj_abc123)
📋 Duplicates to audit: 7

🔬 Auditing duplicate "prism-fluo-main"…  ✅ SAFE
🔬 Auditing duplicate "prism-fluo-insights"…  ⚠️  ACTION NEEDED
...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AUDIT VERDICT — CANONICAL: prism-fluo
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 prism-fluo-main  (prj_xyz)
   Git: rahulsoni25/prism-fluo@main
   Env vars: 22
   ✅ SAFE to disconnect from Git, then delete after cooldown.

📦 prism-fluo-insights  (prj_abc)
   Git: rahulsoni25/prism-fluo@main
   Env vars: 23
   ⚠️  Env keys NOT in canonical (1):
       - SOME_LEGACY_KEY
       → Copy this to canonical before disconnecting this project.
   ⚠️  ACTION NEEDED before this can be safely removed.

SUMMARY: 5 safe to remove · 2 need action first
```

The script **never writes** to Vercel. It only reads metadata. It also **never prints env-var values** — only keys — so the token can't leak secrets through the log.

## Step 2 — Handle ⚠️ ACTION NEEDED duplicates

For each duplicate the audit flagged:

### If it has env vars missing from canonical

1. Open `https://vercel.com/<TEAM>/<DUPLICATE-NAME>/settings/environment-variables`
2. Find each key the audit listed
3. Click the value to reveal it (Vercel shows it after a click)
4. Open canonical project: `https://vercel.com/<TEAM>/prism-fluo/settings/environment-variables`
5. Click **Add New** → paste key + value → choose same environments (Production / Preview / Development)
6. **Trigger a redeploy of `prism-fluo`** so the new env var takes effect:
   - Deployments tab → latest production deployment → ⋯ menu → Redeploy

### If it has a custom domain

1. Open `https://vercel.com/<TEAM>/<DUPLICATE-NAME>/settings/domains`
2. Note the domain name (e.g. `app.yourcompany.com`)
3. Click **Remove** on the domain (this releases it)
4. Open `https://vercel.com/<TEAM>/prism-fluo/settings/domains`
5. **Add Domain** → enter the same domain → Vercel will guide DNS verification

Then re-run the audit. It should now show ✅ SAFE.

## Step 3 — Disconnect each ✅ SAFE duplicate from Git

This stops future auto-deploys but keeps the project URL live. **Reversible** — you can reconnect anytime.

For each safe duplicate:

1. Open `https://vercel.com/<TEAM>/<DUPLICATE-NAME>/settings/git`
2. Find the "Connected Git Repository" section
3. Click **Disconnect**
4. Confirm

Now `git push origin main` will only build the canonical project. Build minutes saved.

## Step 4 — Wait 1 week

This is the safety net. If anyone has a bookmarked URL pointing to a duplicate, they will get an error from a stale deployment — and you will hear about it before the URL is gone forever.

Symptoms to watch for during the week:
- Anyone reports "the app is showing old data"
- A monitoring system pinging a duplicate URL alerts
- An integration (Zapier, webhook) breaks

If nothing breaks: proceed to step 5.

If something breaks: reconnect that specific project (Settings → Git → Connect → choose repo + branch) and audit again to understand why.

## Step 5 — Delete the disconnected duplicates

For each duplicate that's been disconnected for ≥1 week with no incidents:

1. Open `https://vercel.com/<TEAM>/<DUPLICATE-NAME>/settings/advanced`
2. Scroll to **Delete Project**
3. Type the project name to confirm
4. Click **Delete**

The URL becomes permanently unreachable. Done.

## What "nothing breaks" looks like at the end

- One Vercel project: `prism-fluo`
- One production URL: `https://prism-fluo.vercel.app` (plus any custom domain you point at it)
- One build per `git push origin main`
- ~88% reduction in build-quota usage
- No more confusion about which URL is "the real one"

## Recovery — if you delete something by mistake

Vercel keeps deleted projects in a 30-day recycle bin. Open https://vercel.com/account/recently-deleted to restore. After 30 days, gone forever — but the code is still in GitHub, so you can always re-import as a new project.

## Why this is worth doing

| Risk | Today | After cleanup |
|---|---|---|
| Confusion: which URL is live? | 8 candidates | 1 candidate |
| Build minutes per push | 8× | 1× |
| Env-var drift across copies | Possible (audit catches it) | Impossible (one project) |
| Stale duplicate serving old code if canonical fails | Yes (silent) | No |
| Investor demo URL stability | Fragile | Single source of truth |

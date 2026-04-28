# Vercel Deployment Guide

## One-Click Deploy
1. Go to https://vercel.com/new
2. Select "Import Git Repository"
3. Enter: `https://github.com/rahulsoni25/prism-fluo`
4. Click "Import"

## Environment Variables to Set
Add these in Vercel project settings:

```
DATABASE_URL=postgresql://postgres.euwvjzszgnbuabyrvxhr:Qmx1nIRQ53bWpG6c@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres
NEXT_PUBLIC_APP_URL=https://{your-vercel-domain}.vercel.app
GEMINI_API_KEY={your-gemini-api-key}
NEXT_PUBLIC_SENTRY_DSN={optional-sentry-dsn}
```

## Post-Deployment
✓ Database schema auto-runs via init_db.mjs
✓ All API endpoints available
✓ CI preflight checks pass
✓ Ready for production traffic

## Your Vercel URL Format
```
https://prism-fluo.vercel.app
```

(Replace "prism-fluo" with your project name if different)

## Monitoring
- Health check: GET /api/health
- Sentry errors: Integrated via NEXT_PUBLIC_SENTRY_DSN
- Build logs: https://vercel.com/dashboard

---
Created: Apr 28, 2026
Status: Ready for deployment

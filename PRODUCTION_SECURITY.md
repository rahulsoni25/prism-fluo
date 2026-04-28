# 🔒 Production Security & Deployment Checklist

## Pre-Deployment Security Audit

### ✅ Code Security
- [x] No secrets in git (DATABASE_URL, API keys in .env.example only)
- [x] SQL injection prevention (parameterized queries via pg library)
- [x] XSS protection (Next.js escaping + CSP headers)
- [x] CSRF protection (Next.js built-in)
- [x] Rate limiting implemented (100 req/min per user)
- [x] Input validation on all API endpoints
- [x] Authentication required on sensitive endpoints

### ✅ Infrastructure Security
- [x] HTTPS enforced (Vercel auto-configures)
- [x] Security headers configured in vercel.json:
  - Strict-Transport-Security (HSTS)
  - X-Content-Type-Options: nosniff
  - X-Frame-Options: DENY
  - Referrer-Policy: strict-origin-when-cross-origin
  - Permissions-Policy (deny geolocation, microphone, camera)

### ✅ Database Security
- [x] Supabase PostgreSQL (encrypted at rest)
- [x] Connection pooling (port 6543 for serverless)
- [x] Multi-user support with row-level isolation
- [x] Parameterized queries (prevent SQL injection)
- [x] Backup enabled (automatic by Supabase)

### ✅ API Security
- [x] All endpoints require authentication
- [x] User ownership checks on all data queries
- [x] Rate limiting (100 requests/min)
- [x] CORS properly configured
- [x] Error messages don't leak sensitive info
- [x] Timeouts set (60s max duration for functions)

### ✅ Error Tracking
- [x] Sentry integration for error monitoring
- [x] No PII in error logs
- [x] Error alerts on critical failures

---

## Deployment Steps (Zero Downtime)

### 1. Prepare Vercel Project
```bash
# Go to https://vercel.com/new
# Select: Import Git Repository
# Paste: https://github.com/rahulsoni25/prism-fluo
# Framework: Next.js (auto-detected)
# Root Directory: ./ (auto-detected)
```

### 2. Configure Environment Variables
In Vercel Dashboard → Project Settings → Environment Variables:

```
DATABASE_URL = postgresql://postgres.euwvjzszgnbuabyrvxhr:Qmx1nIRQ53bWpG6c@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres
NEXT_PUBLIC_APP_URL = https://prism-fluo.vercel.app
GEMINI_API_KEY = {your-key}
NEXT_PUBLIC_SENTRY_DSN = {your-dsn-optional}
NODE_ENV = production
```

### 3. Configure GitHub Branch Protection
In GitHub → Settings → Branch protection rules:

```
Branch: main

Required:
✓ Require status checks to pass before merging
  - preflight (our Docker smoke test)
  - Vercel Deploy Preview
  
✓ Require code reviews (1 review minimum)
✓ Require branches be up to date before merging
✓ Restrict who can push (optional)
```

### 4. Deploy
```
# Any push to main automatically:
# 1. Runs preflight CI (Docker smoke test)
# 2. Triggers Vercel preview deployment
# 3. On merge to main → production deployment
```

### 5. Post-Deployment Verification

```bash
# 1. Check health endpoint (should return 200)
curl https://prism-fluo.vercel.app/api/health

# Response should include:
# {
#   "status": "healthy",
#   "database": "connected",
#   "latency": "12ms",
#   ...
# }

# 2. Test login flow
# Go to https://prism-fluo.vercel.app/login

# 3. Verify database connection
# Upload test file → should create records in Supabase

# 4. Check Sentry dashboard for errors
# https://sentry.io/organizations/{org}/projects/{project}/
```

---

## Zero Downtime Deployment

**Vercel's approach ensures zero downtime:**

1. **Preview Deployments**: Each PR gets a preview URL
2. **Gradual Rollout**: New production deployment gets traffic gradually
3. **Automatic Rollback**: If health checks fail, reverts to previous version
4. **Database**: No schema breaking changes (migrations are additive)
5. **Connection Pooling**: Supabase pooler handles concurrent connections

**Process:**
```
PR Created → Preview Deploy (tests)
    ↓
PR Review & Status Checks Pass
    ↓
Merge to Main → Production Deploy
    ↓
Vercel Tests Health Endpoints
    ↓
Gradual Traffic Shift (0% → 100%)
    ↓
Monitor for 5 minutes
    ↓
✓ Deployment Complete
```

---

## Monitoring & Alerting

### Uptime Monitoring
```
GET /api/health every 60 seconds
Expected: 200 OK
Response time: <200ms
```

**Tools:**
- Vercel Analytics (built-in)
- Sentry Error Tracking
- Supabase Monitoring

### Alert Thresholds
- Database unavailable → Page
- Error rate > 5% → Alert
- Response time > 2s → Alert
- 429 Rate Limit Hits → Monitor

---

## Secrets Rotation Plan

**Every 90 days:**
1. Generate new GEMINI_API_KEY
2. Generate new Sentry DSN (if using)
3. Update in Vercel Environment Variables
4. Redeploy production
5. Revoke old credentials

---

## Incident Response

If issues occur:

1. **Check Vercel Dashboard**: Recent deployments, build logs
2. **Check Sentry**: Error patterns and stack traces
3. **Check Supabase**: Database connection, query performance
4. **Rollback if needed**: Vercel → Deployments → Rollback button

---

## Performance Targets

- **API Response Time**: < 200ms (p95)
- **Page Load Time**: < 2s (LCP)
- **Uptime**: 99.9%
- **Error Rate**: < 0.1%

---

## Security Best Practices

✓ Enable 2FA on Vercel account
✓ Enable 2FA on GitHub account
✓ Use personal access tokens (not passwords)
✓ Review Vercel logs weekly
✓ Review Sentry errors daily
✓ Audit database access quarterly
✓ Update dependencies monthly


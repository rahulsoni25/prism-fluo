# PRISM Fluo - Deployment Guide

## Overview

PRISM Fluo is a Next.js application deployed on **Vercel** with a **Supabase PostgreSQL** database. This guide covers local setup and production deployment.

---

## Local Development Setup

### Prerequisites
- Node.js >= 22.0.0
- npm >= 10.0.0
- Git

### 1. Clone the Repository
```bash
git clone https://github.com/rahulsoni25/prism-fluo.git
cd prism-fluo
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables

Copy the environment template and configure:
```bash
cp .env.example .env.local
```

Fill in `.env.local` with:
```env
# Database (Supabase PostgreSQL)
DATABASE_URL=postgresql://user:password@host:5432/postgres

# Google Gemini API for analysis generation
GEMINI_API_KEY=your-api-key-here

# Authentication (NextAuth)
NEXTAUTH_SECRET=generate-random-string-here
NEXTAUTH_URL=http://localhost:3000

# Email (Optional - for SLA notifications)
SMTP_HOST=your-smtp-host
SMTP_PORT=587
SMTP_USER=your-email
SMTP_PASS=your-password
SMTP_FROM=noreply@yourdomain.com
```

### 4. Initialize Database (First Time Only)
```bash
npm run db:init
```

This creates the necessary tables:
- `users` - User accounts
- `briefs` - Campaign briefs
- `uploads` - File uploads
- `analyses` - Analysis results
- `presentations` - Generated PPTX decks

### 5. Start Development Server
```bash
npm run dev
```

Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard) in your browser.

---

## Production Deployment

### Prerequisites
- GitHub account with repository access
- Vercel account (free tier available)
- Supabase account with PostgreSQL database

### Step 1: Push Code to GitHub

```bash
# If not already initialized
git init
git add .
git commit -m "Initial commit: PRISM Fluo dashboard"

# Add remote (if not already done)
git remote add origin https://github.com/YOUR_USERNAME/prism-fluo.git

# Push to main branch
git branch -M main
git push -u origin main
```

### Step 2: Connect Vercel to GitHub

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click "Add New..." → "Project"
3. Select "Import Git Repository"
4. Search for `prism-fluo` and click "Import"

### Step 3: Configure Environment Variables on Vercel

In the Vercel dashboard, go to **Settings** → **Environment Variables** and add:

```env
DATABASE_URL=postgresql://user:password@host:5432/postgres
GEMINI_API_KEY=your-api-key
NEXTAUTH_SECRET=generate-new-random-string
NEXTAUTH_URL=https://prism-fluo.vercel.app
SMTP_HOST=your-smtp-host
SMTP_PORT=587
SMTP_USER=your-email
SMTP_PASS=your-password
SMTP_FROM=noreply@yourdomain.com
```

### Step 4: Deploy

1. Vercel will auto-detect Next.js configuration
2. Click **Deploy** button
3. Wait for build to complete (~2-3 minutes)
4. Your app is live at `https://prism-fluo.vercel.app`

---

## Environment Variables Reference

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `DATABASE_URL` | Supabase PostgreSQL connection string | ✅ | `postgresql://...` |
| `GEMINI_API_KEY` | Google Gemini API key for analysis | ✅ | `AIzaSy...` |
| `NEXTAUTH_SECRET` | Session encryption key | ✅ | Random 32+ char string |
| `NEXTAUTH_URL` | Authentication callback URL | ✅ | `https://prism-fluo.vercel.app` |
| `SMTP_HOST` | Email server host | ❌ | `smtp.gmail.com` |
| `SMTP_PORT` | Email server port | ❌ | `587` |
| `SMTP_USER` | Email account username | ❌ | `user@domain.com` |
| `SMTP_PASS` | Email account password | ❌ | `app-password` |
| `SMTP_FROM` | Sender email address | ❌ | `noreply@domain.com` |

---

## Database Setup (Supabase)

### 1. Create Supabase Project
- Go to [supabase.com](https://supabase.com)
- Create new project
- Copy the PostgreSQL connection string

### 2. Run Database Initialization
```bash
# Locally first
npm run db:init

# Or via SQL Editor in Supabase dashboard, run:
psql postgresql://user:password@host:5432/postgres < lib/db/schema.sql
```

### 3. Verify Tables
In Supabase SQL Editor:
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public';
```

Should return: `users`, `briefs`, `uploads`, `analyses`, `presentations`

---

## Deployment Checklist

- [ ] Code pushed to GitHub
- [ ] Vercel project created and connected
- [ ] All environment variables set in Vercel Dashboard
- [ ] Database tables created in Supabase
- [ ] Google Gemini API key obtained
- [ ] SMTP configured (if using email notifications)
- [ ] Build succeeds: `npm run build`
- [ ] Tests pass: `npm run test` (if applicable)
- [ ] Visited production URL and verified dashboard loads
- [ ] Can upload files and trigger analysis
- [ ] Demo briefs visible for new users
- [ ] Email notifications sent (if SMTP configured)

---

## Monitoring & Logs

### Vercel Logs
- Dashboard: [vercel.com/dashboard/prism-fluo](https://vercel.com/dashboard)
- Click project → **Deployments** → View function logs
- Check **Runtime Logs** for errors

### Database Logs
- Supabase Dashboard → **Logs** → Query and error logs
- Monitor slow queries with the Analytics tab

### Sentry (Error Tracking - Optional)
Project is configured with Sentry. Add `SENTRY_DSN` to environment variables:
```env
SENTRY_DSN=https://...@sentry.io/...
```

---

## Continuous Deployment

Vercel auto-deploys on every push to `main` branch:
1. GitHub push to main
2. Vercel detects changes (webhook)
3. Runs `npm run build`
4. Deploys if build succeeds
5. Live within 1-2 minutes

To disable auto-deploy:
- Vercel Dashboard → Settings → Git → Uncheck "Automatic deployments"

---

## Rollback

If deployment breaks production:

```bash
# Revert the last commit
git revert HEAD
git push origin main

# Vercel will auto-redeploy the previous version
```

Or in Vercel Dashboard:
- Deployments → Select previous version → Click "Redeploy"

---

## Performance Optimization

### Caching Strategy
- Dashboard: 90-second per-user cache
- Analyses: 30-second cache
- API responses: `Cache-Control: private, max-age=30`

### Database Query Optimization
- All dashboard queries run in parallel with Promise.all()
- Analyzed endpoint aggregates data in DB (not in JS)
- Per-user filtering scoped at query level

### Image & Asset Optimization
- Tailwind CSS v4 for optimized stylesheets
- NextJS image optimization enabled
- All charts use Chart.js (lightweight)

---

## Troubleshooting

### Deployment Fails
**Error**: "Build step failed"
```bash
# Locally test the build
npm run build

# Check logs for specific error
npm run preflight  # Pre-flight checks
```

### Database Connection Error
**Error**: "ECONNREFUSED" or "role does not exist"
```bash
# Verify connection string
echo $DATABASE_URL

# Test connection
npm run db:init

# Check Supabase dashboard for IP whitelisting
```

### Environment Variables Not Loaded
- Vercel Dashboard → Redeploy without cache
- Or wait 1 minute for variables to sync
- Check variable names are exactly correct (case-sensitive)

### Demo Data Not Showing
- Ensure you have no real briefs in database
- Check `NODE_ENV` is not blocking demo data (should be visible to all users now)
- Clear browser cache: Ctrl+Shift+Delete

---

## Additional Resources

- **Next.js Docs**: https://nextjs.org/docs
- **Vercel Docs**: https://vercel.com/docs
- **Supabase Docs**: https://supabase.com/docs
- **GitHub Issues**: https://github.com/rahulsoni25/prism-fluo/issues

---

## Contact & Support

For deployment issues:
1. Check this guide first
2. Review Vercel/Supabase dashboards
3. Check GitHub repository for similar issues
4. Contact: rahulsoni25@gmail.com

---

**Last Updated**: May 6, 2026
**Version**: 0.1.1

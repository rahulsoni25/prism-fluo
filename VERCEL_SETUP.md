# Vercel Deployment Setup - Step by Step

This guide walks you through deploying **PRISM Fluo** to Vercel in 5 minutes.

---

## Prerequisites

Before you start, ensure you have:
- [x] GitHub account (https://github.com)
- [x] Vercel account (https://vercel.com - free tier available)
- [x] Supabase PostgreSQL database set up
- [x] Google Gemini API key
- [x] Code pushed to GitHub main branch

---

## Step 1: Verify GitHub Repository

### 1.1 Check Remote URL
```bash
cd prism-fluo
git remote -v
# Should show: origin https://github.com/YOUR_USERNAME/prism-fluo.git
```

### 1.2 Push Latest Code
```bash
git add -A
git commit -m "Ready for Vercel deployment"
git push origin main
```

✅ **Your code is now on GitHub**

---

## Step 2: Connect Vercel to GitHub

### 2.1 Go to Vercel Dashboard
Visit: https://vercel.com/dashboard

### 2.2 Import New Project
1. Click **"Add New..."** (top left)
2. Select **"Project"**

### 2.3 Import from GitHub
1. Click **"Continue with GitHub"**
2. Authorize Vercel to access your GitHub account
3. Select **"prism-fluo"** repository

### 2.4 Configure Project
- **Project Name**: prism-fluo (auto-detected)
- **Framework Preset**: Next.js (auto-detected)
- **Root Directory**: ./ (auto-detected)

✅ **Vercel is connected to your repo**

---

## Step 3: Configure Environment Variables

### 3.1 Open Environment Variables Section
In the deployment settings, scroll to **"Environment Variables"**

### 3.2 Add Each Variable

**Required Variables** (must add):

| Name | Value | Example |
|------|-------|---------|
| `DATABASE_URL` | Supabase connection string | `postgresql://user:password@host.supabase.co:6543/postgres` |
| `GEMINI_API_KEY` | Google AI key | `AIzaSy...` |
| `NEXTAUTH_SECRET` | Random 32+ char string | See below ↓ |
| `NEXTAUTH_URL` | Production URL | `https://prism-fluo.vercel.app` |

#### Generate NEXTAUTH_SECRET:

Run locally:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Output: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0...
```

Copy the entire output and paste as `NEXTAUTH_SECRET` value.

#### Add DATABASE_URL:
From Supabase dashboard:
1. Go to https://supabase.com/dashboard
2. Select your project
3. Click **"Settings"** → **"Database"**
4. Copy the **URI** under "Connection pooling"
5. Format should be: `postgresql://postgres.xxxxx:6543/postgres`

#### Add GEMINI_API_KEY:
1. Go to https://ai.google.dev/
2. Click **"Get API Key"**
3. Create new API key in Google Cloud Console
4. Copy and paste

**Optional Variables** (if you have these set up):

| Name | Value | Example |
|------|-------|---------|
| `SMTP_HOST` | Email provider | `smtp.gmail.com` |
| `SMTP_PORT` | Email port | `587` |
| `SMTP_USER` | Email account | `your-email@gmail.com` |
| `SMTP_PASS` | Email password | App password from Google |
| `SMTP_FROM` | Sender email | `noreply@yourdomain.com` |

✅ **All environment variables are configured**

---

## Step 4: Deploy

### 4.1 Click Deploy Button
Once all variables are set, click the **"Deploy"** button

### 4.2 Watch Build Progress
Vercel will:
1. Clone your repo
2. Install dependencies (npm ci)
3. Run build (npm run build)
4. Deploy to edge network

⏱️ **Build typically takes 2-3 minutes**

### 4.3 Check Deployment Status
- Green checkmark = ✅ Success
- Red X = ❌ Build failed (check logs)

---

## Step 5: Verify Production

### 5.1 Visit Your App
Click the **domain link** or visit:
```
https://prism-fluo.vercel.app
```

### 5.2 Test Key Features

1. **Dashboard Loads**
   - Navigate to `/dashboard`
   - Should see demo briefs (or your real briefs)

2. **Upload Works**
   - Go to `/upload`
   - Select a brief
   - Upload test Excel file
   - Should process successfully

3. **Demo Data Shows**
   - If you have no real briefs, demo briefs should display
   - Click demo brief → should go to insights page

### 5.3 Check Function Logs
1. In Vercel Dashboard, click **"Deployments"**
2. Click the deployment name
3. Click **"Runtime Logs"** tab
4. Look for any ERROR or WARN messages

✅ **App is live and working!**

---

## Post-Deployment

### Enable Auto-Deployment
Vercel automatically deploys when you push to `main` branch. No additional setup needed!

### Monitor Performance
- **Vercel Dashboard**: Check **"Analytics"** tab
- **Database**: Monitor Supabase query performance
- **Errors**: Check Sentry (if configured)

### Update Code Workflow
Going forward, just push to main:
```bash
git add -A
git commit -m "Your changes"
git push origin main
# Vercel auto-deploys within 1-2 minutes
```

---

## Troubleshooting

### Deployment Fails at Build

**Error**: "ENOENT: no such file or directory"

**Solution**:
```bash
# Test locally first
npm run build

# Check for missing dependencies
npm install

# Push to GitHub
git push origin main
```

**Check Vercel Logs**:
1. Dashboard → Deployments → failed deployment → Logs
2. Look for the specific error message
3. Fix locally, then push again

### Database Connection Error

**Error**: "ECONNREFUSED" or "role does not exist"

**Solution**:
1. Verify DATABASE_URL is correct
2. Check Supabase dashboard → Database → Connection pooling
3. Make sure pooler endpoint is used (port 6543, not 5432)
4. Check IP whitelisting in Supabase (may need to allow all IPs)

### Environment Variables Not Loading

**Error**: "undefined" in API response or "missing required variable"

**Solution**:
1. Vercel Dashboard → Settings → Environment Variables
2. Verify all required variables are set
3. Redeploy without cache: Deployments → Redeploy → "Redeploy (Ignore Cache)"
4. Wait 2-3 minutes for deployment to complete

### Preview Deployment Not Working

**Note**: Vercel creates preview deployments for Pull Requests

**To Test**:
1. Create a feature branch
2. Push to GitHub
3. Create Pull Request
4. Vercel creates preview deployment (see PR comments)
5. Test on preview before merging to main

---

## Environment Variables Checklist

In Vercel Dashboard → Settings → Environment Variables, verify:

- [ ] `DATABASE_URL` - Supabase pooler URI (port 6543)
- [ ] `GEMINI_API_KEY` - Google AI key
- [ ] `NEXTAUTH_SECRET` - 32+ character random string
- [ ] `NEXTAUTH_URL` - https://prism-fluo.vercel.app
- [ ] `SMTP_HOST` - (optional) Email server
- [ ] `SMTP_PORT` - (optional) Email port
- [ ] `SMTP_USER` - (optional) Email account
- [ ] `SMTP_PASS` - (optional) Email password
- [ ] `SMTP_FROM` - (optional) Sender email

---

## Common Production Issues & Fixes

### Issue: Demo Data Not Showing
**Cause**: User has real briefs but none are visible
**Fix**: 
- Check database query in Supabase logs
- Verify authentication is working
- Check user session in browser console: `console.log(localStorage)`

### Issue: Upload Takes Too Long
**Cause**: Large Excel file or slow network
**Fix**:
- Test with smaller file locally
- Check Gemini API limits
- Monitor Vercel function logs for timeout (60s max)

### Issue: Email Not Sending
**Cause**: SMTP credentials incorrect or incomplete
**Fix**:
- Verify SMTP variables in Vercel Dashboard
- Test SMTP locally: `npm run test:email`
- Check Vercel logs for SMTP errors
- Use Gmail App Password (not regular password)

### Issue: High Latency/Slow Loads
**Cause**: Vercel region far from users or database
**Fix**:
- Change Vercel region: Settings → Regions
- Move Supabase to same region
- Enable caching for API responses (already configured)

---

## Next Steps

1. **Monitor**: Check Vercel Analytics daily for first week
2. **Backup**: Enable Supabase automated backups
3. **DNS**: Connect custom domain (if applicable)
4. **SSL**: Auto-enabled on Vercel
5. **Scaling**: Upgrade Vercel/Supabase plans as needed

---

## Support Resources

- **Vercel Docs**: https://vercel.com/docs
- **Supabase Docs**: https://supabase.com/docs
- **GitHub Issues**: https://github.com/rahulsoni25/prism-fluo/issues
- **Error Logs**: Vercel Dashboard → Deployments → Logs

---

## Rollback

If production breaks:

### Option 1: Revert Code
```bash
git revert HEAD
git push origin main
# Vercel auto-deploys previous version
```

### Option 2: Redeploy Previous Version
1. Vercel Dashboard → Deployments
2. Find the previous successful deployment
3. Click **"Redeploy"** button
4. Confirm redeployment

---

**Congratulations! 🎉 Your app is now live on Vercel!**

For detailed help, see [DEPLOYMENT.md](./DEPLOYMENT.md)

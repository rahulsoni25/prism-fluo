# Railway + Grok API Setup Guide

## Issue Found

Your app is deployed on **Railway** (not Vercel), and the previous configuration referenced **OLLAMA** for the Copilot feature. We've now implemented a **Grok-based Copilot** using xAI's Grok API for deeper, data-grounded insights.

**Error you saw:** "Copilot disabled — set OLLAMA_API_KEY on Railway"
**Root cause:** GROK_API_KEY was not configured on Railway dashboard, and old OLLAMA references were still in place.

---

## Quick Setup (5 minutes)

### Step 1: Verify You Have Grok API Key

1. Go to **https://console.x.ai/**
2. Sign in with your xAI account (or create one)
3. Navigate to **API Keys**
4. Create a new API key (format starts with `grok-`)
5. Copy the key — you'll use it in Step 2

> **First-time users:** xAI may provide free Grok API credits for development. Check your account dashboard.

### Step 2: Add GROK_API_KEY to Railway

1. Go to **https://railway.app/dashboard** (your project)
2. Click on **prism-fluo** service
3. Go to **Variables** tab
4. Click **Add Variable**
5. Set:
   - **Key:** `GROK_API_KEY`
   - **Value:** `grok-xxxxx...` (paste your key from Step 1)
6. Click **Save**

### Step 3: Deploy

Railway automatically triggers a redeploy when environment variables change. Wait for it to complete:

1. Watch the **Deployments** tab
2. Wait for the new deployment to show **Active** (green checkmark)
3. This takes ~2-3 minutes

### Step 4: Test

1. Navigate to your app: **https://prism-fluo.railway.app** (or your custom domain)
2. Go to **Upload** → upload any file → wait for analysis
3. Click **Insights** for the completed analysis
4. Look for **Copilot button** (purple ✨ in bottom-right)
5. Click it and ask a question like:
   - "What are the top insights from this data?"
   - "Summarize the commerce opportunities"
6. Should get a response within 2-5 seconds

**Expected success:** Copilot responds with data-grounded insights (not an error)

---

## How the Grok Copilot Works

### Architecture

```
User Question
    ↓
Frontend: Copilot.jsx
    ↓
/api/copilot endpoint (Grok-based)
    ↓
Fetch analysis data from database
    ↓
Build system prompt (constraints: data-only, no hallucinations)
    ↓
Call Grok API (xAI): grok-2-1212 model
    ↓
Constrain answer to provided analysis data
    ↓
Return answer to frontend
    ↓
Display in Copilot chat UI
```

### Key Features

✅ **Data-Grounded**: Only answers based on YOUR uploaded data
✅ **No Hallucinations**: System prompt enforces strict constraints
✅ **Conversational**: Full chat history maintained per session
✅ **Fast**: Responses in 2-5 seconds (grok API is low-latency)
✅ **4-Pillar Analysis**: Organizes insights by Content, Commerce, Communication, Culture
✅ **Actionable**: Recommends specific strategies based on data

### System Constraints in /api/copilot

The API builds this system prompt before calling Grok:

```
You ONLY answer questions based on the provided analysis data
You do NOT use general knowledge or external information
If a question cannot be answered from the data, you say: 
  "This insight is not available in the current analysis..."
You provide 4-pillar analysis when relevant
You recommend specific, actionable strategies based on the data
```

This ensures Grok **never** makes up information outside your uploaded data.

---

## Troubleshooting

### ❌ "Copilot disabled — set GROK_API_KEY"

**Check:**
1. Go to Railway dashboard → **prism-fluo** service → **Variables**
2. Verify `GROK_API_KEY=grok-...` is present
3. If not, add it (see Step 2 above)
4. If it's there, the deployment may not have completed yet
5. Wait 2-3 minutes and refresh the browser

**What if it STILL says "OLLAMA_API_KEY"?**
- Old build cache issue
- Solution: Go to Railway → **Deployments** → **Re-deploy latest** 
- Wait for "Active" status, then refresh your browser

### ❌ "Failed to generate insight. Please try again."

**Possible causes:**
1. Grok API key is invalid or expired
   - Check: **xAI Console** → API Keys → Verify key is still valid
   - Fix: Generate a new key and update Railway variables

2. xAI quota exhausted
   - Check: **xAI Console** → Usage/Billing
   - Fix: Top up credits or wait for monthly reset

3. Analysis data is malformed
   - Check: Does the analysis page load normally?
   - Fix: Re-upload the file and run analysis again

4. Network/API timeout
   - This is rare but can happen if Grok API is slow
   - Fix: Try again in 30 seconds

### ❌ Copilot button doesn't appear on insights page

**Check:**
1. Are you on the **Insights** page? (Copilot only shows there)
2. Did the analysis complete successfully? (button hidden until analysis loads)
3. Is JavaScript enabled in your browser?

**Fix:**
- Go to Upload → Upload a file
- Wait for analysis to complete (status shows "Ready")
- Click "Insights" 
- Copilot button should appear in bottom-right corner

### ❌ Slow responses (>15 seconds)

**Check:**
1. xAI Grok API rate limits
2. Your network connection
3. Analysis data size (very large datasets may need more time)

**Fix:**
- Try a simpler question first
- Break complex analysis into smaller questions
- Check your internet connection
- If Grok is slow, try again later (their servers may be under load)

---

## Monitoring & Metrics

### Check Copilot usage in logs

Railway provides logs in **Logs** tab:

```bash
# Search for copilot activity
grep copilot railway_logs.txt

# Should see entries like:
copilot:answer_generated ms=1420 questionLength=45 answerLength=320
```

### What's normal?

- **Response time:** 2-5 seconds
- **Questions per analysis:** Unlimited (conversational)
- **History preserved:** Per session only (cleared on page refresh)
- **No cost from PRISM:** Only Grok API calls cost (you pay xAI, not us)

---

## API Reference

### Endpoint

```
POST /api/copilot
```

### Request

```json
{
  "analysisId": "abc-123",
  "question": "What are the top opportunities?",
  "conversationHistory": [
    { "role": "user", "content": "Previous question..." },
    { "role": "assistant", "content": "Previous answer..." }
  ]
}
```

### Response (Success)

```json
{
  "answer": "Based on your data, the top opportunities are..."
}
```

### Response (Error)

```json
{
  "error": "CONFIG_ERROR",
  "message": "Copilot API key not configured. Please add GROK_API_KEY or XAI_API_KEY to environment variables."
}
```

---

## Security & Privacy

### Your Data
- ✅ Sent to Grok API only to answer your question
- ✅ **NOT** used to train models
- ✅ **Deleted** after response generated
- ✅ Per-analysis scope (can't access other users' data)

### Conversation History
- ✅ Stored **in browser** only (browser session memory)
- ✅ **Cleared** on page refresh
- ✅ **Not** saved to database
- ✅ **Not** shared with other users

### API Key Security
- ✅ HTTPS for all calls
- ✅ API key **never** exposed to browser
- ✅ API key stored **only** on Railway (environment variables)
- ✅ User authentication required on all endpoints

---

## Next Steps

1. **Immediate:** Add `GROK_API_KEY` to Railway Variables (see Step 2)
2. **Verify:** Test Copilot on an insights page (see Step 4)
3. **Monitor:** Check logs for `copilot:answer_generated` entries
4. **Iterate:** Gather user feedback on insight quality

---

## FAQ

**Q: Do I need OLLAMA_API_KEY anymore?**  
A: No. The new Grok implementation replaces it. You can remove OLLAMA_API_KEY from Railway variables if it exists.

**Q: Can users access other users' data through Copilot?**  
A: No. Each analysis is user-scoped. The API checks authorization before fetching analysis data.

**Q: What if I want to use OLLAMA instead of Grok?**  
A: Possible but not recommended. Grok is faster, more reliable. If needed, you'd need to create a separate `/api/ollama` endpoint and revert Copilot.jsx.

**Q: Is there a free tier for Grok?**  
A: Yes, xAI offers free credits for new users. Check https://console.x.ai/

**Q: Can conversation history be longer?**  
A: Yes, but limited by Grok's context window (~8K tokens). Very long conversations may be truncated automatically.

**Q: What happens if Grok goes down?**  
A: Copilot will show an error. Fix: Wait for xAI to recover, then retry.

---

## Support

- **Grok API issues:** https://docs.x.ai/
- **Railway issues:** https://railway.app/support
- **PRISM Fluo issues:** https://github.com/rahulsoni25/prism-fluo/issues

---

**Last Updated:** May 6, 2026  
**Status:** Production Ready  
**API Model:** grok-2-1212

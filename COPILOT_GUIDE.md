# PRISM Fluo Copilot - User & Setup Guide

## Overview

**PRISM Copilot** is an AI-powered assistant that provides **deeper, contextual insights** into your uploaded data. It uses **Grok API (xAI)** to answer your questions about the analysis while staying **constrained to only your uploaded data** (no general knowledge hallucinations).

Access Copilot from the **Insights Page** - it appears as a floating button in the bottom-right corner.

---

## Features

✨ **Data-Grounded Insights**
- Answers based ONLY on your uploaded data
- Never makes up information outside the analysis
- Cites specific data points and metrics

🎯 **4-Pillar Analysis**
- Content strategy recommendations
- Commerce/sales optimization insights
- Communication & brand voice analysis
- Culture & community building strategies

💬 **Conversational Interface**
- Ask follow-up questions
- Full conversation history maintained
- Multi-turn dialogue for deeper understanding

⚡ **Real-Time Responses**
- Instant insight generation
- Responses in 2-5 seconds
- Error handling with helpful messages

---

## How to Use

### 1. Upload Data & View Insights
```
1. Go to Dashboard → Upload
2. Select a brief and upload Excel file
3. Choose custom SLA (3h, 6h, 12h, 24h, 48h)
4. Wait for analysis to complete
5. Click "Ready" brief → Insights page
```

### 2. Open Copilot
On the Insights page:
- Look for the purple **Copilot button** (bottom-right corner)
- Click to open the chat panel
- See welcome message from Copilot

### 3. Ask Questions

**Example Questions:**
- "What are the top opportunities for content strategy based on this data?"
- "How can we improve our commerce conversion rate?"
- "What cultural shifts are visible in our audience?"
- "Which communication channels are most effective?"
- "Summarize the key insights across all 4 pillars."
- "What specific actions should we take?"

### 4. Follow-Up Questions
- Ask follow-ups for deeper understanding
- Copilot remembers conversation history
- Refine recommendations with additional context

### 5. Export or Share
- Take screenshots of insights
- PDF export hides Copilot (use "Print to PDF")
- Share key insights with your team

---

## Setup & Configuration

### Prerequisites
- Grok API key from xAI (xAI.com)
- Add to environment variables

### Step 1: Get Grok API Key

1. Go to: **https://console.x.ai/**
2. Sign in with your xAI account
3. Create API key
4. Copy the key (format: grok-...)

### Step 2: Local Development Setup

Update `.env.local`:
```env
GROK_API_KEY=grok-xxxxx
```

Restart dev server:
```bash
npm run dev
```

### Step 3: Production Setup (Vercel)

1. Go to: **Vercel Dashboard** → prism-fluo project
2. Click **Settings** → **Environment Variables**
3. Add new variable:
   - Name: `GROK_API_KEY`
   - Value: `grok-xxxxx` (your API key)
4. Click "Save"
5. Redeploy from Deployments tab

### Step 4: Verify

1. Navigate to Insights page
2. Click Copilot button
3. Ask a test question
4. Should see response within 2-3 seconds

---

## How Copilot Works

### System Prompt (Constraints)

Copilot operates with strict constraints:

```
You ONLY answer questions based on the provided analysis data
You do NOT use general knowledge or external information
If a question cannot be answered from the data, you say so clearly
You organize insights by the 4 pillars: Content, Commerce, Communication, Culture
You recommend specific, actionable strategies based on the data
```

This ensures Copilot never hallucinates or provides information outside your data.

---

## Example Use Cases

### Use Case 1: Content Strategy Deep Dive
```
User: "What content themes resonate most with our audience?"

Copilot: [Analyzes uploaded data for content performance]
"Based on your data, these content themes drive the highest engagement:
- Theme A: 45% engagement rate (vs 22% average)
- Theme B: 38% engagement rate
- Theme C: 31% engagement rate

Recommendation: Double down on Themes A & B in Q2."

User: "How should we format this content?"

Copilot: "Your video content outperforms articles by 3.2x.
Within video: short-form (under 60s) drives 2.1x more conversions."
```

### Use Case 2: Commerce Optimization
```
User: "Why is our conversion rate declining?"

Copilot: "Your data shows a conversion drop starting Week 3:
- Checkout page abandonment up 12%
- Mobile conversion dropped 18%
- Cart value decreased by $15 average

Focus on mobile checkout UX first."
```

### Use Case 3: 4-Pillar Summary
```
User: "Give me a 4-pillar summary with top 3 actions."

Copilot: [Aggregates across all pillars]

CONTENT: Short-form video drives 3x engagement
ACTION: Create weekly short-form video series

COMMERCE: Mobile checkout is bottleneck
ACTION: Implement 1-click checkout

COMMUNICATION: Email outperforms social by 25%
ACTION: Shift 20% budget from social to email

CULTURE: User-generated content drives 2.1x engagement
ACTION: Launch brand ambassador program

TOP 3 ACTIONS (by impact):
1. Implement 1-click mobile checkout
2. Create weekly short-form video content
3. Launch community program
```

---

## Troubleshooting

### Copilot Button Not Showing
- **Cause**: No analysis loaded
- **Fix**: Upload file → go to insights page first

### "API key not configured" Error
- **Cause**: GROK_API_KEY not set
- **Fix**: Add to .env.local or Vercel variables, restart server

### Slow Responses (>10 seconds)
- **Cause**: Large data or Grok API delays
- **Fix**: Try simpler questions, check network

### "This insight is not available" Response
- **Cause**: Question can't be answered from your data
- **Fix**: Upload more relevant data with that information

### Conversation Not Remembered
- **Cause**: Page refresh or navigation away
- **Fix**: Conversation is per-session only

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
  "question": "What are the key insights?",
  "conversationHistory": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

### Response
```json
{
  "answer": "Based on your data..."
}
```

### Error Codes
- `401` - Unauthenticated
- `400` - Missing required fields
- `404` - Analysis not found
- `500` - API configuration error

---

## Best Practices

**Be Specific**
- ✅ "What content drives engagement for millennials?"
- ❌ "Tell me about content"

**Ask Follow-Ups**
- Ask "Why?" to understand reasoning
- Ask "How?" for implementation details
- Ask "What if?" to explore scenarios

**Cite Data Points**
- Ask Copilot to cite specific data
- Verify against your own knowledge
- Use as starting point for deeper analysis

**Use for Decision-Making**
- ✅ Validate strategies with data
- ✅ Identify optimization opportunities
- ❌ Don't use as sole source of truth

**Provide Context**
- Include relevant timeframes
- Mention audience segments
- Reference comparable campaigns

---

## Limits

| Aspect | Limit | Note |
|--------|-------|------|
| Question Length | 2000 chars | Very long auto-truncated |
| Response Length | 2000 tokens | ~1500 words max |
| Response Time | 30 seconds | Timeout threshold |
| Conversation History | Full maintained | Previous context sent |
| Daily Requests | Unlimited | Based on xAI quota |

---

## Privacy & Security

**Your Data:**
- Only sent to Grok API for answering
- Not used to train models
- Deleted after response

**Conversation:**
- Stored in browser session only
- Cleared on page refresh
- Not saved to database

**Security:**
- HTTPS for all API calls
- API key never exposed to client
- User authentication required

---

## FAQ

**Q: Can Copilot access other users' data?**
A: No. Each analysis is user-scoped. Copilot only sees your data.

**Q: Is Grok better than Gemini?**
A: Different tools:
- Gemini: Initial analysis generation
- Grok: Follow-up contextual Q&A

**Q: Can I export conversations?**
A: Take screenshots or copy/paste to notes. PDF export hides Copilot.

**Q: Does Copilot learn from my data?**
A: No. Each question starts fresh. Your data isn't retained.

**Q: What if Copilot is wrong?**
A: Rare but possible. Always verify against original data and ask for citations.

**Q: Can I use offline?**
A: No. Requires internet connection to Grok API.

**Q: Is there a cost?**
A: Yes, based on xAI Grok API usage. Check pricing at xAI.com.

---

## Support

- Email: rahulsoni25@gmail.com
- GitHub: https://github.com/rahulsoni25/prism-fluo/issues

---

**Last Updated**: May 6, 2026  
**Version**: 0.1.1  
**Status**: Production Ready

# PRISM Fluo - Marketing Intelligence Dashboard

**PRISM Fluo** is an AI-powered marketing intelligence platform that analyzes customer data across 4 pillars: **Content**, **Commerce**, **Communication**, and **Culture**.

Upload Excel files with customer insights → Get AI-analyzed briefs → Generate PPTX presentations with actionable recommendations.

![Status](https://img.shields.io/badge/status-active-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-0.1.1-blue)

---

## Key Features

✨ **4-Pillar Marketing Analysis**
- Content: Message strategy & storytelling
- Commerce: Sales & conversion optimization
- Communication: Brand voice & engagement
- Culture: Community & loyalty building

📊 **Smart Brief Management**
- Create campaign briefs with custom SLA targets
- Auto-calculate processing time based on queue
- Track brief status: Draft → Processing → Ready
- Link data uploads to specific briefs

📈 **AI-Powered Insights**
- Upload Excel files with customer data
- Google Gemini AI generates actionable insights
- Automatic analysis categorization
- Historical tracking of analyses

📋 **PPTX Deck Generation**
- Auto-generate professional presentations
- 4-pillar recommendations per campaign
- Customizable SLA timelines
- Ready for executive presentations

👥 **Demo & Prototype Data**
- New users see realistic demo briefs
- Pre-populated Nike, Coca-Cola, Samsung examples
- Click-through insights preview
- No setup needed to explore UI

---

## Quick Start

### Local Development

1. **Clone & Install**
   ```bash
   git clone https://github.com/rahulsoni25/prism-fluo.git
   cd prism-fluo
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your API keys and database URL
   ```

3. **Initialize Database**
   ```bash
   npm run db:init
   ```

4. **Start Dev Server**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard)

---

## Production Deployment

**👉 See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete setup guide**

### Quick Deploy to Vercel

```bash
# 1. Push to GitHub
git push origin main

# 2. Go to https://vercel.com/dashboard
# 3. Import the GitHub repository
# 4. Add environment variables
# 5. Deploy!
```

**Project Details**:
- Vercel Project ID: `prj_wim4Id5MTx7OF8yNsFqRJOCdpOyR`
- GitHub: https://github.com/rahulsoni25/prism-fluo
- Deployed at: https://prism-fluo.vercel.app

---

## Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS v4
- **Backend**: Next.js API Routes, TypeScript
- **Database**: Supabase PostgreSQL
- **AI**: Google Generative AI (Gemini)
- **File Processing**: ExcelJS, PapaParse
- **Presentations**: PptxGenJS
- **Email**: Nodemailer
- **Hosting**: Vercel
- **Monitoring**: Sentry (optional)

---

## Project Structure

```
prism-fluo/
├── app/
│   ├── api/                 # API endpoints
│   │   ├── dashboard/       # Dashboard aggregation
│   │   ├── analyses/        # Analysis CRUD
│   │   ├── briefs/          # Brief management
│   │   ├── upload/          # File upload & processing
│   │   └── presentations/   # PPTX generation
│   ├── dashboard/           # Dashboard page
│   ├── insights/            # Analysis insights page
│   ├── upload/              # Upload flow page
│   └── layout.tsx           # Root layout
├── components/              # Reusable React components
│   ├── BriefSelectModal.jsx # Brief selection modal
│   ├── SlaSelectModal.jsx   # SLA customization modal
│   └── ...                  # Other UI components
├── lib/
│   ├── api/                 # API utilities
│   ├── auth/                # Authentication
│   ├── db/                  # Database client & schema
│   ├── uploads/             # Upload processing logic
│   ├── pptx/                # PPTX generation engine
│   ├── sla.ts               # SLA calculation
│   ├── email/               # Email templates
│   └── logger.ts            # Logging utility
├── public/                  # Static assets
├── styles/                  # Global styles
├── .vercel/                 # Vercel configuration
├── vercel.json              # Vercel deployment config
├── package.json             # Dependencies
├── DEPLOYMENT.md            # 👈 Deployment guide
└── README.md                # This file
```

---

## User Flow

### 1. Upload Data
- Navigate to `/upload`
- Select a brief from your campaigns
- Upload Excel file with customer insights
- Choose custom SLA (3h, 6h, 12h, 24h, 48h)

### 2. Analysis
- System processes file (2-5 minutes)
- AI categorizes insights into 4 pillars
- Results stored in database

### 3. View Insights
- Dashboard shows all briefs & statuses
- Click "Ready" brief to view analysis
- See insights organized by pillar

### 4. Generate Presentation
- From insights page, click "Generate Deck"
- PPTX generated with:
  - Cover slide
  - Agenda with 4 pillars
  - Pillar dividers
  - Insight cards with recommendations
  - Closing slide
- Download and share with stakeholders

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | Supabase PostgreSQL connection string |
| `GEMINI_API_KEY` | ✅ | Google Generative AI API key |
| `NEXTAUTH_SECRET` | ✅ | Session encryption key (32+ chars) |
| `NEXTAUTH_URL` | ✅ | Base URL (localhost:3000 or production domain) |
| `SMTP_HOST` | ❌ | Email server host (for SLA notifications) |
| `SMTP_PORT` | ❌ | Email server port (usually 587) |
| `SMTP_USER` | ❌ | Email account username |
| `SMTP_PASS` | ❌ | Email account password/app password |
| `SMTP_FROM` | ❌ | Sender email address |

---

## API Endpoints

### Dashboard
- `GET /api/dashboard/overview` - Dashboard stats, briefs, recent analyses (cached 90s)

### Briefs
- `GET /api/briefs` - List user's briefs
- `POST /api/briefs` - Create new brief
- `PATCH /api/briefs/:id` - Update brief

### Uploads
- `POST /api/upload` - Upload file, trigger analysis

### Analyses
- `GET /api/analyses` - List user's analyses
- `POST /api/analyses` - Save analysis result

### Presentations
- `POST /api/presentations/generate` - Generate PPTX from analysis

---

## Database Schema

### briefs
```sql
id, user_id, brand, category, objective, status, 
analysis_id, created_at, sla_hours, sla_due_at, actual_completed_at
```

### uploads
```sql
id, user_id, filename, sheet_name, status, created_at,
brief_id, sla_hours, sla_due_at
```

### analyses
```sql
id, user_id, upload_id, sheet_name, filename, results_json,
brief_id, created_at
```

### presentations
```sql
id, user_id, analysis_id, deck_name, pptx_base64, created_at
```

---

## Performance

- **Dashboard**: 90-second per-user cache
- **API Responses**: `Cache-Control: private, max-age=30`
- **Database Queries**: Parallel execution with Promise.all()
- **Dashboard Endpoint**: Single round-trip aggregation in DB
- **Demo Data**: Instant loading for new users (no DB query)

---

## Features by Status

| Feature | Status | Version |
|---------|--------|---------|
| Upload Excel files | ✅ | 0.1.0 |
| 4-pillar analysis | ✅ | 0.1.0 |
| Brief management | ✅ | 0.1.0 |
| Dashboard view | ✅ | 0.1.0 |
| Insights page | ✅ | 0.1.0 |
| PPTX generation | ✅ | 0.1.1 |
| Brief selection modal | ✅ | 0.1.1 |
| SLA customization | ✅ | 0.1.1 |
| Demo data | ✅ | 0.1.1 |
| Email notifications | 🔄 | Planned |
| Team collaboration | 🔄 | Planned |
| Custom branding | 🔄 | Planned |

---

## Contributing

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Commit changes: `git commit -m "Add feature"`
3. Push branch: `git push origin feature/your-feature`
4. Open Pull Request

---

## License

MIT - See LICENSE file for details

---

## Support

- **Documentation**: [DEPLOYMENT.md](./DEPLOYMENT.md)
- **Issues**: [GitHub Issues](https://github.com/rahulsoni25/prism-fluo/issues)
- **Email**: rahulsoni25@gmail.com

---

## Changelog

### v0.1.1 (May 6, 2026)
- ✨ PPTX deck generation with 4-pillar structure
- ✨ Brief selection modal before upload
- ✨ Custom SLA selection modal with go-live timing
- ✨ Demo data visibility for new users
- 🐛 Fix SLA propagation from modal to brief

### v0.1.0 (May 1, 2026)
- 🎉 Initial release
- ✨ Upload & analysis workflow
- ✨ Dashboard with brief management
- ✨ Insights page with 4-pillar breakdown

---

**Made with ❤️ by PRISM Labs**

# PRISM Ads Connector

**Connect Claude to Google and Meta Ads. It can audit, edit, and schedule your ads.**

A zero-dependency [Model Context Protocol](https://modelcontextprotocol.io) (MCP)
server. Add it to Claude (Desktop, Code, or any MCP client) and Claude becomes
your ad-ops team — it can run a full account audit, find wasted spend, pause
underperformers in bulk, add negative keywords at scale, build audit decks, and
schedule recurring checks. Works with **Google Ads**, **Meta Ads**, and **GA4**
from the same connector.

> Runs in **demo mode out of the box** — no credentials needed to try it. Every
> demo response is flagged `"_demo": true`. Add credentials to go live.

---

## What Claude can do once it's connected

| # | Skill | What it does |
|---|-------|--------------|
| 1 | `account_audit` | Scans campaigns, keywords, search terms & tracking and flags every issue with a severity + recommendation |
| 2 | `find_wasted_spend` | *"keywords with zero conversions that spent over $500 this month"* — and totals the recoverable spend |
| 3 | `pause_underperformers` | *"pause all ad groups with CPA above $60 across all campaigns"* (dry-run by default) |
| 4 | `add_negative_keywords` | One command adds negatives across **every** campaign in the account |
| 5 | `build_report` | *"create an 8-slide audit deck with charts and recommendations"* → a structured deck spec |
| 5b | `export_deck_pptx` | Renders a `build_report` deck into a real **.pptx** via PRISM's PptxGenJS pipeline (needs `PRISM_RENDER_URL`) |
| 6 | `schedule_task` | *"every Monday check budget pacing and alert me if anything is off"* |
| + | `list_ad_accounts` | Discover the account IDs the other skills need |
| + | `google_ads_query` · `meta_ads_insights` · `ga4_run_report` | Raw power tools — ask Claude anything the curated skills don't cover |

Write actions (`pause_underperformers`, `add_negative_keywords`) **default to
`dryRun: true`** and return exactly what they *would* change — nothing is
modified until you re-run with `dryRun: false`.

---

## 30-second setup

### 1. Add it to your MCP client

**Claude Code (CLI):**

```bash
claude mcp add prism-ads -- node /absolute/path/to/prism-fluo/connector/src/server.mjs
```

**Claude Desktop** — add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "prism-ads": {
      "command": "node",
      "args": ["/absolute/path/to/prism-fluo/connector/src/server.mjs"],
      "env": {
        "GOOGLE_ADS_DEVELOPER_TOKEN": "",
        "GOOGLE_ADS_CLIENT_ID": "",
        "GOOGLE_ADS_CLIENT_SECRET": "",
        "GOOGLE_ADS_REFRESH_TOKEN": "",
        "GOOGLE_ADS_LOGIN_CUSTOMER_ID": "",
        "META_ACCESS_TOKEN": ""
      }
    }
  }
}
```

Leave the `env` values blank to explore in demo mode first.

### 2. (To go live) add credentials

Copy `.env.example` → `.env` and fill in the platform(s) you want. See the file
for where each value comes from. Any platform left blank stays in demo mode, so
you can connect Google first and add Meta later.

### 3. Talk to Claude

> "Run a full audit of my Google Ads account and show me the top 5 wasted-spend keywords."
> "Pause every ad set over $60 CPA on Meta — dry run first."
> "Build me an 8-slide audit deck."

---

## Exporting audits to .pptx

`build_report` returns a structured deck spec. To turn it into a real
PowerPoint file, the connector POSTs that spec to PRISM's renderer endpoint
(`POST /api/connector/render-deck`), which uses the app's existing PptxGenJS
pipeline and house styles. Set:

```
PRISM_RENDER_URL=https://prism-fluo.vercel.app/api/connector/render-deck
```

Then ask Claude to *"build an 8-slide audit deck and export it to PowerPoint"* —
`export_deck_pptx` saves the .pptx and returns the path.

## Requirements

- **Node ≥ 18** (uses the built-in `fetch`). No npm install needed — zero deps.

## How it works

```
server.mjs        # MCP JSON-RPC server over stdio (newline-delimited)
 ├─ registry.mjs  # collects skills + builds the platform clients
 ├─ skills/       # the capabilities above (one file each)
 ├─ data/         # normalized Google/Meta snapshots (live OR demo, same shape)
 ├─ platforms/    # thin REST clients: google-ads, meta-ads, ga4
 └─ demo/         # realistic sample data for demo mode
```

Each skill returns both a human-readable `content` block and a
`structuredContent` object, so Claude can read the numbers and act on them.

Adding a new skill = drop a module in `src/skills/` and import it in
`registry.mjs`. The raw passthrough tools (`google_ads_query`, etc.) already
expose the full GAQL / Graph / GA4 surface for anything not yet wrapped.

## Run it directly / test

```bash
cd connector
npm start          # start the stdio server (Ctrl-C to stop)
npm test           # 14 tests — protocol handshake + every skill, in demo mode
```

## Scheduling

`schedule_task` persists jobs to `connector/.data/schedule.json`. A host runner
(cron, a worker, or the PRISM app) reads `list_scheduled_tasks` and executes the
named skill on cadence — keeping the connector itself stateless and portable.

## Security notes

- Credentials are read only from env vars and are **never logged**.
- Logs go to **stderr** so they can't corrupt the stdio protocol stream.
- Mutations are **dry-run by default**; demo mode can never write to a live account.

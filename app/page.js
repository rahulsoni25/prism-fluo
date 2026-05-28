import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/server';
import Link from 'next/link';
import styles from './landing.module.css';

/**
 * Public marketing landing page for PRISM Council.
 *
 * Behaviour:
 *  - Logged-in users → bounced to /dashboard so the homepage doesn't get in
 *    their way day-to-day.
 *  - Logged-out visitors → see the marketing page (this is the "sell to
 *    agencies like a cup of tea" surface).
 *
 * Positioning (locked in 2026-05-28 session with rahulsoni25):
 *   Name      : PRISM Council
 *   Hook      : The brain of a senior strategist. The speed of an intern.
 *   Hero buyer: Indian network + independent agencies (Ring 1 + Ring 2)
 *   Beachhead : Lowe Lintas (live design partner)
 *   Anti-LLM  : "Engine vs car" — Claude/GPT is horizontal, PRISM is vertical
 *   Moats     : 6 methodologies · 7-agent verifier council · source parsers ·
 *               Lowe partnership · compounding feedback loop
 */
export default async function Home() {
  const session = await getSession().catch(() => null);
  if (session) redirect('/dashboard');

  return (
    <div className={styles.page}>
      {/* ── NAV ───────────────────────────────────────────────── */}
      <header className={styles.nav}>
        <Link href="/" className={styles.brand}>
          <div className={styles.brandIcon}>P</div>
          <span className={styles.brandText}>PRISM <em>Council</em></span>
        </Link>
        <nav className={styles.navLinks}>
          <a href="#how">How it works</a>
          <a href="#moat">The 7-Agent Council</a>
          <a href="#who">Who it's for</a>
          <a href="#vs">vs. ChatGPT</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <div className={styles.navCta}>
          <Link href="/login" className={styles.navLink}>Sign in</Link>
          <Link href="/signup" className={styles.btnPrimary}>Book a walkthrough</Link>
        </div>
      </header>

      {/* ── HERO ──────────────────────────────────────────────── */}
      <section className={styles.hero}>
        <div className={styles.heroEyebrow}>
          <span className={styles.dot} /> Trusted by strategists at Lowe Lintas, India
        </div>
        <h1 className={styles.heroH1}>
          The brain of a senior strategist.<br />
          <span className={styles.heroAccent}>The speed of an intern.</span>
        </h1>
        <p className={styles.heroSub}>
          PRISM Council reads your GWI, Comscore, SimilarWeb and Konnect Insights —
          then writes the brief using your team's strategic frameworks, verified
          by 7 AI agents before you ever see it.
        </p>
        <div className={styles.heroCtas}>
          <Link href="/signup" className={styles.btnPrimaryLg}>Try with your next brief →</Link>
          <a href="#how" className={styles.btnSecondaryLg}>See how it works</a>
        </div>
        <div className={styles.heroProof}>
          <strong>20 minutes</strong> data → deck &nbsp;·&nbsp;
          <strong>7 agents</strong> verify every card &nbsp;·&nbsp;
          <strong>0</strong> hallucinated stats &nbsp;·&nbsp;
          <strong>100%</strong> cited to source
        </div>
      </section>

      {/* ── DATA SOURCES STRIP ─────────────────────────────────── */}
      <section className={styles.sourcesStrip}>
        <p className={styles.stripLabel}>BUILT FOR THE DATA YOUR STRATEGISTS ALREADY USE</p>
        <div className={styles.sourcesGrid}>
          {['GWI', 'Comscore', 'SimilarWeb', 'Konnect Insights', 'Google Keyword Planner', 'Helium10', 'Brandwatch', 'Meltwater'].map(s => (
            <div key={s} className={styles.sourceChip}>{s}</div>
          ))}
        </div>
        <p className={styles.stripFootnote}>+ any PDF, PPTX, Excel or CSV your client sends over</p>
      </section>

      {/* ── PROBLEM ───────────────────────────────────────────── */}
      <section className={styles.problem}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>The strategist's tax</span>
          <h2>You have the data. The brief is due Friday.<br />Somewhere in 12 tabs of GWI is the insight that wins the pitch.</h2>
        </div>
        <div className={styles.problemGrid}>
          <div className={styles.problemCard}>
            <div className={styles.problemNum}>80%</div>
            <p>of strategist time goes to <strong>translating data</strong>, not telling the story.</p>
          </div>
          <div className={styles.problemCard}>
            <div className={styles.problemNum}>3 days</div>
            <p>average time from raw export → client-ready insight deck. Per brief.</p>
          </div>
          <div className={styles.problemCard}>
            <div className={styles.problemNum}>1 wrong number</div>
            <p>in a board meeting destroys five years of agency trust.</p>
          </div>
          <div className={styles.problemCard}>
            <div className={styles.problemNum}>∞ prompts</div>
            <p>your team re-types into ChatGPT every Monday morning. No consistency. No audit. No compounding.</p>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────── */}
      <section id="how" className={styles.how}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>How it works</span>
          <h2>Three steps. Twenty minutes. Verified output.</h2>
        </div>
        <div className={styles.howGrid}>
          <div className={styles.howStep}>
            <div className={styles.howStepNum}>01</div>
            <h3>Drop your files</h3>
            <p>Multi-source per brief. GWI exports, keyword CSVs, Konnect dumps, the PDF the client sent at 11pm. PRISM auto-detects the source and parses it.</p>
          </div>
          <div className={styles.howStep}>
            <div className={styles.howStepNum}>02</div>
            <h3>Frame the brief</h3>
            <p>Brand, audience, focus questions. The Mapper validates whether your data can actually answer the questions — <em>before</em> you waste a token analyzing thin sources.</p>
          </div>
          <div className={styles.howStep}>
            <div className={styles.howStepNum}>03</div>
            <h3>Get verified insight cards</h3>
            <p>3–6 cards per brief. Each with title, observation, stat, recommendation. Auto-typed charts. Every claim cited. Export to PPTX in three validated templates.</p>
          </div>
        </div>
      </section>

      {/* ── METHODOLOGIES ─────────────────────────────────────── */}
      <section className={styles.methods}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>The thinking inside</span>
          <h2>Six strategic methodologies, hard-coded.</h2>
          <p className={styles.sectionLede}>
            ChatGPT is a brilliant generalist. Strategy is a craft with specific frameworks.
            PRISM has them compiled in — so every output respects the discipline your seniors swear by.
          </p>
        </div>
        <div className={styles.methodsGrid}>
          {[
            { name: 'Insight Strategist for Ads', src: 'GWI', desc: 'Main Headline + Audience Snapshot + 3–6 Title/Observation/Stat/Rec cards. Mandatory chart-type rules (binary→doughnut, persona→radar). Anti-hallucination guardrails.' },
            { name: '8-Layer Keyword Methodology', src: 'Google Keyword Planner', desc: 'Volume → Intent → Themes → Competition → Trend → Recommendations → Deep Intel → Senior Toolkit.' },
            { name: '3-Lens Commerce', src: 'Helium10 · Amazon · Flipkart', desc: 'Creative / Media / Category lenses, each graded by conviction.' },
            { name: '3-Lens Social Listening', src: 'Konnect · Brandwatch · Meltwater', desc: 'Same 3-lens rigor applied to conversation, sentiment and share-of-voice data.' },
            { name: 'PPTX Narrative Strategist', src: 'Client decks', desc: "Parses the deck's central argument and surfaces the tensions worth resolving — turning competitive reads into opportunities." },
            { name: '4Cs × 4 Levers Framework', src: 'Across all sources', desc: 'Every insight bucketed by Content / Commerce / Communication / Culture × Creative / Channel / Media / Pricing / Search.' },
          ].map(m => (
            <div key={m.name} className={styles.methodCard}>
              <div className={styles.methodSrc}>{m.src}</div>
              <h3>{m.name}</h3>
              <p>{m.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── THE MOAT — 7-AGENT COUNCIL ─────────────────────────── */}
      <section id="moat" className={styles.moat}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>The moat</span>
          <h2>Every insight passes through a 7-agent Council<br />before you see it.</h2>
          <p className={styles.sectionLede}>
            Most AI tools are <em>one prompt + hope</em>. PRISM Council runs every card past seven
            specialised verifiers. They cross-confirm each other. They block what they catch.
          </p>
        </div>
        <div className={styles.agentsGrid}>
          {[
            { name: 'ProofReader', catches: 'Jargon, truncated titles, mixed currency, brand mis-capitalisation' },
            { name: 'StatChecker', catches: 'Numbers that don\'t match the source row they claim to' },
            { name: 'FactAnalyzer', catches: 'Claims unsupported by anything in the upload' },
            { name: 'MathIntegrity', catches: 'Percentages that don\'t add to 100, ratios that lie' },
            { name: 'Coverage', catches: 'Cards that skip a required section of the methodology' },
            { name: 'BrandIsolation', catches: 'Foreign brand leaks (a rival surfacing in your client\'s deck)' },
            { name: 'InsightQuality', catches: 'Cards with no data point, no action verb, no concrete noun, no tension' },
          ].map((a, i) => (
            <div key={a.name} className={styles.agentCard}>
              <div className={styles.agentIdx}>0{i + 1}</div>
              <h4>{a.name}</h4>
              <p>{a.catches}</p>
            </div>
          ))}
        </div>
        <div className={styles.moatFooter}>
          Plus three more councils running quietly behind the scenes: <strong>Mapper</strong> (data routing),
          <strong> AI Health</strong> (model reliability), <strong>Export</strong> (PPTX compliance).
          315 tests. 4 councils. 7 verifiers. One ruthless standard.
        </div>
      </section>

      {/* ── VS CHATGPT/CLAUDE ──────────────────────────────────── */}
      <section id="vs" className={styles.versus}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>Why not just ChatGPT?</span>
          <h2>Claude is an engine. PRISM is the car.</h2>
          <p className={styles.sectionLede}>
            Anyone can prompt an LLM. Nobody else has six methodologies, seven verifiers,
            and a top-5 Indian agency teaching the system what good looks like.
          </p>
        </div>
        <div className={styles.versusTable}>
          <div className={styles.versusCol}>
            <h3 className={styles.colChatgpt}>ChatGPT / Claude alone</h3>
            <ul>
              <li>One prompt, one answer, no audit trail</li>
              <li>Re-explains the brief, the brand, the audience — every time</li>
              <li>Hallucinates numbers from messy CSVs</li>
              <li>12 strategists = 12 different output shapes</li>
              <li>No source citation — "where did this number come from?"</li>
              <li>Doesn't learn from your agency's work</li>
              <li>$20/month per seat — and you still do all the verification</li>
            </ul>
          </div>
          <div className={styles.versusColPrism}>
            <h3 className={styles.colPrism}>PRISM Council</h3>
            <ul>
              <li>Verified, cited, audit-trailed cards every time</li>
              <li>Brand, audience, frameworks loaded once — reused forever</li>
              <li>Source-specific parsers harden the data before the LLM sees it</li>
              <li>Same shape, same rigor, across the whole strategy team</li>
              <li>Every claim links back to the row in the upload</li>
              <li>Compounds with every brief your team runs</li>
              <li>Costs more — because it costs you nothing in client trust</li>
            </ul>
          </div>
        </div>
        <div className={styles.versusKicker}>
          <p>
            <strong>The historical pattern is clear.</strong> Databases exist — Salesforce is $300B.
            Text editors exist — Notion is $10B. Google Sheets exists — Airtable is $11B.
            <br /><br />
            Horizontal AI exists. PRISM is the vertical workflow on top of it —
            built for strategists, by strategists, with the discipline that general-purpose AI will never bother to build.
          </p>
        </div>
      </section>

      {/* ── WHO IT'S FOR ──────────────────────────────────────── */}
      <section id="who" className={styles.who}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>Who it's for</span>
          <h2>If your team ships briefs, PRISM pays for itself in a quarter.</h2>
        </div>
        <div className={styles.whoGrid}>
          <div className={styles.whoCard}>
            <div className={styles.whoBadge}>NETWORK AGENCY</div>
            <h3>Large agencies (50+ strategists)</h3>
            <p>Ogilvy, McCann, Leo Burnett, FCB, Lowe Lintas, DDB, Dentsu, BBDO, Havas, Wunderman Thompson.</p>
            <div className={styles.whoSavings}>
              <strong>1,440 hrs / quarter saved</strong>
              <span>12 strategists × 3 hrs × 40 briefs</span>
            </div>
            <div className={styles.whoOutcome}>Standardise output across offices. Cut "redo this slide" cycles. Onboard juniors faster.</div>
          </div>
          <div className={styles.whoCard}>
            <div className={styles.whoBadge}>INDEPENDENT</div>
            <h3>Small + independent agencies</h3>
            <p>Talented, Schbang, Tilt Brand Solutions, Wondrlab, The Glitch, Spring, FoxyMoron, Webchutney.</p>
            <div className={styles.whoSavings}>
              <strong>Punch above your weight</strong>
              <span>Ship like a 200-person agency with a team of 20</span>
            </div>
            <div className={styles.whoOutcome}>Win pitches against network agencies by shipping faster and tighter. Build a methodology moat without hiring 10 seniors.</div>
          </div>
          <div className={styles.whoCard}>
            <div className={styles.whoBadge}>BRAND-SIDE</div>
            <h3>In-house brand strategy teams</h3>
            <p>HUL, ITC, Marico, Dabur, Asian Paints, Tata Consumer, boAt, Mamaearth, Nykaa.</p>
            <div className={styles.whoSavings}>
              <strong>Stop receiving 80-slide decks</strong>
              <span>Get the so-what without the consulting fluff</span>
            </div>
            <div className={styles.whoOutcome}>Defensible decisions in the boardroom. Less agency dependency for routine reads.</div>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIAL / DESIGN PARTNER ───────────────────────── */}
      <section className={styles.testimonial}>
        <div className={styles.testCard}>
          <div className={styles.testBadge}>DESIGN PARTNER</div>
          <blockquote>
            "PRISM is what every strategist wishes their LLM did out of the box —
            actually follows our frameworks, actually cites the data, actually
            catches the mistakes we'd lose sleep over."
          </blockquote>
          <div className={styles.testAttribution}>
            — Strategy lead, <strong>Lowe Lintas India</strong>
          </div>
        </div>
      </section>

      {/* ── PRICING ───────────────────────────────────────────── */}
      <section id="pricing" className={styles.pricing}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>Pricing</span>
          <h2>Yes, it costs more than ChatGPT.<br />That's the point.</h2>
          <p className={styles.sectionLede}>
            One wrong number in a board meeting costs more than five years of PRISM.
            We price like a strategist costs — because we replace the most expensive part of one.
          </p>
        </div>
        <div className={styles.pricingGrid}>
          <div className={styles.pricingCard}>
            <h3>Independent</h3>
            <div className={styles.price}><span>From</span> ₹35,000<em>/mo</em></div>
            <ul>
              <li>Up to 5 strategists</li>
              <li>20 briefs per month</li>
              <li>All 6 methodologies</li>
              <li>Full 7-agent verification</li>
              <li>3 PPTX export templates</li>
              <li>Email support</li>
            </ul>
            <Link href="/signup" className={styles.priceCta}>Start trial</Link>
          </div>
          <div className={`${styles.pricingCard} ${styles.pricingCardFeatured}`}>
            <div className={styles.featuredBadge}>MOST POPULAR</div>
            <h3>Agency</h3>
            <div className={styles.price}><span>From</span> ₹1.4L<em>/mo</em></div>
            <ul>
              <li>Up to 25 strategists</li>
              <li>Unlimited briefs</li>
              <li>All methodologies + custom blueprints</li>
              <li>7-agent verification + audit log</li>
              <li>All PPTX templates + brand theme</li>
              <li>SSO, audit trail, priority support</li>
              <li>Quarterly strategist workshops</li>
            </ul>
            <Link href="/signup" className={styles.priceCtaPrimary}>Book a walkthrough</Link>
          </div>
          <div className={styles.pricingCard}>
            <h3>Network</h3>
            <div className={styles.price}>Custom</div>
            <ul>
              <li>50+ strategists, multi-office</li>
              <li>Multi-brand workspace isolation</li>
              <li>Custom methodology authoring</li>
              <li>On-prem data parsers (Comscore, SimilarWeb, Kantar)</li>
              <li>Dedicated success engineer</li>
              <li>Co-developed agent council</li>
            </ul>
            <Link href="/signup" className={styles.priceCta}>Talk to us</Link>
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────── */}
      <section className={styles.faq}>
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>FAQ</span>
          <h2>The five questions every strategy head asks.</h2>
        </div>
        <div className={styles.faqList}>
          <details className={styles.faqItem}>
            <summary>Why not just give my team ChatGPT licences?</summary>
            <p>You can — for one brief, by one strategist, with no audit trail and a lot of copy-paste. PRISM is for agencies shipping dozens of briefs a quarter where consistency, verification, and speed-at-scale matter. ChatGPT is the engine. PRISM is the car built around it.</p>
          </details>
          <details className={styles.faqItem}>
            <summary>Where does our data go? Is it secure?</summary>
            <p>Per-workspace isolation, encrypted at rest, never used to train models. On Network plans, we offer on-prem parsing for sensitive datasets (Comscore, Kantar, first-party research). Full audit log of every read and export.</p>
          </details>
          <details className={styles.faqItem}>
            <summary>How does it handle hallucinations?</summary>
            <p>Three ways. (1) Source-specific parsers harden the data before the LLM ever sees it. (2) Every claim must cite the source row — no citation, the card is rejected. (3) The 7-agent council catches what slips through. Real flagged-issues count is shown on every report.</p>
          </details>
          <details className={styles.faqItem}>
            <summary>What about a data source you don't support yet?</summary>
            <p>Today: GWI, Konnect Insights, Helium10, Google Keyword Planner, Brandwatch, PDFs, PPTX, generic Excel/CSV. Coming Q3: Comscore, SimilarWeb, Kantar, Nielsen. Network customers can request a parser as part of onboarding.</p>
          </details>
          <details className={styles.faqItem}>
            <summary>How long until my team is productive on it?</summary>
            <p>First brief in 20 minutes. Full team productivity in a week. Most agencies see ROI within the first month — measured in strategist hours saved and "didn't ship the wrong number" risk reduction.</p>
          </details>
        </div>
      </section>

      {/* ── FINAL CTA ─────────────────────────────────────────── */}
      <section className={styles.finalCta}>
        <h2>Your next pitch is due Friday.</h2>
        <p>Start it with PRISM Council. Ship it before lunch.</p>
        <div className={styles.heroCtas}>
          <Link href="/signup" className={styles.btnPrimaryLg}>Try with your next brief →</Link>
          <Link href="/login" className={styles.btnSecondaryLg}>I already have an account</Link>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────── */}
      <footer className={styles.footer}>
        <div className={styles.footerCol}>
          <div className={styles.brand}>
            <div className={styles.brandIcon}>P</div>
            <span className={styles.brandText}>PRISM <em>Council</em></span>
          </div>
          <p className={styles.footerTag}>The intelligence layer for strategic briefs.</p>
        </div>
        <div className={styles.footerCol}>
          <h5>Product</h5>
          <a href="#how">How it works</a>
          <a href="#moat">7-Agent Council</a>
          <a href="#pricing">Pricing</a>
        </div>
        <div className={styles.footerCol}>
          <h5>For</h5>
          <a href="#who">Network agencies</a>
          <a href="#who">Independent agencies</a>
          <a href="#who">Brand-side teams</a>
        </div>
        <div className={styles.footerCol}>
          <h5>Company</h5>
          <Link href="/login">Sign in</Link>
          <Link href="/signup">Get started</Link>
          <a href="mailto:hello@prism.fluo.digital">Contact</a>
        </div>
        <div className={styles.footerBottom}>
          © {new Date().getFullYear()} PRISM Council · Built by Fluo Digital · Made with conviction in India
        </div>
      </footer>
    </div>
  );
}

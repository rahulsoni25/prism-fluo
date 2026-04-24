'use client';
/**
 * /culture — Antigravity Culture Dashboard
 * Interactive bubble canvas showing 36 cultural trend signals for Urban India Gen Z.
 * Design system: DM Mono + Syne fonts, dark void aesthetic.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

// ── 36 trend signals ──────────────────────────────────────────
const TRENDS = [
  // MUSIC
  { id:'hm',  lbl:'Hass mat pagle',      cat:'music',   mom:'rising',   conf:.92, vel:88, px:.46, py:.12, cities:'Delhi · Chandigarh · Mumbai', desc:'Diljit Dosanjh track became a Reels anthem with 2.3M uses in 7 days. Punjabi-pop crossing into pan-urban mainstream at record speed — carried by remix culture, not radio.', tens:['Social identity','Digitally expressive'], tags:['reels','remix','punjabi-pop'], opp:'Align with joyful irreverence — partner with Reels remix culture before the peak flattens.', ls:['social-first','digital-native','status-driven'] },
  { id:'ap',  lbl:'AP Dhillon tour',     cat:'music',   mom:'peaking',  conf:.88, vel:61, px:.14, py:.40, cities:'Mumbai · Bengaluru · Delhi · Pune', desc:'India tour sold out across Metro cities. Live music is now the singular experience this TG plans months around — status, memory, and content all in one event.', tens:['Experience maximiser','Group socialiser'], tags:['live-music','concert','premium'], opp:'Experiential brand presence at venues — own an activation zone, not a banner.', ls:['experience-seeker','social-first','status-driven'] },
  { id:'af',  lbl:'Afrobeats fusion',    cat:'music',   mom:'emerging', conf:.67, vel:74, px:.76, py:.08, cities:'Bengaluru · Mumbai · Hyderabad', desc:'3 new Indian artists blending Afrobeats with desi sounds are gaining playlist traction. Not yet mainstream — 6–8 week window to act before it peaks.', tens:['Cultural sampler'], tags:['emerging','afrobeats','fusion'], opp:'Seed playlist partnerships early — early mover window is narrow.', ls:['cultural-explorer','digital-native'] },
  { id:'lofi',lbl:'Lo-fi study culture', cat:'music',   mom:'fading',   conf:.68, vel:28, px:.58, py:.74, cities:'Pan-urban (college cities)', desc:'Lo-fi study playlists dominated during exam culture but are plateauing as shorter-form content and podcast habits compete.', tens:['Escapist','Cultural sampler'], tags:['ambient','study','plateau'], opp:null, ls:['escapist','digital-native'] },
  { id:'indie',lbl:'Indie Hindi resurgence',cat:'music',mom:'rising',   conf:.77, vel:66, px:.30, py:.18, cities:'Delhi · Pune · Bengaluru', desc:'Artists like Prateek Kuhad seeing renewed discovery on Spotify and Reels. Authenticity over production is the signal.', tens:['Social identity','Cultural sampler'], tags:['indie','authenticity','spotify'], opp:'Brand storytelling through indie artist collaborations — keep it understated.', ls:['cultural-explorer','social-first','experience-seeker'] },
  { id:'edm', lbl:'EDM festival revival', cat:'music',  mom:'rising',   conf:.81, vel:72, px:.88, py:.22, cities:'Mumbai · Goa · Bengaluru', desc:'Sunburn and new boutique festivals seeing record ticket sales. The festival as identity statement is back.', tens:['Experience maximiser','Group socialiser','Social identity'], tags:['festival','EDM','ticketing'], opp:'Festival co-branding with experiential activation — not logo placement.', ls:['experience-seeker','social-first','status-driven'] },
  // FASHION
  { id:'os',  lbl:'Office siren',        cat:'fashion', mom:'rising',   conf:.84, vel:70, px:.62, py:.16, cities:'Delhi · Mumbai', desc:'Young professionals reframing workwear as identity — tailored blazers, structured bags, sharp footwear. Dressing deliberately is a digital and social performance.', tens:['Social identity','Digitally expressive'], tags:['workwear','aesthetic','identity'], opp:'Position as the confident choice for those who dress with intent.', ls:['social-first','digital-native','status-driven'] },
  { id:'li',  lbl:'Oversized linen',     cat:'fashion', mom:'rising',   conf:.79, vel:58, px:.28, py:.20, cities:'Mumbai · Bengaluru · Hyderabad', desc:'Myntra search up 34% WoW. Comfort-meets-aesthetic resonates with work-anywhere culture and weekend trip packing equally.', tens:['Experience maximiser'], tags:['comfort','sustainable','myntra'], opp:null, ls:['experience-seeker','health-conscious'] },
  { id:'gc',  lbl:'Gorpcore',            cat:'fashion', mom:'fading',   conf:.71, vel:22, px:.52, py:.76, cities:'Bengaluru · Pune · Delhi', desc:'Search declining for 3 consecutive weeks. Outdoor-utility aesthetic has hit mass-market.', tens:['Cultural sampler'], tags:['outdoors','mass-market','fading'], opp:null, ls:['cultural-explorer'] },
  { id:'thrift',lbl:'Thrift & resale',   cat:'fashion', mom:'rising',   conf:.76, vel:62, px:.42, py:.14, cities:'Delhi · Mumbai · Bengaluru · Kolkata', desc:'Platforms like Bombay Closet Cleanse and local Instagram resellers are booming. Thrifting is now an identity marker.', tens:['Social identity','Cultural sampler'], tags:['resale','sustainability','identity'], opp:'Brand resale / circular programme — works for premium-adjacent brands.', ls:['cultural-explorer','status-driven','social-first'] },
  { id:'y2k', lbl:'Y2K revival',         cat:'fashion', mom:'peaking',  conf:.83, vel:55, px:.16, py:.38, cities:'Mumbai · Delhi · Pune', desc:'Low-rise jeans, chunky sneakers, baby tees dominate Instagram aesthetics. Nostalgia as currency.', tens:['Social identity','Digitally expressive'], tags:['nostalgia','aesthetic','instagram'], opp:"Campaign framing around 'your era, redefined' — avoid literal Y2K references.", ls:['social-first','digital-native','status-driven'] },
  { id:'corp', lbl:'Corporate streetwear',cat:'fashion',mom:'emerging', conf:.64, vel:68, px:.82, py:.10, cities:'Bengaluru · Hyderabad · Mumbai', desc:'Tech-worker aesthetic meets streetwear — hoodies with tailored trousers, clean sneakers, premium basics.', tens:['Social identity','Cultural sampler'], tags:['quiet-luxury','tech-culture','emerging'], opp:'Logo-free premium basics play — the anti-logomania opportunity.', ls:['status-driven','digital-native','social-first'] },
  // GAMING
  { id:'bg',  lbl:'BGMI season',         cat:'gaming',  mom:'peaking',  conf:.91, vel:59, px:.18, py:.40, cities:'Pan-urban', desc:'4.1M downloads in 48 hours post-unban. Mobile gaming is the dominant escapist activity — social, competitive, always accessible.', tens:['Escapist','Group socialiser'], tags:['mobile','battle-royale','squad'], opp:'In-game brand moments — integrate into squad culture naming or cosmetics.', ls:['escapist','social-first'] },
  { id:'va',  lbl:'Valorant ranked',     cat:'gaming',  mom:'rising',   conf:.76, vel:64, px:.80, py:.22, cities:'Pune · Hyderabad · Bengaluru', desc:'Visible surge in college circuits across Tier 1 cities. Esports identity is becoming a social status signal.', tens:['Social identity','Escapist'], tags:['esports','PC','college'], opp:'Campus esports circuit activation — own the college league, not just the game.', ls:['social-first','escapist','digital-native'] },
  { id:'ch',  lbl:'Chess as identity',   cat:'gaming',  mom:'emerging', conf:.64, vel:71, px:.90, py:.10, cities:'Bengaluru · Delhi · Mumbai', desc:'Chess.com surging on Instagram. Being publicly smart is a new Gen Z flex.', tens:['Social identity'], tags:['chess','intellect','identity'], opp:null, ls:['cultural-explorer','digital-native','status-driven'] },
  { id:'retro',lbl:'Retro gaming nostalgia',cat:'gaming',mom:'rising',  conf:.73, vel:55, px:.36, py:.20, cities:'Mumbai · Delhi · Pune', desc:'Nintendo re-releases and emulator culture on phones are growing. Gaming nostalgia is a status move.', tens:['Cultural sampler','Social identity'], tags:['retro','nostalgia','console'], opp:'Retro-adjacent brand collab — works for beverages, snacks, casual apparel.', ls:['cultural-explorer','social-first','escapist'] },
  { id:'stream',lbl:'Gaming content creation',cat:'gaming',mom:'rising',conf:.80,vel:69, px:.54, py:.16, cities:'Pan-urban (Tier 1 + Tier 2)', desc:'YouTube gaming channels and Twitch streaming from India growing rapidly. Watching gaming as content is now mainstream.', tens:['Digitally expressive','Social identity'], tags:['streaming','youtube','content'], opp:'Brand integration in gaming streams — authentic gaming contexts.', ls:['digital-native','social-first','cultural-explorer'] },
  { id:'vr',  lbl:'VR gaming entry',     cat:'gaming',  mom:'emerging', conf:.61, vel:66, px:.70, py:.06, cities:'Mumbai · Bengaluru · Delhi', desc:'Meta Quest 3 adoption trickling into upper-middle households. Early-adopter narrative accelerating interest.', tens:['Experience maximiser','Social identity'], tags:['VR','hardware','early-adopter'], opp:'VR experience bar or gaming café partnership — the first encounter matters most.', ls:['experience-seeker','status-driven','digital-native'] },
  // FOOD
  { id:'bt',  lbl:'Birria tacos',        cat:'food',    mom:'emerging', conf:.66, vel:76, px:.10, py:.16, cities:'Mumbai · Bengaluru', desc:'New restaurant launches tracking in both cities. International street food formats landing faster than ever.', tens:['Cultural sampler','Experience maximiser'], tags:['international','restaurant','street-food'], opp:'First-to-trend restaurant partnership — capture the moment before it becomes mass.', ls:['cultural-explorer','experience-seeker'] },
  { id:'mf',  lbl:'Millet fast food',    cat:'food',    mom:'rising',   conf:.73, vel:61, px:.50, py:.28, cities:'Bengaluru · Hyderabad · Mumbai · Pune', desc:'Jowar wraps, ragi bowls rising as health-meets-speed. Health identity without sacrifice.', tens:['Social identity'], tags:['health','millet','superfoods'], opp:'Associate with conscious but genuinely cool eating — avoid clinical health tone.', ls:['health-conscious','status-driven'] },
  { id:'ln',  lbl:'Late-night delivery',  cat:'food',   mom:'peaking',  conf:.85, vel:52, px:.32, py:.45, cities:'Pan-urban Metro', desc:'11pm–2am Swiggy and Zomato orders up significantly. Escapist behaviour in its purest form.', tens:['Escapist'], tags:['delivery','night','swiggy'], opp:'Own the late-night occasion — tone, ritual, and exclusive night menu.', ls:['escapist'] },
  { id:'cafe', lbl:'Third-wave café culture',cat:'food', mom:'rising',  conf:.82, vel:65, px:.68, py:.18, cities:'Bengaluru · Mumbai · Delhi · Pune · Ahmedabad', desc:'Specialty coffee shops becoming the new social living room. Third-wave cafés are where Gen Z has first dates, work calls, and content shoots.', tens:['Social identity','Group socialiser','Digitally expressive'], tags:['coffee','café','aesthetic'], opp:'Café co-branding or in-café brand display — the table is prime real estate.', ls:['social-first','digital-native','status-driven'] },
  { id:'pln', lbl:'Plant-based mainstreaming',cat:'food',mom:'rising',  conf:.71, vel:58, px:.22, py:.24, cities:'Mumbai · Bengaluru · Pune', desc:'Good Dot, Blue Tribe, Imagine Meats seeing retail and D2C growth. Plant-based crossing from niche to mainstream.', tens:['Social identity','Cultural sampler'], tags:['plant-based','D2C','fitness'], opp:'Co-branding with a plant-based brand for health-meets-taste positioning.', ls:['health-conscious','cultural-explorer'] },
  { id:'omak', lbl:'Omakase democratised',cat:'food',   mom:'emerging', conf:.63, vel:72, px:.86, py:.12, cities:'Mumbai · Bengaluru · Delhi', desc:'Affordable omakase concepts emerging at ₹1,500–3,000. Experience maximisers trading meals for curated journeys.', tens:['Experience maximiser','Social identity'], tags:['fine-dining','experience','emerging'], opp:'Sponsor an omakase collab dinner — small, exclusive, maximum cultural cachet.', ls:['experience-seeker','status-driven'] },
  // TRAVEL
  { id:'ne',  lbl:'NE India trips',      cat:'travel',  mom:'rising',   conf:.86, vel:70, px:.44, py:.14, cities:'Meghalaya · Assam · Arunachal', desc:"Meghalaya, Assam and Arunachal Pradesh spiking on Reels. 'Undiscovered India' narrative is genuine.", tens:['Experience maximiser','Group socialiser','Digitally expressive'], tags:['northeast','offbeat','reels'], opp:'Travel content partnerships — authentic, unglossy, community-sourced.', ls:['experience-seeker','cultural-explorer','digital-native'] },
  { id:'go',  lbl:'Goa weekends',        cat:'travel',  mom:'fading',   conf:.82, vel:20, px:.26, py:.80, cities:'Goa', desc:"Gen Z narrative actively shifting — Goa is 'overdone'. Discovery and originality are the new currency.", tens:['Social identity'], tags:['fading','crowded','millennial'], opp:null, ls:['social-first'] },
  { id:'sf',  lbl:'Solo female travel',  cat:'travel',  mom:'rising',   conf:.78, vel:66, px:.70, py:.26, cities:'Rishikesh · Kasol · Hampi · Puducherry', desc:'Rising across Tier 1 cities with strong content creation angle. The solo trip is becoming a rite of passage.', tens:['Social identity','Digitally expressive'], tags:['solo','female','identity'], opp:'Safety narrative done without being patronising — a real and underserved brand gap.', ls:['social-first','digital-native','experience-seeker'] },
  { id:'workation',lbl:'Workation culture',cat:'travel',mom:'peaking',  conf:.84, vel:50, px:.16, py:.43, cities:'Rishikesh · Coorg · Manali · Gokarna', desc:'Work-from-mountains peaking. Hybrid work has made extended 2–4 week stays normal.', tens:['Experience maximiser','Escapist'], tags:['remote-work','long-stay','hybrid'], opp:'Co-living or co-working space partnership — the TG needs infrastructure.', ls:['escapist','experience-seeker','digital-native'] },
  { id:'microtrip',lbl:'48-hr micro trips',cat:'travel',mom:'rising',   conf:.80, vel:74, px:.56, py:.16, cities:'Mumbai–Pune · Delhi–Jaipur · Bengaluru–Coorg', desc:'Short-burst trips replacing longer annual holidays. Planned 72 hours in advance, documented in real time.', tens:['Experience maximiser','Group socialiser','Digitally expressive'], tags:['micro-trip','spontaneous','weekend'], opp:'Last-minute booking platform partnership — own the spontaneous travel moment.', ls:['social-first','experience-seeker','digital-native'] },
  { id:'pilgrimage',lbl:'Spiritual travel revival',cat:'travel',mom:'emerging',conf:.65,vel:69,px:.88,py:.08,cities:'Varanasi · Rishikesh · Vrindavan',desc:'Younger audience engaging with spiritual destinations as identity and aesthetic. Varanasi is becoming a Gen Z bucket list stop.',tens:['Experience maximiser','Cultural sampler'],tags:['spiritual','domestic','aesthetic'],opp:null,ls:['cultural-explorer','experience-seeker'] },
  // SPORTS
  { id:'pa',  lbl:'Padel tennis',        cat:'sports',  mom:'emerging', conf:.69, vel:78, px:.84, py:.08, cities:'Mumbai · Delhi · Bengaluru · Hyderabad · Pune · Chennai', desc:'Courts opening in 6 new cities. Social sport not performance sport — the point is the hang, the story, the court-side drink.', tens:['Group socialiser','Social identity'], tags:['padel','emerging','social-sport'], opp:'First mover — court naming rights, racket brand, or post-game occasion.', ls:['social-first','health-conscious','status-driven'] },
  { id:'ip',  lbl:'IPL attention',       cat:'sports',  mom:'fading',   conf:.74, vel:24, px:.62, py:.74, cities:'Pan India', desc:'Auction buzz high but actual match engagement tracking lower than 2025. Spectacle over sustained attention.', tens:['Group socialiser'], tags:['cricket','IPL','fading'], opp:null, ls:['social-first'] },
  { id:'run', lbl:'Running clubs',       cat:'sports',  mom:'rising',   conf:.78, vel:67, px:.38, py:.16, cities:'Mumbai · Delhi · Bengaluru · Hyderabad · Pune', desc:'City running clubs exploding as a social identity — the post-run brunch is as important as the run itself.', tens:['Social identity','Group socialiser'], tags:['running','community','wellness'], opp:'Post-run recovery drink or nutrition partnership — the ritual after the run is the opportunity.', ls:['health-conscious','social-first','status-driven'] },
  { id:'yoga',lbl:'Yoga 2.0',            cat:'sports',  mom:'rising',   conf:.72, vel:55, px:.20, py:.22, cities:'Rishikesh · Mumbai · Bengaluru · Delhi', desc:'Yoga rediscovered by Gen Z not as fitness but as identity and aesthetic. The mat is a status object.', tens:['Social identity','Escapist'], tags:['yoga','wellness','aesthetic'], opp:'Yoga mat, activewear, or retreat sponsorship — lean into the aesthetic.', ls:['health-conscious','status-driven','social-first'] },
  { id:'ff',  lbl:'Fantasy sports',      cat:'sports',  mom:'peaking',  conf:.86, vel:48, px:.14, py:.42, cities:'Pan-urban', desc:'Dream11 crossing from cricket into football and kabaddi. Fantasy sports is now the primary lens through which this TG watches sport.', tens:['Group socialiser','Escapist'], tags:['fantasy','Dream11','data'], opp:'Fantasy sports integration or gaming-adjacent brand play — data-driven audience.', ls:['escapist','social-first','digital-native'] },
  { id:'pickleball',lbl:'Pickleball entry',cat:'sports',mom:'emerging', conf:.62, vel:80, px:.74, py:.06, cities:'Delhi · Mumbai · Bengaluru', desc:"India's earliest pickleball courts seeing full bookings. 12-month window to own this before it scales.", tens:['Social identity','Group socialiser'], tags:['pickleball','emerging','social-sport'], opp:'Equipment brand or court sponsorship — 12-month first-mover window.', ls:['social-first','status-driven','health-conscious'] },
];

const CC = { music:'#a78bfa', fashion:'#f472b6', gaming:'#34d399', food:'#fb923c', travel:'#60a5fa', sports:'#fbbf24' };

const TENSION_SCORES = {
  'all':               { si:8, em:7, gs:6, cs:5, de:7, es:6 },
  'social-first':      { si:9, em:6, gs:9, cs:4, de:8, es:5 },
  'experience-seeker': { si:6, em:9, gs:6, cs:7, de:7, es:7 },
  'digital-native':    { si:8, em:6, gs:5, cs:6, de:9, es:5 },
  'health-conscious':  { si:7, em:7, gs:5, cs:5, de:5, es:4 },
  'escapist':          { si:5, em:6, gs:6, cs:5, de:6, es:9 },
  'cultural-explorer': { si:6, em:7, gs:4, cs:9, de:7, es:5 },
  'status-driven':     { si:9, em:8, gs:5, cs:6, de:8, es:4 },
};

export default function CultureDashboard() {
  const canvasRef  = useRef(null);
  const bubblesRef = useRef([]);
  const [activeCat, setActiveCat] = useState('all');
  const [currentLS, setCurrentLS] = useState('all');
  const [detail, setDetail]       = useState(null);
  const [toast, setToast]         = useState('');
  const [sigCount, setSigCount]   = useState('36 / 36 signals');

  // Selects
  const [age, setAge]         = useState('18-27');
  const [demo, setDemo]       = useState('skew-male');
  const [city, setCity]       = useState('metro-t1-t2');
  const [income, setIncome]   = useState('nccs-ab');
  const [lifestyle, setLifestyle] = useState('all');

  // Tension heatmap data
  const [tensions, setTensions] = useState(TENSION_SCORES['all']);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const buildBubbles = () => {
    const cv = canvasRef.current;
    if (!cv) return;

    // Clear old bubbles
    bubblesRef.current.forEach(el => el.remove());
    bubblesRef.current = [];

    const W = cv.clientWidth  || 900;
    const H = cv.clientHeight || 600;
    const ANIMS = ['ag-fl1','ag-fl2','ag-fl3','ag-fl4','ag-fl5'];
    const DURS  = [3.2, 4.0, 3.7, 2.9, 4.4, 3.5, 2.7, 4.1];

    TRENDS.forEach((t, i) => {
      const s   = Math.round(52 + t.conf * 60);
      const col = CC[t.cat];

      const wrap = document.createElement('div');
      wrap.className = 'ag-bbl';
      wrap.dataset.cat = t.cat;
      wrap.dataset.id  = t.id;
      wrap.dataset.ls  = t.ls.join(',');
      wrap.dataset.state = 'visible';
      wrap.style.width  = s + 'px';
      wrap.style.height = s + 'px';
      wrap.style.left   = Math.round(t.px * (W - s)) + 'px';
      wrap.style.top    = Math.round(t.py * (H - s - 40) + 20) + 'px';
      wrap.style.animationName     = ANIMS[i % 5];
      wrap.style.animationDuration = DURS[i % 8] + 's';
      wrap.style.animationTimingFunction = 'ease-in-out';
      wrap.style.animationIterationCount = 'infinite';
      wrap.style.animationDelay   = (i * 0.22).toFixed(2) + 's';

      const inner = document.createElement('div');
      inner.className = 'ag-bi';
      inner.style.color      = col;
      inner.style.background = col + '14';

      const cat = document.createElement('div');
      cat.className = 'ag-bc';
      cat.style.color = col;
      cat.textContent = t.cat;

      const lbl = document.createElement('div');
      lbl.className = 'ag-bl';
      lbl.style.color = col;
      lbl.style.fontSize = s > 105 ? '11px' : s > 85 ? '10px' : '9px';
      lbl.textContent = t.lbl;

      const mom = document.createElement('div');
      mom.className = 'ag-bm';
      mom.style.color = col;
      mom.textContent = t.mom;

      inner.appendChild(cat);
      inner.appendChild(lbl);
      inner.appendChild(mom);
      wrap.appendChild(inner);

      wrap.addEventListener('click', () => setDetail(t));
      cv.appendChild(wrap);
      bubblesRef.current.push(wrap);
    });

    applyFilters(activeCat, currentLS);
  };

  const applyFilters = (cat, ls) => {
    let vis = 0;
    bubblesRef.current.forEach(el => {
      const catMatch = cat === 'all' || el.dataset.cat === cat;
      const lsMatch  = ls  === 'all' || el.dataset.ls.includes(ls);
      const state = !catMatch ? 'hidden' : (!lsMatch ? 'muted' : 'visible');
      el.dataset.state = state;
      if (state === 'visible') vis++;
    });
    setSigCount(`${vis} / ${TRENDS.length} signals`);
  };

  useEffect(() => {
    // Build zones first
    const cv = canvasRef.current;
    if (!cv) return;
    cv.querySelectorAll('.ag-zone-line,.ag-zone-tag').forEach(e => e.remove());

    const H = cv.clientHeight || 600;
    const W = cv.clientWidth  || 900;

    [{ y: Math.round(H * .33), l: 'PEAKING' }, { y: Math.round(H * .66), l: 'FADING' }].forEach(z => {
      const ln = document.createElement('div');
      ln.className = 'ag-zone-line';
      ln.style.top = z.y + 'px';
      cv.appendChild(ln);
      const tg = document.createElement('div');
      tg.className = 'ag-zone-tag';
      tg.style.top = z.y + 'px';
      tg.textContent = z.l;
      cv.appendChild(tg);
    });
    const topTag = document.createElement('div');
    topTag.className = 'ag-zone-tag ag-zone-top';
    topTag.textContent = 'EMERGING · RISING';
    cv.appendChild(topTag);

    setTimeout(buildBubbles, 80);

    const onResize = () => {
      const cv2 = canvasRef.current;
      if (!cv2) return;
      cv2.querySelectorAll('.ag-zone-line,.ag-zone-tag').forEach(e => e.remove());
      bubblesRef.current.forEach(el => el.remove());
      bubblesRef.current = [];
      buildBubbles();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCatFilter = (cat) => {
    setActiveCat(cat);
    applyFilters(cat, currentLS);
  };

  const handleApplyTG = () => {
    setCurrentLS(lifestyle);
    setTensions(TENSION_SCORES[lifestyle] || TENSION_SCORES['all']);
    applyFilters(activeCat, lifestyle);
    showToast(`TG updated · ${age} · ${lifestyle}`);
  };

  const tensionItems = [
    { l: 'social identity',  v: tensions.si },
    { l: 'experience max',   v: tensions.em },
    { l: 'group social',     v: tensions.gs },
    { l: 'cultural sampler', v: tensions.cs },
    { l: 'digitally exp',    v: tensions.de },
    { l: 'escapist',         v: tensions.es },
  ];

  const cats = ['all','music','fashion','gaming','food','travel','sports'];
  const detailCol = detail ? CC[detail.cat] : '#7b6cff';

  return (
    <div className="ag-wrap">
      {/* Toast */}
      {toast && <div className="ag-toast show">{toast}</div>}

      {/* Header */}
      <div className="ag-hdr">
        <div>
          <div className="ag-wm">Antigravity · PRISM</div>
          <div className="ag-ht">Culture Dashboard</div>
          <div className="ag-hm">W{new Date().toISOString().slice(5,7)} 2026 · Urban India · {TRENDS.length} signals tracked</div>
        </div>
        <div className="ag-hr">
          <div className="ag-tg-badge">{age.toUpperCase()} · {city.toUpperCase()} · {income.toUpperCase()} · {lifestyle.toUpperCase()}</div>
          <div className="ag-pdot">LIVE SYNTHESIS</div>
          <Link href="/dashboard" className="ag-back-btn">← Dashboard</Link>
        </div>
      </div>

      {/* TG Selector */}
      <div className="ag-tg-bar">
        {[
          { lbl:'Age', val:age, set:setAge, opts:[['18-27','18–27 (Gen Z)'],['22-35','22–35 (Young Millennial)'],['28-40','28–40 (Millennial)'],['16-22','16–22 (Late Gen Z)'],['35-50','35–50 (Gen X)']] },
          { lbl:'Demographics', val:demo, set:setDemo, opts:[['skew-male','Skew male (60/40)'],['skew-female','Skew female (60/40)'],['all-gender','All gender (50/50)'],['male-only','Male-indexed'],['female-only','Female-indexed']] },
          { lbl:'City', val:city, set:setCity, opts:[['metro-t1-t2','Metro + Tier 1 + Tier 2'],['metro','Metro only'],['tier1','Tier 1 only'],['tier2-t3','Tier 2 + Tier 3'],['pan','Pan India']] },
          { lbl:'Income', val:income, set:setIncome, opts:[['nccs-ab','NCCS A/B (Upper-mid)'],['nccs-a','NCCS A (Premium)'],['nccs-bc','NCCS B/C (Middle)'],['nccs-abc','NCCS A/B/C (Broad)']] },
          { lbl:'Lifestyle', val:lifestyle, set:setLifestyle, opts:[['all','All lifestyles'],['social-first','Social-first'],['experience-seeker','Experience seeker'],['digital-native','Digital native'],['health-conscious','Health-conscious'],['escapist','Escapist'],['cultural-explorer','Cultural explorer'],['status-driven','Status-driven']] },
        ].map(({ lbl, val, set, opts }) => (
          <div className="ag-sel-grp" key={lbl}>
            <span className="ag-sel-lbl">{lbl}</span>
            <select className="ag-tg-sel" value={val} onChange={e => set(e.target.value)}>
              {opts.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </div>
        ))}
        <button className="ag-apply-btn" onClick={handleApplyTG}>Apply ↗</button>
      </div>

      {/* Signal filter */}
      <div className="ag-sig-bar">
        <span className="ag-sig-lbl">Signal</span>
        {cats.map(c => (
          <button
            key={c}
            className={`ag-fb${activeCat === c ? ' on' : ''}`}
            data-c={c}
            onClick={() => handleCatFilter(c)}
          >{c}</button>
        ))}
        <span className="ag-sig-count">{sigCount}</span>
      </div>

      {/* Bubble canvas */}
      <div className="ag-cv-wrap" ref={canvasRef} />

      {/* Detail panel */}
      <div className={`ag-dp${detail ? ' open' : ''}`}>
        {detail && (
          <div className="ag-dp-inner">
            <div className="ag-dp-left">
              <div className="ag-dp-close-row">
                <div className="ag-dp-title">{detail.lbl}</div>
                <div className="ag-dp-x" onClick={() => setDetail(null)}>×</div>
              </div>
              <div className="ag-dp-meta">
                <span className="ag-dp-pill" style={{ background: detailCol }}>{detail.cat}</span>
                <span className="ag-dp-mom">{detail.mom}</span>
                <span className="ag-dp-cbar">
                  <span className="ag-cbar"><span className="ag-cfill" style={{ width: Math.round(detail.conf * 100) + '%', background: detailCol }} /></span>
                  {Math.round(detail.conf * 100)}%
                </span>
              </div>
              <div className="ag-dp-cities">↗ {detail.cities}</div>
              <div className="ag-dp-desc">{detail.desc}</div>
            </div>
            <div>
              <div className="ag-dp-slbl">Psychographic tensions</div>
              <div className="ag-dp-tens">
                {detail.tens.map(x => <div key={x} className="ag-tens-item">{x}</div>)}
              </div>
              <div className="ag-dp-velocity">
                <span className="ag-vel-label">Velocity</span>
                <div className="ag-vel-bar"><div className="ag-vel-fill" style={{ width: detail.vel + '%' }} /></div>
                <span className="ag-vel-txt">{detail.vel}/100</span>
              </div>
            </div>
            <div>
              <div className="ag-dp-slbl">Brand opportunity</div>
              {detail.opp
                ? <div className="ag-dp-opp">{detail.opp}</div>
                : <div className="ag-dp-opp-null">No clear brand opportunity this cycle.</div>}
              <div className="ag-dp-slbl" style={{ marginTop: 10 }}>Signal tags</div>
              <div className="ag-dp-tags">
                {detail.tags.map(x => <span key={x} className="ag-dp-tag">{x}</span>)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tension heatmap */}
      <div className="ag-hm-strip">
        <div className="ag-hm-lbl">Tension heat</div>
        <div className="ag-hm-bars">
          {tensionItems.map(t => (
            <div key={t.l} className="ag-hm-item">
              <div className="ag-hm-track"><div className="ag-hm-fill" style={{ width: t.v * 10 + '%' }} /></div>
              <div className="ag-hm-name">{t.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="ag-leg">
        <span className="ag-leg-lbl">Category</span>
        {Object.entries(CC).map(([cat, col]) => (
          <div key={cat} className="ag-li"><div className="ag-ld" style={{ background: col }} />{cat}</div>
        ))}
        <span className="ag-leg-note">size = confidence · vertical = momentum state</span>
      </div>
    </div>
  );
}

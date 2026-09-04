const pptxgen = require('pptxgenjs');
const IMG = __dirname + '/img/';

const P = {
  ink:'0B0D12', ink2:'161A23', paper:'F4F5F7', white:'FFFFFF',
  line:'E2E4EA', graphite:'1D1D1F', silver:'D7D9DE', red:'FF3B30',
  cobalt:'1428A0', cobalt2:'3C64F4', sky:'5AC8FA', gold:'F5B301',
  green:'12B886', amber:'C97D14', muted:'6B7280', dim:'A7ADBA'
};
const FH = 'Arial', FB = 'Calibri';
const SW = 13.333, SH = 7.5, MX = 0.65, CW = SW - MX*2;
const ic = (n,c) => IMG + `ic-${n}-${c}.png`;
const sh = (o={}) => Object.assign({type:'outer', color:'000000', blur:16, offset:4, angle:90, opacity:0.10}, o);

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE';
pres.author = 'Apple vs Samsung — USP Presentation';
pres.title  = 'Apple vs Samsung: The Battle of the USPs';

let pageNo = 0;
function newSlide(bg){
  const s = pres.addSlide();
  if (bg) s.background = { path: IMG + bg }; else s.background = { color: P.paper };
  pageNo++;
  return s;
}

/* ------------------------------------------------------------- primitives */
function txt(s, t, o){ s.addText(t, Object.assign({ isTextBox:true, margin:0 }, o)); }

function card(s, x, y, w, h, o={}){
  s.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, rectRadius: o.r ?? 0.16,
    fill: { color: o.fill || P.white },
    line: o.lineColor ? { color:o.lineColor, width:o.lineWidth || 1 } : { type:'none' },
    shadow: o.shadow === false ? { type:'none' } : sh(o.shadow || {})
  });
}

function badge(s, x, y, d, fill, icon, iconColor){
  s.addShape(pres.ShapeType.ellipse, { x, y, w:d, h:d, fill:{ color:fill }, line:{ type:'none' } });
  const p = d * 0.26;
  s.addImage({ path: ic(icon, iconColor), x: x+p, y: y+p, w: d-2*p, h: d-2*p });
}

function chip(s, num, name, dark){
  const w = 2.35, x = SW - MX - w, y = 0.44, h = 0.46;
  s.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius:0.23,
    fill:{ color: dark ? 'FFFFFF' : P.ink, transparency: dark ? 88 : 0 },
    line: dark ? { color:'FFFFFF', width:1, transparency:70 } : { type:'none' } });
  txt(s, [
    { text: num, options:{ bold:true, color: dark ? P.gold : P.gold } },
    { text: '  ' + name.toUpperCase(), options:{ bold:true, color: dark ? 'FFFFFF' : 'FFFFFF' } }
  ], { x, y, w, h, align:'center', valign:'middle', fontFace:FH, fontSize:10.5, charSpacing:1.2 });
}

function foot(s, dark){
  txt(s, 'Apple vs Samsung  ·  USP Analysis', { x:MX, y:6.98, w:6, h:0.3,
    fontFace:FB, fontSize:9, color: dark ? P.dim : P.muted, valign:'middle' });
  txt(s, String(pageNo).padStart(2,'0'), { x:SW-MX-1, y:6.98, w:1, h:0.3, align:'right',
    fontFace:FH, fontSize:9, bold:true, color: dark ? P.dim : P.muted, valign:'middle' });
}

function head(s, eyebrow, title, o={}){
  const dark = o.dark, w = o.w || 9.6, y = o.y ?? 0.52;
  txt(s, eyebrow.toUpperCase(), { x:MX, y, w, h:0.28, fontFace:FH, fontSize:10.5, bold:true,
    charSpacing:2.6, color: o.eyeColor || (dark ? P.gold : P.red), valign:'middle' });
  txt(s, title, { x:MX, y:y+0.3, w, h: o.th || 0.72, fontFace:FH, fontSize: o.ts || 34, bold:true,
    color: dark ? 'FFFFFF' : P.graphite, valign:'middle', lineSpacingMultiple:0.95 });
  if (o.sub) txt(s, o.sub, { x:MX, y: y+0.3+(o.th||0.72)+0.04, w: o.subw || w, h:0.34,
    fontFace:FB, fontSize:13.5, color: dark ? P.dim : P.muted, valign:'middle' });
}

/* icon + heading + body row inside a card */
function iconRow(s, x, y, w, h, o){
  card(s, x, y, w, h, { fill:o.cardFill || P.white, shadow:o.shadow, lineColor:o.lineColor });
  const d = o.d || 0.62, pad = o.pad || 0.3;
  badge(s, x+pad, y+(h-d)/2, d, o.badge || P.red, o.icon, o.iconColor || 'w');
  const tx = x + pad + d + 0.26, tw = w - (pad + d + 0.26) - pad;
  const dk = o.darkCard;
  txt(s, o.title, { x:tx, y: y+h/2-0.44, w:tw, h:0.34, fontFace:FH, fontSize: o.ts || 13.5,
    bold:true, color: dk ? 'FFFFFF' : P.graphite, valign:'middle' });
  txt(s, o.body, { x:tx, y: y+h/2-0.06, w:tw, h: o.bh || 0.5, fontFace:FB, fontSize: o.bs || 11.5,
    color: dk ? P.dim : P.muted, valign:'top', lineSpacingMultiple:1.0 });
}

function bullets(s, items, o){
  txt(s, items.map((t,i)=>({ text:t, options:{ bullet:{ code:'2022', indent:13 }, breakLine: i < items.length-1 } })),
    Object.assign({ isTextBox:true, margin:0, fontFace:FB, fontSize:12.5, color:P.graphite,
      valign:'top', paraSpaceAfter:8, lineSpacingMultiple:1.02 }, o));
}

function dots(s, x, y, n, total, color, offColor){
  const d = 0.155, gap = 0.235;
  for (let i=0;i<total;i++)
    s.addShape(pres.ShapeType.ellipse, { x: x+i*gap, y, w:d, h:d,
      fill:{ color: i<n ? color : (offColor||'D8DBE2') }, line:{ type:'none' } });
}

/* ============================================================ 01 · TITLE */
{
  const s = newSlide('bg-title.png');
  txt(s, 'MARKETING  ·  UNIQUE SELLING PROPOSITION', { x:MX, y:0.72, w:9, h:0.3,
    fontFace:FH, fontSize:11, bold:true, charSpacing:3.2, color:P.gold, valign:'middle' });

  txt(s, 'APPLE', { x:MX, y:1.35, w:6.4, h:1.35, fontFace:FH, fontSize:80, bold:true,
    color:'FFFFFF', valign:'middle', charSpacing:-1 });
  txt(s, 'SAMSUNG', { x:MX, y:3.25, w:8.4, h:1.35, fontFace:FH, fontSize:80, bold:true,
    color:'FFFFFF', valign:'middle', charSpacing:-1 });
  txt(s, 'vs', { x:MX+0.06, y:2.62, w:1.4, h:0.66, fontFace:FH, fontSize:34, bold:true,
    italic:true, color:P.gold, valign:'middle' });

  txt(s, 'One connected ecosystem, or endless innovation and choice?\nEight speakers. Four criteria. One winning USP.',
    { x:MX, y:4.78, w:7.6, h:0.86, fontFace:FB, fontSize:15, color:P.dim, lineSpacingMultiple:1.25 });

  // brand medallions, right
  s.addShape(pres.ShapeType.ellipse, { x:9.55, y:1.75, w:1.62, h:1.62,
    fill:{ color:'FFFFFF', transparency:90 }, line:{ color:'FFFFFF', width:1, transparency:66 } });
  s.addImage({ path: IMG+'logo-apple-w.png', x:10.0, y:2.14, w:0.72, h:0.84 });
  s.addShape(pres.ShapeType.ellipse, { x:11.05, y:3.35, w:1.62, h:1.62,
    fill:{ color:P.cobalt }, line:{ color:'FFFFFF', width:1, transparency:66 } });
  s.addImage({ path: IMG+'logo-samsung-white.png', x:11.24, y:4.0, w:1.24, h:0.28 });

  s.addShape(pres.ShapeType.roundRect, { x:MX, y:5.92, w:CW, h:0.86, rectRadius:0.14,
    fill:{ color:'FFFFFF', transparency:92 }, line:{ color:'FFFFFF', width:1, transparency:78 } });
  txt(s, [
    { text:'PRESENTED BY   ', options:{ bold:true, color:P.gold, fontSize:10, charSpacing:2 } },
    { text:'Isha  ·  Yashvi  ·  Nishita  ·  Aarya  ·  Venesa  ·  Simran  ·  Mann  ·  Gouraksh',
      options:{ color:'FFFFFF', fontSize:12.5, bold:true } }
  ], { x:MX+0.42, y:5.92, w:CW-0.84, h:0.86, valign:'middle', fontFace:FH });
  s.addNotes('Welcome. Today we compare two of the biggest names in consumer electronics — Apple and Samsung — and judge which brand owns the stronger Unique Selling Proposition.');
}

/* ====================================================== 02 · THE LINE-UP */
{
  const s = newSlide();
  head(s, 'Running order', 'The line-up', { sub:'Eight speakers, one argument — building from definition to verdict to jingle.' });
  const people = [
    ['01','Isha','Introduction — what a USP is and what we will evaluate'],
    ['02','Yashvi','Apple’s USP — the seamless ecosystem'],
    ['03','Nishita','Apple from the consumer’s point of view'],
    ['04','Aarya','Samsung’s USP — innovation, smart tech and choice'],
    ['05','Venesa','Samsung from the consumer’s point of view'],
    ['06','Simran','Head-to-head comparison and the winner'],
    ['07','Mann','Deeper analysis of the winning USP'],
    ['08','Gouraksh','Jingle, audio advertisement and conclusion']
  ];
  const cw = 5.75, ch = 1.02, gx = 0.53, gy = 0.2, y0 = 1.98;
  people.forEach((p,i)=>{
    const col = i % 2, row = (i - col) / 2;
    const x = MX + col*(cw+gx), y = y0 + row*(ch+gy);
    card(s, x, y, cw, ch, { fill:P.white });
    s.addShape(pres.ShapeType.ellipse, { x:x+0.28, y:y+(ch-0.6)/2, w:0.6, h:0.6,
      fill:{ color: col===0 ? P.graphite : P.cobalt }, line:{ type:'none' } });
    txt(s, p[0], { x:x+0.28, y:y+(ch-0.6)/2, w:0.6, h:0.6, align:'center', valign:'middle',
      fontFace:FH, fontSize:13, bold:true, color:'FFFFFF' });
    txt(s, p[1], { x:x+1.04, y:y+0.16, w:cw-1.32, h:0.3, fontFace:FH, fontSize:14, bold:true,
      color:P.graphite, valign:'middle' });
    txt(s, p[2], { x:x+1.04, y:y+0.5, w:cw-1.32, h:0.38, fontFace:FB, fontSize:11,
      color:P.muted, valign:'top' });
  });
  foot(s);
  s.addNotes('Quick roadmap so the audience knows who speaks when and what each section adds.');
}

/* =============================================== 03 · ISHA — WHAT IS A USP */
{
  const s = newSlide();
  chip(s, '01', 'Isha');
  head(s, 'Introduction', 'What exactly is a USP?', { w:8.2 });

  card(s, MX, 1.95, 6.05, 2.62, { fill:P.ink });
  s.addImage({ path: ic('quote','gold'), x:MX+0.42, y:2.24, w:0.44, h:0.44 });
  txt(s, 'A Unique Selling Proposition is the one clear reason a customer should choose your product over every other option on the shelf.',
    { x:MX+0.42, y:2.82, w:5.2, h:1.35, fontFace:FH, fontSize:17, bold:true, color:'FFFFFF',
      lineSpacingMultiple:1.14, valign:'top' });

  card(s, MX, 4.76, 6.05, 2.1, { fill:P.white });
  txt(s, 'A USP is NOT…', { x:MX+0.42, y:4.98, w:5.2, h:0.3, fontFace:FH, fontSize:12, bold:true,
    color:P.red, charSpacing:1.4, valign:'middle' });
  bullets(s, ['A slogan or a logo', 'A list of specifications', 'A discount or an offer',
    'Something a rival can copy by tomorrow'],
    { x:MX+0.42, y:5.34, w:5.2, h:1.3, fontSize:12, color:P.graphite });

  txt(s, 'WHY IT MATTERS FOR ELECTRONICS BRANDS', { x:7.15, y:1.95, w:5.5, h:0.3,
    fontFace:FH, fontSize:10.5, bold:true, charSpacing:2, color:P.muted, valign:'middle' });
  const why = [
    ['scale','Every phone looks similar on paper','Screen, chip and camera specs have converged. Specs alone no longer decide the sale.'],
    ['heart','People buy an experience, not a spec sheet','The feeling of using the product is what gets remembered and recommended.'],
    ['tag','A strong USP protects the price','It gives a brand a reason to charge more instead of competing only on discounts.']
  ];
  why.forEach((w,i)=> iconRow(s, 7.15, 2.42 + i*1.52, 5.5, 1.32,
    { icon:w[0], badge: i===1 ? P.graphite : (i===2 ? P.cobalt : P.red), title:w[1], body:w[2], bh:0.62, bs:10.5, ts:12.5 }));
  foot(s);
  s.addNotes('Define the USP, clear away the common confusions, then explain why it matters so much in a category where the hardware looks alike.');
}

/* ================================================ 04 · ISHA — CONTENDERS */
{
  const s = newSlide();
  chip(s, '01', 'Isha');
  head(s, 'Introduction', 'The two contenders', { sub:'Both sell premium smartphones. Each argues for them in a completely different way.' });

  const cw = 5.9, y = 2.15, h = 4.32;
  card(s, MX, y, cw, h, { fill:P.graphite });
  s.addImage({ path: IMG+'logo-apple-w.png', x:MX+0.45, y:y+0.42, w:0.5, h:0.58 });
  txt(s, 'APPLE', { x:MX+1.12, y:y+0.5, w:3, h:0.44, fontFace:FH, fontSize:23, bold:true,
    color:'FFFFFF', valign:'middle', charSpacing:1.5 });
  txt(s, 'Sells a connected experience', { x:MX+0.45, y:y+1.16, w:cw-0.9, h:0.32,
    fontFace:FB, fontSize:13, color:P.red, valign:'middle', bold:true });
  txt(s, 'WHAT WE ARE COMPARING', { x:MX+0.45, y:y+1.62, w:cw-0.9, h:0.26, fontFace:FH,
    fontSize:9.5, bold:true, charSpacing:1.8, color:P.dim, valign:'middle' });
  bullets(s, ['iPhone, Mac and iPad working as one', 'AirPods and Apple Watch as companions',
    'iCloud holding it all together', 'One Apple ID across every device'],
    { x:MX+0.45, y:y+1.98, w:cw-0.9, h:1.6, fontSize:12.5, color:'FFFFFF' });
  s.addShape(pres.ShapeType.roundRect, { x:MX+0.45, y:y+3.68, w:cw-0.9, h:0.56, rectRadius:0.12,
    fill:{ color:'FFFFFF', transparency:88 }, line:{ type:'none' } });
  txt(s, 'In one line: buy one, and the next one works better.',
    { x:MX+0.68, y:y+3.68, w:cw-1.36, h:0.56, fontFace:FB, fontSize:11.5, color:'FFFFFF',
      italic:true, valign:'middle' });

  const x2 = MX + cw + 0.53;
  card(s, x2, y, cw, h, { fill:P.cobalt });
  s.addImage({ path: IMG+'logo-samsung-white.png', x:x2+0.45, y:y+0.52, w:1.5, h:0.34 });
  txt(s, 'Sells innovation and choice', { x:x2+0.45, y:y+1.16, w:cw-0.9, h:0.32,
    fontFace:FB, fontSize:13, color:P.sky, valign:'middle', bold:true });
  txt(s, 'WHAT WE ARE COMPARING', { x:x2+0.45, y:y+1.62, w:cw-0.9, h:0.26, fontFace:FH,
    fontSize:9.5, bold:true, charSpacing:1.8, color:'CFD9FF', valign:'middle' });
  bullets(s, ['Galaxy S series — the flagship line', 'Galaxy A series — the value line',
    'Galaxy Z Fold and Z Flip — foldables', 'Galaxy AI features across the range'],
    { x:x2+0.45, y:y+1.98, w:cw-0.9, h:1.6, fontSize:12.5, color:'FFFFFF' });
  s.addShape(pres.ShapeType.roundRect, { x:x2+0.45, y:y+3.68, w:cw-0.9, h:0.56, rectRadius:0.12,
    fill:{ color:'FFFFFF', transparency:88 }, line:{ type:'none' } });
  txt(s, 'In one line: whatever you want, there is a Galaxy for it.',
    { x:x2+0.68, y:y+3.68, w:cw-1.36, h:0.56, fontFace:FB, fontSize:11.5, color:'FFFFFF',
      italic:true, valign:'middle' });
  foot(s);
  s.addNotes('Introduce both brands and name the exact products we will judge, so the comparison later is fair and like-for-like.');
}

/* ================================================= 05 · ISHA — CRITERIA */
{
  const s = newSlide();
  chip(s, '01', 'Isha');
  head(s, 'Introduction', 'How we will judge the two USPs',
    { sub:'Four criteria. Every later section feeds back into these — and Simran scores them on slide 16.' });

  const items = [
    ['target','Uniqueness','Can a rival copy it quickly, or is it hard to imitate?', P.red,
      'Could a rival launch this next year?'],
    ['heart','Customer value','Does it solve a real problem the buyer feels daily?', P.graphite,
      'Does it help on an ordinary Tuesday?'],
    ['bulb','Memorability','Can someone repeat it in one sentence after hearing it once?', P.gold,
      'Can you repeat it without notes?'],
    ['swap','Differentiation','Does it clearly separate the brand from everyone else?', P.cobalt,
      'Swap the logo — would you still believe it?']
  ];
  const cw = (CW - 3*0.34)/4, y = 2.42, h = 3.6;
  items.forEach((it,i)=>{
    const x = MX + i*(cw+0.34);
    card(s, x, y, cw, h, { fill:P.white });
    badge(s, x+0.36, y+0.42, 0.78, it[3], it[0], 'w');
    txt(s, String(i+1).padStart(2,'0'), { x:x+cw-0.86, y:y+0.46, w:0.6, h:0.4, align:'right',
      fontFace:FH, fontSize:17, bold:true, color:'DDE0E7', valign:'middle' });
    txt(s, it[1], { x:x+0.36, y:y+1.42, w:cw-0.72, h:0.42, fontFace:FH, fontSize:15.5, bold:true,
      color:P.graphite, valign:'middle' });
    txt(s, it[2], { x:x+0.36, y:y+1.92, w:cw-0.72, h:0.6, fontFace:FB, fontSize:11.5,
      color:P.muted, valign:'top', lineSpacingMultiple:1.1 });
    s.addShape(pres.ShapeType.roundRect, { x:x+0.36, y:y+2.56, w:cw-0.72, h:0.82, rectRadius:0.11,
      fill:{ color:'EDEEF3' }, line:{ type:'none' } });
    txt(s, 'THE TEST', { x:x+0.56, y:y+2.68, w:cw-1.12, h:0.22, fontFace:FH, fontSize:8.5,
      bold:true, charSpacing:1.4, color:it[3]===P.gold ? P.amber : it[3], valign:'middle' });
    txt(s, it[4], { x:x+0.56, y:y+2.92, w:cw-1.12, h:0.42, fontFace:FB, fontSize:10.5,
      color:P.graphite, valign:'top', lineSpacingMultiple:1.06 });
  });
  txt(s, 'Note: the scoring on slide 16 is our team’s own assessment of these four criteria — it is a judgement, not market research data.',
    { x:MX, y:6.24, w:CW, h:0.34, fontFace:FB, fontSize:10.5, italic:true, color:P.muted, valign:'middle' });
  foot(s);
  s.addNotes('Set the rules of the contest before either brand is argued for, so the verdict later feels earned rather than opinionated.');
}

/* ========================================= 06 · YASHVI — APPLE USP HERO */
{
  const s = newSlide('bg-apple.png');
  chip(s, '02', 'Yashvi', true);
  txt(s, 'BRAND 1  ·  APPLE', { x:MX, y:1.28, w:6, h:0.3, fontFace:FH, fontSize:11, bold:true,
    charSpacing:3, color:P.red, valign:'middle' });
  txt(s, 'Seamless\nEcosystem', { x:MX, y:1.7, w:6.3, h:2.05, fontFace:FH, fontSize:52, bold:true,
    color:'FFFFFF', lineSpacingMultiple:0.92, valign:'middle' });
  txt(s, 'One connected ecosystem where Apple devices work together effortlessly.',
    { x:MX, y:3.92, w:5.9, h:0.8, fontFace:FB, fontSize:16.5, color:P.silver, lineSpacingMultiple:1.2 });

  s.addShape(pres.ShapeType.roundRect, { x:MX, y:4.98, w:6.0, h:1.42, rectRadius:0.16,
    fill:{ color:'FFFFFF', transparency:90 }, line:{ color:'FFFFFF', width:1, transparency:75 } });
  s.addImage({ path: ic('lock','red'), x:MX+0.4, y:5.42, w:0.5, h:0.5 });
  txt(s, 'The USP is not any single device — it is what happens when you own two of them.',
    { x:MX+1.06, y:5.16, w:4.7, h:1.06, fontFace:FH, fontSize:13, bold:true, color:'FFFFFF',
      valign:'middle', lineSpacingMultiple:1.15 });

  s.addImage({ path: IMG+'ecosystem.png', x:7.1, y:1.24, w:5.55, h:4.87 });
  txt(s, 'Every device signs in with one Apple ID — that is what makes the hand-offs feel automatic.',
    { x:7.1, y:6.16, w:5.55, h:0.6, fontFace:FB, fontSize:11, italic:true, color:P.dim,
      align:'center', lineSpacingMultiple:1.1 });
  foot(s, true);
  s.addNotes('Apple’s USP in three words: the seamless ecosystem. The centre of the diagram is one Apple ID — that single sign-in is the mechanism that makes everything else work.');
}

/* ====================================== 07 · YASHVI — FIVE PROOF POINTS */
{
  const s = newSlide();
  chip(s, '02', 'Yashvi');
  head(s, 'Brand 1 · Apple', 'The five proof points', { w:9.4 });

  const feats = [
    ['link', P.red, 'iPhone + Mac + iPad', 'Continue tasks across devices with Handoff — start on one, finish on another.'],
    ['share', P.graphite, 'AirDrop', 'Instantly share photos, files and content between nearby Apple devices.'],
    ['cloud', P.cobalt, 'iCloud', 'Keeps photos, files and data synced, so every device shows the same thing.'],
    ['headphones', P.graphite, 'AirPods', 'Seamless connection that switches between Apple devices automatically.'],
    ['watch', P.red, 'Apple Watch', 'Stay connected without constantly reaching for your phone.']
  ];
  const cw = 5.9, ch = 1.45, gx = 0.53, gy = 0.22, y0 = 1.98;
  feats.forEach((f,i)=>{
    const col = i % 2, row = (i-col)/2;
    iconRow(s, MX + col*(cw+gx), y0 + row*(ch+gy), cw, ch,
      { icon:f[0], badge:f[1], title:f[2], body:f[3], bh:0.62, bs:11, d:0.66 });
  });
  const lx = MX + (cw+gx), ly = y0 + 2*(ch+gy);
  card(s, lx, ly, cw, ch, { fill:P.ink });
  s.addImage({ path: ic('sparkle','gold'), x:lx+0.32, y:ly+0.46, w:0.54, h:0.54 });
  txt(s, 'What makes it unique?', { x:lx+1.06, y:ly+0.22, w:cw-1.4, h:0.3, fontFace:FH,
    fontSize:11, bold:true, charSpacing:1.6, color:P.gold, valign:'middle' });
  txt(s, 'Apple sells an integrated experience — not just individual devices.',
    { x:lx+1.06, y:ly+0.56, w:cw-1.4, h:0.68, fontFace:FH, fontSize:13.5, bold:true,
      color:'FFFFFF', valign:'top', lineSpacingMultiple:1.1 });
  foot(s);
  s.addNotes('Five concrete proof points. Each one is small on its own; together they are the reason people stay.');
}

/* ================================ 08 · YASHVI — PRODUCT AND BRANDING */
{
  const s = newSlide();
  chip(s, '02', 'Yashvi');
  head(s, 'Brand 1 · Apple', 'In the product and in the branding', { w:9.5 });

  const cw = 5.9, y = 1.98, h = 2.85;
  card(s, MX, y, cw, h, { fill:P.white });
  badge(s, MX+0.4, y+0.4, 0.62, P.red, 'phone', 'w');
  txt(s, 'IN THE PRODUCT', { x:MX+1.16, y:y+0.5, w:cw-1.5, h:0.34, fontFace:FH, fontSize:12.5,
    bold:true, charSpacing:1.8, color:P.graphite, valign:'middle' });
  bullets(s, ['Devices set each other up — sign in once, everything follows',
    'The same apps, layout and gestures on every screen',
    'Files, messages and photos appear on all devices without being sent',
    'Accessories pair themselves instead of being paired'],
    { x:MX+0.4, y:y+1.2, w:cw-0.8, h:1.5, fontSize:12, color:P.graphite });

  const x2 = MX + cw + 0.53;
  card(s, x2, y, cw, h, { fill:P.white });
  badge(s, x2+0.4, y+0.4, 0.62, P.graphite, 'megaphone', 'w');
  txt(s, 'IN THE BRANDING', { x:x2+1.16, y:y+0.5, w:cw-1.5, h:0.34, fontFace:FH, fontSize:12.5,
    bold:true, charSpacing:1.8, color:P.graphite, valign:'middle' });
  bullets(s, ['Adverts show devices being used together, not spec sheets',
    'One design language across the whole family of products',
    'Stores are laid out as one connected table of products',
    'Every launch is framed as an addition to the ecosystem'],
    { x:x2+0.4, y:y+1.2, w:cw-0.8, h:1.5, fontSize:12, color:P.graphite });

  card(s, MX, 5.04, CW, 1.82, { fill:P.ink });
  txt(s, 'REAL-WORLD EXAMPLES', { x:MX+0.45, y:5.26, w:5, h:0.28, fontFace:FH, fontSize:10.5,
    bold:true, charSpacing:2, color:P.gold, valign:'middle' });
  const ex = [
    'Start an email on iPhone, finish it on Mac',
    'AirDrop holiday photos to a friend in seconds',
    'Answer a call on your Watch with the phone in your bag'
  ];
  ex.forEach((e,i)=>{
    const x = MX + 0.45 + i*3.85;
    s.addImage({ path: ic('arrow','red'), x, y:5.72, w:0.32, h:0.32 });
    txt(s, e, { x:x, y:6.12, w:3.5, h:0.62, fontFace:FB, fontSize:12, color:'FFFFFF',
      valign:'top', lineSpacingMultiple:1.1 });
  });
  foot(s);
  s.addNotes('The USP is not only engineered into the product — it also decides how Apple advertises and how its stores are laid out.');
}

/* ================================ 09 · NISHITA — APPLE CONSUMER APPEAL */
{
  const s = newSlide();
  chip(s, '03', 'Nishita');
  head(s, 'Brand 1 · Consumer perspective', 'Why the ecosystem appeals to buyers', { w:9.5, ts:31 });

  const rows = [
    ['link', P.red, 'It removes small, daily frustrations', 'No cables, no transfers, no re-typing passwords. The annoyance simply disappears.'],
    ['user', P.graphite, 'It is easy for non-technical users', 'Nothing has to be set up. Convenience arrives by default, not by configuration.'],
    ['lock', P.cobalt, 'Value grows with every extra device', 'The second and third Apple product make the first one better — so buying again feels logical.'],
    ['heart', P.red, 'It builds trust and habit', 'Once the routine works, switching feels like a risk rather than an upgrade.']
  ];
  rows.forEach((r,i)=> iconRow(s, MX, 1.98 + i*1.26, 7.4, 1.12,
    { icon:r[0], badge:r[1], title:r[2], body:r[3], bh:0.52, bs:10.5, ts:13, d:0.6 }));

  card(s, 8.42, 1.98, 4.26, 4.88, { fill:P.ink });
  s.addImage({ path: ic('quote','gold'), x:8.82, y:2.36, w:0.5, h:0.5 });
  txt(s, '"It just works."', { x:8.82, y:3.1, w:3.46, h:0.66, fontFace:FH, fontSize:26, bold:true,
    color:'FFFFFF', valign:'middle' });
  txt(s, 'This is the promise the ecosystem makes — and the reason customers accept a higher price for it.',
    { x:8.82, y:3.86, w:3.46, h:1.0, fontFace:FB, fontSize:12.5, color:P.dim, lineSpacingMultiple:1.2 });
  s.addShape(pres.ShapeType.roundRect, { x:8.82, y:5.0, w:3.46, h:1.5, rectRadius:0.13,
    fill:{ color:'FFFFFF', transparency:91 }, line:{ type:'none' } });
  txt(s, 'THE BUYER IT SUITS', { x:9.06, y:5.18, w:3.0, h:0.26, fontFace:FH, fontSize:9.5,
    bold:true, charSpacing:1.6, color:P.gold, valign:'middle' });
  txt(s, 'Someone who values simplicity, consistency and time saved more than customisation or a lower price.',
    { x:9.06, y:5.48, w:3.0, h:0.94, fontFace:FB, fontSize:11, color:'FFFFFF', lineSpacingMultiple:1.15 });
  foot(s);
  s.addNotes('The appeal is emotional as much as functional — it is about the friction that never happens.');
}

/* ============================ 10 · NISHITA — APPLE STRENGTHS/WEAKNESSES */
{
  const s = newSlide();
  chip(s, '03', 'Nishita');
  head(s, 'Brand 1 · Consumer perspective', 'Strengths, weaknesses, verdict', { w:9.5 });

  const cw = 5.9, y = 1.98, h = 3.06;
  card(s, MX, y, cw, h, { fill:P.white });
  badge(s, MX+0.4, y+0.38, 0.6, P.green, 'check', 'w');
  txt(s, 'STRENGTHS', { x:MX+1.14, y:y+0.46, w:3.5, h:0.34, fontFace:FH, fontSize:12.5, bold:true,
    charSpacing:1.8, color:P.green, valign:'middle' });
  bullets(s, ['Genuinely hard for a rival to copy — it needs the whole product family',
    'Convenience is felt every single day, not just at purchase',
    'Supports a premium price without discounting',
    'Turns one purchase into repeat purchases'],
    { x:MX+0.4, y:y+1.14, w:cw-0.8, h:1.9, fontSize:12, color:P.graphite });

  const x2 = MX + cw + 0.53;
  card(s, x2, y, cw, h, { fill:P.white });
  badge(s, x2+0.4, y+0.38, 0.6, P.amber, 'alert', 'w');
  txt(s, 'WEAKNESSES', { x:x2+1.14, y:y+0.46, w:3.5, h:0.34, fontFace:FH, fontSize:12.5, bold:true,
    charSpacing:1.8, color:P.amber, valign:'middle' });
  bullets(s, ['The benefit only appears once you own more than one Apple device',
    'Higher entry price than many rival options',
    'Less customisation and fewer form-factor choices',
    'Leaving the ecosystem later feels costly — some buyers resent that'],
    { x:x2+0.4, y:y+1.14, w:cw-0.8, h:1.9, fontSize:12, color:P.graphite });

  card(s, MX, 5.26, CW, 1.6, { fill:P.ink });
  badge(s, MX+0.42, 5.6, 0.68, P.red, 'target', 'w');
  txt(s, 'DIFFERENTIATION VERDICT', { x:MX+1.3, y:5.46, w:5, h:0.28, fontFace:FH, fontSize:10,
    bold:true, charSpacing:2, color:P.gold, valign:'middle' });
  txt(s, 'Very effective. Rivals can match a camera or a chip in one product cycle — they cannot quickly build a whole family of devices that already talk to each other.',
    { x:MX+1.3, y:5.78, w:CW-1.9, h:0.9, fontFace:FB, fontSize:12.5, color:'FFFFFF', lineSpacingMultiple:1.16 });
  foot(s);
  s.addNotes('Be honest about the weaknesses — the lock-in that is a strength for Apple is exactly what some buyers dislike.');
}

/* ======================================= 11 · AARYA — SAMSUNG USP HERO */
{
  const s = newSlide('bg-samsung.png');
  chip(s, '04', 'Aarya', true);
  txt(s, 'BRAND 2  ·  SAMSUNG', { x:MX, y:1.28, w:6, h:0.3, fontFace:FH, fontSize:11, bold:true,
    charSpacing:3, color:P.sky, valign:'middle' });
  txt(s, 'Innovation,\nSmart Tech\n& Choice', { x:MX, y:1.7, w:6.3, h:2.7, fontFace:FH, fontSize:46,
    bold:true, color:'FFFFFF', lineSpacingMultiple:0.94, valign:'middle' });
  txt(s, 'Samsung differentiates itself by combining innovative technology, intelligent features and a wide range of product choices.',
    { x:MX, y:4.58, w:6.0, h:1.0, fontFace:FB, fontSize:16, color:'D7E0FF', lineSpacingMultiple:1.2 });

  s.addShape(pres.ShapeType.roundRect, { x:MX, y:5.72, w:6.0, h:1.18, rectRadius:0.16,
    fill:{ color:'FFFFFF', transparency:88 }, line:{ color:'FFFFFF', width:1, transparency:75 } });
  s.addImage({ path: ic('grid','w'), x:MX+0.38, y:6.08, w:0.46, h:0.46 });
  txt(s, 'Where Apple narrows the choice, Samsung widens it.',
    { x:MX+1.0, y:5.72, w:4.7, h:1.18, fontFace:FH, fontSize:14, bold:true, color:'FFFFFF', valign:'middle' });

  s.addImage({ path: IMG+'foldable.png', x:7.35, y:1.6, w:5.3, h:3.9 });
  txt(s, 'The Galaxy Z Fold and Z Flip: hardware that changes shape — the clearest signal of Samsung’s innovation claim.',
    { x:7.35, y:5.66, w:5.3, h:0.86, fontFace:FB, fontSize:11.5, italic:true, color:'C9D5FF',
      align:'center', lineSpacingMultiple:1.15 });
  foot(s, true);
  s.addNotes('Samsung’s USP has three parts working together — innovation, smart technology and choice. Nothing is locked to a single price point.');
}

/* ======================================== 12 · AARYA — THE THREE PILLARS */
{
  const s = newSlide();
  chip(s, '04', 'Aarya');
  head(s, 'Brand 2 · Samsung', 'Three pillars, one proposition', { w:9.4 });

  const pil = [
    ['layers', P.cobalt, 'Innovation', 'Samsung introduces new and unique smartphone designs.',
      ['Galaxy Z Fold — a phone that opens into a tablet', 'Galaxy Z Flip — a flagship that folds in half', 'New form factors before the rest of the market']],
    ['sparkle', P.cobalt2, 'Smart Technology', 'Galaxy AI makes everyday tasks easier and more convenient.',
      ['Photo Assist — edit images instantly', 'Writing Assist — rewrite and summarise', 'Interpreter — live translation', 'Now Brief — a daily summary']],
    ['grid', P.graphite, 'Wide Choice', 'Smartphones in different designs, features and price ranges.',
      ['Galaxy S series — flagship performance', 'Galaxy A series — accessible pricing', 'Galaxy Z series — foldable form factors']]
  ];
  const cw = (CW - 2*0.36)/3, y = 2.02, h = 4.64;
  pil.forEach((p,i)=>{
    const x = MX + i*(cw+0.36);
    card(s, x, y, cw, h, { fill:P.white });
    badge(s, x+0.36, y+0.4, 0.8, p[1], p[0], 'w');
    txt(s, p[2], { x:x+0.36, y:y+1.38, w:cw-0.72, h:0.4, fontFace:FH, fontSize:17, bold:true,
      color:P.graphite, valign:'middle' });
    txt(s, p[3], { x:x+0.36, y:y+1.86, w:cw-0.72, h:0.78, fontFace:FB, fontSize:12,
      color:P.muted, valign:'top', lineSpacingMultiple:1.12 });
    s.addShape(pres.ShapeType.roundRect, { x:x+0.36, y:y+2.5, w:cw-0.72, h:1.86, rectRadius:0.12,
      fill:{ color:'EDEEF3' }, line:{ type:'none' } });
    txt(s, 'EXAMPLES', { x:x+0.6, y:y+2.66, w:cw-1.2, h:0.24, fontFace:FH, fontSize:9,
      bold:true, charSpacing:1.6, color:P.cobalt, valign:'middle' });
    bullets(s, p[4], { x:x+0.6, y:y+2.98, w:cw-1.2, h:1.3, fontSize:10, color:P.graphite,
      paraSpaceAfter:4 });
  });
  foot(s);
  s.addNotes('Each pillar has its own evidence. Innovation is the hardware, smart technology is Galaxy AI, and choice is the three-series line-up.');
}

/* ============================= 13 · AARYA — PRODUCT AND BRANDING (SAMSUNG) */
{
  const s = newSlide();
  chip(s, '04', 'Aarya');
  head(s, 'Brand 2 · Samsung', 'In the product and in the branding', { w:9.5 });

  const cw = 5.9, y = 1.98, h = 2.58;
  card(s, MX, y, cw, h, { fill:P.white });
  badge(s, MX+0.4, y+0.38, 0.6, P.cobalt, 'phone', 'w');
  txt(s, 'IN THE PRODUCT', { x:MX+1.14, y:y+0.46, w:3.6, h:0.34, fontFace:FH, fontSize:12.5,
    bold:true, charSpacing:1.8, color:P.graphite, valign:'middle' });
  bullets(s, ['Foldable screens that change what a phone can be',
    'Galaxy AI features built into the everyday apps',
    'A model at almost every price point and screen size'],
    { x:MX+0.4, y:y+1.16, w:cw-0.8, h:1.3, fontSize:12, color:P.graphite });

  const x2 = MX + cw + 0.53;
  card(s, x2, y, cw, h, { fill:P.white });
  badge(s, x2+0.4, y+0.38, 0.6, P.cobalt2, 'megaphone', 'w');
  txt(s, 'IN THE BRANDING', { x:x2+1.14, y:y+0.46, w:3.6, h:0.34, fontFace:FH, fontSize:12.5,
    bold:true, charSpacing:1.8, color:P.graphite, valign:'middle' });
  bullets(s, ['Launch events lead with the newest form factor',
    'Advertising demonstrates AI features in real situations',
    'Campaigns run across every tier, not only the flagship'],
    { x:x2+0.4, y:y+1.16, w:cw-0.8, h:1.3, fontSize:12, color:P.graphite });

  card(s, MX, 4.78, CW, 2.08, { fill:P.ink });
  txt(s, 'ONE USP, THREE PRICE TIERS', { x:MX+0.45, y:5.0, w:5.4, h:0.28, fontFace:FH,
    fontSize:10.5, bold:true, charSpacing:2, color:P.sky, valign:'middle' });
  txt(s, 'The same promise — new technology, your choice of shape and budget — is repeated at every level of the range. A student and a flagship buyer are both being sold "choice".',
    { x:MX+0.45, y:5.34, w:6.8, h:1.1, fontFace:FB, fontSize:13, color:'FFFFFF', lineSpacingMultiple:1.2 });
  s.addImage({ path: IMG+'range.png', x:7.9, y:4.94, w:4.4, h:1.97 });
  foot(s);
  s.addNotes('Samsung repeats one message across three price tiers — that is how the choice pillar becomes visible in marketing.');
}

/* ============================== 14 · VENESA — SAMSUNG CONSUMER APPEAL */
{
  const s = newSlide();
  chip(s, '05', 'Venesa');
  head(s, 'Brand 2 · Consumer perspective', 'Why Samsung’s USP appeals to buyers', { w:9.5, ts:31 });

  card(s, MX, 1.98, 4.26, 4.88, { fill:P.cobalt });
  s.addImage({ path: ic('quote','w'), x:MX+0.4, y:2.36, w:0.5, h:0.5 });
  txt(s, 'More options,\nmore new ideas.', { x:MX+0.4, y:3.02, w:3.46, h:1.0, fontFace:FH,
    fontSize:23, bold:true, color:'FFFFFF', valign:'middle', lineSpacingMultiple:1.0 });
  txt(s, 'Samsung appeals through innovation, variety and advanced features — and offers phones across price ranges, giving consumers more choice than Apple.',
    { x:MX+0.4, y:4.14, w:3.46, h:1.3, fontFace:FB, fontSize:12.5, color:'D7E0FF', lineSpacingMultiple:1.2 });
  s.addShape(pres.ShapeType.roundRect, { x:MX+0.4, y:5.5, w:3.46, h:1.0, rectRadius:0.13,
    fill:{ color:'FFFFFF', transparency:88 }, line:{ type:'none' } });
  txt(s, 'THE BUYER IT SUITS', { x:MX+0.62, y:5.64, w:3.0, h:0.24, fontFace:FH, fontSize:9.5,
    bold:true, charSpacing:1.6, color:P.sky, valign:'middle' });
  txt(s, 'Someone who wants the newest technology, room to customise, and a phone that fits their budget.',
    { x:MX+0.62, y:5.9, w:3.0, h:0.56, fontFace:FB, fontSize:10.5, color:'FFFFFF', lineSpacingMultiple:1.12 });

  const rows = [
    ['tag', P.cobalt, 'A phone at every budget', 'From the value A series to the flagship S series — consumers are not forced into one price.'],
    ['layers', P.cobalt2, 'Genuinely new hardware', 'Foldable phones give buyers something they simply cannot get from a conventional slab phone.'],
    ['sparkle', P.graphite, 'AI that helps with real tasks', 'Photo Assist, Writing Assist, Interpreter and Now Brief make everyday jobs quicker.'],
    ['grid', P.cobalt, 'Freedom to customise', 'Displays, cameras and software settings can be tailored to how the owner actually uses the phone.']
  ];
  rows.forEach((r,i)=> iconRow(s, 5.28, 1.98 + i*1.26, 7.4, 1.12,
    { icon:r[0], badge:r[1], title:r[2], body:r[3], bh:0.52, bs:10.5, ts:13, d:0.6 }));
  foot(s);
  s.addNotes('Samsung’s appeal is about breadth — features people want to try, at a price they can reach.');
}

/* ========================= 15 · VENESA — SAMSUNG STRENGTHS/WEAKNESSES */
{
  const s = newSlide();
  chip(s, '05', 'Venesa');
  head(s, 'Brand 2 · Consumer perspective', 'Strengths, weaknesses, verdict', { w:9.5 });

  const cw = 5.9, y = 1.98, h = 3.06;
  card(s, MX, y, cw, h, { fill:P.white });
  badge(s, MX+0.4, y+0.36, 0.6, P.green, 'check', 'w');
  txt(s, 'STRENGTHS', { x:MX+1.14, y:y+0.44, w:3.5, h:0.34, fontFace:FH, fontSize:12.5, bold:true,
    charSpacing:1.8, color:P.green, valign:'middle' });
  bullets(s, ['More variety across designs and price points',
    'Innovative features and foldable form factors',
    'Wider price range reaches far more buyers',
    'Greater customisation for the owner'],
    { x:MX+0.4, y:y+1.1, w:cw-0.8, h:1.7, fontSize:12, color:P.graphite });

  const x2 = MX + cw + 0.53;
  card(s, x2, y, cw, h, { fill:P.white });
  badge(s, x2+0.4, y+0.36, 0.6, P.amber, 'alert', 'w');
  txt(s, 'WEAKNESSES', { x:x2+1.14, y:y+0.44, w:3.5, h:0.34, fontFace:FH, fontSize:12.5, bold:true,
    charSpacing:1.8, color:P.amber, valign:'middle' });
  bullets(s, ['So many models that choosing becomes confusing',
    'Features vary between models — the promise is inconsistent',
    'A three-part USP is harder to remember than a single idea',
    'Rivals can copy an individual feature quickly'],
    { x:x2+0.4, y:y+1.1, w:cw-0.8, h:1.7, fontSize:12, color:P.graphite });

  card(s, MX, 5.26, CW, 1.6, { fill:P.ink });
  badge(s, MX+0.42, 5.6, 0.68, P.cobalt2, 'swap', 'w');
  txt(s, 'HOW SAMSUNG DIFFERENTIATES ITSELF FROM APPLE', { x:MX+1.3, y:5.46, w:8, h:0.28,
    fontFace:FH, fontSize:10, bold:true, charSpacing:1.8, color:P.sky, valign:'middle' });
  txt(s, 'Apple focuses on a premium, simple, closely connected ecosystem. Samsung gives consumers more device options, more customisation and more experimental technology — variety and novelty instead of integration.',
    { x:MX+1.3, y:5.78, w:CW-1.9, h:0.9, fontFace:FB, fontSize:12.5, color:'FFFFFF', lineSpacingMultiple:1.16 });
  foot(s);
  s.addNotes('Overall: Samsung suits buyers who want variety, customisation and the latest features; Apple suits buyers who value premium experience, simplicity and integration.');
}

/* ================================== 16 · SIMRAN — HEAD-TO-HEAD SCORECARD */
{
  const s = newSlide();
  chip(s, '06', 'Simran');
  head(s, 'USP comparison', 'Head to head, on our four criteria',
    { y:0.44, th:0.6, ts:31, sub:'Scored out of five. This is our team’s assessment of the two propositions — a judgement, not market research data.', subw:11.2 });

  const hy = 1.98;
  txt(s, 'CRITERION', { x:MX+0.3, y:hy, w:2.6, h:0.26, fontFace:FH, fontSize:9.5, bold:true,
    charSpacing:1.8, color:P.muted, valign:'middle' });
  txt(s, 'APPLE  ·  SEAMLESS ECOSYSTEM', { x:MX+3.5, y:hy, w:4.2, h:0.26, fontFace:FH, fontSize:9.5,
    bold:true, charSpacing:1.6, color:P.red, valign:'middle' });
  txt(s, 'SAMSUNG  ·  INNOVATION & CHOICE', { x:MX+8.0, y:hy, w:4.2, h:0.26, fontFace:FH, fontSize:9.5,
    bold:true, charSpacing:1.6, color:P.cobalt, valign:'middle' });

  const data = [
    ['Uniqueness', 4, 'Structurally hard to copy, but the idea itself is well known', 5, 'Foldable hardware is the most visibly new thing in the category'],
    ['Customer value', 5, 'Saves time and effort every single day', 4, 'Great when a feature is used — but not every buyer uses them'],
    ['Memorability', 5, 'One idea, one sentence: everything works together', 3, 'Three ideas at once are harder to repeat back'],
    ['Differentiation', 5, 'Nobody else owns a whole connected device family', 3, 'Individual features get matched by rivals within a cycle']
  ];
  const rh = 0.86, gy = 0.10, y0 = 2.26;
  data.forEach((d,i)=>{
    const y = y0 + i*(rh+gy);
    card(s, MX, y, CW, rh, { fill:P.white, r:0.13 });
    txt(s, d[0], { x:MX+0.3, y:y+0.06, w:2.9, h:rh-0.12, fontFace:FH, fontSize:14, bold:true,
      color:P.graphite, valign:'middle' });
    dots(s, MX+3.5, y+0.19, d[1], 5, P.red);
    txt(s, d[1]+'/5', { x:MX+4.78, y:y+0.11, w:0.7, h:0.3, fontFace:FH, fontSize:11.5, bold:true,
      color:P.red, valign:'middle' });
    txt(s, d[2], { x:MX+3.5, y:y+0.46, w:4.2, h:0.34, fontFace:FB, fontSize:10.5, color:P.muted, valign:'top' });
    dots(s, MX+8.0, y+0.19, d[3], 5, P.cobalt);
    txt(s, d[3]+'/5', { x:MX+9.28, y:y+0.11, w:0.7, h:0.3, fontFace:FH, fontSize:11.5, bold:true,
      color:P.cobalt, valign:'middle' });
    txt(s, d[4], { x:MX+8.0, y:y+0.46, w:4.0, h:0.34, fontFace:FB, fontSize:10.5, color:P.muted, valign:'top' });
  });

  const ty = y0 + 4*(rh+gy) + 0.04;
  card(s, MX, ty, CW, 0.58, { fill:P.ink, r:0.13 });
  txt(s, 'TOTAL', { x:MX+0.3, y:ty, w:2.9, h:0.58, fontFace:FH, fontSize:11, bold:true,
    charSpacing:1.8, color:P.dim, valign:'middle' });
  txt(s, '19 / 20', { x:MX+3.5, y:ty, w:2, h:0.58, fontFace:FH, fontSize:17, bold:true,
    color:P.red, valign:'middle' });
  txt(s, '15 / 20', { x:MX+8.0, y:ty, w:2, h:0.58, fontFace:FH, fontSize:17, bold:true,
    color:'7E9BFF', valign:'middle' });
  foot(s);
  s.addNotes('Samsung actually wins uniqueness — foldables are the newest thing on a shop shelf. Apple wins everything else, and wins memorability and differentiation decisively.');
}

/* ============================================ 17 · SIMRAN — THE VERDICT */
{
  const s = newSlide('bg-dark.png');
  chip(s, '06', 'Simran', true);
  txt(s, 'THE VERDICT', { x:MX, y:1.24, w:6, h:0.3, fontFace:FH, fontSize:11, bold:true,
    charSpacing:3.2, color:P.gold, valign:'middle' });
  badge(s, MX, 1.78, 0.96, P.gold, 'trophy', 'ink');
  txt(s, 'The stronger USP:\nApple’s Seamless Ecosystem', { x:MX, y:2.98, w:7.0, h:1.5,
    fontFace:FH, fontSize:36, bold:true, color:'FFFFFF', lineSpacingMultiple:1.0, valign:'middle' });
  txt(s, 'Samsung out-innovates Apple on hardware. But a USP is judged on whether customers can name it, feel it and fail to find it elsewhere.',
    { x:MX, y:4.62, w:6.7, h:0.94, fontFace:FB, fontSize:14, color:P.dim, lineSpacingMultiple:1.22 });

  s.addShape(pres.ShapeType.roundRect, { x:MX, y:5.82, w:6.7, h:1.04, rectRadius:0.15,
    fill:{ color:'FFFFFF', transparency:91 }, line:{ color:'FFFFFF', width:1, transparency:82 } });
  txt(s, 'TEAM SCORECARD (SLIDE 16)', { x:MX+0.42, y:5.94, w:4.4, h:0.24, fontFace:FH,
    fontSize:9.5, bold:true, charSpacing:1.8, color:P.gold, valign:'middle' });
  txt(s, [
    { text:'Apple 19', options:{ color:'FFFFFF' } },
    { text:'/20', options:{ color:P.dim } },
    { text:'      ·      ', options:{ color:P.dim } },
    { text:'Samsung 15', options:{ color:'FFFFFF' } },
    { text:'/20', options:{ color:P.dim } }
  ], { x:MX+0.42, y:6.2, w:5.9, h:0.44, fontFace:FH, fontSize:17, bold:true, valign:'middle' });

  const just = [
    ['bulb','It is one idea, not three','"Everything works together" survives one hearing. "Innovation, smart technology and choice" does not.'],
    ['lock','It compounds instead of resetting','Each new Apple device makes the existing ones more useful. A new Samsung feature starts the argument again.'],
    ['target','It cannot be matched feature by feature','A rival can build a foldable in one cycle. Building a family of devices that already trust each other takes years.']
  ];
  just.forEach((j,i)=>{
    const y = 1.72 + i*1.72;
    s.addShape(pres.ShapeType.roundRect, { x:7.55, y, w:5.13, h:1.5, rectRadius:0.15,
      fill:{ color:'FFFFFF', transparency:91 }, line:{ color:'FFFFFF', width:1, transparency:82 } });
    badge(s, 7.85, y+0.42, 0.66, P.gold, j[0], 'ink');
    txt(s, j[1], { x:8.68, y:y+0.2, w:3.75, h:0.36, fontFace:FH, fontSize:13, bold:true,
      color:'FFFFFF', valign:'middle' });
    txt(s, j[2], { x:8.68, y:y+0.58, w:3.75, h:0.78, fontFace:FB, fontSize:10.5, color:P.dim,
      valign:'top', lineSpacingMultiple:1.12 });
  });
  foot(s, true);
  s.addNotes('State the winner plainly and give three reasons. Credit Samsung for uniqueness so the verdict does not sound like fandom.');
}

/* ================================= 18 · MANN — WHY THE WINNING USP WORKS */
{
  const s = newSlide();
  chip(s, '07', 'Mann');
  head(s, 'Deeper analysis · The winning USP', 'Why the ecosystem keeps winning', { w:9.5 });

  const mech = [
    ['link', P.red, 'The value compounds', 'One device is a good product. Two devices become a system. Each purchase increases the value of the ones already owned — so the advantage grows over time instead of resetting each launch.'],
    ['lock', P.graphite, 'It raises the cost of leaving', 'Switching away does not mean losing one phone — it means losing the hand-offs, the shared files and the habits built around them. That keeps customers without needing a discount.'],
    ['heart', P.cobalt, 'It sells a feeling, not a feature', 'Specifications are compared; experiences are remembered. "It just works" is the kind of claim customers repeat to each other, which turns owners into advocates.']
  ];
  const cw = (CW - 2*0.36)/3, y = 2.0, h = 3.3;
  mech.forEach((m,i)=>{
    const x = MX + i*(cw+0.36);
    card(s, x, y, cw, h, { fill:P.white });
    badge(s, x+0.34, y+0.36, 0.72, m[1], m[0], 'w');
    txt(s, m[2], { x:x+0.34, y:y+1.24, w:cw-0.68, h:0.6, fontFace:FH, fontSize:15, bold:true,
      color:P.graphite, valign:'top', lineSpacingMultiple:1.05 });
    txt(s, m[3], { x:x+0.34, y:y+1.84, w:cw-0.68, h:1.3, fontFace:FB, fontSize:11.5,
      color:P.muted, valign:'top', lineSpacingMultiple:1.14 });
  });

  card(s, MX, 5.56, CW, 1.3, { fill:P.ink });
  txt(s, 'THE EVIDENCE, IN EVERYDAY TERMS', { x:MX+0.45, y:5.68, w:6, h:0.28, fontFace:FH,
    fontSize:10.5, bold:true, charSpacing:2, color:P.gold, valign:'middle' });
  const ev = [
    ['link','Handoff: the task follows you between devices'],
    ['share','AirDrop: sharing needs no app, account or cable'],
    ['cloud','iCloud: the same photo is already on every screen']
  ];
  ev.forEach((e,i)=>{
    const x = MX + 0.45 + i*3.9;
    s.addImage({ path: ic(e[0],'red'), x, y:6.08, w:0.34, h:0.34 });
    txt(s, e[1], { x:x+0.48, y:6.06, w:3.3, h:0.56, fontFace:FB, fontSize:11.5, color:'FFFFFF',
      valign:'top', lineSpacingMultiple:1.12 });
  });
  foot(s);
  s.addNotes('Three mechanisms, then the everyday evidence. The point: this advantage is structural, not a marketing line.');
}

/* ========================== 19 · MANN — FROM USP TO ADVERTISING (BRIDGE) */
{
  const s = newSlide();
  chip(s, '07', 'Mann');
  head(s, 'Deeper analysis · Bridge to the advertising', 'How this USP should be communicated', { w:9.5 });

  const brief = [
    ['target', P.red, 'What the ad must SAY', 'Everything you own works together — with nothing to set up.'],
    ['heart', P.graphite, 'What the ad must MAKE YOU FEEL', 'Relief. The small daily frictions simply are not there any more.'],
    ['check', P.green, 'What the ad must PROVE', 'Show a hand-off happening: one action, two devices, no explanation needed.'],
    ['music', P.gold, 'Why AUDIO suits this USP', 'The idea is a sequence of moments, so it can be sung. Sound can travel between devices in a way a still image cannot.']
  ];
  brief.forEach((b,i)=>{
    const col = i % 2, row = (i-col)/2;
    const cw = 5.9, ch = 1.62;
    iconRow(s, MX + col*(cw+0.53), 2.1 + row*(ch+0.26), cw, ch,
      { icon:b[0], badge:b[1], title:b[2], body:b[3], bh:0.78, bs:12, ts:12.5, d:0.68, pad:0.36 });
  });

  card(s, MX, 5.86, CW, 1.0, { fill:P.ink });
  s.addImage({ path: ic('arrow','gold'), x:MX+0.42, y:6.14, w:0.44, h:0.44 });
  txt(s, 'Over to Gouraksh — who turns this brief into a fifteen-second jingle.',
    { x:MX+1.06, y:5.86, w:CW-1.6, h:1.0, fontFace:FH, fontSize:14, bold:true, color:'FFFFFF', valign:'middle' });
  foot(s);
  s.addNotes('This slide is the handover: it converts the analysis into a creative brief the next speaker can act on.');
}

/* =============================== 20 · GOURAKSH — JINGLE / AUDIO ADVERT */
{
  const s = newSlide('bg-dark.png');
  chip(s, '08', 'Gouraksh', true);
  txt(s, 'AUDIO ADVERTISEMENT', { x:MX, y:1.1, w:6, h:0.3, fontFace:FH, fontSize:11, bold:true,
    charSpacing:3.2, color:P.gold, valign:'middle' });
  txt(s, '"One Tap Away"', { x:MX, y:1.5, w:7, h:0.86, fontFace:FH, fontSize:40, bold:true,
    color:'FFFFFF', valign:'middle' });
  txt(s, 'A fifteen-second jingle. Each line is one device picking up where the last one left off — the music never stops, and neither does the task.',
    { x:MX, y:2.44, w:6.1, h:0.9, fontFace:FB, fontSize:13.5, color:P.dim, lineSpacingMultiple:1.2 });

  s.addShape(pres.ShapeType.roundRect, { x:MX, y:3.5, w:6.1, h:3.02, rectRadius:0.16,
    fill:{ color:'FFFFFF', transparency:91 }, line:{ color:'FFFFFF', width:1, transparency:80 } });
  s.addImage({ path: ic('music','gold'), x:MX+0.4, y:3.78, w:0.46, h:0.46 });
  txt(s, 'THE LYRICS', { x:MX+1.02, y:3.78, w:3, h:0.46, fontFace:FH, fontSize:10.5, bold:true,
    charSpacing:2, color:P.gold, valign:'middle' });
  txt(s, 'Phone to laptop — tap, it’s there,\nPhotos flying through the air.\nWatch on wrist, buds in your ear,\nEverything you love stays near.\n\nApple. One world, one tap away.',
    { x:MX+0.4, y:4.36, w:5.3, h:1.94, fontFace:FH, fontSize:15, bold:true, italic:true,
      color:'FFFFFF', lineSpacingMultiple:1.24, valign:'top' });

  s.addImage({ path: IMG+'wave.png', x:7.2, y:1.24, w:5.4, h:2.03 });
  const why = [
    ['link','Line 1 = Handoff', 'The task moves between devices without stopping.'],
    ['share','Line 2 = AirDrop', 'Sharing sounds effortless because it is described as flying.'],
    ['watch','Line 3 = Watch + AirPods', 'The companion devices join the same sentence.'],
    ['heart','Line 4 = the payoff', '"Stays near" is the emotional promise of the ecosystem.']
  ];
  why.forEach((w,i)=>{
    const y = 3.36 + i*0.74;
    s.addImage({ path: ic(w[0],'gold'), x:7.2, y:y+0.06, w:0.34, h:0.34 });
    txt(s, w[1], { x:7.68, y:y, w:4.9, h:0.28, fontFace:FH, fontSize:12, bold:true,
      color:'FFFFFF', valign:'middle' });
    txt(s, w[2], { x:7.68, y:y+0.3, w:4.9, h:0.34, fontFace:FB, fontSize:10.5, color:P.dim, valign:'top' });
  });
  s.addShape(pres.ShapeType.roundRect, { x:7.2, y:6.32, w:5.4, h:0.5, rectRadius:0.25,
    fill:{ color:'FFFFFF', transparency:90 }, line:{ color:P.gold, width:1, transparency:45 } });
  s.addImage({ path: ic('mic','gold'), x:7.48, y:6.44, w:0.28, h:0.28 });
  txt(s, 'PERFORM OR PLAY THE JINGLE HERE', { x:7.9, y:6.32, w:4.4, h:0.5,
    fontFace:FH, fontSize:10, bold:true, charSpacing:1.2, color:P.gold, valign:'middle' });
  foot(s, true);
  s.addNotes('Introduce the idea, explain the structure, then perform or play the jingle. Afterwards, point out that every line maps to one ecosystem feature.');
}

/* ============================================ 21 · CONCLUSION / TAGLINE */
{
  const s = newSlide('bg-title.png');
  txt(s, 'CONCLUSION', { x:MX, y:1.32, w:6, h:0.3, fontFace:FH, fontSize:11, bold:true,
    charSpacing:3.2, color:P.gold, valign:'middle' });
  txt(s, 'Samsung sells you\nmore products.\nApple sells you\none experience.',
    { x:MX, y:1.82, w:7.6, h:2.9, fontFace:FH, fontSize:38, bold:true, color:'FFFFFF',
      lineSpacingMultiple:1.06, valign:'middle' });
  txt(s, 'That is why the seamless ecosystem is the stronger Unique Selling Proposition.',
    { x:MX, y:4.9, w:7.0, h:0.5, fontFace:FB, fontSize:15, color:P.dim, valign:'middle' });

  s.addShape(pres.ShapeType.roundRect, { x:8.62, y:1.82, w:4.06, h:2.9, rectRadius:0.18,
    fill:{ color:'FFFFFF', transparency:90 }, line:{ color:'FFFFFF', width:1, transparency:76 } });
  badge(s, 8.98, 2.18, 0.8, P.gold, 'megaphone', 'ink');
  txt(s, 'OUR TAGLINE', { x:8.98, y:3.18, w:3.4, h:0.28, fontFace:FH, fontSize:10, bold:true,
    charSpacing:2, color:P.gold, valign:'middle' });
  txt(s, '"One world.\nOne tap away."', { x:8.98, y:3.5, w:3.4, h:1.0, fontFace:FH, fontSize:21,
    bold:true, italic:true, color:'FFFFFF', lineSpacingMultiple:1.06, valign:'top' });

  s.addShape(pres.ShapeType.roundRect, { x:MX, y:5.62, w:CW, h:1.16, rectRadius:0.15,
    fill:{ color:'FFFFFF', transparency:92 }, line:{ color:'FFFFFF', width:1, transparency:80 } });
  txt(s, 'THANK YOU  ·  QUESTIONS WELCOME', { x:MX+0.45, y:5.78, w:6.4, h:0.32, fontFace:FH,
    fontSize:12, bold:true, charSpacing:2.4, color:P.gold, valign:'middle' });
  txt(s, 'Isha  ·  Yashvi  ·  Nishita  ·  Aarya  ·  Venesa  ·  Simran  ·  Mann  ·  Gouraksh',
    { x:MX+0.45, y:6.14, w:CW-0.9, h:0.4, fontFace:FB, fontSize:13, color:'FFFFFF', valign:'middle' });
  s.addNotes('Close on the contrast in one sentence, land the tagline, thank the audience and open for questions.');
}

pres.writeFile({ fileName: __dirname + '/Apple-vs-Samsung-USP.pptx' })
  .then(f => console.log('WROTE ' + f + '  (' + pageNo + ' slides)'));

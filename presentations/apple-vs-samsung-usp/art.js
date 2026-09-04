const sharp = require('sharp');
const fs = require('fs');
const OUT = __dirname + '/img/';

const C = {
  ink:'#0B0D12', ink2:'#14171F', paper:'#F6F6F8', white:'#FFFFFF',
  graphite:'#1D1D1F', silver:'#D7D9DE', red:'#FF3B30',
  cobalt:'#1428A0', cobalt2:'#3C64F4', gold:'#F5B301',
  green:'#12B886', amber:'#E8A33D', muted:'#6B7280'
};

const svg = (w,h,inner,bg='none') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`+
  (bg==='none'?'':`<rect width="${w}" height="${h}" fill="${bg}"/>`)+inner+`</svg>`;

const write = (name, s, w) => sharp(Buffer.from(s)).resize({width:w}).png()
  .toFile(OUT+name).then(()=>console.log('  '+name));

/* ---------------------------------------------------------------- icons */
const I = {
  link:'<path d="M10 13.2a5 5 0 007.5.5l2.2-2.2a5 5 0 00-7.1-7.1l-1.2 1.3"/><path d="M14 10.8a5 5 0 00-7.5-.5L4.3 12.5a5 5 0 007.1 7.1l1.2-1.3"/>',
  share:'<path d="M12 16.5V4"/><path d="M7.8 8.2L12 4l4.2 4.2"/><path d="M4 14v4.5A2.5 2.5 0 006.5 21h11a2.5 2.5 0 002.5-2.5V14"/>',
  cloud:'<path d="M7 18.5a4.5 4.5 0 01-.4-9A6.2 6.2 0 0118.3 10a4.3 4.3 0 01-.6 8.5z"/>',
  headphones:'<path d="M4.2 15.5v-3.2a7.8 7.8 0 0115.6 0v3.2"/><rect x="2.6" y="13.6" width="4" height="7" rx="2"/><rect x="17.4" y="13.6" width="4" height="7" rx="2"/>',
  watch:'<rect x="7" y="6.8" width="10" height="10.4" rx="2.6"/><path d="M9.2 6.8V3.6h5.6v3.2"/><path d="M9.2 17.2v3.2h5.6v-3.2"/><path d="M12 10v2.3l1.7 1"/>',
  sparkle:'<path d="M12 2.8l1.9 5.6 5.6 1.9-5.6 1.9L12 17.8l-1.9-5.6L4.5 10.3l5.6-1.9z"/><path d="M18.6 16.4l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  layers:'<path d="M12 3.2L21 8l-9 4.8L3 8z"/><path d="M3 12.6l9 4.8 9-4.8"/><path d="M3 17.1l9 4.8 9-4.8"/>',
  grid:'<rect x="3.2" y="3.2" width="7.4" height="7.4" rx="2"/><rect x="13.4" y="3.2" width="7.4" height="7.4" rx="2"/><rect x="3.2" y="13.4" width="7.4" height="7.4" rx="2"/><rect x="13.4" y="13.4" width="7.4" height="7.4" rx="2"/>',
  check:'<circle cx="12" cy="12" r="9.2"/><path d="M7.8 12.4l2.9 2.9 5.5-5.8"/>',
  alert:'<path d="M12 3.4l9.2 16.4H2.8z"/><path d="M12 9.6v4.4"/><path d="M12 17.2h.02"/>',
  trophy:'<path d="M7 3.6h10v5.2a5 5 0 01-10 0z"/><path d="M7 5.8H3.6v1.9A3.4 3.4 0 007 11.1"/><path d="M17 5.8h3.4v1.9a3.4 3.4 0 01-3.4 3.4"/><path d="M10.2 13.8h3.6l.7 4.6h-5z"/><path d="M7.6 20.6h8.8"/>',
  music:'<path d="M9.2 18.4V5.6l10-2.2v12.8"/><circle cx="6.6" cy="18.4" r="2.7"/><circle cx="16.6" cy="16.2" r="2.7"/>',
  mic:'<rect x="9" y="2.8" width="6" height="11.4" rx="3"/><path d="M4.8 11.6a7.2 7.2 0 0014.4 0"/><path d="M12 18.8v2.6"/><path d="M8.4 21.4h7.2"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3"/>',
  lock:'<rect x="3.8" y="10" width="16.4" height="10.6" rx="2.6"/><path d="M8 10V7.2a4 4 0 018 0V10"/>',
  heart:'<path d="M12 20.4S4.4 15.8 4.4 10.8A4.2 4.2 0 0112 8.2a4.2 4.2 0 017.6 2.6c0 5-7.6 9.6-7.6 9.6z"/>',
  bulb:'<path d="M9.4 18.6h5.2"/><path d="M10.3 21.4h3.4"/><path d="M12 2.8a6.3 6.3 0 00-3.7 11.4c.7.5 1.1 1.3 1.1 2.1h5.2c0-.8.4-1.6 1.1-2.1A6.3 6.3 0 0012 2.8z"/>',
  scale:'<path d="M12 4.2v16"/><path d="M5.6 7.6h12.8"/><path d="M8 20.4h8"/><path d="M5.6 7.6L2.4 14h6.4z"/><path d="M18.4 7.6L15.2 14h6.4z"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4.4 20.4a7.6 7.6 0 0115.2 0"/>',
  users:'<circle cx="9.4" cy="8.2" r="3.6"/><path d="M2.8 20.2a6.6 6.6 0 0113.2 0"/><path d="M16.4 5.1a3.6 3.6 0 010 6.9"/><path d="M17.6 14.4a6.6 6.6 0 013.6 5.8"/>',
  arrow:'<path d="M4 12h15.4"/><path d="M13.6 6.2L19.4 12l-5.8 5.8"/>',
  phone:'<rect x="6.6" y="2.4" width="10.8" height="19.2" rx="3"/><path d="M10.3 5.4h3.4"/><path d="M10.6 18.8h2.8"/>',
  tag:'<path d="M3.4 12.6l9.2-9.2h8v8l-9.2 9.2z"/><circle cx="16.6" cy="7.4" r="1.5"/>',
  swap:'<path d="M3.6 9.4h14.2"/><path d="M14.4 5.8l3.6 3.6-3.6 3.6"/><path d="M20.4 15.4H6.2"/><path d="M9.6 11.8L6 15.4l3.6 3.6"/>',
  megaphone:'<path d="M3.6 10v4.4a1.8 1.8 0 001.8 1.8h1.4V8.2H5.4A1.8 1.8 0 003.6 10z"/><path d="M6.8 8.2l11-4.4v16.8l-11-4.4z"/><path d="M7.8 16.2l1.2 4.6h3l-1-4.6"/>',
  quote:'<path d="M9.6 5.6C6.4 6.8 4.4 9.6 4.4 13v5.4h6.4V12H7.6c0-2 .8-3.6 2.6-4.4z"/><path d="M18.6 5.6c-3.2 1.2-5.2 4-5.2 7.4v5.4h6.4V12h-3.2c0-2 .8-3.6 2.6-4.4z"/>'
};
const ICON_COLORS = { w:'#FFFFFF', ink:'#0B0D12', red:'#FF3B30', cob:'#1428A0', gold:'#F5B301', grn:'#12B886', amb:'#C97D14', sil:'#D7D9DE' };

/* -------------------------------------------------------------- helpers */
const grain = (w,h,n,op,seed=7) => {
  let s='', r=seed;
  const rnd=()=> (r = (r*1103515245+12345)%2147483648)/2147483648;
  for(let i=0;i<n;i++) s+=`<circle cx="${(rnd()*w).toFixed(1)}" cy="${(rnd()*h).toFixed(1)}" r="${(rnd()*1.6+.3).toFixed(2)}" fill="#fff" opacity="${(rnd()*op).toFixed(3)}"/>`;
  return s;
};

async function main(){
  fs.mkdirSync(OUT,{recursive:true});
  const jobs=[];

  /* icons */
  for(const [n,p] of Object.entries(I))
    for(const [ck,cv] of Object.entries(ICON_COLORS))
      jobs.push(write(`ic-${n}-${ck}.png`,
        svg(24,24,`<g fill="none" stroke="${cv}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${p}</g>`), 256));

  /* ---- title background: deep space + two brand glows + orbit rings */
  const W=2000,H=1125;
  jobs.push(write('bg-title.png', svg(W,H,`
    <defs>
      <radialGradient id="gA" cx="22%" cy="38%" r="46%">
        <stop offset="0%" stop-color="#FF3B30" stop-opacity=".30"/><stop offset="100%" stop-color="#FF3B30" stop-opacity="0"/></radialGradient>
      <radialGradient id="gB" cx="80%" cy="62%" r="48%">
        <stop offset="0%" stop-color="#3C64F4" stop-opacity=".38"/><stop offset="100%" stop-color="#3C64F4" stop-opacity="0"/></radialGradient>
      <linearGradient id="gBase" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0B0D12"/><stop offset="55%" stop-color="#101420"/><stop offset="100%" stop-color="#0B0D12"/></linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#gBase)"/>
    <g stroke="#FFFFFF" fill="none" opacity=".055">
      ${[240,400,560,720,880,1040].map(r=>`<circle cx="${W/2}" cy="${H/2}" r="${r}"/>`).join('')}
    </g>
    <rect width="${W}" height="${H}" fill="url(#gA)"/>
    <rect width="${W}" height="${H}" fill="url(#gB)"/>
    ${grain(W,H,190,.30,11)}`), W));

  /* ---- generic dark background for section / verdict slides */
  jobs.push(write('bg-dark.png', svg(W,H,`
    <defs><linearGradient id="d" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0B0D12"/><stop offset="100%" stop-color="#171B26"/></linearGradient>
      <radialGradient id="dg" cx="78%" cy="18%" r="55%">
        <stop offset="0%" stop-color="#F5B301" stop-opacity=".16"/><stop offset="100%" stop-color="#F5B301" stop-opacity="0"/></radialGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#d)"/><rect width="${W}" height="${H}" fill="url(#dg)"/>
    ${grain(W,H,120,.22,3)}`), W));

  /* ---- Apple slide background: graphite */
  jobs.push(write('bg-apple.png', svg(W,H,`
    <defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#141416"/><stop offset="100%" stop-color="#26262B"/></linearGradient>
      <radialGradient id="ag" cx="16%" cy="80%" r="55%">
        <stop offset="0%" stop-color="#FF3B30" stop-opacity=".22"/><stop offset="100%" stop-color="#FF3B30" stop-opacity="0"/></radialGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#a)"/><rect width="${W}" height="${H}" fill="url(#ag)"/>
    ${grain(W,H,110,.20,5)}`), W));

  /* ---- Samsung slide background: cobalt */
  jobs.push(write('bg-samsung.png', svg(W,H,`
    <defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0A1560"/><stop offset="60%" stop-color="#1428A0"/><stop offset="100%" stop-color="#0E1C78"/></linearGradient>
      <radialGradient id="sg" cx="82%" cy="24%" r="52%">
        <stop offset="0%" stop-color="#5AC8FA" stop-opacity=".30"/><stop offset="100%" stop-color="#5AC8FA" stop-opacity="0"/></radialGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#s)"/><rect width="${W}" height="${H}" fill="url(#sg)"/>
    ${grain(W,H,110,.22,9)}`), W));

  /* ---- logos */
  const applePath = 'M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.088-4.61 1.088zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701';
  for (const [k,col] of [['w','#FFFFFF'],['ink','#0B0D12'],['sil','#D7D9DE']])
    jobs.push(write(`logo-apple-${k}.png`, svg(24,24,`<path d="${applePath}" fill="${col}"/>`), 512));

  const samsungMark = (fill,txt) => svg(600,200,
    `<ellipse cx="300" cy="100" rx="296" ry="96" fill="${fill}"/>
     <text x="300" y="100" font-family="DejaVu Sans, Arial, sans-serif" font-size="78" font-weight="bold"
       letter-spacing="6" fill="${txt}" text-anchor="middle" dominant-baseline="central">SAMSUNG</text>`);
  jobs.push(write('logo-samsung-blue.png', samsungMark('#1428A0','#FFFFFF'), 900));
  jobs.push(write('logo-samsung-white.png', samsungMark('#FFFFFF','#1428A0'), 900));

  /* ---- ecosystem hub diagram */
  const EW=980, EH=860, cx=EW/2, cy=EH/2;
  const sat=[['iPhone',-90],['Mac',-30],['iPad',30],['Watch',90],['AirPods',150],['iCloud',210]];
  let eg = `<defs>
      <radialGradient id="hub" cx="50%" cy="35%" r="70%">
        <stop offset="0%" stop-color="#FF6A5E"/><stop offset="100%" stop-color="#D6271C"/></radialGradient>
      <linearGradient id="pill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity=".16"/><stop offset="100%" stop-color="#FFFFFF" stop-opacity=".06"/></linearGradient>
    </defs>
    <circle cx="${cx}" cy="${cy}" r="330" fill="none" stroke="#FFFFFF" stroke-opacity=".10" stroke-dasharray="3 12"/>
    <circle cx="${cx}" cy="${cy}" r="250" fill="none" stroke="#FFFFFF" stroke-opacity=".07"/>`;
  const R=330;
  sat.forEach(([label,deg])=>{
    const a=deg*Math.PI/180, x=cx+R*Math.cos(a), y=cy+R*Math.sin(a);
    eg+=`<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#FF6A5E" stroke-opacity=".38" stroke-width="2"/>`;
  });
  eg+=`<circle cx="${cx}" cy="${cy}" r="118" fill="url(#hub)"/>
       <text x="${cx}" y="${cy-14}" font-family="DejaVu Sans, Arial" font-size="30" font-weight="bold" fill="#FFFFFF" text-anchor="middle">ONE</text>
       <text x="${cx}" y="${cy+26}" font-family="DejaVu Sans, Arial" font-size="30" font-weight="bold" fill="#FFFFFF" text-anchor="middle">APPLE ID</text>`;
  sat.forEach(([label,deg])=>{
    const a=deg*Math.PI/180, x=cx+R*Math.cos(a), y=cy+R*Math.sin(a);
    eg+=`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="82" fill="#1C1C20" stroke="#FFFFFF" stroke-opacity=".22" stroke-width="2"/>
         <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="82" fill="url(#pill)"/>
         <text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="DejaVu Sans, Arial" font-size="27" font-weight="bold" fill="#FFFFFF" text-anchor="middle" dominant-baseline="central">${label}</text>`;
  });
  jobs.push(write('ecosystem.png', svg(EW,EH,eg), EW));

  /* ---- foldable phone */
  jobs.push(write('foldable.png', svg(760,560,`
    <defs><linearGradient id="scr" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#5AC8FA"/><stop offset="100%" stop-color="#3C64F4"/></linearGradient>
      <linearGradient id="scr2" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#8AA7FF"/><stop offset="100%" stop-color="#1428A0"/></linearGradient></defs>
    <g transform="translate(70,40)">
      <rect x="0" y="30" width="290" height="450" rx="22" fill="#0A0E2A" stroke="#FFFFFF" stroke-opacity=".25" stroke-width="3"/>
      <rect x="14" y="44" width="262" height="422" rx="14" fill="url(#scr)" opacity=".92"/>
      <rect x="300" y="0" width="290" height="510" rx="22" fill="#0A0E2A" stroke="#FFFFFF" stroke-opacity=".25" stroke-width="3"/>
      <rect x="314" y="14" width="262" height="482" rx="14" fill="url(#scr2)" opacity=".92"/>
      <rect x="288" y="0" width="14" height="510" rx="7" fill="#FFFFFF" fill-opacity=".30"/>
      <g fill="#FFFFFF" fill-opacity=".55">
        <rect x="36" y="70" width="150" height="14" rx="7"/><rect x="36" y="98" width="98" height="14" rx="7"/>
        <rect x="36" y="150" width="218" height="90" rx="12" fill-opacity=".28"/>
        <rect x="36" y="258" width="218" height="90" rx="12" fill-opacity=".28"/>
        <rect x="336" y="46" width="170" height="14" rx="7"/><rect x="336" y="74" width="110" height="14" rx="7"/>
        <rect x="336" y="120" width="218" height="130" rx="12" fill-opacity=".28"/>
        <rect x="336" y="268" width="104" height="104" rx="12" fill-opacity=".28"/>
        <rect x="450" y="268" width="104" height="104" rx="12" fill-opacity=".28"/>
      </g>
    </g>`), 760));

  /* ---- three-tier phone range */
  const tiers=[['Z SERIES','#F5B301',330],['S SERIES','#FFFFFF',300],['A SERIES','#5AC8FA',262]];
  let pg='';
  tiers.forEach(([lab,col,h],i)=>{
    const x=40+i*300, y=(360-h)/2;
    pg+=`<rect x="${x}" y="${y}" width="${h*0.47}" height="${h}" rx="20" fill="#0A1350" stroke="${col}" stroke-opacity=".8" stroke-width="3"/>
         <rect x="${x+9}" y="${y+9}" width="${h*0.47-18}" height="${h-18}" rx="13" fill="${col}" opacity=".16"/>
         <rect x="${x+h*0.47/2-22}" y="${y+18}" width="44" height="9" rx="4.5" fill="${col}" opacity=".55"/>
         <text x="${x+h*0.47/2}" y="395" font-family="DejaVu Sans, Arial" font-size="24" font-weight="bold" fill="${col}" text-anchor="middle">${lab}</text>`;
  });
  jobs.push(write('range.png', svg(940,420,pg), 940));

  /* ---- sound wave for the jingle slide */
  let wv=''; const bars=64;
  for(let i=0;i<bars;i++){
    const t=i/(bars-1);
    const amp = Math.abs(Math.sin(t*Math.PI*3.1))*Math.sin(t*Math.PI)*150 + 12;
    wv+=`<rect x="${(i*15).toFixed(1)}" y="${(180-amp/2).toFixed(1)}" width="8" height="${amp.toFixed(1)}" rx="4" fill="#F5B301" opacity="${(0.35+0.55*Math.sin(t*Math.PI)).toFixed(2)}"/>`;
  }
  jobs.push(write('wave.png', svg(960,360,wv), 960));

  await Promise.all(jobs);
  console.log('artwork complete');
}
main().catch(e=>{console.error(e);process.exit(1);});

export const BRANDS = ['Nike','Adidas','Puma','Reebok','Under Armour','New Balance','Apple','Samsung','OnePlus','Xiaomi','Oppo','Vivo','Coca-Cola','Pepsi','Sprite','7UP','Red Bull','Monster Energy',"McDonald's",'KFC','Burger King','Subway',"Domino's",'Pizza Hut','Nescafé','Bru','Tata Tea','Nespresso','Starbucks',"L'Oréal Paris",'Maybelline','MAC','Lakme','Nykaa','Mamaearth','Zara','H&M','Uniqlo','Mango','Myntra','Ajio','Amazon','Flipkart','Meesho','Snapdeal','HDFC Bank','SBI','ICICI Bank','Paytm','PhonePe','Groww','Tata Motors','Hyundai','Maruti Suzuki','Mahindra','Kia','MG Motors','Colgate','Dabur','Himalaya','Patanjali','HUL','P&G','Swiggy','Zomato','Blinkit','BigBasket','Zepto','Boat','Noise','Lenskart','Dream11'];

export const MARKETS = ['India','USA','UK','UAE','Germany','France','Brazil','Australia','Singapore','Indonesia','Thailand','Malaysia','Vietnam','Philippines','Saudi Arabia','Egypt','South Africa','Nigeria','Kenya','Southeast Asia (Regional)','MENA (Regional)','South Asia (Regional)','Europe (Regional)','Global','Mumbai','Delhi NCR','Bangalore','Hyderabad','Chennai','Kolkata','Pune','Ahmedabad'];

export const PLATFORMS_DATA = [
  {name:'Global Web Index (GWI)',icon:'👥',desc:'Audience profiling, media habits & psychographics',status:'complete',pct:100,note:'14.2M respondents analysed'},
  {name:'Comscore',icon:'📡',desc:'Digital reach, traffic & cross-platform measurement',status:'complete',pct:100,note:'Digital audience reach mapped'},
  {name:'SimilarWeb',icon:'🔍',desc:'Competitor web traffic & digital market intelligence',status:'fetching',pct:68,note:'Competitor analysis in progress…'},
  {name:'Google Trends',icon:'📈',desc:'Search trend analysis & seasonality patterns',status:'complete',pct:100,note:'24-month trend data fetched'},
  {name:'Google Insights Finder',icon:'🎯',desc:'Consumer intent signals & audience interests',status:'connecting',pct:22,note:'Establishing API connection…'},
  {name:'Brandwatch Sentiment',icon:'💬',desc:'Brand sentiment, social listening & share of voice',status:'complete',pct:100,note:'2.3M brand mentions processed'},
  {name:'Helium10',icon:'🛒',desc:'E-commerce, Amazon rankings & keyword intelligence',status:'queued',pct:0,note:'Queued — starts in ~2 hrs'},
  {name:'Google Keyword',icon:'🔑',desc:'Search volume, CPC & competitive keyword analysis',status:'complete',pct:100,note:'Top 500 high-intent keywords mapped'},
];

// Defining colors for the charts here as well, so it can be passed to components
const C = {
  blue:'rgba(37,99,235,0.85)',   blueM:'rgba(37,99,235,0.55)',  blueL:'rgba(37,99,235,0.15)',
  purple:'rgba(124,58,237,0.85)',purpleL:'rgba(124,58,237,0.15)',
  green:'rgba(5,150,105,0.85)',  greenL:'rgba(5,150,105,0.15)',
  orange:'rgba(217,119,6,0.85)', orangeL:'rgba(217,119,6,0.15)',
  red:'rgba(220,38,38,0.8)',     teal:'rgba(8,145,178,0.85)',
  pink:'rgba(219,39,119,0.85)',  sky:'rgba(14,165,233,0.85)',
  lime:'rgba(101,163,13,0.85)',
};

export const C_CONSTANTS = C;

export const HM_DATA = [
  {region:'North India',cities:[{n:'South Delhi',s:91},{n:'Gurgaon',s:88},{n:'Noida',s:85},{n:'Chandigarh',s:67},{n:'Jaipur',s:64}]},
  {region:'West India',cities:[{n:'Mumbai Central',s:94},{n:'Andheri',s:89},{n:'Pune',s:83},{n:'Ahmedabad',s:74},{n:'Surat',s:61}]},
  {region:'South India',cities:[{n:'Koramangala',s:96},{n:'Whitefield',s:88},{n:'Hyderabad',s:82},{n:'Chennai',s:78},{n:'Kochi',s:72}]},
  {region:'Central India',cities:[{n:'Indore',s:55},{n:'Nagpur',s:52},{n:'Bhopal',s:48},{n:'Nashik',s:58},{n:'Raipur',s:39}]},
  {region:'East India',cities:[{n:'Kolkata',s:73},{n:'Bhubaneswar',s:46},{n:'Patna',s:41},{n:'Guwahati',s:38},{n:'Ranchi',s:34}]},
];

export const ID = {
  content: [
    {
      title: 'Short-form video dominates engagement for the 18–34 segment',
      source: 'GWI + Comscore', confidence: 94,
      obs: 'Among 18–34 sports & fitness enthusiasts in India, short-form video (15–30s) generates 4.2× higher engagement than static posts. Instagram Reels drives 62% of content consumption in this segment; YouTube Shorts accounts for 28%. Daily viewing time for short-form video has grown 67% YoY.',
      rec: 'Shift 65–70% of content budget to short-form video. Build a Reels-first content calendar with weekly cadence. Prioritise vertical video production to reduce repurposing friction across platforms.',
      stat: '4.2× higher engagement for short-form vs. static content',
      lbl: 'Engagement Multiplier by Content Format (Static Image = 1.0×)',
      chartType: 'bar',
      chartData: {
        labels: ['Short-form\nVideo','Long-form\nVideo','Stories','Carousels','Static\nImage'],
        datasets: [{data:[4.2,2.1,1.8,1.5,1.0],backgroundColor:[C.blue,C.blueM,'rgba(37,99,235,.5)','rgba(37,99,235,.35)','rgba(37,99,235,.22)'],borderRadius:6,borderSkipped:false}]
      },
      chartExtra: {scales:{y:{min:0,title:{display:true,text:'Engagement Multiplier',font:{size:9,family:'Inter'},color:'#94A3B8'}}}}
    },
    {
      title: 'Behind-the-scenes athlete content drives highest save & share rates',
      source: 'Brandwatch + GWI', confidence: 88,
      obs: 'Analysis of 1.4M content pieces shows BTS athlete content drives 3.8× higher save rate and 2.1× higher share rate vs. polished campaign content. Indian athletes generate disproportionately high engagement among 18–34 target segments.',
      rec: 'Develop a recurring BTS series with Nike-partnered Indian athletes. A monthly "Training Ground" series on Instagram and YouTube showing authentic moments will build loyalty and differentiation.',
      stat: '3.8× higher save rate for BTS athlete content',
      lbl: 'Content Performance Multiplier by Type — Save Rate vs Share Rate',
      chartType: 'bar',
      chartData: {
        labels: ['BTS Athlete','Lifestyle','Product Showcase','Campaign Content'],
        datasets: [
          {label:'Save Rate',data:[3.8,2.4,1.9,1.0],backgroundColor:C.blue,borderRadius:5,borderSkipped:false},
          {label:'Share Rate',data:[2.1,1.7,1.4,1.0],backgroundColor:C.purple,borderRadius:5,borderSkipped:false},
        ]
      },
      chartExtra: {plugins:{legend:{display:true,position:'top',labels:{font:{size:10,family:'Inter'},padding:8,boxWidth:9}}}}
    },
    {
      title: 'User-generated content drives 28% higher purchase intent',
      source: 'GWI + Brandwatch', confidence: 91,
      obs: 'Target audience shows significantly higher purchase intent from peer-created content. "Product in use" UGC drives 28% higher conversion for footwear. Nike India currently has limited UGC amplification vs. Adidas and Puma.',
      rec: 'Launch a structured UGC campaign (#JustMoveIndia) incentivising customers to share authentic product-in-use content. Build a clear submission and amplification pipeline across tier 1 and tier 2 markets.',
      stat: '28% higher conversion with UGC vs. brand-produced content',
      lbl: 'Conversion Rate (%) by Content Source Type',
      chartType: 'bar',
      chartData: {
        labels: ['UGC\nProduct-in-use','Influencer\nContent','Brand\nContent','Celebrity\nEndorsed'],
        datasets: [{data:[28,24,22,19],backgroundColor:[C.blue,C.teal,C.blueM,'rgba(37,99,235,.3)'],borderRadius:6,borderSkipped:false}]
      },
      chartExtra: {scales:{y:{min:14,title:{display:true,text:'Conversion %',font:{size:9,family:'Inter'},color:'#94A3B8'}}}}
    },
    {
      title: 'Voice search in the fitness category growing at 34% YoY',
      source: 'Google Trends + Insights Finder', confidence: 79,
      obs: 'Voice-based search queries in sports & fitness have grown 34% YoY among 18–34 Indians. Queries are conversational and intent-heavy ("best running shoes for flat feet under ₹5000"). Voice search optimisation remains largely untapped across the sportswear category.',
      rec: 'Develop FAQ-structured long-form content targeting conversational voice-query formats. Partner with fitness podcasts for voice-first advertising placements.',
      stat: '34% YoY growth in voice search within fitness category',
      lbl: 'Voice Search Volume Index — Fitness Category India (2021 = 100)',
      chartType: 'line',
      chartData: {
        labels: ['2021','2022','2023','2024','2025'],
        datasets: [{label:'Voice Search Index',data:[100,118,142,189,234],borderColor:C.blue,backgroundColor:C.blueL,fill:true,pointBackgroundColor:C.blue,pointRadius:4,pointHoverRadius:6}]
      }
    },
  ],
  commerce: [
    {
      title: '73% of the target audience researches on social before purchasing',
      source: 'GWI + SimilarWeb', confidence: 96,
      obs: '73% of 18–34 Nike target consumers in India research on Instagram or YouTube before visiting a brand website or e-commerce platform. The average purchase journey spans 4.7 touchpoints, with social as discovery and Amazon/Myntra as conversion. Nike\'s DTC website conversion rate sits at 12% vs. a category average of 19%.',
      rec: 'Integrate Instagram Shopping and YouTube product tagging to create shoppable content touchpoints. Invest in retargeting that bridges social discovery to purchase. Prioritise DTC website UX improvements to close the 7-point gap vs. category peers.',
      stat: '4.7 touchpoints in the average purchase journey',
      lbl: 'Discovery Channel Breakdown — Where Target Segment Researches Before Buying',
      chartType: 'pie',
      chartData: {
        labels: ['Instagram','YouTube','Google Search','Word of Mouth','Other'],
        datasets: [{data:[38,35,15,7,5],backgroundColor:[C.blue,C.purple,C.teal,C.orange,C.blueM],borderWidth:2,borderColor:'#fff',hoverOffset:4}]
      }
    },
    {
      title: 'Amazon India drives 34% of sportswear discovery — Nike underindexes vs. Adidas',
      source: 'Helium10 + SimilarWeb', confidence: 85,
      obs: 'Helium10 data shows Nike-related keywords generating 890,000+ monthly searches on Amazon India, yet brand sponsored ad presence score is 40% lower than Adidas. Nike ranks below Adidas in organic results for 6 of the top 10 high-intent search terms.',
      rec: 'Significantly increase Amazon Ads investment with a keyword-first strategy. Build A+ content for top-selling SKUs with lifestyle imagery. Consider exclusive Amazon launch bundles to leverage the platform\'s discovery power.',
      stat: '890K monthly Amazon searches · Nike ad presence 40% lower than Adidas',
      lbl: 'Amazon Sponsored Ad Presence Score — Nike vs. Adidas (Score out of 100)',
      chartType: 'hbar',
      chartData: {
        labels: ['Running Shoes','Gym Shoes','Sports Shoes','Training Shoes','Walking Shoes'],
        datasets: [
          {label:'Nike',data:[42,35,55,38,48],backgroundColor:C.blue,borderRadius:5},
          {label:'Adidas',data:[78,82,75,71,69],backgroundColor:C.red,borderRadius:5},
        ]
      },
      chartExtra: {
        scales:{x:{grid:{color:'#EEF2F7',display:true},max:100},y:{grid:{display:false}}},
        plugins:{legend:{display:true,position:'top',labels:{font:{size:10,family:'Inter'},padding:8,boxWidth:9}}}
      }
    },
    {
      title: 'Price-to-value perception gap in tier 2/3 cities is a significant opportunity',
      source: 'GWI + Comscore', confidence: 82,
      obs: 'Brand consideration for Nike remains high in tier 2/3 cities (score: 74%), but purchase conversion is 3× lower than tier 1. The primary barrier is price-to-value perception. The ₹2,000–₹4,000 price band has the highest search velocity in non-metro markets, where Nike has minimal SKU presence.',
      rec: 'Introduce a dedicated mid-range line for tier 2/3 markets positioned as "premium accessible". Create new entry-point SKUs that protect premium brand equity while driving volume — avoid discounting hero products.',
      stat: '3× lower conversion in tier 2/3 despite 74% brand aspiration score',
      lbl: 'Brand Consideration vs. Purchase Conversion (%) — by City Tier',
      chartType: 'bar',
      chartData: {
        labels: ['Metro','Tier 1','Tier 2','Tier 3'],
        datasets: [
          {label:'Brand Consideration',data:[82,78,74,65],backgroundColor:C.blueM,borderRadius:5,borderSkipped:false},
          {label:'Purchase Conversion',data:[58,46,24,18],backgroundColor:C.blue,borderRadius:5,borderSkipped:false},
        ]
      },
      chartExtra: {
        scales:{y:{min:0,max:100,title:{display:true,text:'%',font:{size:9,family:'Inter'},color:'#94A3B8'}}},
        plugins:{legend:{display:true,position:'top',labels:{font:{size:10,family:'Inter'},padding:8,boxWidth:9}}}
      }
    },
    {
      title: 'Purchase Intent Heatmap — India by City / Pin Code Cluster',
      source: 'Google Trends + Helium10', confidence: 89,
      fullWidth: true, isHeatmap: true,
      obs: 'Purchase intent signals for sportswear show a clear metro-heavy concentration. Bangalore (Koramangala, Whitefield), Mumbai (Central, Andheri) and Delhi NCR (South Delhi, Gurgaon) show the highest intent scores. Tier 2 cities like Pune, Chandigarh, and Kochi show emerging intent pockets. Eastern markets remain significantly underpenetrated.',
      rec: 'Prioritise hyperlocal digital media investment in top-intent pin code clusters. Run Bangalore and Mumbai first-wave launch campaigns, followed by Delhi NCR. Build a phased tier 2 rollout starting with Pune, Chandigarh, and Kochi. Develop dedicated creatives for eastern markets to build category awareness.',
      stat: 'Top 5 high-intent city clusters contribute 58% of all sportswear online purchase signals',
      lbl: 'Intent Score by City Cluster (hover for details)',
      chartData: HM_DATA,
    },
  ],
  communication: [
    {
      title: 'Purpose-led messaging drives 41% higher brand affinity in the category',
      source: 'Brandwatch + GWI', confidence: 90,
      obs: 'Sentiment analysis of 2.3M brand mentions shows purpose-driven campaigns generate 41% higher brand affinity scores vs. product-led advertising. Adidas\'s "Impossible Is Nothing" India adaptations outperformed Nike\'s recent campaigns in earned media value by 28%.',
      rec: 'Develop a long-term purpose campaign rooted in Indian grassroots sports. A "Nayi Daud" platform spotlighting non-elite Indian athletes across kabaddi, athletics, and local football would build authentic cultural capital and differentiate from Adidas.',
      stat: '41% higher brand affinity for purpose-led vs. product-led communication',
      lbl: 'Brand Affinity Score by Message Type (out of 100)',
      chartType: 'bar',
      chartData: {
        labels: ['Purpose-\nled','Humour-\nbased','Social\nProof','Celebrity\nEndorsed','Product-\nled'],
        datasets: [{data:[78,71,68,62,55],backgroundColor:[C.purple,'rgba(124,58,237,.7)','rgba(124,58,237,.55)','rgba(124,58,237,.4)','rgba(124,58,237,.28)'],borderRadius:6,borderSkipped:false}]
      },
      chartExtra: {scales:{y:{min:40,title:{display:true,text:'Affinity Score',font:{size:9,family:'Inter'},color:'#94A3B8'}}}}
    },
    {
      title: '"Quality" and "durability" are the top positive brand associations',
      source: 'Brandwatch Sentiment', confidence: 93,
      obs: 'NLP analysis of Nike-related social conversations shows "quality" (38%), "durability" (31%), and "style" (27%) as top positive associations. Negative sentiment clusters around "price" (44%) and "availability in India" (28%). Conversation volume is growing 18% YoY but share of voice declined 4 points vs. last year.',
      rec: 'Lead communication with product quality and durability proof-points. Develop a "Built to Last" content series showcasing Nike\'s performance in Indian conditions — heat, terrain, urban life — to own and defend the quality narrative.',
      stat: '"Quality" & "durability" account for 69% of all positive brand mentions',
      lbl: 'Positive Sentiment Breakdown — Brand Mention NLP Analysis (2.3M mentions)',
      chartType: 'pie',
      chartData: {
        labels: ['Quality (38%)','Durability (31%)','Style (27%)','Innovation (4%)'],
        datasets: [{data:[38,31,27,4],backgroundColor:[C.purple,C.blue,C.teal,C.orange],borderWidth:2,borderColor:'#fff',hoverOffset:4}]
      }
    },
    {
      title: 'Marathon season triggers a 3.4× spike in running shoe search intent',
      source: 'Google Trends + Insights Finder', confidence: 88,
      obs: 'Search data shows a 3.4× spike in running-related queries during Oct–Dec and Jan–Feb marathon seasons (Mumbai, Delhi, Bengaluru, Hyderabad marathons). The current Nike India communication calendar does not align with these intent peaks. Asics and New Balance already capitalise on this window.',
      rec: 'Build a marathon-season communication calendar with 6-week lead-up activations for each major city race. Create city-specific, runner-targeted creatives with search-backed messaging. Sponsor city marathon events for earned media amplification.',
      stat: '3.4× search spike during marathon season — currently a missed window',
      lbl: 'Monthly Search Volume Index — "Running Shoes" India (Jan–Dec)',
      chartType: 'line',
      chartData: {
        labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
        datasets: [{label:'Search Volume',data:[145,162,98,76,72,68,75,82,91,178,210,168],borderColor:C.purple,backgroundColor:C.purpleL,fill:true,pointBackgroundColor:C.purple,pointRadius:3,pointHoverRadius:6}]
      }
    },
    {
      title: 'Nano and micro-influencers outperform celebrities 3:1 on conversion',
      source: 'Brandwatch + GWI', confidence: 86,
      obs: 'Sportswear influencer campaign analysis shows nano-influencers (10K–50K) and micro-influencers (50K–200K) in fitness drive 3.1× higher conversion than celebrity ambassadors. Authenticity scores are 2.7× higher. 61% of 18–34 consumers report skipping celebrity-fronted social ads.',
      rec: 'Rebalance influencer spend towards a larger base of nano and micro fitness creators. Build a "Nike India Creator Community" of 50–100 fitness-authentic voices across metro and tier 1 cities. Use celebrities for brand-building reach; micro-influencers for performance conversion.',
      stat: '3.1× higher conversion from nano/micro vs. celebrity influencers',
      lbl: 'Conversion Multiplier & Authenticity Score by Influencer Tier',
      chartType: 'bar',
      chartData: {
        labels: ['Celebrity\n>1M','Macro\n200K–1M','Micro\n50K–200K','Nano\n10K–50K'],
        datasets: [
          {label:'Conversion Multiplier',data:[1.0,1.8,2.7,3.1],backgroundColor:C.purple,borderRadius:5,borderSkipped:false},
          {label:'Authenticity Score',data:[1.0,1.6,2.2,2.7],backgroundColor:C.purpleL,borderRadius:5,borderSkipped:false},
        ]
      },
      chartExtra: {plugins:{legend:{display:true,position:'top',labels:{font:{size:10,family:'Inter'},padding:8,boxWidth:9}}}}
    },
  ],
  culture: [
    {
      title: 'Everyday fitness culture is replacing elite sport aspiration',
      source: 'GWI + Google Trends', confidence: 92,
      obs: '67% of 18–34 year olds in India now report exercising 3+ times/week — a 23% increase in 4 years. Fitness identity has shifted from "spectator sport fan" to "everyday mover". Searches for "home workout", "running tips", and "yoga for beginners" have collectively grown 89% since 2022.',
      rec: 'Reposition Nike India\'s core narrative from elite sport to "everyday movement for everyone". Communicate inclusively to first-time fitness adopters celebrating personal progress over podium finishes. "Your Run. Your Rules." positioning would land strongly.',
      stat: '67% of target audience exercises 3+ times/week — up 23% in 4 years',
      lbl: '% of Target Segment Exercising 3+ Times Per Week (Trend 2021–2025)',
      chartType: 'line',
      chartData: {
        labels: ['2021','2022','2023','2024','2025'],
        datasets: [{label:'% 3+ times/week',data:[52,55,60,64,67],borderColor:C.orange,backgroundColor:C.orangeL,fill:true,pointBackgroundColor:C.orange,pointRadius:4,pointHoverRadius:6}]
      },
      chartExtra: {scales:{y:{min:40,max:80,title:{display:true,text:'% of segment',font:{size:9,family:'Inter'},color:'#94A3B8'}}}}
    },
    {
      title: 'Football is India\'s fastest-growing sport by cultural conversation volume',
      source: 'Brandwatch + GWI', confidence: 87,
      obs: 'While cricket dominates cultural conversation (54% share), football has grown its share from 11% to 19% in 3 years among 18–34 urban Indians. The ISL and global club football (especially Premier League) are key drivers. Nike has global football equity but underinvests in India\'s football culture.',
      rec: 'Build a dedicated India football strategy beyond ISL jersey deals. Invest in grassroots football content, urban football culture storytelling, and partnerships with emerging Indian talent. Position Nike as "the football brand that believed in India before football did."',
      stat: 'Football cultural conversation share up from 11% → 19% in 3 years among 18–34s',
      lbl: 'Cultural Conversation Share by Sport — 2022 vs 2025 (% of total)',
      chartType: 'bar',
      chartData: {
        labels: ['Cricket','Football','Kabaddi','Tennis','Badminton','Others'],
        datasets: [
          {label:'2022',data:[62,11,10,8,5,4],backgroundColor:'rgba(217,119,6,.35)',borderRadius:5,borderSkipped:false},
          {label:'2025',data:[54,19,10,7,6,4],backgroundColor:C.orange,borderRadius:5,borderSkipped:false},
        ]
      },
      chartExtra: {
        scales:{y:{title:{display:true,text:'% Share',font:{size:9,family:'Inter'},color:'#94A3B8'}}},
        plugins:{legend:{display:true,position:'top',labels:{font:{size:10,family:'Inter'},padding:8,boxWidth:9}}}
      }
    },
    {
      title: 'Gen Z treats brand stance on mental wellness as a purchase signal',
      source: 'GWI + Brandwatch', confidence: 80,
      obs: 'Among 18–24 year olds, 58% say a brand\'s position on mental health influences their purchase decisions. Fitness and mental health are increasingly connected. Brands integrating mental wellness into fitness communication see 19% higher preference score among Gen Z vs. pure physical performance messaging.',
      rec: 'Integrate a mental wellness layer into Nike India\'s fitness communication. A "Move for the Mind" content series — featuring authentic athlete mental health conversations and recovery narratives — would build strong differentiation among the 18–24 cohort.',
      stat: '58% of 18–24s say brand mental health stance affects purchase decisions',
      lbl: 'Purchase Influence Factors Among Gen Z 18–24, India (% strongly influenced)',
      chartType: 'hbar',
      chartData: {
        labels: ['Product Quality','Brand Purpose','Mental Health\nStance','Peer Endorsement','Price','Sustainability'],
        datasets: [{data:[35,22,20,15,12,8],backgroundColor:[C.orange,'rgba(217,119,6,.75)','rgba(217,119,6,.65)','rgba(217,119,6,.5)','rgba(217,119,6,.38)','rgba(217,119,6,.28)'],borderRadius:5}]
      },
      chartExtra: {scales:{x:{grid:{color:'#EEF2F7',display:true},title:{display:true,text:'% strongly influenced',font:{size:9,family:'Inter'},color:'#94A3B8'}},y:{grid:{display:false}}}}
    },
    {
      title: 'Sustainability awareness vs. conversion — a demographic scatter analysis',
      source: 'GWI', confidence: 75,
      obs: 'GWI data shows sustainability as a growing consideration, particularly among urban women 22–32 (index 142 vs. baseline 100). However, 43% of the target segment express scepticism towards brand sustainability claims. The scatter plot reveals a non-linear relationship — high awareness doesn\'t uniformly translate to conversion.',
      rec: 'Lead with product-first sustainability stories (recycled materials, circular economy) over generic brand-level CSR. Tie Move to Zero directly to specific Nike India products in a transparent, evidence-backed way. Avoid "greenwashing" language.',
      stat: 'Sustainability consideration index: 142 among urban women 22–32 (vs. 100 baseline)',
      isScatter: true,
      lbl: 'Sustainability Awareness Score vs. Purchase Conversion Rate by Demographic Segment',
      chartType: 'scatter',
      chartData: {
        datasets: [
          {label:'Urban Women 22–32',data:[{x:78,y:31}],backgroundColor:C.blue,pointRadius:11,pointHoverRadius:14},
          {label:'Urban Men 22–32',data:[{x:62,y:26}],backgroundColor:C.purple,pointRadius:11,pointHoverRadius:14},
          {label:'Women 33–45',data:[{x:55,y:22}],backgroundColor:C.teal,pointRadius:10,pointHoverRadius:13},
          {label:'Men 33–45',data:[{x:44,y:19}],backgroundColor:C.orange,pointRadius:10,pointHoverRadius:13},
          {label:'Gen Z Women',data:[{x:88,y:28}],backgroundColor:C.pink,pointRadius:11,pointHoverRadius:14},
          {label:'Gen Z Men',data:[{x:70,y:23}],backgroundColor:C.sky,pointRadius:10,pointHoverRadius:13},
          {label:'Tier 2 Women',data:[{x:42,y:14}],backgroundColor:C.lime,pointRadius:9,pointHoverRadius:12},
          {label:'Tier 2 Men',data:[{x:35,y:12}],backgroundColor:C.red,pointRadius:9,pointHoverRadius:12},
        ]
      }
    },
  ],
};

export const SCATTER_COLORS=[C.blue,C.purple,C.teal,C.orange,C.pink,C.sky,C.lime,C.red];
export const SCATTER_LABELS=['Urban Women 22–32','Urban Men 22–32','Women 33–45','Men 33–45','Gen Z Women','Gen Z Men','Tier 2 Women','Tier 2 Men'];

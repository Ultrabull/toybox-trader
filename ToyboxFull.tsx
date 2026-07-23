import { useState, useEffect, useRef } from "react";
import { apiUrl } from "./src/api";
import Landing from "./src/Landing";
import { buildInsight, CURRICULUM } from "./src/insight.mjs";
import { CATS as TASK_CATS, catOf, TEMPLATES, loadTasks, saveTasks, loadStore, saveStore, loadClaims, saveClaims, uid, applyRecurringResets, loadOwed, saveOwed, loadSettings, saveSettings, loadRequests, saveRequests, REQ_CATS, reqCatOf, REQ_SUGGESTIONS, loadSavings, saveSavings, loadAllowance, saveAllowance, loadFamily, saveFamily, loadGifts, saveGifts } from "./src/tasks";

// ─── Constants ─────────────────────────────────────
const AVATARS = ["🚀","🦁","⚡","🐉","🦊","🐼","🦋","🎮","🏆","🌟","🦅","🐯","🐬","🦄","🐸","🎸","🧙","🎯","🐺","🦈"];
const THEMES  = [
  {id:"space",  label:"Cosmic Space",     bg:"linear-gradient(160deg,#0d0621 0%,#1a0e3a 50%,#080c14 100%)", accent:"#7c3aed", card:"rgba(124,58,237,.12)"},
  {id:"forest", label:"Enchanted Forest", bg:"linear-gradient(160deg,#021a0e 0%,#052e16 50%,#021a0e 100%)", accent:"#10b981", card:"rgba(16,185,129,.12)"},
  {id:"neon",   label:"Neon Cyberpunk",   bg:"linear-gradient(160deg,#050014 0%,#120030 50%,#050014 100%)", accent:"#06b6d4", card:"rgba(6,182,212,.12)"},
  {id:"ocean",  label:"Underwater World", bg:"linear-gradient(160deg,#050f2e 0%,#0c2a4a 50%,#050f2e 100%)", accent:"#38bdf8", card:"rgba(56,189,248,.12)"},
  {id:"sunset", label:"Sunset Vibes",     bg:"linear-gradient(160deg,#2a0a1e 0%,#4a1226 50%,#1a0512 100%)", accent:"#fb7185", card:"rgba(251,113,133,.12)"},
  {id:"candy",  label:"Candy Land",       bg:"linear-gradient(160deg,#2a0a2e 0%,#3d1247 50%,#180520 100%)", accent:"#e879f9", card:"rgba(232,121,249,.12)"},
  {id:"lava",   label:"Volcano",          bg:"linear-gradient(160deg,#2a0e06 0%,#4a1c0a 50%,#1a0805 100%)", accent:"#f97316", card:"rgba(249,115,22,.12)"},
  {id:"gold",   label:"Golden Lux",       bg:"linear-gradient(160deg,#241c05 0%,#3a2e0a 50%,#140f03 100%)", accent:"#fbbf24", card:"rgba(251,191,36,.12)"},
];
const PIN_CORRECT = "1234";
const genCode = () => Math.floor(100000 + Math.random()*900000).toString();

// ─── Sound + haptic feedback (kid engagement) ───
let _audioCtx = null;
const playSound = (type) => {
  try {
    _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _audioCtx;
    const now = ctx.currentTime;
    const notes = {
      buy:    [523, 659, 784],   // happy ascending chime
      sell:   [784, 659, 523],   // descending
      coin:   [988, 1319],       // bright coin ping
      reward: [523, 659, 784, 1047], // fanfare
      correct:[659, 880],        // ding ding
      wrong:  [220, 165],        // low buzz
      tap:    [440],             // soft tick
    }[type] || [440];
    notes.forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type === "wrong" ? "sawtooth" : "sine";
      o.frequency.value = freq;
      o.connect(g); g.connect(ctx.destination);
      const start = now + i * 0.09;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.18, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
      o.start(start); o.stop(start + 0.24);
    });
  } catch(e) {}
};
const haptic = (ms = 12) => { try { navigator.vibrate && navigator.vibrate(ms); } catch(e) {} };
const fx = (type, ms) => { playSound(type); haptic(ms); };

// ─── US stock market hours (real Eastern Time) ───
// Returns {open:boolean, label, nextOpenText}. Crypto ignores this (24/7).
const getMarketStatus = () => {
  try {
    // Convert 'now' to US Eastern time
    const now = new Date();
    const et = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const day = et.getDay();           // 0=Sun, 6=Sat
    const mins = et.getHours()*60 + et.getMinutes();
    const openMins = 9*60+30;          // 9:30am ET
    const closeMins = 16*60;           // 4:00pm ET
    const isWeekday = day>=1 && day<=5;
    const isOpen = isWeekday && mins>=openMins && mins<closeMins;
    let nextOpenText = "Mon 9:30am ET";
    if(isWeekday && mins<openMins) nextOpenText = "today 9:30am ET";
    else if(isWeekday && mins>=closeMins && day<5) nextOpenText = "tomorrow 9:30am ET";
    else if(day===5 && mins>=closeMins) nextOpenText = "Monday 9:30am ET";
    else if(day===6) nextOpenText = "Monday 9:30am ET";
    else if(day===0) nextOpenText = "Monday 9:30am ET";
    else if(isWeekday && mins<openMins) nextOpenText = "today 9:30am ET";
    return {open:isOpen, etTime:et, nextOpenText};
  } catch(e) { return {open:true, nextOpenText:""}; }
};

// ─── Persistent storage helpers (survive app close) ───
const KIDS_KEY = "toybox:kids:registry";
const stateKey = id => `toybox:kid:${id}:state`;
const saveData = async (key,value) => { try{ await window.storage.set(key,JSON.stringify(value),false); }catch(e){} };
const loadData = async (key) => { try{ const r=await window.storage.get(key,false); return r?JSON.parse(r.value):null; }catch(e){ return null; } };

// ─── Backup / Restore (protects against browser data loss) ───
// Encodes a kid's full account + progress into a short shareable code.
const makeBackupCode = (account, state) => {
  try {
    const payload = {v:1, account, state, savedAt:Date.now()};
    return "TBX-" + btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  } catch(e){ return null; }
};
const readBackupCode = (code) => {
  try {
    const raw = code.trim().replace(/^TBX-/, "");
    const payload = JSON.parse(decodeURIComponent(escape(atob(raw))));
    if(payload && payload.account) return payload;
    return null;
  } catch(e){ return null; }
};
const f$  = n => `$${Number(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const fs$ = n => n>=1000 ? `$${(n/1000).toFixed(1)}k` : `$${Number(n).toFixed(2)}`;
const pct = (a,b) => (((a-b)/b)*100).toFixed(1);
// Tidy a share/token quantity: whole numbers plain, fractions to ≤4 decimals
// (no more 0.08141615392763166 — that's a float, not something a kid reads).
const fmtQty = q => Number.isInteger(q) ? String(q) : parseFloat(Number(q).toFixed(4)).toString();
const toRobux = d => Math.round(d*10).toLocaleString();

// ─── Market data ───────────────────────────────────
// Each asset has a `cat` (how it's grouped) and `minAge` (kids younger than
// this see it as a locked "coming soon" card). Age comes from what we already
// collect at sign-up — no new data needed.
//   cat: "stock" | "crypto" (all ages) · "etf" (10+) · "other" markets (13+)
const MARKET = [
  {ticker:"AAPL",name:"Apple",   type:"stock", cat:"stock", minAge:0, basePrice:250.00,icon:"🍎",color:"#6366f1",
   tagline:"Makes iPhones — billions sold every year",risk:"low",
   kidEx:"Apple is like the most popular kid at school. Every iPhone your parents buy makes Apple richer — and you too if you own a block!",
   news:"📱 Big idea: when Apple launches a popular new iPhone, lots of people buy it — that can lift the stock.",newsGood:true,trend:"up"},
  {ticker:"RBLX",name:"Roblox",  type:"stock", cat:"stock", minAge:0, basePrice:115.00,icon:"🎮",color:"#ec4899",
   tagline:"70 million kids play this every single day",risk:"medium",
   kidEx:"Every time someone buys Robux, Roblox earns money. Own a block and get a tiny slice of every Robux purchase!",
   news:"🎮 Big idea: the more kids who play Roblox and buy Robux, the more the company can earn.",newsGood:true,trend:"up"},
  {ticker:"DIS", name:"Disney",  type:"stock", cat:"stock", minAge:0, basePrice:112.00,icon:"🏰",color:"#8b5cf6",
   tagline:"Owns Marvel, Star Wars, Frozen & Disney+",risk:"low",
   kidEx:"Disney owns almost every movie you love. Every cinema ticket and Disney+ subscription earns them money!",
   news:"🎬 Big idea: a hit Marvel movie or busy Disney+ can mean more money for Disney.",newsGood:true,trend:"flat"},
  {ticker:"NVDA",name:"Nvidia",  type:"stock", cat:"stock", minAge:0, basePrice:175.00,icon:"🖥️",color:"#10b981",
   tagline:"Their chips power every video game AND every AI",risk:"medium",
   kidEx:"Your PS5, Xbox and every AI chatbot runs on Nvidia chips. They power gaming AND AI!",
   news:"🤖 Big idea: when AI and gaming companies need lots of chips, Nvidia can sell more of them.",newsGood:true,trend:"up"},
  {ticker:"BTC", name:"Bitcoin", type:"crypto",cat:"crypto",minAge:0, basePrice:100000,icon:"₿", color:"#f59e0b",
   tagline:"Only 21 million ever — like limited Pokémon cards",risk:"high",
   kidEx:"Only 21 million Bitcoins will EVER exist. Like a limited holographic Pokémon card — if everyone wants it, price goes up!",
   news:"⚠️ Big idea: Bitcoin's price can jump up and down a LOT in a short time — that's called being 'volatile'.",newsGood:false,trend:"volatile"},
  {ticker:"ETH", name:"Ethereum",type:"crypto",cat:"crypto",minAge:0, basePrice:3500,  icon:"⟠",color:"#06b6d4",
   tagline:"Digital money that runs thousands of apps",risk:"high",
   kidEx:"Ethereum is like Roblox's currency system but for the whole internet. More apps = more demand!",
   news:"⚠️ Big idea: Ethereum is crypto too, so its price can also swing up and down quickly — high risk!",newsGood:false,trend:"volatile"},

  // ── ETFs (unlock at age 10) — "baskets" that teach diversification ──
  {ticker:"VOO", name:"S&P 500", type:"stock", cat:"etf", minAge:10, badge:"Basket", basePrice:500.00,icon:"🧺",color:"#3b82f6",
   tagline:"500 of America's biggest companies in ONE basket",risk:"low",
   kidEx:"Instead of picking ONE company, this basket owns a tiny slice of 500 big ones — Apple, Disney, Nvidia and more. If one has a bad day, the others help balance it out. Safer than one stock!",
   news:"🧺 Big idea: an ETF is a basket of many stocks at once. One bad company barely hurts — that's called 'spreading your risk'.",newsGood:true,trend:"up"},
  {ticker:"QQQ", name:"Tech 100", type:"stock", cat:"etf", minAge:10, badge:"Basket", basePrice:500.00,icon:"💻",color:"#14b8a6",
   tagline:"A basket of the 100 biggest tech companies",risk:"medium",
   kidEx:"This basket is stuffed with the biggest tech names — Apple, Nvidia, Microsoft and friends. When tech does well, the whole basket grows together!",
   news:"💻 Big idea: a tech basket has more exciting ups AND downs than a mixed one, because it's all one type of company.",newsGood:true,trend:"up"},

  // ── Other markets (unlock at age 13) — for older kids ──
  {ticker:"GLD", name:"Gold",    type:"stock", cat:"other", minAge:13, badge:"Gold", basePrice:240.00,icon:"🥇",color:"#eab308",
   tagline:"Own real gold without a treasure chest",risk:"low",
   kidEx:"This lets you own real gold without hiding bars under your bed! People often buy gold when they feel nervous about other investments — it's known as a 'safe haven'.",
   news:"🥇 Big idea: gold often stays calm (or even rises) when stocks get scary. It moves differently from stocks.",newsGood:true,trend:"flat"},
  {ticker:"TLT", name:"Gov Bonds",type:"stock", cat:"other", minAge:13, badge:"Bond", basePrice:90.00,icon:"🏦",color:"#64748b",
   tagline:"Lending money to the government for interest",risk:"low",
   kidEx:"A bond is like lending your allowance and getting it back later PLUS a little extra. This is a basket of loans to the US government — the slow-and-steady one, not exciting but calm.",
   news:"🏦 Big idea: bonds are usually calmer than stocks. Slow and steady wins races, not thrills.",newsGood:true,trend:"flat"},
  {ticker:"VXUS",name:"World",   type:"stock", cat:"other", minAge:13, badge:"World", basePrice:65.00,icon:"🌍",color:"#22c55e",
   tagline:"Companies from EVERY country but the USA",risk:"medium",
   kidEx:"This basket owns companies from all over the planet — Japan, Europe, everywhere except the USA. It's how investors avoid betting on just one country!",
   news:"🌍 Big idea: owning companies from other countries means you're not depending on just ONE country doing well.",newsGood:true,trend:"flat"},
];
// Approximate fallback prices — only shown if the live price feed is
// unreachable. The /prices function overrides these with real quotes.
const INIT_PRICES = {AAPL:332.00,RBLX:125.00,DIS:115.00,NVDA:185.00,BTC:110000,ETH:3800,VOO:686.00,QQQ:590.00,GLD:378.00,TLT:88.00,VXUS:68.00};
// Trade-screen tabs. `minAge` gates the whole group; younger kids see a
// friendly locked card instead of the tradable ones.
const CATS = [
  {k:"all",   label:"🌐 All",     minAge:0},
  {k:"stock", label:"🧱 Blocks",  minAge:0},
  {k:"crypto",label:"🃏 Cards",   minAge:0},
  {k:"etf",   label:"🧺 Baskets", minAge:10},
  {k:"other", label:"🌍 Markets", minAge:13},
];
// Kid-friendly "what's wrong?" choices for the Get Help / report-a-problem form.
const BUG_CATS = [
  {id:"broken",  icon:"🐞", label:"Something's broken"},
  {id:"confused",icon:"😕", label:"I'm confused"},
  {id:"money",   icon:"💸", label:"Wrong price or money"},
  {id:"idea",    icon:"💡", label:"I have an idea!"},
  {id:"other",   icon:"❓", label:"Something else"},
];

// ─── Lessons with adventure map ────────────────────
const LESSONS = [
  {id:"money_basics",icon:"💵",title:"What is Money?",color:"#22c55e",cashReward:25,island:"Money Start",
   slides:[
    {icon:"🔄",title:"Money is a swap tool",body:"Long ago, people swapped things — I give you apples, you give me bread. Money makes swapping easy! Everyone agrees a coin is worth something, so you can trade it for almost anything.",example:"💡 A $1 bill is just paper — but everyone agrees it's worth $1, so you can swap it for a treat!"},
    {icon:"⏳",title:"Money runs out",body:"You only have so much money. Once you spend it, it's gone until you earn more. That's why smart kids choose carefully what to buy.",example:"💡 Spend your whole $10 on candy Monday, and there's nothing left for the rest of the week!"},
   ],
   quiz:[
    {q:"What is money really for?",opts:["Swapping for things you need or want","Eating it","Nothing at all","Drawing pictures"],correct:0,why:"Money is a tool everyone agrees on, so we can swap it for things we need and want!"},
    {q:"What happens when you spend ALL your money?",opts:["It magically comes back","It's gone until you earn more","It doubles","Nothing changes"],correct:1,why:"Once it's spent, it's gone until you earn or get more — so choose carefully!"},
   ],},
  {id:"needs_wants",icon:"🥦",title:"Needs vs Wants",color:"#10b981",cashReward:25,island:"Choice Cove",
   slides:[
    {icon:"🥦",title:"Needs come first",body:"Needs are things you MUST have to live: food, water, a home, clothes. Wants are the fun extras: toys, candy, games. Smart spenders pay for needs FIRST.",example:"💡 Dinner (a need) always comes before a new toy (a want)!"},
    {icon:"🍦",title:"Wants are still okay!",body:"Wants aren't bad — treats make life fun! Just make sure your needs are covered first, then enjoy your wants without worry.",example:"💡 Chores done and food covered? Now that ice cream is a well-earned treat! 🍦"},
   ],
   quiz:[
    {q:"Which of these is a NEED?",opts:["A new video game","Food to eat","Candy","A fancy toy"],correct:1,why:"Food is a need — you can't live without it! The others are fun wants."},
    {q:"What should you spend on FIRST?",opts:["Wants","Needs","Toys","Candy"],correct:1,why:"Needs first, then wants — that's how smart grown-ups budget their money!"},
   ],},
  {id:"earning",icon:"🛠️",title:"Where Money Comes From",color:"#3b82f6",cashReward:25,island:"Work Woods",
   slides:[
    {icon:"🛠️",title:"Money is earned",body:"Money doesn't appear by magic — people earn it by working, helping and doing jobs. Your chores are your very first 'job'!",example:"💡 Do your chores → earn coins. That's EXACTLY how grown-ups earn money at their jobs!"},
    {icon:"📚",title:"Learning = earning",body:"The more useful your skills, the more you can earn. Kids who read and learn become grown-ups who can do bigger jobs — and earn more!",example:"💡 Every lesson you finish makes you smarter about money. Learning pays off for life!"},
   ],
   quiz:[
    {q:"Where does money usually come from?",opts:["It grows on trees","Working and helping others","Pure magic","Falling from the sky"],correct:1,why:"Money is earned by working and helping — just like your chores earn you coins!"},
    {q:"How can you earn MORE when you grow up?",opts:["Do nothing all day","Learn skills and work hard","Sleep more","Wish for it"],correct:1,why:"Learning skills lets you do bigger jobs and earn more. Learning always pays off!"},
   ],},
  {id:"saving_basics",icon:"🐷",title:"The Magic of Saving",color:"#f59e0b",cashReward:25,island:"Piggy Bay",
   slides:[
    {icon:"🐷",title:"A little adds up",body:"Save just a little each week and it grows into a LOT. Skipping one candy ($1) a week adds up to $52 in a year — that's real magic!",example:"💡 Save $2 a week → over $100 in a year. Enough for something BIG!"},
    {icon:"🎯",title:"Save for something you love",body:"Saving is easier when you have a goal. Picture the thing you really want, then watch your savings jar fill up toward it, week by week.",example:"💡 Want a $40 Lego set? Save $5 a week and it's yours in just 8 weeks!"},
   ],
   quiz:[
    {q:"What happens when you save a little every week?",opts:["Nothing at all","It slowly adds up to a lot","It disappears","It gets smaller"],correct:1,why:"Small savings add up fast! A little every week becomes a big pile over time."},
    {q:"What makes saving easier and more fun?",opts:["Having a goal to save for","Spending it right away","Forgetting about it","Hiding it away"],correct:0,why:"A goal makes saving fun — you get to watch your jar fill up toward the thing you want!"},
   ],},
  {id:"investing",icon:"🍋",title:"What is Investing?",color:"#6366f1",cashReward:50,island:"Lemonade Island",
   slides:[
    {icon:"🍋",title:"The Lemonade Stand Lesson",body:"Your friend opens a lemonade stand for $10. She lets you invest $5 to own half. Every dollar it earns, you get 50 cents back. That's investing — your money works FOR you!",example:"💡 Stand earns $20 on Saturday → your $5 earns $10 back. That's doubling your money in ONE day!"},
    {icon:"🍎",title:"Apple is just a HUGE lemonade stand",body:"Apple works exactly the same — except instead of lemonade, they sell iPhones. Buy 1 Apple Building Block and you become one of billions of tiny owners!",example:"💡 If Apple earns more money this year, your block is worth MORE. You profit without doing any work!"},
    {icon:"⏳",title:"Time is your superpower",body:"$100 in Apple in 2014 → $1,100+ today. No work. Just patience. The best investors wait while companies grow.",example:"💡 This is called compound growth. Your money earns money, which earns more money. It snowballs!"},
  ],
   quiz:[
    {q:"What does it mean to 'invest' in a company?",opts:["You give them money for free","You own a tiny piece and share in the profits","You borrow money from them","You work there"],correct:1,why:"Investing means buying a piece of a company. When it does well, your piece is worth more!"},
    {q:"In the lemonade stand example, if you own half and it earns $20, how much is yours?",opts:["$20","$5","$10","Nothing"],correct:2,why:"You own HALF, so you get half of $20 = $10! Your money worked for you."},
   ],},
  {id:"when_buy",icon:"🛍️",title:"When to Buy?",color:"#10b981",cashReward:75,island:"Sale Island",
   slides:[
    {icon:"🛍️",title:"Buying on sale",body:"Your favorite game is $60. On sale for $40. You'd buy it immediately! Smart investors do the same — a temporary dip on a GOOD company is a SALE!",example:"💡 Apple drops to $170 for one slow week. Smart investors buy knowing it'll recover!"},
    {icon:"🧺",title:"Never put all eggs in one basket",body:"10 Easter eggs in one basket. Dog knocks it over — you lose ALL 10. But 5 baskets with 2 eggs each? Dog only gets 2!",example:"💡 Own 4-5 different assets. If one crashes, others protect you. This is called diversification!"},
  ],
   quiz:[
    {q:"When is often a SMART time to buy a good company's stock?",opts:["When everyone is panicking and the price dipped","When the price is at its highest ever","Never","Only on weekends"],correct:0,why:"A temporary dip on a GOOD company is like a sale — smart investors buy the discount!"},
    {q:"Why should you own 4-5 different assets instead of just one?",opts:["It looks cooler","To confuse people","If one crashes, the others protect you","There's no reason"],correct:2,why:"That's diversification! Like eggs in different baskets — if one breaks, you still have the others."},
   ],},
  {id:"when_sell",icon:"💰",title:"When to Sell?",color:"#ec4899",cashReward:75,island:"Profit Peak",
   slides:[
    {icon:"🃏",title:"The Pokémon card moment",body:"Charizard bought at $50, now worth $80. Sell NOW to lock in $30 real profit. Wait and the hype might die, dropping it back to $55!",example:"💡 Profit is only REAL when you sell. Until then it's a number that can go back down!"},
    {icon:"🧘",title:"Don't panic sell",body:"Apple dropped 20%+ eight times since 2010. Every single time it came back higher. Panic sellers lost money. Patient holders won.",example:"💡 Like deleting your Roblox account during a server outage. Then it came back. Oops!"},
  ],
   quiz:[
    {q:"When does your profit become REAL money?",opts:["When the price goes up on screen","Only when you SELL","When you tell your friends","Never"],correct:1,why:"Profit is only real when you sell! Until then it's just a number that can still go down."},
    {q:"A stock you own drops 10% in one day. What's usually the SMART move?",opts:["Panic and sell everything","Stay calm — good companies usually bounce back","Buy a lottery ticket","Delete the app"],correct:1,why:"Don't panic sell! Good companies have dropped many times and always came back higher."},
   ],},
  {id:"crypto",icon:"🃏",title:"Crypto Explained",color:"#f59e0b",cashReward:50,island:"Crypto Cove",
   slides:[
    {icon:"🃏",title:"Limited edition trading cards",body:"Only 21 million Bitcoins exist EVER. If a billion people want it and only 21 million exist — price rockets. If people lose interest — it crashes. Like rare Pokémon cards!",example:"💡 Your holographic Charizard is worth $200 because people BELIEVE it's rare. Bitcoin works the same way!"},
    {icon:"⚖️",title:"The 10% rule",body:"Never put more than 10% of your garden in crypto. With $1,000 that's $100 maximum. No matter how excited you feel!",example:"💡 You wouldn't put all your birthday money on ONE scratch card. Crypto = scratch card of investing!"},
  ],
   quiz:[
    {q:"Why can crypto prices crash so fast?",opts:["Because it's based on what people believe, not real products","Because computers are slow","Because it's illegal","It never crashes"],correct:0,why:"Crypto value comes from belief and demand — when confidence drops, the price can crash fast!"},
    {q:"What's the maximum % of your money experts say to put in crypto?",opts:["100%","50%","10%","All of it"],correct:2,why:"The 10% rule! Never risk more than 10% on something this unpredictable."},
   ],},
  {id:"charts",icon:"📊",title:"Reading Charts",color:"#06b6d4",cashReward:100,island:"Chart Island",
   slides:[
    {icon:"📊",title:"What is a price chart?",body:"A chart shows how a stock changed over time. Like plotting your weekly quiz scores — it shows if you're improving or getting worse!",example:"💡 Scores: 60, 65, 70, 75 = upward trend. Stocks have trends too!"},
    {icon:"🕯️",title:"Green and red candles",body:"Each candle = ONE day. GREEN = price finished HIGHER (good day 📈). RED = price finished LOWER (bad day 📉). Thin lines show highest and lowest points.",example:"💡 Five green candles in a row = up 5 straight days. Strong momentum!"},
    {icon:"🛹",title:"Support — the trampoline",body:"A price the stock keeps BOUNCING back from when it dips. Like a trampoline floor. Break THROUGH support? Danger sign!",example:"💡 Apple keeps bouncing at $180. That's support! Smart traders buy near support."},
    {icon:"〰️",title:"Moving averages",body:"Average price of the last 20 days. Smooths out daily noise. Price ABOVE it = healthy. BELOW it = be careful!",example:"💡 Price crosses ABOVE the moving average = many traders see it as a buy signal!"},
  ],
   quiz:[
    {q:"On a price chart, what does a GREEN candle mean?",opts:["The price finished LOWER that day","The price finished HIGHER that day","The stock is broken","Time to sell"],correct:1,why:"Green = price finished higher than it started = a good day! Red means it finished lower."},
    {q:"What is 'support' on a chart?",opts:["A price the stock keeps bouncing back up from","A customer service line","The highest price ever","A type of crypto"],correct:0,why:"Support is like a trampoline floor — a price level the stock keeps bouncing back up from!"},
   ],},
  {id:"options",icon:"🎁",title:"Options Trading",color:"#8b5cf6",cashReward:150,island:"Options Outpost",
   slides:[
    {icon:"🎁",title:"The toy reservation",body:"PS6 isn't out yet but you pay $20 NOW to reserve one at today's $400 price. Next month it costs $600 — you still get it for $400!",example:"💡 You paid $20 (premium) to lock in $400 (strike price). PS6 hits $600 → you made $180 profit from a $20 bet!"},
    {icon:"📈",title:"Call options — betting UP",body:"CALL option = right to BUY at a locked price. Apple at $195, you buy a call at $200 for $5. Apple hits $230 — your $5 call could be worth $30+!",example:"💡 500%+ return on your $5 bet! But ONLY if you're right about direction AND timing."},
    {icon:"📉",title:"Put options — protection",body:"PUT option = right to SELL at a locked price. Like insurance! Own Apple, scared it might crash? Buy a put at $190. If Apple drops to $150, your put gains value!",example:"💡 Even Warren Buffett uses puts to protect his billions. Smart risk management!"},
    {icon:"⚠️",title:"Options expire — they go to ZERO!",body:"Unlike stocks, options have an EXPIRY DATE. When they expire wrong — they're worth NOTHING. Most option traders lose money. Master Building Blocks first!",example:"💡 Options are level 10 investing. You're still levelling up! Don't rush here."},
  ],
   quiz:[
    {q:"In the PS6 example, what is the $20 you paid to reserve it called?",opts:["The strike price","The premium","The tax","The refund"],correct:1,why:"The premium is the fee you pay for the option — like a reservation deposit!"},
    {q:"What's the biggest danger of options compared to stocks?",opts:["They're boring","They expire and can become worthless","They're too cheap","Nothing"],correct:1,why:"Options EXPIRE! If you're wrong by the expiry date, they can go to zero. Master stocks first!"},
   ],},
  {id:"risk",icon:"🛡️",title:"Risk Management",color:"#10b981",cashReward:100,island:"Safe Harbor",
   slides:[
    {icon:"🛡️",title:"The most important skill",body:"The best investors don't focus on making money — they focus on NOT LOSING it. If you protect from big losses, the gains take care of themselves.",example:"💡 Lose 50% of your garden → need 100% gain just to break even. Protecting is harder than gaining!"},
    {icon:"✂️",title:"Stop losses",body:"A rule that automatically sells if price drops X%. Set the rule BEFORE you buy, when your head is clear — not during a panic!",example:"💡 Like telling a friend 'if I spend too much at the arcade, take my coins!' Rules beat emotions."},
    {icon:"🍕",title:"Never bet the farm",body:"Max 20% of your garden in ANY single investment. With $1,000 that's $200 max per stock. If it crashes 50%, you only lose $100 — not everything.",example:"💡 Order one pizza slice, not the whole pizza. If you hate it you haven't wasted your whole budget!"},
  ],
   quiz:[
    {q:"What is a 'stop loss'?",opts:["A rule to auto-sell if price drops too much","A way to never lose","A type of stock","A video game"],correct:0,why:"A stop loss automatically sells if the price falls too far — protecting you from big losses!"},
    {q:"What's the max % of your garden to put in ONE investment?",opts:["100%","20%","75%","50%"],correct:1,why:"Never more than 20% in one thing! If it crashes, you only lose a slice — not everything."},
   ],},
  {id:"psychology",icon:"🧠",title:"Market Psychology",color:"#f59e0b",cashReward:100,island:"Mind Mountain",
   slides:[
    {icon:"😱",title:"Fear and greed",body:"Stock prices are driven by EMOTIONS — fear and greed. When greedy, people buy and push prices up. When fearful, they panic sell and crash prices. Smart investors do the OPPOSITE of the crowd!",example:"💡 Warren Buffett: 'Be greedy when others are fearful, fearful when others are greedy.'"},
    {icon:"🐂",title:"Bull and bear markets",body:"BULL market = prices going UP for months 🐂. BEAR market = prices going DOWN 🐻. They ALWAYS switch eventually. Patient investors win both!",example:"💡 2020 COVID crash = bear. 2021 = biggest bull ever. Those who held through the crash made fortunes!"},
    {icon:"😨",title:"FOMO — the most dangerous feeling",body:"Fear Of Missing Out. Stock up 50%? Everyone buys NOW thinking they'll miss more gains. But when EVERYONE is talking about a stock — it's usually already too late!",example:"💡 Everyone talked about Bitcoin at $69,000. Those who FOMOed watched it crash to $16,000. Painful!"},
  ],
   quiz:[
    {q:"What does the famous rule say to do when others are FEARFUL?",opts:["Be fearful too and sell","Be greedy and look for opportunities","Stop investing forever","Panic"],correct:1,why:"'Be greedy when others are fearful' — crashes are often the best buying opportunities!"},
    {q:"What is FOMO?",opts:["A type of stock","Fear Of Missing Out — buying because everyone else is","A safe investment","A trading robot"],correct:1,why:"FOMO makes you buy high when everyone's excited — usually right before the price drops!"},
   ],},

  {id:"dca",icon:"📆",title:"Dollar-Cost Averaging",color:"#06b6d4",cashReward:125,island:"Steady Shores",
   slides:[
    {icon:"📆",title:"A little bit, again and again",body:"Instead of spending all your money at once, you invest a small amount on a regular schedule — like every allowance day. Some weeks the price is high, some weeks low. It evens out over time!",example:"💡 Buy $10 of Apple every week. You stop stressing about 'is today the right day?' — you just keep going."},
    {icon:"🎢",title:"Why it beats guessing",body:"Nobody — not even the pros — can perfectly time the market. DCA means when prices are LOW, your fixed money buys MORE shares. When high, it buys fewer. You automatically buy more on sale!",example:"💡 $10 buys 1 share at $10, but 2 shares at $5. Low prices = bonus shares. The dips become your friend!"},
    {icon:"😌",title:"The stress-free strategy",body:"DCA is the #1 strategy experts recommend for beginners. You don't watch the news in panic. You don't try to be a hero. You just invest steadily and let time do the work.",example:"💡 People who DCA'd into the market through the 2008 crash ended up RICHER than those who waited for 'the right time'."},
  ],
   quiz:[
    {q:"What does Dollar-Cost Averaging mean?",opts:["Spending all your money at once","Investing a fixed amount regularly over time","Only buying when prices are high","Never investing"],correct:1,why:"DCA = investing a steady amount on a schedule, no matter the price. It removes the stress of timing!"},
    {q:"When prices DROP, your fixed weekly money buys...",opts:["Fewer shares","The same shares","MORE shares (bonus!)","Nothing"],correct:2,why:"Lower prices mean your money buys more shares — so dips actually help you when you DCA!"},
   ],},

  {id:"buy_hold",icon:"💎",title:"Buy and Hold",color:"#8b5cf6",cashReward:125,island:"Diamond Isle",
   slides:[
    {icon:"💎",title:"Diamond hands win",body:"Buy and Hold means you buy a GREAT company and keep it for years — through ups AND downs. You don't panic-sell on a bad week. This is Warren Buffett's whole secret!",example:"💡 Buffett's rule: 'My favorite holding period is forever.' He's one of the richest people alive from doing exactly this."},
    {icon:"🐢",title:"The tortoise beats the hare",body:"Studies show people who trade a LOT usually do WORSE than people who buy good companies and do nothing. Every time you trade you risk a mistake. Patience is a superpower.",example:"💡 $1,000 in Apple in 2003, left alone, became over $400,000. The kids who did NOTHING won the most!"},
    {icon:"🌳",title:"Let it grow",body:"A tree doesn't grow if you keep digging it up to check the roots. Investments are the same — give good companies TIME. The longer you hold quality, the more powerful compound growth becomes.",example:"💡 The boring strategy of 'buy good stuff, wait 10 years' beats almost every fancy trading robot."},
  ],
   quiz:[
    {q:"What is Warren Buffett's famous holding period?",opts:["One day","One week","Forever","One hour"],correct:2,why:"'My favorite holding period is forever' — he buys great companies and holds for decades!"},
    {q:"Studies show people who trade a LOT usually...",opts:["Get rich fast","Do WORSE than patient holders","Always win","Never make mistakes"],correct:1,why:"Frequent trading usually loses to patient buy-and-hold. Every trade is a chance to slip up!"},
   ],},

  {id:"diversify_deep",icon:"🧺",title:"Smart Diversification",color:"#10b981",cashReward:100,island:"Balance Bay",
   slides:[
    {icon:"🧺",title:"Different baskets, different types",body:"Real diversification isn't just owning 5 things — it's owning 5 DIFFERENT KINDS of things. If you own 5 game companies and gaming crashes, you still lose everything!",example:"💡 Mix it up: a tech company, an entertainment company, a chip maker, maybe a little crypto. Different worlds!"},
    {icon:"⚖️",title:"When one zigs, another zags",body:"The magic of diversification: different investments often move in different directions. When one drops, another might rise — smoothing out your whole garden so no single crash hurts too much.",example:"💡 In 2022 tech stocks fell but energy stocks soared. A diversified kid barely felt the tech crash!"},
    {icon:"🍕",title:"Don't over-do it either",body:"Owning 50 things means you can't follow any of them. For a young investor, 4–8 good, different investments is the sweet spot — enough safety, few enough to actually understand.",example:"💡 Know what you own and why. 5 companies you understand beats 50 you've never heard of."},
  ],
   quiz:[
    {q:"True diversification means owning...",opts:["5 companies that all do the same thing","Different KINDS of investments","Only one stock","Only crypto"],correct:1,why:"Owning 5 game companies isn't safe if gaming crashes. Spread across DIFFERENT types of business!"},
    {q:"For a young investor, a good number of investments is roughly...",opts:["1","50+","4 to 8 different ones","100"],correct:2,why:"4–8 different investments you actually understand is the sweet spot — safe but manageable!"},
   ],},

  {id:"dividends",icon:"🌰",title:"Dividends — Paid to Wait",color:"#f59e0b",cashReward:125,island:"Harvest Hollow",
   slides:[
    {icon:"🌰",title:"Free money for owning",body:"Some companies share their profits with owners every few months — that's a DIVIDEND. You get paid CASH just for holding the stock, even if you never sell it!",example:"💡 Own Apple and it pays a small dividend 4 times a year. It's like a fruit tree that drops fruit every season."},
    {icon:"🔁",title:"Reinvest for a snowball",body:"Smart investors use dividend money to buy MORE shares — which then pay MORE dividends — which buy even more shares. It snowballs into something huge over years!",example:"💡 This is 'compounding'. Reinvested dividends made up a HUGE chunk of all stock market gains in history."},
    {icon:"🏦",title:"Steady companies pay them",body:"Big, stable, grown-up companies (think Coca-Cola, Apple) tend to pay dividends. Brand-new risky companies usually don't — they spend everything trying to grow.",example:"💡 Dividends are a sign a company is healthy and profitable enough to share the rewards with you!"},
  ],
   quiz:[
    {q:"What is a dividend?",opts:["A fee you pay","Cash a company pays you for owning its stock","A type of loan","A trading mistake"],correct:1,why:"A dividend is your share of the company's profits — paid to you in cash, just for holding!"},
    {q:"What's the smart thing to do with dividend money?",opts:["Spend it instantly","Reinvest it to buy more shares","Throw it away","Hide it"],correct:1,why:"Reinvesting dividends buys more shares that pay more dividends — a powerful snowball over time!"},
   ],},

  {id:"index",icon:"🌐",title:"Index Investing",color:"#6366f1",cashReward:150,island:"Index Island",
   slides:[
    {icon:"🌐",title:"Own a tiny bit of everything",body:"Instead of picking which company will win, an INDEX FUND lets you own a tiny slice of hundreds of companies at once. If any one wins, you win a bit. You can't pick the loser by mistake!",example:"💡 The 'S&P 500' is 500 of America's biggest companies in one basket. Buy it and you own all 500!"},
    {icon:"🏆",title:"It beats most experts",body:"Here's a shocker: over 10+ years, simple index funds beat MOST highly-paid professional fund managers. Picking winners is SO hard that owning everything usually wins!",example:"💡 Buffett bet $1 million that an index fund would beat fancy hedge funds over 10 years. He WON, easily."},
    {icon:"😴",title:"The lazy genius move",body:"Index investing needs almost no effort — no studying charts, no stress. You own the whole market and ride its long-term rise. Many millionaires were made just doing this for decades.",example:"💡 'Don't look for the needle in the haystack. Just buy the haystack!' — index investing in one sentence."},
  ],
   quiz:[
    {q:"What does an index fund let you do?",opts:["Own one risky stock","Own a tiny bit of hundreds of companies at once","Only buy crypto","Trade every second"],correct:1,why:"An index fund holds many companies at once — instant diversification without picking winners!"},
    {q:"Over 10+ years, index funds usually...",opts:["Lose all your money","Beat most professional fund managers","Do nothing","Only work for adults"],correct:1,why:"Simple index funds beat most expensive professionals over time — owning everything is powerful!"},
   ],},

  {id:"value_growth",icon:"🔍",title:"Value vs Growth",color:"#ec4899",cashReward:125,island:"Two Paths Pass",
   slides:[
    {icon:"🏷️",title:"Value investing = bargain hunting",body:"A VALUE investor looks for good companies that are temporarily CHEAP — like finding a $100 toy on sale for $60. They buy quality at a discount and wait for the price to catch up.",example:"💡 Warren Buffett is a value investor. He asks: 'Is this worth MORE than its price tag right now?'"},
    {icon:"🚀",title:"Growth investing = future stars",body:"A GROWTH investor buys companies growing super fast, betting they'll be HUGE later — even if they look expensive now. Riskier, but the winners can be enormous.",example:"💡 Buying Amazon or Tesla early when they looked 'too expensive' — growth investors who were right got rich."},
    {icon:"⚖️",title:"Which is better? Both!",body:"Neither always wins — they take turns. Many smart investors mix BOTH: some steady bargains, some exciting growth bets. Knowing the difference helps you understand WHY you're buying something.",example:"💡 Ask yourself before buying: 'Am I getting a bargain (value) or betting on the future (growth)?'"},
  ],
   quiz:[
    {q:"A VALUE investor looks for...",opts:["The most expensive stock","Good companies that are temporarily cheap","Only brand-new companies","Crypto only"],correct:1,why:"Value investing is bargain hunting — buying quality companies when they're on sale!"},
    {q:"A GROWTH investor bets on...",opts:["Companies that will shrink","Fast-growing companies becoming huge later","Only cheap stocks","Never selling"],correct:1,why:"Growth investors buy fast-growing companies, betting they'll be much bigger in the future!"},
   ],},

  {id:"time_in_market",icon:"⏰",title:"Time IN the Market",color:"#10b981",cashReward:150,island:"Patience Point",
   slides:[
    {icon:"⏰",title:"The most important rule",body:"There's a famous saying: 'Time IN the market beats TIMING the market.' Translation: how LONG you stay invested matters far more than trying to guess the perfect day to buy or sell.",example:"💡 Trying to jump in and out at perfect moments almost never works. Staying invested for years almost always does."},
    {icon:"😬",title:"Missing the best days hurts",body:"Here's the scary part: the market's biggest UP days often come right after the scary down days. If you panic-sell and miss just a handful of those best days, your returns collapse.",example:"💡 Miss the 10 best days over 20 years and you could HALVE your gains. The panic-sellers miss them every time!"},
    {icon:"🧘",title:"Boring is beautiful",body:"The kids who do best aren't the ones glued to prices all day. They invest in good things and let time work. Calm beats clever. Years beat hours.",example:"💡 'The stock market is a device for transferring money from the impatient to the patient.' — Warren Buffett"},
  ],
   quiz:[
    {q:"The famous saying is: 'Time IN the market beats...'",opts:["Time at school","TIMING the market","Time on your phone","Nothing"],correct:1,why:"Staying invested over time beats trying to guess perfect buy/sell days — which almost never works!"},
    {q:"What happens if you panic-sell and miss the market's best days?",opts:["Nothing changes","Your gains can collapse","You get richer","You win a prize"],correct:1,why:"The best up-days often follow scary drops. Miss them by panicking and your returns can halve!"},
   ],},

  {id:"exit_strategy",icon:"🚪",title:"Exit Strategies",color:"#ef4444",cashReward:150,island:"Exit Summit",
   slides:[
    {icon:"🚪",title:"Plan your exit BEFORE you enter",body:"Pro investors decide when they'll SELL before they even buy. Two rules: a TAKE-PROFIT price (cash out when you've won enough) and a STOP-LOSS price (get out if it drops too far). Decide calmly, in advance.",example:"💡 'I'll sell Apple if it gains 30%, OR if it drops 20%.' Write it down. Then emotions can't trick you later!"},
    {icon:"🎯",title:"Take-profit: lock in the win",body:"When a stock hits your target gain, selling some (or all) turns paper profit into REAL money. Greedy investors who never take profit often watch their gains vanish.",example:"💡 Up 40% on a meme stock? Taking profit means you actually KEEP it instead of riding it back down to zero."},
    {icon:"🛑",title:"Stop-loss: protect the downside",body:"A stop-loss is your safety net — sell automatically if the price falls past a line you set. It caps how much you can lose on any one bet, so no single mistake wrecks your whole garden.",example:"💡 Set a stop-loss 20% below your buy price. Worst case you lose 20%, not everything. Survival first!"},
    {icon:"🧩",title:"Match your exit to your reason",body:"If you bought for the LONG term (buy & hold), your 'exit' might be years away. If it was a short risky bet, set tight exits. Always know: why did I buy, and what would make me sell?",example:"💡 The best investors are never surprised — they always know their plan for both winning AND losing."},
  ],
   quiz:[
    {q:"When should you plan your exit (when to sell)?",opts:["Never","After you've already lost money","BEFORE you even buy","Only when panicking"],correct:2,why:"Decide your sell rules calmly BEFORE buying — then emotions can't trick you into bad decisions later!"},
    {q:"What does a STOP-LOSS do?",opts:["Guarantees profit","Sells automatically if price drops too far, capping your loss","Buys more forever","Nothing useful"],correct:1,why:"A stop-loss caps your downside — you lose a set amount at most, so one bad bet can't wreck everything!"},
   ],},
];

// ─── Careers & grown-up money life ─────────────────────────────────────────
// Kids live the real loop: EARN a paycheck → pay the BILLS (rent, food, phone
// — you have to!) → invest what's LEFT (your savings) → get PROMOTED to a
// higher-paying job once you've invested from a couple of paychecks. You climb
// the ladder from lowest to highest, and each promotion means bigger pay AND
// bigger bills — but more left over to invest. Two lessons baked in:
//   1) more school/skill → more pay      2) bills come first, then invest.
// Pay is GROSS. Real life: tax comes out first (higher earners pay a higher
// rate — a gentle tax-bracket lesson), THEN bills, and what's left is savings.
// Bills are ~58% of pay, split into rent/food/phone/other, so a nicer job
// means a nicer (pricier) life too — but always leaves more to invest.
const billsFor = (pay) => {
  const total=Math.round(pay*0.58);
  const Home=Math.round(total*0.50), Food=Math.round(total*0.26), Phone=Math.round(total*0.11);
  return {Home, Food, Phone, Other: total-Home-Food-Phone};
};
const JOBS = [
  {id:"food",     icon:"🍔",  name:"Fast-Food Crew",     pay:120,  tax:0.10, school:"First job — no experience needed"},
  {id:"cashier",  icon:"🛒",  name:"Store Cashier",      pay:165,  tax:0.10, school:"A little on-the-job training"},
  {id:"cook",     icon:"🧑‍🍳", name:"Cook",               pay:210,  tax:0.10, school:"Learned in the kitchen"},
  {id:"firefighter",icon:"🚒",name:"Firefighter",        pay:260,  tax:0.12, school:"Fire academy + training"},
  {id:"police",   icon:"👮",  name:"Police Officer",     pay:300,  tax:0.12, school:"Police academy"},
  {id:"teacher",  icon:"🧑‍🏫", name:"Teacher",            pay:350,  tax:0.12, school:"4 years of college"},
  {id:"nurse",    icon:"👩‍⚕️", name:"Nurse",              pay:410,  tax:0.15, school:"Nursing school"},
  {id:"engineer", icon:"👷",  name:"Engineer",           pay:480,  tax:0.15, school:"College + lots of math"},
  {id:"coder",    icon:"🧑‍💻", name:"Software Developer", pay:560,  tax:0.18, school:"Computer science + coding"},
  {id:"lawyer",   icon:"👩‍⚖️", name:"Lawyer",             pay:700,  tax:0.18, school:"College + law school"},
  {id:"doctor",   icon:"🩺",  name:"Doctor",             pay:900,  tax:0.20, school:"10+ years of school"},
  {id:"astronaut",icon:"🚀",  name:"Astronaut",          pay:1150, tax:0.22, school:"Top science + years of training"},
  {id:"business", icon:"💼",  name:"Business Owner",      pay:1500, tax:0.25, school:"Runs their own company — the sky's the limit!"},
].map(j=>({...j, bills: billsFor(j.pay)}));
const BILL_ICON = {Home:"🏠",Food:"🍎",Phone:"📱",Other:"🚌"};
const jobTax   = (j) => Math.round(j.pay * (j.tax||0));               // tax taken out first
const jobBills = (j) => Object.values(j.bills).reduce((a,b)=>a+b,0);   // total bills
const jobSave  = (j) => j.pay - jobTax(j) - jobBills(j);              // left to invest each payday
// A promotion takes 2 invested paychecks. With paydays every 2 weeks, that's
// about 1 month per upgrade — a steady, not-too-fast climb up the ladder.
const promoNeed = () => 2;
const PAY_DAYS = 14;   // a fresh paycheck is ready every 2 weeks
// Surprise life events — a random one may hit on payday, eating into savings.
// This teaches WHY you keep an emergency fund: life throws curveballs!
const LIFE_EVENTS = [
  {emoji:"🚗", text:"Car repair!"},
  {emoji:"📱", text:"Cracked phone screen!"},
  {emoji:"🦷", text:"Surprise dentist visit!"},
  {emoji:"🐶", text:"Vet bill for your pet!"},
  {emoji:"🏠", text:"Leaky roof to fix!"},
  {emoji:"🤒", text:"Caught the flu — doctor visit!"},
  {emoji:"👟", text:"Outgrew your shoes!"},
];
// Old saves stored {job:'doctor',...}; new shape is index-based. Reset those.
const freshCareer = () => ({jobIndex:0, period:0, investsAtJob:0, awaitingInvest:false, awaitingAmt:0, lastEvent:null, lastPayday:"", emergency:0, totalSaved:0});
const migrateCareer = (c) => (c && typeof c.jobIndex==="number") ? {...c, jobIndex:Math.min(c.jobIndex, JOBS.length-1)} : freshCareer();

// ─── Challenge Rounds: a harder "Round 2" for each finished lesson ──────────
// These questions are tougher and deliberately CONNECT to earlier lessons, so
// kids have to remember (and sometimes re-read) what came before to answer.
// Passing pays the same cash again — extra money to invest — but you must
// clear it with 3 hearts, no wrong answers survive, so it takes real thought.
const LESSON_CHALLENGE = {
  money_basics:[
    {q:"Your friend says a $1 bill is valuable because it's made of something special. What's the REAL reason it's worth $1?",opts:["It's made of gold","Everyone AGREES it's worth $1, so you can swap it for things","The government mails you extra","It's shiny"],correct:1,why:"Money is a swap tool that only works because everyone agrees on its value — not what it's made of."},
    {q:"You have $10, spend $7 on a toy and $3 on a snack. A friend asks to borrow $2. What's true?",opts:["Sure — I have plenty left","Sorry, I spent it all; it's gone until I earn more","I'll just make more appear","Money never runs out"],correct:1,why:"Once money is spent it's gone until you earn more. Money runs out — spend carefully!"},
  ],
  needs_wants:[
    {q:"You have $12 (and remember — money runs out!). You need $8 for lunch this week, and a $10 toy is on sale. Smart move?",opts:["Buy the toy — it's on sale!","Cover the $8 lunch first, then see what's left","Borrow money for both","Spend all $12 on the toy"],correct:1,why:"Needs before wants. Lunch is a need, and since money runs out, cover it first — then enjoy wants with the rest."},
    {q:"Which shopping list puts NEEDS first?",opts:["Game, candy, then food if there's money","Food and a warm coat first, then a game if money's left","Only toys","Candy for every meal"],correct:1,why:"Food and clothing are needs — they come before wants like games. That's smart budgeting!"},
  ],
  earning:[
    {q:"You want a $40 game (a want) but have $0. Using what you know, the BEST plan is…",opts:["Wait for it to fall from the sky","Do chores/jobs to earn it, cover needs, then buy it","Take it from someone","Give up"],correct:1,why:"Money is earned by working. Earn it, cover your needs first, then buy your want."},
    {q:"Two kids want to earn more as grown-ups. Who probably will?",opts:["The one who never learns anything","The one who reads and learns useful skills","The one who sleeps all day","Nobody — earning is random"],correct:1,why:"Learning = earning. More skills → bigger jobs → more pay. You'll see this in your paycheck jobs too!"},
  ],
  saving_basics:[
    {q:"You earn $5 a week from chores and want a $40 Lego set. If you save it ALL, how long?",opts:["1 week","8 weeks","1 year","Never — saving doesn't work"],correct:1,why:"$40 ÷ $5 = 8 weeks. A little saved every week adds up to big things!"},
    {q:"Why is saving toward a GOAL easier than saving with no goal?",opts:["It isn't — goals don't matter","You can picture the thing and watch your jar fill toward it","Goals make money vanish","Grown-ups just say so"],correct:1,why:"A goal makes saving fun — you're watching your savings climb toward something you love!"},
  ],
  investing:[
    {q:"Saving $100 in a piggy bank keeps it $100. What can INVESTING that $100 do that saving can't?",opts:["Nothing different","Make your money grow by working for you","Make it vanish","Turn it into candy"],correct:1,why:"Saving keeps money safe but flat. Investing puts your money to WORK so it can grow — the big difference!"},
    {q:"You invest $5 to own HALF a lemonade stand. It earns $30 Saturday. How much is yours?",opts:["$5","$15","$30","Nothing"],correct:1,why:"You own half, so half of $30 = $15. Your money worked while you did nothing!"},
  ],
  when_buy:[
    {q:"You learned investing means owning a piece of a GOOD company. Its price drops 15% for no bad reason. A smart investor sees…",opts:["A disaster — sell everything","A SALE — a chance to own a good thing cheaper","A reason to panic","Nothing"],correct:1,why:"A temporary dip on a GOOD company is like a sale. Smart investors buy the discount!"},
    {q:"You have $100 to invest. Which is safest?",opts:["All $100 in ONE company","Spread across 4–5 different companies","Under your pillow","All in the riskiest one"],correct:1,why:"Don't put all eggs in one basket! Spreading out (diversifying) protects you if one drops."},
  ],
  when_sell:[
    {q:"You bought a stock on a dip (nice!). It's up +$30 on screen. When is that $30 REALLY yours?",opts:["Right now, it's on the screen","Only when you SELL and lock it in","When you tell friends","Never"],correct:1,why:"Profit is only real when you sell. Until then it's a number that can still drop."},
    {q:"A good company you own drops 10% in a day. The smart move is…",opts:["Panic sell everything","Stay calm — good companies usually bounce back higher","Buy a lottery ticket","Delete the app"],correct:1,why:"Don't panic sell! Good companies have dropped many times and come back. Patience wins."},
  ],
  crypto:[
    {q:"You have $1,000. What's the MOST you should put in crypto?",opts:["All $1,000","$100 (10%)","$800","$500"],correct:1,why:"The 10% rule! Never more than 10% in crypto — with $1,000 that's $100 max, no matter how excited you feel."},
    {q:"Why can Bitcoin rocket up AND crash down so fast?",opts:["It's backed by gold","Its value is what people BELIEVE it's worth, and only 21M exist","The government sets it","It never changes"],correct:1,why:"Like rare trading cards, crypto's price runs on belief and scarcity — exciting, but risky!"},
  ],
  charts:[
    {q:"A chart shows a stock zig-zagging UP over a year with lots of little dips. A patient investor sees the dips as…",opts:["Reasons to panic sell","Normal bumps on the way up — maybe even buying chances","Proof it's doomed","Boring"],correct:1,why:"Charts show ups AND downs. Little dips are normal — panic sellers lose, patient investors ride the trend."},
    {q:"The best way to use a chart is to…",opts:["Guess the future perfectly","See the overall trend and stay calm through normal ups and downs","Panic at every red day","Ignore it"],correct:1,why:"Charts show trends, not guarantees. Use them to spot the big picture and stay calm!"},
  ],
  options:[
    {q:"Options are powerful but risky. What's the golden rule before anything risky?",opts:["Bet everything","Never risk more than you can afford to lose","Borrow lots of money","Close your eyes and hope"],correct:1,why:"Options can multiply gains AND losses fast. Only ever risk a small amount you can afford to lose."},
    {q:"An option lets you…",opts:["Own a company forever for free","Make a time-limited bet on where a price will go","Guarantee you never lose","Get free money"],correct:1,why:"Options are time-limited bets on price. They can pay big or expire worthless — that's why they're advanced!"},
  ],
  risk:[
    {q:"Which portfolio is the LEAST risky?",opts:["100% in one crypto coin","Spread across 5 things, only ~10% in crypto","All in one meme stock","Everything in the hottest new thing"],correct:1,why:"Diversifying AND capping risky stuff like crypto at ~10% is how smart investors control risk."},
    {q:"You feel SUPER excited about a risky coin. Using your rules, you…",opts:["Put everything in — excitement means safe","Stick to the plan: a small slice (~10%), stay diversified","Ignore all rules","Bet your lunch money too"],correct:1,why:"Excitement isn't a strategy! Rules like the 10% cap and diversifying protect you from your own hype."},
  ],
  psychology:[
    {q:"Everyone online screams 'SELL, it's crashing!' You own good companies. A calm investor usually…",opts:["Panics and sells with the crowd","Stays calm — good companies have bounced back before","Buys 100% crypto","Deletes everything"],correct:1,why:"Fear spreads fast, but panic sellers usually lose. Staying calm through dips is a superpower!"},
    {q:"'FOMO' (fear of missing out) makes people…",opts:["Buy carefully after research","Rush to buy something just because it's hot, often at the top","Save more","Stay patient"],correct:1,why:"FOMO makes people buy high in a panic. Knowing your feelings keeps you from costly mistakes."},
  ],
  dca:[
    {q:"Dollar-cost averaging means investing the SAME amount on a regular schedule. Why is it smart?",opts:["You time the market perfectly","You buy more when it's cheap and less when it's pricey, stress-free","It guarantees profit","It isn't smart"],correct:1,why:"Investing a set amount regularly (like your paycheck slice!) auto-buys more on dips. A little, steadily, adds up."},
    {q:"Which is dollar-cost averaging?",opts:["Investing $25 every payday no matter the price","Dumping everything in one lucky day","Only buying when scared","Never investing"],correct:0,why:"Same amount, every payday — exactly what your Money Machine does for you!"},
  ],
  buy_hold:[
    {q:"You own a great company that wiggles up and down for months. The 'buy and hold' investor…",opts:["Sells the moment it dips","Holds patiently, letting it grow over years","Trades it every day","Panics constantly"],correct:1,why:"Buy and hold = patience. Time in the market beats jumping in and out. Let good companies grow!"},
    {q:"Why does frequent trading often BEAT you?",opts:["It doesn't — daily trading is best","Costs and bad timing add up, and you miss the big up-days","Holding is illegal","No reason"],correct:1,why:"Jumping in and out racks up costs and mistakes. Holding steady usually wins — like your Money Machine does!"},
  ],
  diversify_deep:[
    {q:"You have 10 'eggs' (dollars). The safest basket plan is…",opts:["All 10 in one basket","2 eggs in each of 5 baskets","10 baskets you can't see","Throw them all"],correct:1,why:"Spreading eggs across baskets means one drop won't lose it all. That's diversification!"},
    {q:"TRUE diversification means owning things that…",opts:["Are all the same company","Move differently, so they don't all crash together","Are all crypto","Are all one type"],correct:1,why:"Owning DIFFERENT kinds of things that don't all move together is what really protects you."},
  ],
  dividends:[
    {q:"A dividend is…",opts:["A fee you pay","A slice of profit a company pays you just for HOLDING its stock","A kind of chart","Free candy"],correct:1,why:"Dividends pay you to wait! Hold good dividend companies and they share profits with you."},
    {q:"How do dividends reward a 'buy and hold' investor?",opts:["They punish holding","The longer you hold, the more dividend payments you collect","They only pay if you sell fast","They don't"],correct:1,why:"Patience pays — literally. Hold longer, collect more. Dividends reward the buy-and-hold habit!"},
  ],
  index:[
    {q:"An index fund (like the S&P 500) lets you…",opts:["Own just one company","Own a tiny piece of hundreds of companies at once","Guarantee you never lose","Avoid investing"],correct:1,why:"An index fund is instant diversification — hundreds of companies in one buy! It's what your Money Machine uses."},
    {q:"Why do many smart grown-ups love index funds?",opts:["They're super risky","They're diversified, low-cost, and grow with the whole market over time","They need daily trading","They only lose"],correct:1,why:"Broadly diversified + low cost + long-term growth = why index investing is a favorite."},
  ],
  value_growth:[
    {q:"A 'value' investor is most like a shopper who…",opts:["Buys good things when they're ON SALE","Always pays the highest price","Never buys anything","Only buys the shiniest thing"],correct:0,why:"Value investing = buying good companies for less than they're worth. Like a sale — remember 'When to Buy'!"},
    {q:"A 'growth' investor bets on companies that…",opts:["Are shrinking","Are growing FAST and could be much bigger later","Never change","Are about to close"],correct:1,why:"Growth investors pay up for fast-growers hoping they get much bigger. Value hunts bargains — two smart paths!"},
  ],
  time_in_market:[
    {q:"Which usually wins?",opts:["Perfectly TIMING the market's ups and downs","TIME IN the market — staying invested for the long run","Panic selling often","Never investing"],correct:1,why:"'Time IN the market beats timing the market.' Nobody times it perfectly — staying invested wins over years!"},
    {q:"Missing just the market's few BEST days each year usually…",opts:["Helps you","Badly hurts your long-term returns","Doesn't matter","Doubles your money"],correct:1,why:"The best days often come right after scary drops. Panic sellers miss them — so stay invested!"},
  ],
  exit_strategy:[
    {q:"A 'take-profit' plan means you decide…",opts:["To never sell, ever","AHEAD of time the price where you'll sell to lock in gains","To sell in a panic","To ignore winners"],correct:1,why:"Planning your exit before emotions hit keeps you disciplined — lock in profit at a price you chose calmly."},
    {q:"A STOP-LOSS and a TAKE-PROFIT together help you…",opts:["Guarantee riches","Control your downside AND lock in gains, without panicking","Trade on feelings","Lose faster"],correct:1,why:"Stop-loss caps losses, take-profit locks gains — a calm plan beats emotional decisions every time!"},
  ],
};

// Difficulty tag for each lesson so kids (and parents) can see what's age-right.
// Starter = youngest money basics, Grow = core investing, Pro = advanced ideas.
const LESSON_LEVELS = {
  Starter:{label:"Starter",emoji:"🌱",color:"#22c55e",age:"Ages 8+"},
  Grow:{label:"Grow",emoji:"🌿",color:"#06b6d4",age:"Ages 10+"},
  Pro:{label:"Pro",emoji:"🌳",color:"#8b5cf6",age:"Ages 13+"},
};
const LESSON_LEVEL = {
  money_basics:"Starter", needs_wants:"Starter", earning:"Starter", saving_basics:"Starter",
  investing:"Grow", when_buy:"Grow", when_sell:"Grow", crypto:"Grow", charts:"Grow",
  risk:"Grow", dca:"Grow", buy_hold:"Grow", diversify_deep:"Grow", dividends:"Grow", index:"Grow",
  options:"Pro", psychology:"Pro", value_growth:"Pro", time_in_market:"Pro", exit_strategy:"Pro",
};
const levelOf=(id)=>LESSON_LEVELS[LESSON_LEVEL[id]]||LESSON_LEVELS.Grow;

// ─── The money course: 4 Levels (Levels 1–2 free, 3–4 are Toybox Plus) ──
const LEVEL_META = {
  1:{name:"Money Basics",  color:"#22c55e", age:"Ages 8+",  free:true},
  2:{name:"First Investor",color:"#06b6d4", age:"Ages 9+",  free:true},
  3:{name:"Smart Investor",color:"#8b5cf6", age:"Ages 11+", free:false},
  4:{name:"Pro Investor",  color:"#ec4899", age:"Ages 13+", free:false},
};
const LEVEL_OF = Object.fromEntries(CURRICULUM.map(c=>[c.id,c.level]));   // lessonId → 1..4
const COURSE_ORDER = CURRICULUM.map(c=>c.id);                            // lesson ids in course order

// ─── Daily stories ─────────────────────────────────
const DAILY_STORIES = [
  {icon:"🍎",title:"Why might a stock like Apple go UP?",color:"#6366f1",
   body:"Imagine Apple makes a cool new iPhone that everyone wants. Lots of people want to own a piece of Apple, so they buy the stock — and the price goes UP! Big exciting news that moves a price like this has a name: a 'catalyst'.",
   lesson:"💡 Good news = more buyers = higher price. Always ask WHY a stock is moving!"},
  {icon:"🎮",title:"Why might a game company like Roblox jump?",color:"#ec4899",
   body:"Imagine WAY more kids start playing Roblox than anyone expected. More players buy more Robux, so the company makes more money. That good surprise makes people want the stock — so the price jumps up fast!",
   lesson:"💡 When a company does BETTER than expected, the price often jumps. Fun surprise!"},
  {icon:"📉",title:"Why might the WHOLE market drop at once?",color:"#ef4444",
   body:"Sometimes borrowing money gets more expensive for everyone. Companies then keep less money, so lots of people sell their stocks at the same time — and almost EVERY price drops together.",
   lesson:"💡 Some big changes push ALL stocks down at once. That's called a 'macro event' — it touches everything!"},
  {icon:"₿",title:"Why might Bitcoin crash overnight?",color:"#f59e0b",
   body:"Imagine a big crypto app breaks and people can't get their money out. Everyone gets scared and sells their Bitcoin super fast. Lots of scared selling = the price crashes down quickly.",
   lesson:"💡 Crypto can drop FAST because it runs on feelings, not real toys or products. Be careful!"},
  {icon:"🦈",title:"What is a short squeeze?",color:"#8b5cf6",
   body:"Some traders BET that a stock will go DOWN by 'short selling' it. But if the stock goes UP instead, they panic-buy to stop their losses. All that panic buying makes the stock go up EVEN MORE. It's a squeeze!",
   lesson:"💡 GameStop went from $4 to $483 in 2021 because of a short squeeze. Regular investors made fortunes overnight!"},
];

// ─── Siblings (for challenges) ─────────────────────
const SIBLINGS = [
  {id:"s1",name:"Sam",  avatar:"🦁",color:"#ec4899",cash:850,portPnl:+120,lastActive:"2h ago"},
  {id:"s2",name:"Riley",avatar:"⚡",color:"#10b981",cash:1200,portPnl:-45, lastActive:"1h ago"},
];

// ─── LB data ───────────────────────────────────────
const LB_BASE = [
  {name:"Jordan",val:12847,avatar:"🏆",chg:"+8.2%",up:true},
  {name:"Taylor",val:9650, avatar:"🦋",chg:"+3.1%",up:true},
  {name:"Morgan",val:8420, avatar:"🐯",chg:"-1.4%",up:false},
  {name:"Riley", val:7830, avatar:"⚡",chg:"+0.9%",up:true},
  {name:"Casey", val:6200, avatar:"🌟",chg:"-2.1%",up:false},
];

// ─── Spin prizes ───────────────────────────────────
// ─── Daily login bonus ladder (7-day cycle) ─────────
// Escalating rewards for coming back each day. Day 7 is the jackpot, unlocked
// only if a lesson was done in the past week (learning pulls the reward).
const DAILY_BONUS = [
  {coins:20},
  {coins:40},
  {coins:60, tokens:1},
  {coins:90},
  {coins:100, card:1},
  {coins:150},
  {coins:300, cash:100, card:1, jackpot:true},
];

const SPIN_PRIZES = [
  {label:"50 Coins",   icon:"🪙",  type:"coins",  val:50},
  {label:"$25 Cash",   icon:"💵",  type:"cash",   val:25},
  {label:"100 XP",     icon:"⚡",  type:"xp",     val:100},
  {label:"Rare Card!", icon:"✨",  type:"card",   val:1},
  {label:"25 Coins",   icon:"🪙",  type:"coins",  val:25},
  {label:"$10 Cash",   icon:"💵",  type:"cash",   val:10},
  {label:"200 XP",     icon:"⚡",  type:"xp",     val:200},
  {label:"75 Coins",   icon:"🪙",  type:"coins",  val:75},
];

// ─── Coin Shop items (cosmetic only — coins are for FUN) ───
const SHOP_ITEMS = [
  {id:"theme_neon",   icon:"🌃", name:"Neon Theme",        desc:"Unlock the Neon Cyberpunk look",       cost:200, type:"theme"},
  {id:"theme_ocean",  icon:"🌊", name:"Ocean Theme",       desc:"Unlock the Underwater World look",      cost:200, type:"theme"},
  {id:"theme_sunset", icon:"🌅", name:"Sunset Theme",      desc:"Warm pink sunset vibes",                cost:200, type:"theme"},
  {id:"theme_candy",  icon:"🍭", name:"Candy Theme",       desc:"Sweet candy-land colors",               cost:200, type:"theme"},
  {id:"theme_lava",   icon:"🌋", name:"Volcano Theme",     desc:"Fiery orange volcano look",             cost:250, type:"theme"},
  {id:"theme_gold",   icon:"✨", name:"Golden Theme",      desc:"Shiny gold luxury look",                cost:400, type:"theme"},
  {id:"avatar_dragon",icon:"🐉", name:"Dragon Avatar",     desc:"A legendary dragon profile icon",       cost:150, type:"avatar"},
  {id:"avatar_unicorn",icon:"🦄",name:"Unicorn Avatar",    desc:"A magical unicorn profile icon",        cost:150, type:"avatar"},
  {id:"avatar_robot", icon:"🤖", name:"Robot Avatar",      desc:"A cool robot profile icon",             cost:150, type:"avatar"},
  {id:"avatar_alien", icon:"👽", name:"Alien Avatar",      desc:"An out-of-this-world profile icon",     cost:150, type:"avatar"},
  {id:"avatar_ninja", icon:"🥷", name:"Ninja Avatar",      desc:"A stealthy ninja profile icon",         cost:150, type:"avatar"},
  {id:"avatar_wizard",icon:"🧙", name:"Wizard Avatar",     desc:"A magical wizard profile icon",         cost:150, type:"avatar"},
  {id:"avatar_king",  icon:"🤴", name:"Prince Avatar",     desc:"A royal profile icon",                  cost:200, type:"avatar"},
  {id:"avatar_star",  icon:"🌟", name:"Superstar Avatar",  desc:"Shine bright like a star",              cost:300, type:"avatar"},
  {id:"pet_hat",      icon:"🎩", name:"Top Hat for Pet",   desc:"Dress up your trading buddy",           cost:100, type:"cosmetic"},
  {id:"pet_crown",    icon:"👑", name:"Crown for Pet",     desc:"Make your buddy royalty",               cost:250, type:"cosmetic"},
  {id:"frame_gold",   icon:"🏅", name:"Gold Name Frame",   desc:"Golden glow around your leaderboard name",cost:300,type:"cosmetic"},
  {id:"streak_freeze",icon:"🧊", name:"Streak Freeze",     desc:"Protects your streak if you miss 1 day", cost:120, type:"powerup"},
  {id:"extra_token",  icon:"⚡", name:"Extra Trade Token", desc:"One bonus trade for today",             cost:80,  type:"powerup", consumable:true},
];

// ─── Achievement badges ───
const BADGES = [
  {id:"first_trade", icon:"🥇", name:"First Trade",     desc:"Made your very first investment",        check:s=>s.trades>=1},
  {id:"first_lesson",icon:"🎓", name:"Quick Learner",   desc:"Completed your first lesson",            check:s=>s.lessons>=1},
  {id:"diversified", icon:"🧺", name:"Diversified",     desc:"Own 3 or more different assets",          check:s=>s.assets>=3},
  {id:"scholar",     icon:"📚", name:"Scholar",         desc:"Completed all lessons",                  check:s=>s.lessons>=LESSONS.length},
  {id:"high_roller", icon:"💎", name:"High Roller",     desc:"Grew your garden past $1,500",           check:s=>s.value>=1500},
  {id:"profit_maker",icon:"📈", name:"Profit Maker",    desc:"Made your first profitable sell",        check:s=>s.profitableSells>=1},
  {id:"streak_star", icon:"🔥", name:"Streak Star",     desc:"Logged in 7 days in a row",              check:s=>s.streak>=7},
  {id:"card_collector",icon:"🎴",name:"Card Collector", desc:"Earned 5 investment cards",              check:s=>s.cards>=5},
  {id:"fortune_teller",icon:"🔮",name:"Fortune Teller", desc:"Made 3 price predictions",               check:s=>s.predictions>=3},
  {id:"big_brain",   icon:"🧠", name:"Big Brain",       desc:"Reached Level 5",                        check:s=>s.level>=5},
];

// ─── Starter buddies (Pokémon-style companions) ───
const STARTERS = [
  {id:"flame", emoji:"🦊", name:"Fennix",  type:"Fire",  color:"#f97316", glow:"#fb923c", blurb:"A fiery fox who loves a winning streak!"},
  {id:"leaf",  emoji:"🐲", name:"Sproutle",type:"Leaf",  color:"#10b981", glow:"#34d399", blurb:"A leafy dragon that grows with your garden!"},
  {id:"spark", emoji:"⚡", name:"Voltik",  type:"Spark", color:"#eab308", glow:"#fde047", blurb:"A zappy bolt-buddy full of energy!"},
  {id:"aqua",  emoji:"🐢", name:"Shellby", type:"Aqua",  color:"#06b6d4", glow:"#67e8f9", blurb:"A chill turtle who stays calm in a crash!"},
  {id:"mystic",emoji:"🦄", name:"Lumina",  type:"Mystic",color:"#a855f7", glow:"#c4b5fd", blurb:"A magical unicorn with rare instincts!"},
];



// ═══════════════════════════════════════════════════
// CSS
// ═══════════════════════════════════════════════════
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@400;600;700;800;900&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
:root{--fd:'Fredoka One',cursive;--fb:'Nunito',sans-serif;--r:14px;--rl:22px}
body{font-family:var(--fb);overflow:hidden}
body[data-flow="auth-mid"] #tbx-sync-btn,body[data-flow="auth-mid"] #tbx-push-btn{display:none!important}
body[data-kid="1"] #tbx-sync-btn,body[data-kid="1"] #tbx-push-btn{display:none!important}
@keyframes fabIn{from{opacity:0;transform:translateY(10px) scale(.9)}to{opacity:1;transform:none}}
.app{height:100vh;height:100dvh;width:100vw;overflow:hidden;position:relative}

/* Stars */
.stars{position:fixed;inset:0;overflow:hidden;z-0;pointer-events:none}
.star{position:absolute;border-radius:50%;background:#fff;animation:twinkle linear infinite}
@keyframes twinkle{0%,100%{opacity:.1}50%{opacity:.65}}

/* ── Auth screens ── */
.page{height:100vh;height:100dvh;width:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;overflow-y:auto;-webkit-overflow-scrolling:touch;position:relative;z-index:1}
.card{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);border-radius:var(--rl);padding:28px 22px;width:100%;max-width:400px;backdrop-filter:blur(20px)}
.dots{display:flex;gap:7px;justify-content:center;margin-bottom:20px}
.dot{height:6px;border-radius:100px;background:rgba(255,255,255,.2);transition:all .3s}
.dot.on{background:#fff;width:22px}.dot:not(.on){width:6px}
.ttl{font-family:var(--fd);font-size:22px;color:#fff;margin-bottom:8px;line-height:1.2;text-align:center}
.sub{font-size:13px;color:rgba(255,255,255,.65);font-weight:600;line-height:1.7;margin-bottom:16px;text-align:center}
.inp{width:100%;padding:13px 15px;border-radius:13px;font-family:var(--fb);font-size:15px;font-weight:700;outline:none;margin-bottom:10px;background:rgba(255,255,255,.1);border:1.5px solid rgba(255,255,255,.2);color:#fff;transition:all .2s}
.inp:focus{border-color:rgba(255,255,255,.5);background:rgba(255,255,255,.15)}
.inp::placeholder{color:rgba(255,255,255,.4)}
.lbl{font-size:12px;font-weight:800;color:rgba(255,255,255,.7);margin-bottom:5px}
.btn{width:100%;padding:15px;border-radius:14px;border:none;font-family:var(--fd);font-size:16px;cursor:pointer;transition:all .2s;margin-top:6px}
.btn:active{transform:scale(.97)}.btn:disabled{opacity:.4;cursor:not-allowed;transform:none}
.btn-w{background:#fff;color:#1e1b4b;box-shadow:0 4px 14px rgba(0,0,0,.15)}
.btn-p{background:linear-gradient(135deg,#7c3aed,#9333ea);color:#fff;box-shadow:0 4px 14px rgba(124,58,237,.4)}
.btn-g{background:linear-gradient(135deg,#047857,#10b981);color:#fff;box-shadow:0 4px 14px rgba(4,120,87,.35)}
.btn-link{background:none;border:none;color:rgba(255,255,255,.4);font-size:12px;font-weight:700;cursor:pointer;font-family:var(--fb);padding:8px;display:block;text-align:center;width:100%}
.role-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}
.role-btn{border-radius:var(--rl);padding:26px 14px;border:2px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);cursor:pointer;text-align:center;transition:all .22s;color:#fff}
.role-btn:active{transform:scale(.96)}.role-btn:hover{border-color:rgba(255,255,255,.3);background:rgba(255,255,255,.11)}
.role-icon{font-size:46px;display:block;margin-bottom:9px}
.role-title{font-family:var(--fd);font-size:16px;margin-bottom:4px}
.role-sub{font-size:11px;color:rgba(255,255,255,.5);font-weight:600;line-height:1.4}
.av-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:12px}
.av-opt{aspect-ratio:1;border-radius:12px;border:2px solid rgba(255,255,255,.1);background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;font-size:25px;cursor:pointer;transition:all .2s}
.av-opt:active{transform:scale(.9)}.av-opt.sel{border-color:#fff;background:rgba(255,255,255,.2);transform:scale(1.08)}
.age-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}
.age-btn{padding:12px 4px;border-radius:11px;border:2px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:rgba(255,255,255,.7);font-family:var(--fd);font-size:15px;cursor:pointer;transition:all .2s;text-align:center}
.age-btn.sel{border-color:#fff;background:rgba(255,255,255,.2);color:#fff}
.age-btn:active{transform:scale(.94)}
.theme-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
.theme-opt{border-radius:13px;padding:14px 10px;border:2px solid rgba(255,255,255,.1);cursor:pointer;text-align:center;transition:all .2s}
.theme-opt.sel{border-color:#fff;box-shadow:0 0 0 3px rgba(255,255,255,.18)}
.theme-opt:active{transform:scale(.96)}
.theme-dot{width:24px;height:24px;border-radius:50%;margin:0 auto 7px;box-shadow:0 3px 8px rgba(0,0,0,.4)}
.theme-lbl{font-size:11px;font-weight:800;color:#fff}
.pin-dots{display:flex;gap:12px;justify-content:center;margin:14px 0}
.pin-dot{width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.35);transition:all .2s}
.pin-dot.filled{background:#fff;border-color:#fff;box-shadow:0 0 8px rgba(255,255,255,.4)}
.pin-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.pin-btn{padding:16px;border-radius:14px;border:1px solid rgba(255,255,255,.17);background:rgba(255,255,255,.09);color:#fff;font-family:var(--fd);font-size:20px;cursor:pointer;transition:all .2s}
.pin-btn:active{background:rgba(255,255,255,.25);transform:scale(.94)}
.pin-btn.del{font-size:16px;color:rgba(255,255,255,.6)}
.pin-err{color:#fca5a5;font-size:12px;font-weight:700;text-align:center;margin-top:8px;animation:shake .4s}
@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}
.twofa-row{display:flex;gap:8px;justify-content:center;margin:14px 0}
.twofa-inp{width:42px;height:52px;border-radius:12px;border:2px solid rgba(255,255,255,.2);background:rgba(255,255,255,.1);color:#fff;font-family:var(--fd);font-size:22px;text-align:center;outline:none;transition:all .2s}
.twofa-inp:focus{border-color:#fff;background:rgba(255,255,255,.18)}
.twofa-inp.filled{border-color:rgba(255,255,255,.5)}
.email-code-box.tap-ready{animation:tapPulse 1.3s ease-in-out infinite}
@keyframes tapPulse{0%,100%{box-shadow:0 0 0 0 rgba(124,58,237,.45)}50%{box-shadow:0 0 0 7px rgba(124,58,237,0)}}
.email-pop{background:rgba(255,255,255,.96);border-radius:var(--rl);overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.3);margin-top:14px;animation:popUp .4s cubic-bezier(.34,1.56,.64,1)}
.email-hd{background:linear-gradient(135deg,#1d4ed8,#2563eb);padding:11px 15px;display:flex;align-items:center;gap:8px}
.email-logo{width:26px;height:26px;border-radius:6px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0}
.email-bd{padding:14px}
.email-sub{font-size:13px;font-weight:800;color:#1e1b4b;margin-bottom:8px}
.email-txt{font-size:11px;font-weight:600;color:#4b5563;line-height:1.6;margin-bottom:12px}
.email-code-box{background:linear-gradient(135deg,#f5f0ff,#ede9fe);border:2px solid rgba(124,58,237,.2);border-radius:13px;padding:14px;text-align:center;margin-bottom:8px}
.email-code{font-family:var(--fd);font-size:34px;color:#7c3aed;letter-spacing:8px}
.email-foot{font-size:10px;color:#9ca3af;font-weight:600;text-align:center}
.sec-badge{background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.25);border-radius:12px;padding:11px 13px;margin-bottom:12px;display:flex;gap:8px;font-size:12px;font-weight:700;color:rgba(255,255,255,.85);line-height:1.5}
.profiles-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}
.prof-card{background:rgba(255,255,255,.07);border:2px solid rgba(255,255,255,.1);border-radius:var(--rl);padding:16px 12px;text-align:center;cursor:pointer;transition:all .2s}
.prof-card:active{transform:scale(.96)}.prof-card:hover{border-color:rgba(255,255,255,.28);background:rgba(255,255,255,.11)}
.prof-av{font-size:42px;display:block;margin-bottom:7px}
.prof-nm{font-family:var(--fd);font-size:14px;color:#fff}
.prof-sub{font-size:10px;color:rgba(255,255,255,.45);font-weight:700;margin-top:2px}
.prof-new{border-style:dashed;border-color:rgba(255,255,255,.22);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;padding:24px 12px}
.celebrate-ov{position:fixed;inset:0;z-index:500;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;padding:24px}
.conf-wrap{position:fixed;inset:0;pointer-events:none;overflow:hidden}
.conf-p{position:absolute;border-radius:2px;animation:confFall linear infinite}
@keyframes confFall{0%{transform:translateY(-20px) rotate(0);opacity:1}100%{transform:translateY(110vh) rotate(720deg);opacity:0}}

/* ── Dashboard shell ── */
.dash{height:100vh;height:100dvh;display:flex;flex-direction:column;overflow:hidden;position:relative;z-index:1}
.topbar{display:flex;align-items:center;padding:11px 14px;border-bottom:1px solid rgba(255,255,255,.09);background:rgba(0,0,0,.3);backdrop-filter:blur(16px);flex-shrink:0;gap:10px;z-index:20;position:relative}
.tb-av{width:36px;height:36px;border-radius:11px;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0}
.tb-name{font-family:var(--fd);font-size:15px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tb-sub{font-size:10px;color:rgba(255,255,255,.5);font-weight:700}
.tb-right{display:flex;align-items:center;gap:6px;flex-shrink:0}
.tb-chip{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);border-radius:100px;padding:5px 11px;font-size:12px;font-weight:800;color:#fff;white-space:nowrap}
.tb-chip.gold{color:#f59e0b}.tb-chip.fire{color:#fb923c}
.main{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:14px 14px calc(84px + env(safe-area-inset-bottom,0px));scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.1) transparent}
.bnav{display:flex;position:fixed;bottom:0;left:0;right:0;height:64px;background:rgba(0,0,0,.7);border-top:1px solid rgba(255,255,255,.1);backdrop-filter:blur(20px);z-index:50;padding-bottom:env(safe-area-inset-bottom,0px)}
.bnav-btn{flex:1;border:none;background:transparent;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;color:rgba(255,255,255,.35);font-family:var(--fb);font-size:9px;font-weight:800;position:relative}
.bnav-btn .bni{font-size:22px;transition:transform .2s}
.bnav-btn.on{color:#fff}.bnav-btn.on .bni{transform:scale(1.18);filter:drop-shadow(0 2px 6px rgba(255,255,255,.35))}
.bnav-btn.on::after{content:'';position:absolute;top:0;left:22%;right:22%;height:3px;border-radius:0 0 4px 4px;background:#fff}

/* ── Tour overlay ── */
.tour-ov{position:fixed;inset:0;z-index:400;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding:0 0 80px}
.tour-bg{position:absolute;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(4px)}
.tour-card{background:linear-gradient(135deg,#1a0e3a,#0d1a2e);border:2px solid rgba(124,58,237,.4);border-radius:24px;padding:26px 22px;width:calc(100% - 32px);max-width:400px;position:relative;z-index:1;animation:popUp .4s cubic-bezier(.34,1.56,.64,1)}

/* ── Stock alert toast ── */
.alert-toast{position:fixed;top:0;left:0;right:0;z-index:300;padding:10px 14px;display:flex;align-items:center;gap:10px;animation:slideDown .4s ease;font-size:13px;font-weight:800}
@keyframes slideDown{from{transform:translateY(-100%);opacity:0}to{transform:translateY(0);opacity:1}}
.alert-toast.up{background:rgba(4,120,87,.95);color:#86efac}
.alert-toast.dn{background:rgba(185,28,28,.95);color:#fca5a5}

/* ── Pet mascot ── */
.pet-card{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:14px;display:flex;align-items:center;gap:12px;margin-bottom:12px}
.pet-em{font-size:42px;animation:float 2.8s ease-in-out infinite}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
.pet-bubble{background:rgba(255,255,255,.1);border-radius:100px;padding:6px 13px;font-size:12px;font-weight:700;color:rgba(255,255,255,.85)}

/* ── Spin wheel ── */
.wheel-wrap{position:relative;width:220px;height:220px;margin:0 auto 16px}
.wheel{width:100%;height:100%;border-radius:50%;position:relative;transition:transform 4s cubic-bezier(.17,.67,.12,.99);border:4px solid rgba(255,255,255,.3);box-shadow:0 0 30px rgba(124,58,237,.4)}
.wheel-pointer{position:absolute;top:-14px;left:50%;transform:translateX(-50%);font-size:22px;z-index:2;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))}
.spin-btn{width:100%;padding:15px;border-radius:14px;border:none;background:linear-gradient(135deg,#7c3aed,#9333ea);color:#fff;font-family:var(--fd);font-size:17px;cursor:pointer;box-shadow:0 4px 18px rgba(124,58,237,.5)}
.spin-btn:disabled{opacity:.4;cursor:not-allowed}
.spin-btn:active{transform:scale(.97)}

/* ── Collectible cards ── */
.cards-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(min-width:480px){.cards-grid{grid-template-columns:repeat(3,1fr)}}
.inv-card{border-radius:16px;padding:16px;position:relative;overflow:hidden;cursor:pointer;transition:all .25s}
.inv-card:active{transform:scale(.96)}
.inv-card.holo{box-shadow:0 0 20px rgba(124,58,237,.4),0 0 40px rgba(6,182,212,.2)}
.inv-card::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,.1),rgba(0,0,0,.06))}
.card-shine{position:absolute;top:-50%;left:-50%;width:200%;height:200%;background:linear-gradient(45deg,transparent 40%,rgba(255,255,255,.08) 50%,transparent 60%);animation:shine 3s ease-in-out infinite;pointer-events:none}
@keyframes shine{0%,100%{transform:translateX(-100%) rotate(45deg)}50%{transform:translateX(100%) rotate(45deg)}}
.card-tier{position:absolute;top:9px;right:9px;font-size:9px;font-weight:800;padding:2px 7px;border-radius:100px;text-transform:uppercase;background:rgba(0,0,0,.25);color:rgba(255,255,255,.75)}
.card-ic{font-size:32px;display:block;margin-bottom:6px}
.card-nm{font-family:var(--fd);font-size:14px;color:#fff;margin-bottom:3px}
.card-pnl{font-size:12px;font-weight:800}

/* ── Adventure map ── */
.map-wrap{position:relative;padding:10px 0 20px}
.map-path{position:absolute;left:50%;top:0;bottom:0;width:3px;background:linear-gradient(to bottom,rgba(255,255,255,.05),rgba(255,255,255,.12),rgba(255,255,255,.05));transform:translateX(-50%)}
.map-node{display:flex;align-items:center;gap:14px;margin-bottom:22px;position:relative;z-index:1}
.map-node.right{flex-direction:row-reverse}
.map-circle{width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;transition:all .3s;border:3px solid transparent}
.map-circle.done{border-color:#10b981;background:linear-gradient(135deg,#047857,#10b981);box-shadow:0 0 0 4px rgba(16,185,129,.15)}
.map-circle.curr{border-color:#7c3aed;background:linear-gradient(135deg,#7c3aed,#9333ea);box-shadow:0 0 0 4px rgba(124,58,237,.2);animation:pulse 2s ease-in-out infinite}
.map-circle.lock{border-color:rgba(255,255,255,.1);background:rgba(255,255,255,.06)}
@keyframes pulse{0%,100%{box-shadow:0 0 0 4px rgba(124,58,237,.2)}50%{box-shadow:0 0 0 8px rgba(124,58,237,.1),0 0 20px rgba(124,58,237,.3)}}
.map-content{flex:1;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:12px 14px;transition:all .2s}
.map-content.curr{border-color:rgba(124,58,237,.35);background:rgba(124,58,237,.1)}
.map-content.done{border-color:rgba(16,185,129,.25);background:rgba(16,185,129,.07)}
.map-island{font-size:10px;font-weight:800;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px}
.map-title{font-family:var(--fd);font-size:14px;color:#fff;margin-bottom:3px}
.map-rewards{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px}
.map-rew-chip{font-size:9px;font-weight:800;padding:2px 7px;border-radius:100px}

/* ── Challenge card ── */
.challenge-card{background:linear-gradient(135deg,rgba(124,58,237,.15),rgba(6,182,212,.08));border:2px solid rgba(124,58,237,.3);border-radius:var(--rl);padding:18px;margin-bottom:12px}
.vs-row{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.vs-player{flex:1;text-align:center}
.vs-badge{font-size:11px;font-weight:800;padding:3px 10px;border-radius:100px;margin-top:4px;display:inline-block}
.vs-label{font-size:11px;font-weight:800;padding:6px 10px;border-radius:100px;background:rgba(255,255,255,.1);color:rgba(255,255,255,.6)}
.challenge-bar{height:10px;background:rgba(255,255,255,.08);border-radius:100px;overflow:hidden;position:relative}
.challenge-fill{height:100%;border-radius:100px;position:absolute;top:0;transition:width .8s ease}

/* ── Club ── */
.club-pool{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:var(--rl);padding:18px;margin-bottom:12px}
.member-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.07)}
.member-row:last-child{border-bottom:none;padding-bottom:0}

/* ── Predictions ── */
.pred-card{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:var(--rl);padding:16px;margin-bottom:12px}
.pred-btns{display:flex;gap:10px;margin-top:12px}
.pred-btn-up{flex:1;padding:13px;border-radius:13px;border:none;background:linear-gradient(135deg,#047857,#10b981);color:#fff;font-family:var(--fd);font-size:15px;cursor:pointer}
.pred-btn-dn{flex:1;padding:13px;border-radius:13px;border:none;background:linear-gradient(135deg,#b91c1c,#ef4444);color:#fff;font-family:var(--fd);font-size:15px;cursor:pointer}
.pred-btn-up:active,.pred-btn-dn:active{transform:scale(.97)}

/* ── Report card ── */
.report-star{font-size:32px;margin-bottom:4px}
.report-grade{font-family:var(--fd);font-size:48px;margin-bottom:4px}
.stat-row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.07);font-size:13px;font-weight:700;color:rgba(255,255,255,.75)}
.stat-row:last-child{border-bottom:none}
.stat-row .val{font-family:var(--fd);font-size:15px;color:#fff}

/* ── Lesson modal ── */
.lesson-ov{position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px}
.lesson-modal{background:#111827;border:1px solid rgba(124,58,237,.3);border-radius:var(--rl);width:100%;max-width:440px;overflow:hidden;animation:popUp .4s cubic-bezier(.34,1.56,.64,1)}
.lesson-prog{height:5px;background:rgba(255,255,255,.08)}.lesson-prog-fill{height:100%;transition:width .3s}
.lesson-body{padding:22px 20px}
.lesson-ic{font-size:50px;text-align:center;display:block;margin-bottom:12px;animation:popUp .35s ease}
.lesson-title{font-family:var(--fd);font-size:19px;color:#fff;text-align:center;margin-bottom:10px}
.lesson-txt{font-size:13px;color:rgba(255,255,255,.68);font-weight:600;line-height:1.75;text-align:center}
.lesson-ex{border-radius:12px;padding:12px;margin-top:13px;font-size:12px;font-weight:700;text-align:left;line-height:1.5}
.lesson-footer{padding:0 20px 20px;display:flex;gap:9px}
.lesson-back{flex:1;padding:12px;border-radius:14px;border:1.5px solid rgba(255,255,255,.15);background:transparent;color:rgba(255,255,255,.5);font-family:var(--fd);font-size:14px;cursor:pointer}
.lesson-next{flex:2;padding:12px;border-radius:14px;border:none;color:#fff;font-family:var(--fd);font-size:14px;cursor:pointer}
.lesson-next:active,.lesson-back:active{transform:scale(.97)}

/* ── Trade modal ── */
.trade-ov{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:100;display:flex;align-items:flex-end;justify-content:center}
.trade-modal{background:#111827;border:1px solid rgba(124,58,237,.3);border-radius:22px 22px 0 0;padding:22px 18px;width:100%;max-width:520px;padding-bottom:calc(22px + env(safe-area-inset-bottom,0px));animation:slideUp .32s cubic-bezier(.34,1.56,.64,1)}
@keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes popUp{from{transform:scale(.85) translateY(20px);opacity:0}to{transform:scale(1) translateY(0);opacity:1}}
/* ── Adventure game animations ── */
@keyframes buddyIdle{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-6px) scale(1.03)}}
@keyframes buddyHop{0%{transform:translateY(0)}30%{transform:translateY(-34px) scale(1.1,.9)}55%{transform:translateY(-10px)}100%{transform:translateY(0)}}
@keyframes buddyCheer{0%,100%{transform:translateY(0) rotate(0)}25%{transform:translateY(-18px) rotate(-12deg)}50%{transform:translateY(-26px) rotate(0)}75%{transform:translateY(-18px) rotate(12deg)}}
@keyframes buddySad{0%,100%{transform:translateX(0) rotate(0)}20%{transform:translateX(-7px) rotate(-7deg)}40%{transform:translateX(7px) rotate(7deg)}60%{transform:translateX(-5px) rotate(-5deg)}80%{transform:translateX(5px) rotate(5deg)}}
@keyframes coinFly{0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(var(--cx,0),-120px) scale(.4);opacity:0}}
@keyframes screenShake{0%,100%{transform:translate(0,0)}20%{transform:translate(-8px,4px)}40%{transform:translate(8px,-4px)}60%{transform:translate(-6px,2px)}80%{transform:translate(6px,-2px)}}
@keyframes redFlash{0%{opacity:0}30%{opacity:.55}100%{opacity:0}}
@keyframes pathGlow{0%,100%{box-shadow:0 0 0 0 rgba(255,255,255,.0)}50%{box-shadow:0 0 16px 3px var(--gl,rgba(124,58,237,.5))}}
@keyframes confettiPop{0%{transform:translateY(0) rotate(0);opacity:1}100%{transform:translateY(-140px) rotate(360deg);opacity:0}}
@keyframes dustPuff{0%{transform:scale(.4);opacity:.7}100%{transform:scale(1.6);opacity:0}}
.shake{animation:screenShake .4s ease}
.game-buddy{font-size:54px;display:inline-block;filter:drop-shadow(0 6px 10px rgba(0,0,0,.4))}
.game-buddy.idle{animation:buddyIdle 2.2s ease-in-out infinite}
.game-buddy.hop{animation:buddyHop .55s cubic-bezier(.34,1.56,.64,1)}
.game-buddy.cheer{animation:buddyCheer .7s ease}
.game-buddy.sad{animation:buddySad .5s ease}
.handle{width:36px;height:4px;border-radius:100px;background:rgba(255,255,255,.15);margin:0 auto 16px}
.qty-row{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.qty-btn{width:48px;height:48px;border-radius:13px;border:1.5px solid rgba(255,255,255,.15);background:rgba(255,255,255,.08);color:#fff;font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s}
.qty-btn:active{background:rgba(124,58,237,.4);border-color:rgba(124,58,237,.6)}
.success-ov{position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:200;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;padding:24px;text-align:center}
.reward-ov{position:fixed;inset:0;background:rgba(0,0,0,.93);z-index:250;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;padding:24px;text-align:center}

/* ── More drawer ── */
.drawer-ov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:80;display:flex;align-items:flex-end}
.drawer{background:rgba(15,10,30,.95);border-radius:22px 22px 0 0;width:100%;padding:20px 16px;padding-bottom:calc(16px + env(safe-area-inset-bottom,0px));animation:slideUp .28s ease;backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.1)}
.drawer-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px}
.drawer-btn{border:1px solid rgba(255,255,255,.1);border-radius:var(--r);padding:14px 8px;background:rgba(255,255,255,.06);cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;font-family:var(--fb);font-size:10px;font-weight:800;color:rgba(255,255,255,.75);transition:all .2s}
.drawer-btn:active{transform:scale(.96)}.drawer-btn .di{font-size:26px}
.drawer-btn.on{border-color:rgba(255,255,255,.3);background:rgba(255,255,255,.14);color:#fff}
.news-card{border-radius:var(--rl);padding:16px;margin-bottom:12px}
`;

// ═══════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════
export default function ToyboxApp() {
  const [screen,    setScreen]    = useState(()=>{ try{ return localStorage.getItem("toybox:started")?"role_select":"landing"; }catch(e){ return "landing"; } });
  const [kids,      setKids]      = useState([]);
  const [regData,   setRegData]   = useState({});
  const [loginKid,  setLoginKid]  = useState(null);
  const [twoFACode, setTwoFACode] = useState("");
  const [authUser,  setAuthUser]  = useState(null);
  const [savedState,setSavedState]= useState(null);  // loaded kid state for resume
  const [bgTheme,   setBgTheme]   = useState(THEMES[0]);
  const [loaded,    setLoaded]    = useState(false);
  const [famPremium,setFamPremium]= useState(false);   // Toybox Plus (family flag)
  const [kidLimit,  setKidLimit]  = useState(false);    // "1 kid on free plan" modal

  // Load registered kids + premium flag from storage on first load
  useEffect(()=>{ (async()=>{
    const reg = await loadData(KIDS_KEY);
    if(reg && Array.isArray(reg)) setKids(reg);
    const r = await loadData("toybox:family:premium");
    setFamPremium(r===true||r==="1"||r===1);
    setLoaded(true);
  })(); },[]);

  // Save kids registry whenever it changes
  useEffect(()=>{ if(loaded) saveData(KIDS_KEY, kids); },[kids,loaded]);

  const bg = authUser?.theme ? (THEMES.find(t=>t.id===authUser.theme)?.bg||bgTheme.bg) : bgTheme.bg;

  // Hide the floating ☁️/🔔 buttons during mid-flow auth screens (registration,
  // PIN, 2FA, celebrate) so they don't float over those cards. They stay
  // visible on welcome/profiles (for sync sign-in) and the dashboard.
  useEffect(()=>{
    const midFlow = ["landing","kid_reg","kid_reg_2fa","kid_pin","kid_login_2fa","celebrate","parent_login"];
    document.body.dataset.flow = midFlow.includes(screen) ? "auth-mid" : "";
  },[screen]);

  const enterTwoFA = to => { setTwoFACode(genCode()); setScreen(to); };
  const onKidReg   = data => {
    const k = {id:Date.now().toString(),name:data.name,avatar:data.avatar,age:data.age,email:data.email,pin:data.pin,theme:data.theme||"space",cash:1000,coins:50,xp:0,streak:0,joinedAt:new Date().toLocaleDateString("en-US")};
    setKids(ks=>[...ks,k]); setAuthUser(k); setSavedState(null); setScreen("celebrate");
    setTimeout(()=>setScreen("kid_dash"),3000);
  };
  const onKidLogin = async k => {
    const st = await loadData(stateKey(k.id));
    setSavedState(st);
    setAuthUser(k);
    setScreen("kid_dash");
  };

  // Restore a full account from a backup code
  const onRestore = async ({account, state}) => {
    // Re-add the account to the registry (replace if same id exists)
    setKids(ks=>{ const without=ks.filter(x=>x.id!==account.id); return [...without, account]; });
    // Save the restored progress to storage
    if(state) await saveData(stateKey(account.id), state);
    setSavedState(state||null);
    setAuthUser(account);
    setScreen("kid_dash");
  };

  // Parent resets a kid's progress (or removes account entirely)
  const onResetKid = async (kidId, mode, gain=0) => {
    if(mode==="money"){
      // Reset TRADING only — Money Garden becomes $1,000 + the chosen starting
      // gain (0 = fresh start). Clears holdings & trades but KEEPS lessons, badges
      // and coins — corrects bad play-money profit without erasing learning.
      try{
        const st=await loadData(stateKey(kidId));
        if(st){
          const lessonCash=(st.doneLesson||[]).reduce((s,id)=>s+(LESSONS.find(l=>l.id===id)?.cashReward||0),0);   // full earned lesson cash
          const g=Math.max(0,Number(gain)||0);   // chosen stock-holding gain
          const base=(lessonCash+g)>0 ? lessonCash+g : 1000;   // e.g. $1,850 lessons + $75 = $1,925 (fresh $1,000 if nothing)
          await saveData(stateKey(kidId),{...st,cash:base,portfolio:[],trades:[],pendingOrders:[],lastValue:base});
        }
      }catch(e){}
      return;
    }
    try { await window.storage.delete(stateKey(kidId), false); } catch(e) {}
    if(mode==="remove"){
      setKids(ks=>ks.filter(k=>k.id!==kidId));
    }
    // 'reset' keeps the account but wipes saved progress (fresh $1000 next login)
  };

  const Stars = () => {
    const s=Array.from({length:20},(_,i)=>({id:i,sz:`${1+Math.random()*2}px`,top:`${Math.random()*100}%`,left:`${Math.random()*100}%`,dur:`${3+Math.random()*5}s`,del:`${Math.random()*5}s`}));
    return <div className="stars">{s.map(x=><div key={x.id} className="star" style={{width:x.sz,height:x.sz,top:x.top,left:x.left,animationDuration:x.dur,animationDelay:x.del}}/>)}</div>;
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="app" style={{background:bg}}>
        <Stars/>
        {screen==="landing"          && <Landing      onStart={()=>{ try{localStorage.setItem("toybox:started","1");}catch(e){} setScreen("role_select"); }}/>}
        {screen==="welcome"          && <Welcome      onNext={()=>setScreen("role_select")}/>}
        {screen==="role_select"      && <RoleSelect   onKid={()=>setScreen("kid_profiles")} onParent={()=>setScreen("parent_login")} onBack={()=>setScreen("landing")}/>}
        {screen==="kid_profiles"     && <KidProfiles  kids={kids} onSelect={k=>{setLoginKid(k);setScreen("kid_pin");}} onNew={()=>{ if(kids.length>=1 && !famPremium){ setKidLimit(true); } else { setScreen("kid_reg"); } }} onBack={()=>setScreen("role_select")} onRestore={onRestore}/>}
        {screen==="kid_reg"          && <KidRegister  regData={regData} setRegData={setRegData} onComplete={d=>{setRegData(d);enterTwoFA("kid_reg_2fa");}} onBack={()=>setScreen("kid_profiles")} setBgTheme={setBgTheme}/>}
        {screen==="kid_reg_2fa"      && <TwoFA        email={regData.email} code={twoFACode} who={regData.name} isReg onVerified={()=>onKidReg(regData)} onBack={()=>setScreen("kid_reg")}/>}
        {screen==="kid_pin"          && <PinScreen    kid={loginKid} onVerified={()=>enterTwoFA("kid_login_2fa")} onBack={()=>setScreen("kid_profiles")}/>}
        {screen==="kid_login_2fa"    && <TwoFA        email={loginKid?.email} code={twoFACode} who={loginKid?.name} onVerified={()=>onKidLogin(loginKid)} onBack={()=>setScreen("kid_pin")}/>}
        {screen==="parent_login"     && <ParentLogin  onVerified={()=>setScreen("parent_dash")} onBack={()=>setScreen("role_select")}/>}
        {screen==="celebrate"        && <Celebrate    user={authUser}/>}
        {screen==="kid_dash"         && <KidDash      user={authUser} savedState={savedState} onLogout={()=>{setAuthUser(null);setScreen("welcome");}}/>}
        {screen==="parent_dash"      && <ParentDash   kids={kids} onResetKid={onResetKid} onLogout={()=>setScreen("welcome")}/>}

        {kidLimit&&(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:22}} onClick={()=>setKidLimit(false)}>
            <div style={{background:"#111827",border:"1px solid rgba(124,58,237,.35)",borderRadius:22,padding:24,maxWidth:360,width:"100%",textAlign:"center"}} onClick={e=>e.stopPropagation()}>
              <div style={{fontSize:46,marginBottom:8}}>👨‍👩‍👧‍👦</div>
              <div style={{fontFamily:"var(--fd)",fontSize:20,color:"#fff",marginBottom:8}}>Add the whole family!</div>
              <div style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,.7)",lineHeight:1.6,marginBottom:18}}>The free plan includes <strong style={{color:"#fff"}}>1 kid</strong>. Unlock <strong style={{color:"#c4b5fd"}}>Toybox Plus</strong> to add all your children — each with their own account, tasks and savings. ⭐</div>
              <div style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.5)",lineHeight:1.6,marginBottom:18}}>Tap the <strong style={{color:"#fff"}}>☁️ button</strong> → <strong style={{color:"#fff"}}>Toybox Plus</strong> to unlock.</div>
              <button onClick={()=>setKidLimit(false)} style={{width:"100%",padding:13,borderRadius:13,border:"none",background:"linear-gradient(135deg,#7c3aed,#9333ea)",color:"#fff",fontFamily:"var(--fd)",fontSize:15,cursor:"pointer"}}>Got it</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════
// AUTH SCREENS
// ═══════════════════════════════════════════════════
function Welcome({onNext}){
  return(
    <div className="page">
      <div className="card" style={{textAlign:"center"}}>
        <div style={{fontSize:68,marginBottom:14,animation:"float 3s ease-in-out infinite",display:"block",filter:"drop-shadow(0 0 20px rgba(255,255,255,.2))"}}>🧸</div>
        <div className="ttl" style={{fontSize:30}}>Toybox Trader</div>
        <div className="sub">Learn to invest, grow your Money Garden, and beat your friends every month!</div>
        <div style={{display:"flex",gap:7,justifyContent:"center",flexWrap:"wrap",marginBottom:20}}>
          {["📈 Real skills","🎮 Game fun","🏆 Monthly winners","🧸 Kid-safe"].map(t=><div key={t} style={{fontSize:11,fontWeight:800,background:"rgba(255,255,255,.1)",color:"rgba(255,255,255,.8)",padding:"4px 10px",borderRadius:100}}>{t}</div>)}
        </div>
        <button className="btn btn-w" onClick={onNext}>Get Started 🚀</button>
        <div style={{marginTop:14,fontSize:11,fontWeight:600,color:"rgba(255,255,255,.4)"}}>
          Play money only — no real trades. <a href="/privacy.html" target="_blank" rel="noopener" style={{color:"rgba(167,139,250,.9)"}}>Privacy Policy</a>
        </div>
      </div>
    </div>
  );
}

function RoleSelect({onKid,onParent,onBack}){
  return(
    <div className="page">
      <div className="card">
        <div className="ttl">Who are you? 👋</div>
        <div className="sub" style={{marginBottom:18}}>Pick your role</div>
        <div className="role-grid">
          <button className="role-btn" onClick={onKid}><span className="role-icon">🧒</span><div className="role-title">I'm a Kid</div><div className="role-sub">Create or log into my account</div></button>
          <button className="role-btn" onClick={onParent}><span className="role-icon">👔</span><div className="role-title">I'm a Parent</div><div className="role-sub">Manage my kids' accounts</div></button>
        </div>
        <button className="btn-link" onClick={onBack}>← Back</button>
      </div>
    </div>
  );
}

function KidProfiles({kids,onSelect,onNew,onBack,onRestore}){
  const [showRestore,setShowRestore]=useState(false);
  const [code,setCode]=useState("");
  const [err,setErr]=useState("");
  const tryRestore=()=>{
    const data=readBackupCode(code);
    if(!data){ setErr("That code doesn't look right. Check you copied all of it."); return; }
    onRestore(data);
  };
  return(
    <div className="page">
      <div className="card">
        <div className="ttl">Who's playing? 🎮</div>
        <div className="sub" style={{marginBottom:16}}>{kids.length===0?"No accounts yet — create yours!":"Tap your profile to log in"}</div>
        <div className="profiles-grid">
          {kids.map(k=>(
            <button key={k.id} className="prof-card" onClick={()=>onSelect(k)}>
              <span className="prof-av">{k.avatar}</span>
              <div className="prof-nm">{k.name}</div>
              <div className="prof-sub">Age {k.age}</div>
            </button>
          ))}
          <button className="prof-card prof-new" onClick={onNew}>
            <span style={{fontSize:34,opacity:.6}}>➕</span>
            <div className="prof-nm" style={{color:"rgba(255,255,255,.55)",fontSize:12}}>Create account</div>
          </button>
        </div>
        {!showRestore?(
          <button className="btn-link" onClick={()=>setShowRestore(true)}>🔑 Restore from a backup code</button>
        ):(
          <div style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.12)",borderRadius:13,padding:13,marginTop:6}}>
            <div style={{fontSize:12,fontWeight:800,color:"rgba(255,255,255,.75)",marginBottom:6}}>Paste your backup code</div>
            <div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,.45)",lineHeight:1.5,marginBottom:8}}>Got a backup code from before? Paste it here to bring your whole account and progress back.</div>
            <textarea className="inp" placeholder="TBX-..." value={code} onChange={e=>{setCode(e.target.value);setErr("");}} style={{minHeight:60,fontSize:12,fontFamily:"monospace",resize:"none"}}/>
            {err&&<div style={{fontSize:11,fontWeight:700,color:"#fca5a5",marginBottom:6}}>{err}</div>}
            <button className="btn btn-g" onClick={tryRestore} style={{marginTop:2}}>Restore my account 🔑</button>
            <button className="btn-link" onClick={()=>setShowRestore(false)}>Cancel</button>
          </div>
        )}
        <button className="btn-link" onClick={onBack}>← Back</button>
      </div>
    </div>
  );
}

function KidRegister({regData,setRegData,onComplete,onBack,setBgTheme}){
  const [step,setStep]=useState(0);
  const [d,setD]=useState({name:"",avatar:"🚀",age:null,email:"",pin:"",pin2:"",theme:"space",...regData});
  const [err,setErr]=useState("");
  const upd=(k,v)=>setD(x=>({...x,[k]:v}));
  const STEPS=["Your Name","Avatar","Your Age","Email","PIN","Theme"];
  const next=()=>{
    setErr("");
    if(step===0&&!d.name.trim()) return setErr("Enter your name!");
    if(step===2&&!d.age)         return setErr("Pick your age!");
    if(step===3&&!d.email.includes("@")) return setErr("Enter a valid email!");
    if(step===4&&d.pin.length<4) return setErr("Choose 4 digits!");
    if(step===4&&d.pin!==d.pin2) return setErr("PINs don't match!");
    if(step<5){setStep(s=>s+1);return;}
    setRegData(d);onComplete(d);
  };
  return(
    <div className="page">
      <div className="card">
        <div className="dots">{STEPS.map((_,i)=><div key={i} className={`dot ${i<=step?"on":""}`}/>)}</div>
        <div style={{fontSize:11,color:"rgba(255,255,255,.4)",fontWeight:800,textAlign:"center",marginBottom:14,textTransform:"uppercase",letterSpacing:".5px"}}>Step {step+1}/{STEPS.length} · {STEPS[step]}</div>
        {step===0&&<><div className="ttl">What's your name? 😊</div><div className="sub">This shows on the leaderboard</div><input className="inp" placeholder="e.g. Jamie, Zoe, Max..." value={d.name} onChange={e=>upd("name",e.target.value)} maxLength={20} autoFocus/>{d.name&&<div style={{fontSize:12,color:"rgba(255,255,255,.5)",fontWeight:700}}>Looking good, {d.name}! 👋</div>}</>}
        {step===1&&<><div className="ttl">Pick your avatar! {d.avatar}</div><div className="sub" style={{marginBottom:12}}>Your trading identity</div><div className="av-grid">{AVATARS.map(a=><button key={a} className={`av-opt ${d.avatar===a?"sel":""}`} onClick={()=>upd("avatar",a)}>{a}</button>)}</div></>}
        {step===2&&<><div className="ttl">How old are you? 🎂</div><div className="sub" style={{marginBottom:12}}>Personalises your learning</div><div className="age-grid">{[8,9,10,11,12,13,14,15,16,17].map(a=><button key={a} className={`age-btn ${d.age===a?"sel":""}`} onClick={()=>upd("age",a)}>{a}</button>)}</div></>}
        {step===3&&<><div className="ttl">Your email address 📧</div><div className="sub" style={{marginBottom:10}}>Used for the pretend 2FA security lesson — we don't send real emails.</div><div className="sec-badge"><span style={{fontSize:18}}>🔐</span><span>You'll <strong>practice Two-Factor Authentication (2FA)</strong>. Even if someone steals your PIN, they still can't log in without the code. Real apps like Google, Apple and banks all use it!</span></div><input className="inp" type="email" placeholder="your@email.com" value={d.email} onChange={e=>upd("email",e.target.value)}/></>}
        {step===4&&<><div className="ttl">Create your PIN 🔒</div><div className="sub">4 digits only you know — don't use your birthday!</div><div className="lbl">Your PIN</div><input className="inp" type="password" inputMode="numeric" maxLength={4} placeholder="4 digits" value={d.pin} onChange={e=>upd("pin",e.target.value.replace(/\D/g,"").slice(0,4))}/><div className="lbl">Confirm PIN</div><input className="inp" type="password" inputMode="numeric" maxLength={4} placeholder="Type it again" value={d.pin2} onChange={e=>upd("pin2",e.target.value.replace(/\D/g,"").slice(0,4))}/>{d.pin.length===4&&d.pin===d.pin2&&<div style={{fontSize:12,fontWeight:800,color:"#86efac"}}>✅ PINs match!</div>}</>}
        {step===5&&<><div className="ttl">Pick your theme! 🎨</div><div className="sub" style={{marginBottom:12}}>How your dashboard looks</div><div className="theme-grid">{THEMES.map(t=><button key={t.id} className={`theme-opt ${d.theme===t.id?"sel":""}`} style={{background:t.bg}} onClick={()=>{upd("theme",t.id);setBgTheme(t);}}><div className="theme-dot" style={{background:t.accent}}/><div className="theme-lbl">{t.label}</div></button>)}</div></>}
        {err&&<div className="pin-err">{err}</div>}
        <button className="btn btn-w" onClick={next} style={{marginTop:10}}>{step===5?"Create My Account! 🚀":"Next →"}</button>
        <button className="btn-link" onClick={()=>step>0?setStep(s=>s-1):onBack()}>← Back</button>
      </div>
    </div>
  );
}

function PinScreen({kid,onVerified,onBack}){
  const [pin,setPin]=useState("");const [err,setErr]=useState(false);
  const tap=d=>{if(pin.length>=4)return;const n=pin+d;setPin(n);if(n.length===4){if(n===kid.pin){setTimeout(onVerified,200);}else{setErr(true);setTimeout(()=>{setPin("");setErr(false);},900);}}};
  const DIGITS=["1","2","3","4","5","6","7","8","9","","0","⌫"];
  return(
    <div className="page">
      <div className="card" style={{textAlign:"center"}}>
        <div style={{fontSize:50,marginBottom:8}}>{kid?.avatar}</div>
        <div className="ttl">Hi, {kid?.name}! 👋</div>
        <div className="sub">Enter your PIN</div>
        <div className="pin-dots">{[0,1,2,3].map(i=><div key={i} className={`pin-dot ${i<pin.length?"filled":""}`}/>)}</div>
        <div className="pin-grid">{DIGITS.map((d,i)=>d===""?<div key={i}/>:<button key={i} className={`pin-btn ${d==="⌫"?"del":""}`} onClick={()=>d==="⌫"?setPin(p=>p.slice(0,-1)):tap(d)}>{d}</button>)}</div>
        {err&&<div className="pin-err">❌ Wrong PIN</div>}
        <button className="btn-link" style={{marginTop:14}} onClick={onBack}>← Not {kid?.name}?</button>
      </div>
    </div>
  );
}

function TwoFA({email,code,who,isReg,onVerified,onBack}){
  const [vals,setVals]=useState(["","","","","",""]);
  const [status,setStatus]=useState("waiting"); // waiting | ready | arriving | done
  const doneRef=useRef(false);
  const finish=()=>{ if(doneRef.current)return; doneRef.current=true; setStatus("done"); setTimeout(onVerified,700); };
  // The pretend email "arrives" after a short beat. Then the KID taps the code
  // to fill it in themselves (no typing, no autofill). Tapping fills the boxes
  // digit-by-digit, then verifies — so entering the code is their own action.
  useEffect(()=>{
    const t=setTimeout(()=>setStatus(s=>s==="waiting"?"ready":s),1100);
    return ()=>clearTimeout(t);
  },[]);
  const fillIn=()=>{
    if(doneRef.current||status!=="ready")return;   // only once the code has arrived
    setStatus("arriving");
    const digits=String(code).split("");
    digits.forEach((d,i)=>setTimeout(()=>{
      setVals(v=>{const n=[...v];n[i]=d;return n;});
      if(i===digits.length-1) setTimeout(finish,450);
    }, i*150));
  };
  const tappable=status==="ready";
  return(
    <div className="page" style={{overflowY:"auto"}}>
      <div className="card">
        <div style={{textAlign:"center",marginBottom:16}}>
          <div style={{fontSize:42,marginBottom:8}}>🔐</div>
          <div className="ttl">Security Lesson!</div>
          <div className="sub">Learn how <strong style={{color:"#fff"}}>2-Factor Login</strong> keeps you safe — no real email is sent, this is just for learning! 🎓</div>
        </div>
        <div style={{background:"rgba(16,185,129,.1)",border:"1px solid rgba(16,185,129,.25)",borderRadius:13,padding:13,marginBottom:14,fontSize:12,fontWeight:700,color:"rgba(255,255,255,.85)",lineHeight:1.6}}>
          🔐 <strong>Why 2FA?</strong> Even if someone steals your PIN, they can't log in without this code. It's like having two locks on a door. Real apps like Google, Apple and banks all use this — you're learning how the pros stay safe!
        </div>
        <div style={{fontFamily:"var(--fd)",fontSize:11,color:"rgba(255,255,255,.4)",textAlign:"center",marginBottom:8,textTransform:"uppercase",letterSpacing:".5px"}}>Your 6-digit code</div>
        <div className="twofa-row">{vals.map((v,i)=><input key={i} className={`twofa-inp ${v?"filled":""}`} value={v} readOnly tabIndex={-1}/>)}</div>
        <div style={{textAlign:"center",fontSize:12,fontWeight:800,marginBottom:8,color:status==="done"?"#86efac":"#c4b5fd"}}>
          {status==="waiting"?"📩 Your code is on its way…":status==="ready"?"👆 Tap your code below to fill it in!":status==="arriving"?"✨ Great! Filling it in…":"✅ Verified! Great job 🎓"}
        </div>
        <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.4)",textAlign:"center",marginBottom:8}}>👇 Pretend email — in a real app this would land in your inbox.</div>
        <div className="email-pop" onClick={fillIn} style={{cursor:tappable?"pointer":"default",opacity:status==="waiting"?.55:1,transition:"opacity .3s"}}>
          <div className="email-hd"><div className="email-logo">🧸</div><div><div style={{fontSize:11,fontWeight:800,color:"#fff"}}>Toybox Trader (pretend)</div><div style={{fontSize:10,color:"rgba(255,255,255,.6)",fontWeight:600}}>demo@toyboxtrader.com → {email}</div></div></div>
          <div className="email-bd">
            <div className="email-sub">🔐 Your practice security code</div>
            <div className="email-txt">Hi {who}! 👋 {status==="waiting"?"Your code is arriving…":"Here's your code — tap it to enter it:"}</div>
            <button type="button" onClick={fillIn} disabled={!tappable} className={`email-code-box${tappable?" tap-ready":""}`} style={{display:"block",width:"100%",borderColor:tappable?"#7c3aed":"rgba(124,58,237,.2)",cursor:tappable?"pointer":"default"}}>
              <div className="email-code">{code}</div>
              <div style={{fontSize:10.5,fontWeight:800,color:"#a78bfa",marginTop:5}}>
                {status==="waiting"?"📩 arriving…":status==="ready"?"👆 Tap here to fill in your code!":status==="arriving"?"✨ Filling in…":"✅ Done!"}
              </div>
            </button>
            <div className="email-foot">This is why 2FA matters — even if someone has your password, they don't have your email! 🔒</div>
          </div>
        </div>
        <button className="btn-link" style={{marginTop:10}} onClick={onBack}>← Back</button>
      </div>
    </div>
  );
}

// Real parental gate (App Store / Play Store requirement): a multiplication
// challenge a young child shouldn't be able to pass, guarding the parent area.
function ParentLogin({onVerified,onBack}){
  const [a]=useState(()=>6+Math.floor(Math.random()*4));   // 6..9
  const [b]=useState(()=>7+Math.floor(Math.random()*3));   // 7..9
  const [ans,setAns]=useState("");const [err,setErr]=useState(false);
  const check=()=>{ if(parseInt(ans,10)===a*b){ setErr(false); onVerified(); } else { setErr(true); } };
  return(
    <div className="page">
      <div className="card" style={{textAlign:"center"}}>
        <div style={{fontSize:42,marginBottom:8}}>🔒</div>
        <div className="ttl">Grown-ups only</div>
        <div className="sub">Ask a parent to unlock this area</div>
        <div style={{fontFamily:"var(--fd)",fontSize:24,color:"#fff",margin:"18px 0 12px"}}>What is {a} × {b}?</div>
        <input className="inp" inputMode="numeric" placeholder="Type the answer" value={ans} onChange={e=>{setAns(e.target.value.replace(/\D/g,""));setErr(false);}} onKeyDown={e=>e.key==="Enter"&&check()} style={{textAlign:"center"}}/>
        {err&&<div className="pin-err">❌ Not quite — ask a grown-up and try again</div>}
        <button className="btn btn-w" onClick={check} style={{marginTop:12}}>Unlock 🔓</button>
        <button className="btn-link" onClick={onBack}>← Back</button>
      </div>
    </div>
  );
}

function Celebrate({user}){
  const cols=["#f59e0b","#ec4899","#7c3aed","#10b981","#06b6d4","#ef4444"];
  const conf=Array.from({length:26},(_,i)=>({id:i,col:cols[i%cols.length],left:`${Math.random()*100}%`,del:`${Math.random()*2}s`,dur:`${2+Math.random()*2}s`,w:`${7+Math.random()*8}px`,h:`${10+Math.random()*12}px`}));
  return(
    <div className="celebrate-ov">
      <div className="conf-wrap">{conf.map(c=><div key={c.id} className="conf-p" style={{left:c.left,background:c.col,width:c.w,height:c.h,animationDuration:c.dur,animationDelay:c.del}}/>)}</div>
      <div style={{fontSize:72,animation:"popUp .6s cubic-bezier(.34,1.56,.64,1)",position:"relative",zIndex:1}}>{user?.avatar}</div>
      <div style={{fontFamily:"var(--fd)",fontSize:24,color:"#fff",textAlign:"center",position:"relative",zIndex:1}}>Welcome, {user?.name}! 🎉</div>
      <div style={{fontSize:13,color:"rgba(255,255,255,.65)",fontWeight:700,textAlign:"center",lineHeight:1.7,maxWidth:280,position:"relative",zIndex:1}}>Account secured with 2FA! 🔐<br/>You have $1,000 to start investing.<br/>Complete lessons to earn MORE cash!</div>
      <div style={{background:"rgba(245,158,11,.15)",border:"1px solid rgba(245,158,11,.3)",borderRadius:14,padding:"14px 22px",textAlign:"center",position:"relative",zIndex:1}}><div style={{fontFamily:"var(--fd)",fontSize:30,color:"#f59e0b"}}>💵 $1,000.00</div><div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.45)",marginTop:3}}>Your starting Money Garden</div></div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// KID DASHBOARD — all 12 features
// ═══════════════════════════════════════════════════
function KidDash({user,savedState,onLogout}){
  const S = savedState || {};   // saved state (or empty for new accounts)
  const [nav,      setNav]      = useState("Home");
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreView, setMoreView] = useState("Ranks");

  // Economy — restored from storage if available
  const [cash,     setCash]     = useState(S.cash ?? 1000);
  const [coins,    setCoins]    = useState(S.coins ?? (user?.coins||50));
  const [xp,       setXp]       = useState(S.xp ?? (user?.xp||0));
  const DAILY_TOKENS = 5;   // fresh trades each day
  const [tokens,   setTokens]   = useState(S.tokens ?? DAILY_TOKENS);
  const [tokenDay, setTokenDay] = useState(S.tokenDay || null);   // date tokens were last refilled
  const [prices,   setPrices]   = useState({...INIT_PRICES});
  const [portfolio,setPort]     = useState(S.portfolio || []);
  const [trades,   setTrades]   = useState(S.trades || []);          // full trade history
  const [lastValue,setLastValue]= useState(S.lastValue ?? null);     // value at last session
  const [hydrated, setHydrated] = useState(false);                    // ready to save?

  // Features — restored
  const [streak,      setStreak]      = useState(S.streak ?? 1);                  // 1 — daily streak
  const [lastSpin,    setLastSpin]    = useState(S.lastSpin ?? null);             // 5 — spin wheel
  const [spinning,    setSpinning]    = useState(false);
  const [spinDeg,     setSpinDeg]     = useState(0);
  const [spinResult,  setSpinResult]  = useState(null);
  const [invCards,    setInvCards]    = useState(S.invCards || []);               // 2 — collectible cards
  const [alertToast,  setAlertToast]  = useState(null);                          // 3 — stock alerts
  const [tradeAsset,  setTradeAsset]  = useState(null);                          // trade modal
  const [tradeMode,   setTradeMode]   = useState("buy");
  const [tradeQty,    setTradeQty]    = useState(1);
  const [tradeTab,    setTradeTab]    = useState("all");
  const [orderType,   setOrderType]   = useState("market");                      // market | limit
  const [limitPrice,  setLimitPrice]  = useState(0);                             // target price for limit
  const [pendingOrders,setPending]    = useState(S.pendingOrders || []);         // queued/limit orders
  const [autoInvest,  setAutoInvest]  = useState(S.autoInvest || null);          // Money Machine: {etf,amount,active,lastRun,totalInvested,paydays}
  const [invPickEtf,  setInvPickEtf]  = useState("VOO");                         // Money Machine setup selections
  const [invPickAmt,  setInvPickAmt]  = useState(25);
  const [career,      setCareer]      = useState(migrateCareer(S.career));        // money-life: {jobIndex,period,investsAtJob,awaitingInvest,totalSaved}
  const [invAmt,      setInvAmt]      = useState(null);                           // chosen invest amount this payday (null = not picked)
  const warnedOrders = useRef(new Set());  // orders we've already shown a "not enough cash" toast for
  const [lastBonusClaim,setLastBonusClaim] = useState(S.lastBonusClaim ?? null); // date daily bonus last claimed
  const [lastLessonAt, setLastLessonAt]    = useState(S.lastLessonAt ?? null);   // when a lesson was last completed (jackpot gate)
  const [showDailyBonus,setShowDailyBonus] = useState(false);                    // daily-bonus popup open
  const [bonusResult,  setBonusResult]     = useState(null);                     // what the claim awarded
  const [isPremium,    setIsPremium]       = useState(false);                    // family has Toybox Plus
  const [showPlus,     setShowPlus]        = useState(false);                    // Plus upsell modal
  const [askedPlus,    setAskedPlus]       = useState(false);                    // kid sent the "ask a grown-up" nudge
  const [plusCelebrate,setPlusCelebrate]   = useState(false);                    // celebrate a fresh unlock
  const [orderToast,  setOrderToast]  = useState(null);                          // "order filled!" toast
  const [success,     setSuccess]     = useState(null);
  const [cashReward,  setCashReward]  = useState(null);                          // lesson cash pop
  // Chores & Rewards (family-shared tasks/store; no real money)
  const [tasks,       setTasks]       = useState([]);
  const [store,       setStore]       = useState([]);
  const [choreGoal,   setChoreGoal]   = useState(0);
  const [taskCelebrate,setTaskCelebrate]=useState(null);                         // {emoji,title,coins?}
  const [investOpen,  setInvestOpen]  = useState(false);
  const [owed,        setOwed]        = useState(0);                             // pocket money owed to this kid (tracking only)
  const [ttEnabled,   setTtEnabled]   = useState(false);                         // Together Time on/off (parent-set)
  const [reqCat,      setReqCat]      = useState("together");
  const [reqText,     setReqText]     = useState("");
  const [savings,     setSavings]     = useState(null);                          // {name,target,saved,matchPct} or null
  const [goalName,    setGoalName]    = useState("");
  const [goalTarget,  setGoalTarget]  = useState(100);
  const [gifts,       setGifts]       = useState([]);                            // family gifts waiting for this kid
  const [showCert,    setShowCert]    = useState(false);                         // certificate modal
  const [lesson,       setLesson]      = useState(null);   // lesson modal
  const [lessonSlide,  setLessonSlide] = useState(0);
  const [lessonProgress,setLessonProg]= useState({});     // saved progress per lesson
  const [slideTimer,   setSlideTimer] = useState(0);      // seconds on current slide
  const [slideReady,   setSlideReady] = useState(false);  // can advance?
  const [inQuiz,       setInQuiz]     = useState(false);  // showing the adventure level?
  const [challengeMode,setChallengeMode] = useState(false); // playing a lesson's harder Round 2?
  const [qIdx,         setQIdx]       = useState(0);      // current checkpoint index
  const [qAnswer,      setQAnswer]    = useState(null);   // selected answer
  const [qWrong,       setQWrong]     = useState(false);  // wrong this checkpoint?
  const [hearts,       setHearts]     = useState(3);      // lives for this level
  const [combo,        setCombo]      = useState(0);      // streak counter
  const [buddyAnim,    setBuddyAnim]  = useState("idle"); // idle|hop|cheer|sad
  const [coinBurst,    setCoinBurst]  = useState(false);  // coin fly animation
  const [shake,        setShake]      = useState(false);  // screen shake
  const [levelWon,     setLevelWon]   = useState(false);  // finished level
  const [buddy,        setBuddy]      = useState(S.buddy || null);  // chosen starter id
  const [pickBuddy,    setPickBuddy]  = useState(false);  // starter picker open
  const [doneLesson,   setDoneLesson] = useState(S.doneLesson || []);
  const [doneChallenge,setDoneChallenge] = useState(S.doneChallenge || []);     // lesson ids whose harder Round 2 was cleared
  const [lessonDates,  setLessonDates]= useState(S.lessonDates || {});          // {lessonId: completedAt} — powers the weekly Parent Insight
  const [doneMission, setDoneMission] = useState(S.doneMission || []);
  const [tourStep,    setTourStep]    = useState(1);
  const [tourDone,    setTourDone]    = useState(S.tourDone ?? false);  // persisted: intro tour shows only once
  const [predictions, setPreds]       = useState(S.predictions || []);            // 10 — predictions
  const [predSel,     setPredSel]     = useState(null);
  const [clubPool,    setClubPool]    = useState(S.clubPool || {total:0,members:[]}); // 11 — investment club
  const [clubAmt,     setClubAmt]     = useState(50);
  const [challenge,   setChallenge]   = useState(null);                          // 6 — head-to-head
  const [storyIdx,    setStoryIdx]    = useState(0);                             // 12 — daily story
  const [reportOpen,  setReportOpen]  = useState(false);                         // 8 — report card
  const [bugCat,      setBugCat]      = useState("");                            // help/report-a-problem
  const [bugMsg,      setBugMsg]      = useState("");
  const [bugEmail,    setBugEmail]    = useState("");                            // optional grown-up email for a reply/confirmation
  const [bugConfirmed,setBugConfirmed]= useState(false);                         // server actually sent the confirmation copy
  const [bugErr,      setBugErr]      = useState("");                            // last send failure reason (for diagnostics)
  const [coachMsgs,   setCoachMsgs]   = useState([]);                            // "Ask Toby" AI coach chat: {role:"user"|"assistant",content}
  const [coachInput,  setCoachInput]  = useState("");
  const [coachBusy,   setCoachBusy]   = useState(false);
  const [fabOpen,     setFabOpen]     = useState(false);                          // floating helper widget (Toby/sync/reminders/report)
  // On kid screens, hide the standalone ☁️/🔔 buttons — they live inside the widget now.
  useEffect(()=>{ document.body.dataset.kid="1"; return ()=>{ delete document.body.dataset.kid; }; },[]);
  const [bugState,    setBugState]    = useState("idle");                        // idle | sending | done | error
  const [owned,       setOwned]       = useState(S.owned || []);                 // shop items owned
  const [equipAvatar, setEquipAvatar] = useState(S.equipAvatar || null);         // equipped avatar emoji (overrides default)
  const [equipTheme,  setEquipTheme]  = useState(S.equipTheme || null);          // equipped theme id (overrides default)
  // Active look: equipped value wins, else the kid's original choice
  const theme  = THEMES.find(t=>t.id===(equipTheme||user?.theme))||THEMES[0];
  const avatar = equipAvatar || user?.avatar || "🚀";
  const [shopMsg,     setShopMsg]     = useState(null);                          // shop purchase feedback
  const [earnedBadges,setEarnedBadges]= useState(S.earnedBadges || []);          // achievement badges
  const [newBadge,    setNewBadge]    = useState(null);                          // badge popup
  const [goal,        setGoal]        = useState(S.goal ?? null);                // savings goal value
  const [goalInput,   setGoalInput]   = useState(1500);
  const [showInfo,    setShowInfo]    = useState(false);                         // XP/coin explainer
  const [showOrderHelp,setShowOrderHelp]=useState(false);                        // limit-order explainer (replayable)
  const [seenOrderHelp,setSeenOrderHelp]=useState(S.seenOrderHelp || false);     // first-time auto-show

  const portVal    = portfolio.reduce((s,h)=>s+h.qty*(prices[h.ticker]||h.avgCost),0);
  const totalValue = portVal+cash;
  const startingCash = 1000 + doneLesson.reduce((s,id)=>s+(LESSONS.find(l=>l.id===id)?.cashReward||0),0);
  const allTimeGain   = totalValue - 1000;
  // Realized P&L = sum of profit/loss from completed sells
  const realizedPnl = trades.filter(t=>t.side==="SELL"&&t.pnl!=null).reduce((s,t)=>s+t.pnl,0);
  // Unrealized P&L = current holdings vs what was paid
  const unrealizedPnl = portfolio.reduce((s,h)=>s+((prices[h.ticker]||h.avgCost)-h.avgCost)*h.qty,0);
  // Since last visit
  const sinceLastVisit = lastValue!=null ? totalValue - lastValue : null;

  // Mark hydrated once mounted (lets us avoid saving on the very first render)
  useEffect(()=>{ const t=setTimeout(()=>setHydrated(true),500); return()=>clearTimeout(t); },[]);

  // ── Daily trade-token refill ──
  // Tokens are a per-DAY allowance. Whenever it's a new calendar day (or a
  // brand-new account with no record), top tokens back up to DAILY_TOKENS.
  // Never reduces tokens (so buying Extra Trade Tokens still works).
  // Checked every minute too, so a tablet left open overnight refills at
  // midnight instead of waiting for a reload.
  useEffect(()=>{
    const check = () => {
      const today = new Date().toDateString();
      if(tokenDay !== today){
        setTokens(t => Math.max(t, DAILY_TOKENS));
        setTokenDay(today);
      }
    };
    check();
    const id = setInterval(check, 60000);
    return ()=>clearInterval(id);
  },[tokenDay]);

  // ── Real daily streak ──
  // Compare the last time this kid played (saved as lastActive) with today:
  // came back the very next day → streak +1; skipped a day or more → back to 1;
  // same-day reopen → unchanged. Runs once per login.
  useEffect(()=>{
    if(!S.lastActive) return;
    const last = new Date(S.lastActive), now = new Date();
    const startOfDay = d => new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();
    const daysApart = Math.round((startOfDay(now)-startOfDay(last))/86400000);
    if(daysApart===1){ setStreak(s=>s+1); fx("coin",15); }
    else if(daysApart>1) setStreak(1);
  },[]);

  // AUTO-SAVE: persist all state whenever anything important changes
  useEffect(()=>{
    if(!hydrated||!user?.id) return;
    const snapshot = {cash,coins,xp,tokens,tokenDay,portfolio,trades,streak,lastSpin,invCards,doneLesson,doneChallenge,lessonDates,doneMission,predictions,clubPool,owned,equipAvatar,equipTheme,earnedBadges,goal,pendingOrders,autoInvest,career,seenOrderHelp,buddy,lastBonusClaim,lastLessonAt,tourDone,lastValue:totalValue,lastActive:Date.now()};
    saveData(stateKey(user.id), snapshot);
  },[cash,coins,xp,tokens,tokenDay,portfolio,trades,streak,lastSpin,invCards,doneLesson,doneChallenge,doneMission,predictions,clubPool,owned,equipAvatar,equipTheme,earnedBadges,goal,pendingOrders,autoInvest,career,seenOrderHelp,buddy,hydrated]);

  // ── Check for newly-earned badges ──
  useEffect(()=>{
    if(!hydrated) return;
    const lv=Math.floor(xp/500)+1;
    const stats={
      trades:trades.length,
      lessons:doneLesson.length,
      assets:portfolio.length,
      value:totalValue,
      profitableSells:trades.filter(t=>t.side==="SELL"&&t.pnl>0).length,
      streak,cards:invCards.length,predictions:predictions.length,level:lv,
    };
    BADGES.forEach(b=>{
      if(!earnedBadges.includes(b.id)&&b.check(stats)){
        setEarnedBadges(e=>[...e,b.id]);
        setNewBadge(b);
        fx("reward",30);
        setTimeout(()=>setNewBadge(null),3200);
        try { window.toyboxSync?.notify?.(`🏆 ${user?.name||"Your child"} earned the "${b.name}" badge ${b.icon}`); } catch(e) {}
      }
    });
  },[trades,doneLesson,portfolio,totalValue,streak,invCards,predictions,xp,hydrated]);

  // ── Family Leaderboard (fulfils the "Monthly winners" promise) ──
  // Every kid's state lives in the family's cloud space and is synced to this
  // device at app load, so the board is built from local reads. Each kid's
  // value at their first login of the month is saved as the baseline, and the
  // board ranks by % gain since then.
  const monthKey = (()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;})();
  const [famBoard,setFamBoard] = useState([]);
  useEffect(()=>{ (async()=>{
    if(!hydrated||!user?.id) return;
    const k=`toybox:kid:${user.id}:mbase:${monthKey}`;
    const existing = await loadData(k);
    if(!existing || !(existing.value>0)) await saveData(k,{value:totalValue,at:Date.now()});
  })(); },[hydrated]);
  useEffect(()=>{ (async()=>{
    if(!hydrated) return;
    const reg = await loadData(KIDS_KEY);
    if(!Array.isArray(reg)||reg.length===0){ setFamBoard([]); return; }
    const rows=[];
    for(const k of reg){
      const isMe = k.id===user?.id;
      const st = isMe ? null : await loadData(stateKey(k.id));
      const kidCash = isMe ? cash : (st?.cash ?? k.cash ?? 0);
      const port = isMe ? portfolio : (st?.portfolio || []);
      let value = kidCash;
      port.forEach(h=>{ value += (h.qty||0) * (prices[h.ticker] ?? h.avgCost ?? 0); });
      const base = await loadData(`toybox:kid:${k.id}:mbase:${monthKey}`);
      const gain = base?.value>0 ? ((value-base.value)/base.value)*100 : null;
      rows.push({id:k.id,name:k.name,avatar:k.avatar,value,gain,isMe});
    }
    rows.sort((a,b)=>((b.gain??-1e9)-(a.gain??-1e9)) || (b.value-a.value));
    setFamBoard(rows);
  })(); },[hydrated,prices,cash,portfolio]);

  // ── Resolve due predictions (7 days after they were made) ──
  // Compares against the live price and pays the promised +50 XP / +25 coins
  // per correct call. Runs whenever prices refresh; already-resolved
  // predictions are skipped, so this is safe to re-run.
  useEffect(()=>{
    if(!hydrated) return;
    const now = Date.now();
    const isDue = p => p.status==="open" && now - p.id >= 7*86400000;
    const due = predictions.filter(isDue);
    if(due.length===0) return;
    // Compute results synchronously (NOT inside the setPreds updater, which
    // React defers) so the payout below sees the real win count.
    let wins=0, losses=0, lastResolved=null;
    const next = predictions.map(p=>{
      if(!isDue(p)) return p;
      const cur = prices[p.ticker] ?? INIT_PRICES[p.ticker] ?? p.price;
      const correct = p.dir==="UP" ? cur>p.price : cur<p.price;
      if(correct) wins++; else losses++;
      lastResolved = {...p,status:"resolved",correct,resultPrice:cur};
      return lastResolved;
    });
    setPreds(next);
    if(wins>0){ setXp(x=>x+50*wins); setCoins(c=>c+25*wins); fx("reward",30); }
    if(lastResolved){
      setOrderToast({type:"pred",name:lastResolved.name,correct:lastResolved.correct,wins,count:wins+losses});
      setTimeout(()=>setOrderToast(null),6000);
    }
  },[hydrated,prices,predictions]);

  // ── Backup / Restore ──
  const [backupCode,setBackupCode]=useState(null);
  const [copied,setCopied]=useState(false);
  const generateBackup=()=>{
    const account={id:user.id,name:user.name,avatar:user.avatar,age:user.age,email:user.email,pin:user.pin,theme:user.theme,joinedAt:user.joinedAt};
    // Mirror the auto-save snapshot exactly, so a restore brings back
    // EVERYTHING — pet buddy, equipped cosmetics, pending orders, token day.
    const state={cash,coins,xp,tokens,tokenDay,portfolio,trades,streak,lastSpin,invCards,doneLesson,doneChallenge,lessonDates,doneMission,predictions,clubPool,owned,equipAvatar,equipTheme,earnedBadges,goal,pendingOrders,autoInvest,career,seenOrderHelp,buddy,lastBonusClaim,lastLessonAt,tourDone,lastValue:totalValue,lastActive:Date.now()};
    const code=makeBackupCode(account,state);
    setBackupCode(code); setCopied(false); fx("reward",20);
  };
  const copyBackup=async()=>{
    try{ await navigator.clipboard.writeText(backupCode); setCopied(true); fx("coin",15); setTimeout(()=>setCopied(false),2500); }catch(e){}
  };

  // ── Coin Shop purchase ──
  const buyItem = (item) => {
    if(coins < item.cost){ setShopMsg("Not enough coins! Earn more by trading and learning."); fx("wrong",20); setTimeout(()=>setShopMsg(null),2500); return; }
    if(item.consumable){
      if(item.id==="extra_token") setTokens(t=>t+1);
    } else {
      if(owned.includes(item.id)) return;
      setOwned(o=>[...o,item.id]);
      // Auto-equip avatars/themes the moment they're bought, so the change is visible immediately
      if(item.type==="avatar") setEquipAvatar(item.icon);
      if(item.type==="theme"){ const tid=item.id.replace("theme_",""); if(THEMES.find(t=>t.id===tid)) setEquipTheme(tid); }
    }
    setCoins(c=>c-item.cost);
    setShopMsg(`Bought ${item.name}! ${item.type==="avatar"?"Now wearing it! 🎉":item.type==="theme"?"Theme applied! 🎉":item.consumable?"":"🎉"}`);
    fx("coin",25);
    setTimeout(()=>setShopMsg(null),2500);
  };

  // Equip an already-owned avatar/theme (lets kids switch between ones they own)
  const equipItem = (item) => {
    if(item.type==="avatar") setEquipAvatar(item.icon);
    if(item.type==="theme"){ const tid=item.id.replace("theme_",""); if(THEMES.find(t=>t.id===tid)) setEquipTheme(tid); }
    setShopMsg(`Now using ${item.name}! ✨`); fx("coin",15); setTimeout(()=>setShopMsg(null),2000);
  };

  // ── Real prices via our server-side price feed (Netlify function) ──
  // Fetching server-side avoids the CORS/proxy issues that made the old direct
  // browser calls fail. refPrice holds each asset's previous close so the % on
  // the cards is the real daily change, not a jump from a stale base price.
  // ── Practice market: a self-contained price simulation (no live data feed). ──
  // Prices drift up AND down with a gentle random walk plus a slow "market mood"
  // (good stretches and rough stretches), and a tiny long-term upward lean that
  // rewards patience. Seeded from INIT_PRICES, clamped so nothing runs away, and
  // persisted so prices continue smoothly across reloads (no more $240→$378 jumps).
  const [refPrice,setRefPrice]=useState({...INIT_PRICES});   // day-open baseline for % change
  const refPriceRef=useRef({...INIT_PRICES});
  useEffect(()=>{ refPriceRef.current=refPrice; },[refPrice]);
  const moodRef=useRef(0);
  const SIM_KEY="toybox:sim:v2";
  const simVol=(a)=>a.type==="crypto"?0.010:a.cat==="other"?0.003:a.cat==="etf"?0.004:0.006;  // per-tick volatility
  useEffect(()=>{  // restore the saved market once, or seed a fresh one
    const today=new Date().toDateString();
    try{
      const s=JSON.parse(localStorage.getItem(SIM_KEY)||"null");
      if(s&&s.prices){
        setPrices(p=>({...p,...s.prices}));
        setRefPrice(s.day===today&&s.ref?s.ref:{...s.prices});   // new day → fresh % baseline
        moodRef.current=typeof s.mood==="number"?s.mood:0;
      }else{
        localStorage.setItem(SIM_KEY,JSON.stringify({prices:INIT_PRICES,ref:INIT_PRICES,day:today,mood:0}));
      }
    }catch(e){}
  },[]);

  // ── Chores & Rewards ──
  const refreshTasks = async () => {
    const t = applyRecurringResets(await loadTasks());
    setTasks(t); saveTasks(t);
    setStore(await loadStore());
    const o = await loadOwed(); setOwed(o[user?.id]||0);
    const s = await loadSettings(); setTtEnabled(!!s.togetherTime);
    const sv = await loadSavings(); setSavings(sv[user?.id]||null);
    const gf = await loadGifts(); setGifts(gf.filter(g=>g.kidId===user?.id && !g.collected));
  };
  const collectGift = (gift) => {
    (async()=>{ const gf=await loadGifts(); const g2=gf.find(g=>g.id===gift.id); if(g2){ g2.collected=true; await saveGifts(gf); } setGifts(gf.filter(g=>g.kidId===user?.id && !g.collected)); })();
    if(gift.coins>0) setCoins(c=>c+gift.coins);
    fx("reward",30);
    setTaskCelebrate({emoji:gift.emoji||"🎁",title:`${gift.from} sent you a gift!`,label:gift.message||"",coins:gift.coins>0?gift.coins:undefined});
  };
  // Auto-allowance — credits once a week automatically (Plus, set by parent).
  useEffect(()=>{ (async()=>{
    if(!hydrated || !user?.id) return;
    const a=await loadAllowance(); const mine=a[user.id];
    if(!mine || !mine.enabled || !(mine.amount>0)) return;
    const today=new Date().toDateString();
    const due = !mine.lastPaid || Math.round((Date.parse(today)-Date.parse(mine.lastPaid))/86400000) >= 7;
    if(!due) return;
    mine.lastPaid=today; a[user.id]=mine; await saveAllowance(a); fx("reward",30);
    if(mine.type==="coins"){ setCoins(c=>c+mine.amount); setTaskCelebrate({emoji:"💰",title:"Your weekly allowance arrived!",coins:mine.amount}); }
    else { const o=await loadOwed(); o[user.id]=(o[user.id]||0)+mine.amount; await saveOwed(o); setOwed(o[user.id]); setTaskCelebrate({emoji:"💵",title:"Your weekly allowance arrived!",label:`+${fs$(mine.amount)} pocket money — ask your grown-up!`}); }
  })(); },[hydrated]);
  const setSavingsGoal = () => {
    const name=goalName.trim(); if(!name) return;
    (async()=>{ const sv=await loadSavings(); const prev=sv[user?.id]; sv[user?.id]={name,target:Math.max(10,+goalTarget||10),saved:prev?.saved||0,matchPct:prev?.matchPct||0}; await saveSavings(sv); setSavings(sv[user?.id]); })();
    setGoalName("");
  };
  const depositSavings = (n) => {
    if(n<=0||n>coins||!savings) return;
    const bonus = Math.floor(n*(savings.matchPct||0)/100);
    (async()=>{ const sv=await loadSavings(); const cur=sv[user?.id]; if(!cur) return; cur.saved=(cur.saved||0)+n+bonus; sv[user?.id]=cur; await saveSavings(sv); setSavings({...cur}); })();
    setCoins(c=>c-n); fx("reward",25);
    setTaskCelebrate({emoji:"🏦",title:`Saved ${n} coins!`,label:bonus>0?`Your grown-up matched +${bonus} bonus coins! 🎉`:undefined,coins:bonus>0?undefined:undefined});
  };
  const clearSavingsGoal = () => { (async()=>{ const sv=await loadSavings(); const saved=sv[user?.id]?.saved||0; if(saved>0) setCoins(c=>c+saved); delete sv[user?.id]; await saveSavings(sv); setSavings(null); })(); };
  useEffect(()=>{ (async()=>{ await refreshTasks(); const g=await loadData(`toybox:choregoal:${user?.id}`); if(g) setChoreGoal(g); })(); },[]);
  // Re-check for parent approvals whenever the Tasks/Together views open.
  useEffect(()=>{ if(nav==="More"&&(moreView==="Tasks"||moreView==="Together")) refreshTasks(); },[nav,moreView]);
  const myTasks = tasks.filter(t=>t.kidId===user?.id);
  const todoCount = myTasks.filter(t=>t.status==="todo").length;

  const markTaskDone = (task) => {
    const next = tasks.map(t=>t.id===task.id?{...t,status:"pending",doneAt:Date.now()}:t);
    setTasks(next); saveTasks(next); fx("correct",12);
    try{ window.toyboxSync?.notify?.(`✅ ${user?.name||"Your child"} finished a task: "${task.title}". Open Toybox Trader → 👔 Parent to approve it.`); }catch(e){}
  };
  const collectTask = (task) => {
    const next = tasks.map(t=>t.id===task.id?{...t,status:"done",lastDone:new Date().toDateString()}:t);
    setTasks(next); saveTasks(next); fx("reward",30);
    if(task.reward.type==="coins"){ setCoins(c=>c+(task.reward.coins||0)); setTaskCelebrate({emoji:"🪙",title:task.title,coins:task.reward.coins||0}); }
    else if(task.reward.type==="money"){ const amt=task.reward.money||0; (async()=>{ const o=await loadOwed(); o[user?.id]=(o[user?.id]||0)+amt; await saveOwed(o); setOwed(o[user?.id]); })(); setTaskCelebrate({emoji:"💵",title:task.title,label:`You earned ${fs$(amt)} pocket money — ask your grown-up!`}); }
    else { setTaskCelebrate({emoji:task.reward.emoji||"🎁",title:task.title,label:task.reward.label}); }
  };
  // Together Time — kid asks a parent for shared time (no coins; the reward is the time).
  const sendRequest = () => {
    const text=reqText.trim(); if(!text) return;
    (async()=>{ const r=await loadRequests(); r.unshift({id:uid(),kidId:user?.id,text,cat:reqCat,status:"asked",createdAt:Date.now()}); await saveRequests(r); })();
    setReqText(""); fx("reward",20);
    try{ window.toyboxSync?.notify?.(`💛 ${user?.name||"Your child"} would love some together time: "${text}". See it in Toybox → 👔 Parent → Together Time.`); }catch(e){}
    setTaskCelebrate({emoji:"💛",title:"Request sent!",label:"Your grown-up will see it. Fingers crossed! 🤞"});
  };
  const redeemStoreItem = (item) => {
    if(coins < item.cost) return;
    setCoins(c=>c-item.cost);
    (async()=>{ const claims=await loadClaims(); claims.unshift({id:uid(),kidId:user?.id,itemName:item.name,emoji:item.emoji,cost:item.cost,at:Date.now()}); await saveClaims(claims); })();
    try{ window.toyboxSync?.notify?.(`🎁 ${user?.name||"Your child"} redeemed "${item.emoji} ${item.name}" for ${item.cost} coins. Time to give the reward!`); }catch(e){}
    fx("reward",25); setTaskCelebrate({emoji:item.emoji,title:`Redeemed ${item.name}!`,label:"Ask your grown-up for your reward 🎉"});
  };
  const saveChoreGoal = (g) => { setChoreGoal(g); saveData(`toybox:choregoal:${user?.id}`, g); };
  const investCoins = (n) => { if(n<=0||n>coins) return; setCoins(c=>c-n); setCash(c=>c+n); fx("reward",20); setInvestOpen(false); setTaskCelebrate({emoji:"📈",title:`${n} coins → ${fs$(n)} trading cash!`,label:"Go to Trade to grow it into more!"}); };

  // Move the practice market every few seconds: mood-biased random walk + a tiny
  // upward lean, clamped so it can't run away, and persisted so it resumes cleanly.
  useEffect(()=>{
    const id=setInterval(()=>setPrices(p=>{
      let mood=moodRef.current+(Math.random()-0.5)*0.14;
      mood=Math.max(-1,Math.min(1,mood*0.98));   // slow-moving "market mood": good vs rough stretches
      moodRef.current=mood;
      const n={...p};
      let triggered=null;
      MARKET.forEach(a=>{
        const base=INIT_PRICES[a.ticker]||a.basePrice;
        const move=0.00006 /*tiny long-term upward lean*/ + mood*0.0009 /*mood bias*/ + (Math.random()-0.5)*2*simVol(a);
        const prev=n[a.ticker]??base;
        let next=prev*(1+move);
        next=Math.max(base*0.35,Math.min(base*3.5,next));   // clamp: never runs away or crashes to zero
        n[a.ticker]=next;
        const chg=(next-prev)/prev*100;
        if(Math.abs(chg)>1.0&&!triggered&&portfolio.find(h=>h.ticker===a.ticker)){
          triggered={name:a.name,icon:a.icon,chg,cur:next};
        }
      });
      if(triggered) setAlertToast(triggered);
      try{ localStorage.setItem(SIM_KEY,JSON.stringify({prices:n,ref:refPriceRef.current,day:new Date().toDateString(),mood:moodRef.current})); }catch(e){}
      return n;
    }),4000);
    return()=>clearInterval(id);
  },[portfolio]);

  // Dismiss alert after 5s
  useEffect(()=>{if(!alertToast)return;const t=setTimeout(()=>setAlertToast(null),5000);return()=>clearTimeout(t);},[alertToast]);

  // Whole days since a saved date-string ("" / null = long ago).
  const daysSince = (d) => d ? Math.floor((Date.now()-new Date(d).getTime())/86400000) : 9999;

  // ── Grown-up money life: earn → pay bills → invest savings → get promoted ──
  const ETFS = MARKET.filter(m=>m.cat==="etf");
  const curJob   = JOBS[career.jobIndex] || JOBS[0];
  const nextJob  = JOBS[career.jobIndex+1] || null;      // null = top of the ladder
  const curTax   = jobTax(curJob);
  const curBills = jobBills(curJob);
  const curSave  = jobSave(curJob);                      // paycheck minus tax & bills = what you can invest
  const emGoal   = curBills * 6;                         // a full emergency fund ≈ 3 months of bills
  // Paydays come on a real every-2-weeks rhythm (the first one is ready now).
  const payReady = !career.awaitingInvest && (!career.lastPayday || daysSince(career.lastPayday) >= PAY_DAYS);
  const payInDays= Math.max(0, PAY_DAYS - daysSince(career.lastPayday));
  const chosenEtf = autoInvest?.etf || invPickEtf;       // which ETF savings go into

  // 1) Collect a paycheck. Bills come out first (you have to pay them!), a
  //    surprise life event might strike, and the leftover — your savings —
  //    lands in your cash to invest.
  const collectPaycheck = () => {
    if(career.awaitingInvest) return;                    // handle the last paycheck first
    if(career.lastPayday && daysSince(career.lastPayday) < PAY_DAYS) return;   // not due for 2 weeks yet
    let ev=null;                                          // maybe a surprise expense (not on the very first payday)
    if((career.period||0) >= 1 && Math.random() < 0.35){
      const e = LIFE_EVENTS[Math.floor(Math.random()*LIFE_EVENTS.length)];
      ev = {...e, cost: Math.max(5, Math.round(curSave*(0.3 + Math.random()*0.4)))};   // 30–70% of savings
    }
    // A surprise is paid from the emergency fund first; only the uncovered
    // remainder eats into this payday's savings.
    const fund      = career.emergency||0;
    const covered   = ev ? Math.min(fund, ev.cost) : 0;
    const remainder = ev ? ev.cost-covered : 0;
    const kept = Math.max(0, curSave-remainder);
    setCash(c=>c+kept);                                  // net savings after tax, bills (and any uncovered surprise)
    setCoins(c=>c+10); setXp(x=>x+20); fx("reward",25);
    setInvAmt(null);
    setCareer(cur=>({...cur, period:(cur.period||0)+1, awaitingInvest:true, awaitingAmt:kept, lastPayday:new Date().toDateString(), lastEvent: ev?{...ev,covered,remainder}:null, emergency:(cur.emergency||0)-covered, totalSaved:(cur.totalSaved||0)+kept}));
    if(ev){
      if(covered>=ev.cost)      setTaskCelebrate({emoji:"🛟",title:"Emergency fund to the rescue!",label:`${ev.emoji} ${ev.text} cost ${fs$(ev.cost)} — but your emergency fund covered ALL of it, so your savings are safe! THIS is why you build a fund. 💪`});
      else if(covered>0)        setTaskCelebrate({emoji:ev.emoji,title:`😮 Surprise! ${ev.text}`,label:`It cost ${fs$(ev.cost)}. Your emergency fund covered ${fs$(covered)}, so only ${fs$(remainder)} came out of savings. See how the fund helps? Build it up more! 🛟`});
      else                      setTaskCelebrate({emoji:ev.emoji,title:`😮 Surprise! ${ev.text}`,label:`It cost ${fs$(ev.cost)} and you had no emergency fund, so it came out of savings — you kept ${fs$(kept)}. Start a fund 🛟 so next time you're covered!`});
    } else {
      setTaskCelebrate({emoji:curJob.icon,title:`💰 Payday!  +${fs$(kept)} to save`,label:`${curJob.name} paycheck: ${fs$(curJob.pay)}. Tax took ${fs$(curTax)}, bills took ${fs$(curBills)} — grown-up life! You kept ${fs$(kept)} to invest 👇`});
    }
  };

  // Build the emergency fund — money set safely aside (from cash) to absorb
  // future surprises. Doesn't grow like investing, but keeps curveballs from
  // hurting. A real trade-off: safety now vs. growth later.
  const addEmergency = (amtWanted) => {
    const room = Math.max(0, emGoal - (career.emergency||0));   // don't grow past ~3 months of bills
    if(room < 1){ setTaskCelebrate({emoji:"🛟",title:"Emergency fund is full! 🎉",label:`You've saved about 3 months of bills (${fs$(emGoal)}) — a strong safety net. Put the rest into investing to grow it! 🌱`}); return; }
    const amt=Math.min(Math.max(1,Math.round(amtWanted||0)), Math.floor(cash), room);
    if(amt<1){ setTaskCelebrate({emoji:"💸",title:"No cash to set aside",label:"Collect a paycheck first, then move a little into your emergency fund."}); return; }
    setCash(c=>c-amt); setCareer(cur=>({...cur, emergency:(cur.emergency||0)+amt})); fx("coin",12);
  };

  // 2) Invest your savings into the chosen ETF. Any amount > 0 handles this
  //    paycheck and counts toward your next promotion. Buys real ETF shares.
  const investSavings = (amtWanted) => {
    const asset=MARKET.find(m=>m.ticker===chosenEtf); if(!asset) return;
    const amt=Math.min(Math.max(1,Math.round(amtWanted||0)), Math.floor(cash));
    if(amt<1){ setTaskCelebrate({emoji:"💸",title:"No savings yet!",label:"Collect a paycheck first, then invest what's left after bills."}); return; }
    const price=prices[asset.ticker]||asset.basePrice;
    const qty=amt/price;
    setCash(c=>c-amt);
    setPort(prev=>{ const h=prev.find(p=>p.ticker===asset.ticker); return h?prev.map(p=>p.ticker===asset.ticker?{...p,qty:p.qty+qty,avgCost:(p.avgCost*p.qty+price*qty)/(p.qty+qty)}:p):[...prev,{ticker:asset.ticker,name:asset.name,type:asset.type,qty,avgCost:price,icon:asset.icon,color:asset.color}]; });
    const now=new Date();
    setTrades(ts=>[{id:Date.now()+Math.random(),date:now.toLocaleDateString("en-US",{day:"numeric",month:"short"}),time:now.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),ticker:asset.ticker,name:asset.name,icon:asset.icon,side:"BUY",qty,price,total:amt,pnl:null,auto:true,longTerm:true},...ts]);
    setCoins(c=>c+5); setXp(x=>x+15); fx("reward",25);
    setAutoInvest(a=>({etf:asset.ticker, amount:curSave, active:true, totalInvested:(a?.totalInvested||0)+amt, paydays:(a?.paydays||0)+1}));
    setInvAmt(null);
    // Only a paycheck you were "awaiting" counts toward promotion (one per paycheck).
    if(career.awaitingInvest){
      const need=promoNeed(career.jobIndex);
      const invests=(career.investsAtJob||0)+1;
      if(invests>=need && nextJob){
        setCareer(cur=>({...cur, awaitingInvest:false, awaitingAmt:0, lastEvent:null, investsAtJob:0, jobIndex:cur.jobIndex+1}));
        setTaskCelebrate({emoji:nextJob.icon,title:`🎉 PROMOTED to ${nextJob.name}!`,label:`You invested like a pro, so you leveled up! New pay: ${fs$(nextJob.pay)} every payday (bills go up too — that's real life). More to invest now! 🚀`});
      } else {
        setCareer(cur=>({...cur, awaitingInvest:false, awaitingAmt:0, lastEvent:null, investsAtJob:invests}));
        setTaskCelebrate({emoji:"📈",title:"Invested! 🌱",label:`${fs$(amt)} into ${asset.name} — planted for the long run. ${nextJob?`Invest from ${need-invests} more paycheck${need-invests===1?"":"s"} to get promoted to ${nextJob.name}!`:"You're at the TOP job — keep investing to grow rich! 🏆"}`});
      }
    } else {
      setTaskCelebrate({emoji:"📈",title:"Invested! 🌱",label:`${fs$(amt)} into ${asset.name} — planted for the long run to grow.`});
    }
  };
  const pickEtf = (t) => { setInvPickEtf(t); if(autoInvest) setAutoInvest(a=>({...a,etf:t})); };

  // Time Machine: project a value forward at ~7%/yr with monthly contributions.
  const projectFuture = (years,principal,monthly) => {
    const r=0.07, mr=r/12, months=years*12;
    const fvP=principal*Math.pow(1+r,years);
    const fvC=mr>0?monthly*((Math.pow(1+mr,months)-1)/mr):monthly*months;
    return fvP+fvC;
  };

  // ── Market status (refreshed each minute) ──
  const [mkt, setMkt] = useState(getMarketStatus());
  useEffect(()=>{ const id=setInterval(()=>setMkt(getMarketStatus()),20000); return()=>clearInterval(id); },[]);

  const openTrade=(asset,mode="buy")=>{
    setTradeAsset(asset); setTradeMode(mode);
    setTradeQty(asset.type==="crypto"?.1:1);
    setOrderType("market");
    setLimitPrice(+(prices[asset.ticker]||asset.basePrice).toFixed(2));
  };

  // Core fill logic — actually moves money & shares. Used by instant trades AND filled orders.
  const fillOrder = ({ticker,name,type,icon,color,side,qty,price}) => {
    const total = price*qty;
    const heldPos = portfolio.find(p=>p.ticker===ticker);
    const now=new Date();
    const dateStr=now.toLocaleDateString("en-US",{day:"numeric",month:"short"});
    const timeStr=now.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
    if(side==="buy"){
      if(heldPos) setPort(prev=>prev.map(p=>p.ticker===ticker?{...p,qty:p.qty+qty,avgCost:(p.avgCost*p.qty+price*qty)/(p.qty+qty)}:p));
      else setPort(prev=>[...prev,{ticker,name,type,qty,avgCost:price,icon,color}]);
      setCash(c=>c-total);
      setInvCards(cs=>[...cs,{id:Date.now()+Math.random(),ticker,name,icon,color,buyPrice:price,qty,earnedAt:dateStr,tier:"⬜ Common"}]);
      setTrades(ts=>[{id:Date.now()+Math.random(),date:dateStr,time:timeStr,ticker,name,icon,side:"BUY",qty,price,total,pnl:null},...ts]);
    } else {
      const realized = (price-(heldPos?.avgCost||price))*qty;
      const realizedPct = heldPos?.avgCost ? ((price-heldPos.avgCost)/heldPos.avgCost*100) : 0;
      setPort(prev=>prev.map(p=>p.ticker===ticker?{...p,qty:+(p.qty-qty).toFixed(6)}:p).filter(p=>p.qty>0.000001));
      setCash(c=>c+total);
      setTrades(ts=>[{id:Date.now()+Math.random(),date:dateStr,time:timeStr,ticker,name,icon,side:"SELL",qty,price,total,pnl:realized,pnlPct:realizedPct.toFixed(1)},...ts]);
    }
    setXp(x=>x+50); setCoins(c=>c+10);
    // Best-effort parent alert via Telegram (never blocks the trade)
    try {
      const verb = side==="buy" ? "🟢 bought" : "🔴 sold";
      const qtyLabel = type==="crypto" ? `${qty} ${name}` : `${qty} ${name} ${qty===1?"share":"shares"}`;
      window.toyboxSync?.notify?.(`${user?.name||"Your child"} ${verb} ${qtyLabel} at ${fs$(price)} (${fs$(total)}).`);
    } catch(e) {}
  };

  const execTrade=()=>{
    if(!tradeAsset) return;
    const isSell = tradeMode==="sell";
    // Tokens only limit BUYING. Selling is always allowed so kids can manage what they own.
    if(!isSell && tokens===0) return;
    const livePrice=prices[tradeAsset.ticker]||tradeAsset.basePrice;
    const isCrypto = tradeAsset.type==="crypto";
    const total=livePrice*tradeQty;
    // Basic validation
    if(tradeMode==="buy" && (orderType==="market"?total:limitPrice*tradeQty) > cash) return;
    const held=portfolio.find(p=>p.ticker===tradeAsset.ticker)?.qty||0;
    if(isSell&&held<tradeQty)return;

    const base={ticker:tradeAsset.ticker,name:tradeAsset.name,type:tradeAsset.type,icon:tradeAsset.icon,color:tradeAsset.color,side:tradeMode,qty:tradeQty};
    // Only buys spend a token
    const spendToken = ()=>{ if(!isSell) setTokens(t=>Math.max(0,t-1)); };

    // CASE 1: Limit order → always queue (waits for target price)
    if(orderType==="limit"){
      setPending(o=>[{...base,id:Date.now(),kind:"limit",limitPrice:+limitPrice,placedAt:Date.now(),placed:new Date().toLocaleDateString("en-US",{day:"numeric",month:"short"})},...o]);
      setOrderToast({type:"limit",name:tradeAsset.name,side:tradeMode,price:limitPrice});
      spendToken();
      fx("tap",12); setTradeAsset(null);
      setTimeout(()=>setOrderToast(null),3500);
      return;
    }

    // CASE 2: Market order on a CLOSED stock market → queue for next open
    if(!isCrypto && !mkt.open){
      setPending(o=>[{...base,id:Date.now(),kind:"queued",placedAt:Date.now(),placed:new Date().toLocaleDateString("en-US",{day:"numeric",month:"short"})},...o]);
      setOrderToast({type:"queued",name:tradeAsset.name,side:tradeMode,when:mkt.nextOpenText});
      spendToken();
      fx("tap",12); setTradeAsset(null);
      setTimeout(()=>setOrderToast(null),3500);
      return;
    }

    // CASE 3: Instant fill (crypto anytime, or stock during open hours)
    fillOrder({...base,price:livePrice});
    spendToken();
    setSuccess({mode:tradeMode,name:tradeAsset.name,icon:tradeAsset.icon,total});
    fx(tradeMode==="buy"?"buy":"sell",18);
    setTradeAsset(null);
    setTimeout(()=>setSuccess(null),2000);
  };

  const cancelOrder = (id) => { setPending(o=>o.filter(x=>x.id!==id)); fx("tap",10); };

  // ── ORDER MATCHING ENGINE ──
  // Fills limit orders when target hit, and queued market orders once the market is open.
  // Runs: on app open/login (sweep), when market flips open, and on every price tick.
  // ── HISTORICAL BACKFILL ──
  // On app open, scan REAL price history since each order was placed.
  // If the kid's target was ever hit while the app was closed (e.g. at
  // school), fill the order at the target price — even though "now" may
  // have moved past it. This is the fair "set a smart limit and it
  // triggers even if you weren't watching" behaviour.
  const backfillOrders = async () => {
    const open = pendingOrders;
    if(!open || open.length===0) return;

    // Group tickers we need history for
    const tickers = [...new Set(open.map(o=>o.ticker))];
    const history = {}; // ticker -> array of {t, lo, hi} candles

    for(const tk of tickers){
      const ord = open.find(o=>o.ticker===tk);
      const since = ord.placedAt || (Date.now()-86400000); // default 1 day back
      // Practice market has no historical feed — pending orders fill live via
      // matchPendingOrders when the simulated price crosses the target.
      void since;
    }

    // Decide fills from history
    const fills=[]; const stillOpen=[];
    open.forEach(ord=>{
      const candles = history[ord.ticker];
      if(!candles || candles.length===0){ stillOpen.push(ord); return; }
      let hitPrice=null;
      if(ord.kind==="limit"){
        for(const c of candles){
          // buy limit: filled if price dipped to/below target → fill AT target
          if(ord.side==="buy" && c.lo<=ord.limitPrice){ hitPrice=ord.limitPrice; break; }
          // sell limit: filled if price rose to/above target → fill AT target
          if(ord.side==="sell" && c.hi>=ord.limitPrice){ hitPrice=ord.limitPrice; break; }
        }
      } else {
        // queued market order: fills at the first available historical price after placing
        hitPrice = candles[0] ? (candles[0].lo+candles[0].hi)/2 : null;
      }
      if(hitPrice!=null) fills.push({ord,fillPrice:hitPrice});
      else stillOpen.push(ord);
    });

    if(fills.length>0){
      // Same affordability rules as live matching: unaffordable orders stay
      // pending rather than silently disappearing.
      const executed=[]; let short=null; let cashLeft=cash;
      fills.forEach(({ord,fillPrice})=>{
        const held=portfolio.find(p=>p.ticker===ord.ticker)?.qty||0;
        const cost=fillPrice*ord.qty;
        if((ord.side==="buy" && cost>cashLeft) || (ord.side==="sell" && held<ord.qty)){
          stillOpen.push(ord);
          if(ord.side==="buy" && !warnedOrders.current.has(ord.id)){
            warnedOrders.current.add(ord.id);
            short={name:ord.name,needed:cost};
          }
          return;
        }
        cashLeft += ord.side==="buy" ? -cost : cost;
        fillOrder({ticker:ord.ticker,name:ord.name,type:ord.type,icon:ord.icon,color:ord.color,side:ord.side,qty:ord.qty,price:fillPrice});
        executed.push({ord,fillPrice});
      });
      setPending(stillOpen);
      if(executed.length>0){
        const last=executed[executed.length-1];
        setOrderToast({type:"backfill",name:last.ord.name,side:last.ord.side,price:last.fillPrice,count:executed.length});
        fx("reward",30);
        setTimeout(()=>setOrderToast(null),5000);
      } else if(short){
        setOrderToast({type:"insufficient",name:short.name,needed:short.needed});
        setTimeout(()=>setOrderToast(null),6000);
      }
    }
  };

  // Run the historical backfill shortly after app open (once)
  useEffect(()=>{ const t=setTimeout(()=>backfillOrders(),1800); return()=>clearTimeout(t); },[]);

  // Deep-link: tapping the weekly "report is ready" push opens ?view=report,
  // so land the parent straight on the Report Card, then clean the URL.
  useEffect(()=>{
    try{
      const params=new URLSearchParams(location.search);
      if(params.get("view")==="report"){
        setNav("More"); setMoreView("Report");
        const u=new URL(location.href); u.searchParams.delete("view");
        history.replaceState({}, "", u.pathname+u.search+u.hash);
      }
    }catch(e){}
  },[]);

  const matchPendingOrders = () => {
    setPending(prev=>{
      if(prev.length===0) return prev;
      const stillPending=[];
      const filled=[];
      prev.forEach(ord=>{
        const isCrypto = ord.type==="crypto";
        const live = prices[ord.ticker] ?? INIT_PRICES[ord.ticker];
        if(live==null){ stillPending.push(ord); return; }
        const marketAvailable = isCrypto || mkt.open;
        if(ord.kind==="limit"){
          const hit = ord.side==="buy" ? live<=ord.limitPrice : live>=ord.limitPrice;
          if(hit && marketAvailable){ filled.push({ord,fillPrice:live}); }
          else stillPending.push(ord);
        } else { // queued market order
          if(marketAvailable){ filled.push({ord,fillPrice:live}); }
          else stillPending.push(ord);
        }
      });
      if(filled.length>0){
        // Fill what the kid can afford; anything unaffordable stays PENDING
        // (never silently deleted) and we tell them why — once per order.
        const executed=[]; let short=null; let cashLeft=cash;
        filled.forEach(({ord,fillPrice})=>{
          const held=portfolio.find(p=>p.ticker===ord.ticker)?.qty||0;
          const cost=fillPrice*ord.qty;
          if((ord.side==="buy" && cost>cashLeft) || (ord.side==="sell" && held<ord.qty)){
            stillPending.push(ord);
            if(ord.side==="buy" && !warnedOrders.current.has(ord.id)){
              warnedOrders.current.add(ord.id);
              short={name:ord.name,needed:cost};
            }
            return;
          }
          cashLeft += ord.side==="buy" ? -cost : cost;
          fillOrder({ticker:ord.ticker,name:ord.name,type:ord.type,icon:ord.icon,color:ord.color,side:ord.side,qty:ord.qty,price:fillPrice});
          executed.push({ord,fillPrice});
        });
        if(executed.length===0){
          if(short){ setOrderToast({type:"insufficient",name:short.name,needed:short.needed}); setTimeout(()=>setOrderToast(null),6000); }
          return stillPending;
        }
        const lastFill=executed[executed.length-1];
        setOrderToast({type:"filled",name:lastFill.ord.name,side:lastFill.ord.side,price:lastFill.fillPrice,count:executed.length});
        fx("reward",25);
        setTimeout(()=>setOrderToast(null),4500);
      }
      return stillPending;
    });
  };

  // Run on price changes and whenever market opens/closes
  useEffect(()=>{ matchPendingOrders(); },[prices,mkt.open]);
  // Sweep once shortly after app open / login — catches orders that should have filled while away
  useEffect(()=>{ const t=setTimeout(()=>matchPendingOrders(),1200); return()=>clearTimeout(t); },[]);
  // Safety net: re-check every 15s in case a tick was missed
  useEffect(()=>{ const id=setInterval(()=>matchPendingOrders(),15000); return()=>clearInterval(id); },[prices,mkt.open,cash,portfolio]);

  // Slide timer — resets each time slide changes
  useEffect(()=>{
    if(!lesson) return;
    setSlideTimer(0); setSlideReady(false);
    const tick = setInterval(()=>setSlideTimer(t=>{
      if(t+1>=3) setSlideReady(true);
      return t+1;
    }),1000);
    return()=>clearInterval(tick);
  },[lessonSlide, lesson?.id]);

  const openLesson = ls => {
    if((LEVEL_OF[ls.id]||1)>=3 && !isPremium){ setShowPlus(true); return; }   // Levels 3–4 are Plus
    const saved = lessonProgress[ls.id];
    setLesson(ls); setChallengeMode(false);
    setLessonSlide(saved?.slide||0);
    setSlideReady(false); setSlideTimer(0);
    setInQuiz(false); setQIdx(0); setQAnswer(null); setQWrong(false);
    setHearts(3); setCombo(0); setBuddyAnim("idle"); setLevelWon(false);
  };
  // Harder Round 2 — skips the slides, jumps straight to the tougher quiz that
  // connects back to earlier lessons. Pays the lesson's cash again if cleared.
  const openChallenge = ls => {
    if(!LESSON_CHALLENGE[ls.id]) return;
    if(!buddy){ setPickBuddy(true); return; }
    setLesson(ls); setChallengeMode(true);
    setInQuiz(true); setQIdx(0); setQAnswer(null); setQWrong(false);
    setHearts(3); setCombo(0); setBuddyAnim("idle"); setLevelWon(false);
  };
  // The quiz currently in play (harder Round 2, or the normal lesson quiz).
  const activeQuiz = () => (challengeMode && lesson && LESSON_CHALLENGE[lesson.id]) ? LESSON_CHALLENGE[lesson.id] : (lesson?.quiz || []);

  const advanceSlide = () => {
    if(!slideReady) return;
    const next = lessonSlide+1;
    setLessonProg(p=>({...p,[lesson.id]:{slide:next,seen:[...(p[lesson.id]?.seen||[]),lessonSlide]}}));
    setLessonSlide(next);
  };

  // ── Adventure game (replaces quiz) ──
  const startGame = () => {
    // Need a buddy first
    if(!buddy){ setPickBuddy(true); return; }
    setInQuiz(true); setQIdx(0); setQAnswer(null); setQWrong(false);
    setHearts(3); setCombo(0); setBuddyAnim("idle"); setLevelWon(false);
  };

  const answerGame = (i) => {
    if(qAnswer!==null) return;       // already answered, wait
    const quiz = activeQuiz();
    const q = quiz[qIdx];
    setQAnswer(i);
    if(i===q.correct){
      // Correct → hop forward, coins burst, combo up
      setQWrong(false);
      setCombo(c=>c+1);
      setBuddyAnim("hop");
      setCoinBurst(true); fx("correct",15);
      setTimeout(()=>setCoinBurst(false),700);
      setTimeout(()=>{
        if(qIdx < quiz.length-1){
          setQIdx(x=>x+1); setQAnswer(null); setBuddyAnim("idle");
        } else {
          // Reached the goal → win + cheer
          setBuddyAnim("cheer"); setLevelWon(true); fx("reward",30);
          setTimeout(()=>{ challengeMode ? completeChallenge(lesson.id) : completeLesson(lesson.id); }, 1600);
        }
      },800);
    } else {
      // Wrong → lose a heart, screen shake, buddy sad
      setQWrong(true); setCombo(0);
      setBuddyAnim("sad"); setShake(true); fx("wrong",30);
      setTimeout(()=>setShake(false),420);
      setHearts(h=>{
        const left=h-1;
        if(left<=0){
          // Out of hearts → tumble back to checkpoint 1
          setTimeout(()=>{ setQIdx(0); setQAnswer(null); setQWrong(false); setHearts(3); setCombo(0); setBuddyAnim("idle"); },1400);
        }
        return left;
      });
    }
  };

  const retryCheckpoint = () => { setQAnswer(null); setQWrong(false); setBuddyAnim("idle"); };
  const reviewLesson = () => { setInQuiz(false); setLessonSlide(0); setSlideReady(false); setSlideTimer(0); setQAnswer(null); setQWrong(false); setLevelWon(false); };

  const closeLesson = () => {
    if(lesson && !challengeMode) setLessonProg(p=>({...p,[lesson.id]:{...(p[lesson.id]||{}),slide:lessonSlide}}));
    setLesson(null); setChallengeMode(false); setInQuiz(false);
  };

  // Grant a rare collectible card (used by the daily bonus + spin wheel).
  const grantRareCard = () => {
    // Collectibles are the fun single stocks + crypto — not ETFs/bonds/gold.
    const pool = MARKET.filter(a=>a.cat==="stock"||a.cat==="crypto");
    const a = pool[Math.floor(Math.random()*pool.length)];
    setInvCards(cs=>[...cs,{id:Date.now()+Math.random(),ticker:a.ticker,name:a.name,icon:a.icon,color:a.color,buyPrice:prices[a.ticker]||a.basePrice,qty:0,earnedAt:new Date().toLocaleDateString("en-US",{day:"numeric",month:"short"}),tier:"✨ Rare"}]);
  };

  // Report a bug / problem — kid-friendly, emails our support address.
  const sendBug = async () => {
    if(bugState==="sending") return;
    const cat = BUG_CATS.find(c=>c.id===bugCat);
    setBugState("sending");
    try {
      const r = await fetch(apiUrl("/api/report-bug"),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
        category: cat?cat.label:"Something else",
        message: bugMsg,
        name: user.name,
        age: user.age,
        contactEmail: bugEmail.trim(),
        screen: nav,
        appVersion: (typeof location!=="undefined"?location.host:""),
        userAgent: (typeof navigator!=="undefined"?navigator.userAgent:""),
      })});
      const d = await r.json().catch(()=>({}));
      if(d&&d.ok){ setBugConfirmed(!!d.confirmed); setBugState("done"); fx("reward",20); }
      else { setBugErr((d&&d.error)?String(d.error):`http ${r.status}`); setBugState("error"); }
    } catch(e){ setBugErr(String(e&&e.message||e)); setBugState("error"); }
  };

  // Ask Toby — send a question to the kid-safe AI money coach with the child's
  // own play-money context. History is kept short; roles are user/assistant.
  const COACH_DAILY_LIMIT = 10;   // caps API cost + healthy screen-time
  const coachDayKey = () => `toybox:coach:${user?.id||"k"}:${new Date().toDateString()}`;
  const coachUsedToday = () => { try{ return parseInt(localStorage.getItem(coachDayKey())||"0",10)||0; }catch(e){ return 0; } };
  const sendCoach = async (text) => {
    const q = (text||coachInput).trim();
    if(!q || coachBusy) return;
    if(coachUsedToday() >= COACH_DAILY_LIMIT){
      setCoachMsgs(m=>[...m,{role:"user",content:q},{role:"assistant",content:`🦊 Phew, we've talked a LOT today — ${COACH_DAILY_LIMIT} questions! I need a little rest. Come back tomorrow and ask me more. See you then! 💤`}]);
      setCoachInput("");
      return;
    }
    try{ localStorage.setItem(coachDayKey(), String(coachUsedToday()+1)); }catch(e){}
    const history = [...coachMsgs, {role:"user",content:q}];
    setCoachMsgs(history); setCoachInput(""); setCoachBusy(true);
    try {
      const holdings = portfolio.map(h=>{ const a=MARKET.find(m=>m.ticker===h.ticker); return {ticker:h.ticker,name:a?a.name:h.ticker,qty:h.qty,value:h.qty*(prices[h.ticker]||h.avgCost)}; });
      const r = await fetch(apiUrl("/api/coach"),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
        messages: history,
        profile: {name:user?.name, age:user?.age},
        stats: {cash, coins, xp, streak, lessonsDone:doneLesson.length, lessonsTotal:LESSONS.length, holdings},
      })});
      const d = await r.json().catch(()=>({}));
      if(d&&d.ok&&d.reply) setCoachMsgs(m=>[...m,{role:"assistant",content:d.reply}]);
      else setCoachMsgs(m=>[...m,{role:"assistant",content: d?.error==="coach-not-configured" ? "🦊 Toby is taking a little nap right now — check back soon!" : "🦊 Oops, my whiskers got crossed. Try asking me again!"}]);
    } catch(e){ setCoachMsgs(m=>[...m,{role:"assistant",content:"🦊 I couldn't hear you — is your internet okay? Try again!"}]); }
    setCoachBusy(false);
  };

  const completeLesson = id => {
    const ls = LESSONS.find(l=>l.id===id);
    if(!ls) return;
    setLastLessonAt(Date.now());  // any lesson pass counts toward the weekly jackpot gate
    // Reward only granted after passing the quiz (called from answerQuiz)
    if(!doneLesson.includes(id)){
      const reward = ls.cashReward||50;
      setDoneLesson(d=>[...d,id]); setLessonDates(m=>({...m,[id]:Date.now()})); setXp(x=>x+200); setCoins(c=>c+50); setCash(c=>c+reward);
      setLessonProg(p=>{const n={...p};delete n[id];return n;});
      // Which lessons unlock a "try it now" action?
      const tryMap = {
        exit_strategy:{label:"🎯 Try a limit order",act:"limit"},
        when_buy:{label:"🎯 Try buying on a dip",act:"limit"},
        when_sell:{label:"🎯 Try a take-profit order",act:"limit"},
        dca:{label:"⚡ Make your first buy",act:"trade"},
        buy_hold:{label:"⚡ Buy something to hold",act:"trade"},
        diversify_deep:{label:"⚡ Add a different asset",act:"trade"},
        index:{label:"⚡ Go to the market",act:"trade"},
        value_growth:{label:"⚡ Go find a bargain",act:"trade"},
      };
      setCashReward({amount:reward,lesson:ls.title,tryIt:tryMap[id]||null});
      fx("reward",30);
      // Auto-dismiss only if there's no "try it" button to tap
      if(!tryMap[id]) setTimeout(()=>setCashReward(null),3500);
    }
    setLesson(null); setInQuiz(false);
  };

  // Clearing a lesson's harder Round 2 pays the lesson's cash AGAIN (once) —
  // extra money to invest, earned by proving they remember the earlier lessons.
  const completeChallenge = id => {
    const ls = LESSONS.find(l=>l.id===id);
    if(ls && !doneChallenge.includes(id)){
      const reward = ls.cashReward||50;
      setDoneChallenge(d=>[...d,id]); setXp(x=>x+150); setCoins(c=>c+40); setCash(c=>c+reward);
      setCashReward({amount:reward,lesson:`${ls.title} — Challenge cleared! 🔥`,tryIt:null});
      fx("reward",30);
      setTimeout(()=>setCashReward(null),4000);
    }
    setLesson(null); setInQuiz(false); setChallengeMode(false);
  };

  const doSpin=()=>{
    if(spinning||lastSpin===new Date().toDateString())return;
    setSpinning(true);
    const idx=Math.floor(Math.random()*SPIN_PRIZES.length);
    const prize=SPIN_PRIZES[idx];
    const deg=1440+(idx/SPIN_PRIZES.length)*360;
    setSpinDeg(d=>d+deg);
    setTimeout(()=>{
      setSpinning(false);setLastSpin(new Date().toDateString());setSpinResult(prize);fx("coin",20);
      if(prize.type==="coins")setCoins(c=>c+prize.val);
      if(prize.type==="cash") setCash(c=>c+prize.val);
      if(prize.type==="xp")   setXp(x=>x+prize.val);
      if(prize.type==="card") grantRareCard();  // previously unhandled — card prize gave nothing
    },4100);
  };

  // ── Daily login bonus ──
  // Show the popup once per calendar day. Runs after hydration so streak (set
  // by the streak effect) is settled and lastBonusClaim is loaded.
  useEffect(()=>{
    if(!hydrated || !tourDone) return;  // wait until the intro tour is dismissed
    if(lastBonusClaim !== new Date().toDateString()) setShowDailyBonus(true);
  },[hydrated,tourDone]);

  const claimDailyBonus = () => {
    const idx = (Math.max(1,streak)-1)%7;             // 0..6 → day 1..7
    const r = DAILY_BONUS[idx];
    const learnedThisWeek = lastLessonAt && (Date.now()-lastLessonAt < 7*86400000);
    const locked = !!r.jackpot && !learnedThisWeek;
    const award = locked ? {coins:100} : r;           // jackpot locked → coins-only consolation
    if(award.coins)  setCoins(c=>c+award.coins);
    if(award.cash)   setCash(c=>c+award.cash);
    if(award.tokens) setTokens(t=>t+award.tokens);
    if(award.card)   grantRareCard();
    setLastBonusClaim(new Date().toDateString());
    setBonusResult({...award, day:idx+1, jackpot:!!r.jackpot, locked});
    fx("reward",30);
  };

  // ── Toybox Plus (premium) ──
  // Premium is a family-level flag synced via the cloud. When a device first
  // sees it flip on, celebrate + grant the kid an instant reward (so the
  // parent's "yes" feels amazing to the kid).
  useEffect(()=>{ (async()=>{
    if(!hydrated) return;
    const r = await loadData("toybox:family:premium");
    const prem = r===true || r==="1" || r===1;
    setIsPremium(prem);
    if(prem){
      let seen=false; try{ seen=localStorage.getItem("toybox:sync:premiumseen")==="1"; }catch(e){}
      if(!seen){
        try{ localStorage.setItem("toybox:sync:premiumseen","1"); }catch(e){}
        setCoins(c=>c+500);
        setOwned(o=>[...new Set([...o,"pet_crown","frame_gold"])]);
        setPlusCelebrate(true);
        fx("reward",40);
      }
    }
  })(); },[hydrated]);

  const askGrownup = () => {
    try {
      window.toyboxSync?.notify?.(`⭐ ${user?.name||"Your child"} wants Toybox Plus! They're on a ${Math.max(1,streak)}-day streak 🔥. To unlock: open Toybox Trader → tap the ☁️ button → Unlock Toybox Plus.`);
    } catch(e) {}
    setAskedPlus(true);
    fx("reward",20);
  };

  const startChallenge=sib=>{
    setChallenge({sib,myGain:allTimeGain,sibGain:sib.portPnl,started:new Date().toLocaleDateString("en-US"),ends:new Date(Date.now()+7*86400000).toLocaleDateString("en-US",{day:"numeric",month:"short"})});
  };

  const makePred=(asset,dir)=>{
    const code=Math.floor(Math.random()*200+1);
    setPreds(ps=>[...ps,{id:Date.now(),ticker:asset.ticker,name:asset.name,icon:asset.icon,dir,price:prices[asset.ticker]||asset.basePrice,resolves:new Date(Date.now()+7*86400000).toLocaleDateString("en-US",{day:"numeric",month:"short"}),status:"open",correct:null}]);
    setPredSel(null);setXp(x=>x+30);setCoins(c=>c+10);
  };

  const joinClub=(amt)=>{
    if(amt>cash)return;
    setCash(c=>c-amt);
    setClubPool(p=>({total:p.total+amt,members:[...p.members,{name:user?.name||"You",avatar,amt}]}));
  };

  const MISSIONS=[
    {id:"m1",icon:"📚",title:"Complete your first lesson",sub:"Tap Learn and start 'What is Money?'",action:()=>setNav("Learn")},
    {id:"m2",icon:"🧱",title:"Make your first trade",sub:"Tap Trade ⚡ and buy 1 Apple Building Block",action:()=>setNav("Trade")},
    {id:"m3",icon:"🔮",title:"Make a price prediction",sub:"Tap the ••• menu → Predict",action:()=>{setMoreOpen(true);setMoreView("Predict");}},
  ];

  const TOUR_STEPS=[
    {step:1,icon:"🧸",title:`Welcome, ${user?.name||""}! 🎉`,body:"You have $1,000 of pretend money. Grow it as big as possible before the end of the month. The kid with the biggest Money Garden WINS! 🏆",cta:"Show me around →"},
    {step:2,icon:"📚",title:"ALWAYS learn first!",body:"Before trading a single dollar, complete at least the first lesson in Learn. Each lesson gives you REAL paper money added to your garden. Knowledge = more cash!",cta:"Got it →"},
    {step:3,icon:"🎯",title:"Missions tell you what to do",body:"Your 3 daily missions give step-by-step instructions — exactly what to tap and where to go. Do Mission 1 first, then 2, then 3. The order matters!",cta:"OK! →"},
    {step:4,icon:"🔧",title:"Your 5 tabs explained",body:"🏠 Home · ⚡ Trade · 📚 Learn · 💼 Assets · ••• More (Ranks, Cards, Challenges, Predictions, Club, Report Card!)",cta:"Let's start with Learn! 📚",goTo:"Learn"},
  ];
  const tourS=TOUR_STEPS.find(t=>t.step===tourStep);

  const lv=Math.floor(xp/500)+1;
  const toRealMoney=(n)=>{if(n>=999)return"a PS5 + 2 games";if(n>=500)return"an iPad case + 50 apps";if(n>=200)return"6 months of Spotify";if(n>=100)return"3 months of Netflix";if(n>=50)return"5 McDonald's meals";return`${Math.round(n*10)} Robux`;};

  const petState=portVal===0?"😴":(portVal>portfolio.reduce((s,h)=>s+h.qty*h.avgCost,0)+50?"🥳":portVal<portfolio.reduce((s,h)=>s+h.qty*h.avgCost,0)-50?"😰":"😊");
  const petMsg={
    "😴":"I'm napping... wake me up by making your first trade! 💤",
    "🥳":"WE'RE UP! Your investments are doing GREAT! Keep holding! 🚀",
    "😰":"Down a bit... but don't panic! Good companies always come back. Breathe! 🧘",
    "😊":"Looking healthy! Keep diversifying and checking the news! 📰",
  }[petState];

  const weekStats={best:portfolio.reduce((b,h)=>{const g=(prices[h.ticker]||h.avgCost)-h.avgCost;return g>b.g?{name:h.name,g}:b;},{name:"None",g:0}),trades:portfolio.length,gainPct:portVal>0?parseFloat(pct(portVal,portfolio.reduce((s,h)=>s+h.qty*h.avgCost,0))):0};
  const reportGrade=weekStats.gainPct>=10?"A+":weekStats.gainPct>=5?"A":weekStats.gainPct>=0?"B":weekStats.gainPct>=-5?"C":"D";

  // Grouped so the drawer reads as tidy sections instead of one long grid.
  const MORE_GROUPS=[
    {title:"🦊 Money Coach",items:[
      {id:"Coach",   icon:"🦊",label:"Ask Toby"},
    ]},
    {title:"💰 Money & Tasks",items:[
      {id:"Invest",  icon:"🏦",label:"Money Machine"},
      {id:"Tasks",   icon:"✅",label:"My Tasks"},
      ...(ttEnabled?[{id:"Together",icon:"💛",label:"Together"}]:[]),
      {id:"Shop",    icon:"🛍️",label:"Shop"},
      {id:"Orders",  icon:"⏳",label:"Orders"},
    ]},
    {title:"🎮 Games & Fun",items:[
      {id:"Cards",   icon:"🎴",label:"Cards"},
      {id:"Challenge",icon:"⚔️",label:"Battle"},
      {id:"Predict", icon:"🔮",label:"Predict"},
      {id:"Ranks",   icon:"🏆",label:"Ranks"},
      {id:"Club",    icon:"🤝",label:"Club"},
    ]},
    {title:"⭐ My Progress",items:[
      {id:"Badges",  icon:"🏅",label:"Badges"},
      {id:"Performance",icon:"📈",label:"P&L"},
      {id:"Report",  icon:"📊",label:"Report"},
    ]},
    {title:"⚙️ Settings",items:[
      {id:"Backup",  icon:"💾",label:"Backup"},
    ]},
  ];

  return(
    <div className="dash" style={{background:theme.bg,transition:"background .4s ease"}}>
      {/* Order placed / filled toast */}
      {orderToast&&(
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:320,padding:"12px 16px",background:(orderToast.type==="filled"||orderToast.type==="backfill"||(orderToast.type==="pred"&&orderToast.wins>0))?"rgba(4,120,87,.96)":orderToast.type==="insufficient"?"rgba(180,83,9,.96)":"rgba(124,58,237,.96)",color:"#fff",animation:"slideDown .4s ease",display:"flex",alignItems:"center",gap:10}} onClick={()=>setOrderToast(null)}>
          <span style={{fontSize:22}}>{orderToast.type==="filled"?"✅":orderToast.type==="backfill"?"🎯":orderToast.type==="limit"?"🎯":orderToast.type==="pred"?"🔮":orderToast.type==="insufficient"?"⏳":"⏰"}</span>
          <div style={{flex:1,fontSize:13,fontWeight:800,lineHeight:1.4}}>
            {orderToast.type==="filled"&&<>Order filled! {orderToast.side==="buy"?"Bought":"Sold"} {orderToast.name} at {fs$(orderToast.price)}{orderToast.count>1?` (+${orderToast.count-1} more)`:""} 🎉</>}
            {orderToast.type==="backfill"&&<>While you were away, {orderToast.name} hit your target! {orderToast.side==="buy"?"Bought":"Sold"} at {fs$(orderToast.price)}{orderToast.count>1?` (+${orderToast.count-1} more)`:""} 🎯🎉</>}
            {orderToast.type==="limit"&&<>Limit order placed! We'll {orderToast.side} {orderToast.name} when it hits {fs$(orderToast.price)}. Check ••• → Orders.</>}
            {orderToast.type==="queued"&&<>Order queued! {orderToast.name} will {orderToast.side} at next open ({orderToast.when}). Check ••• → Orders.</>}
            {orderToast.type==="pred"&&(orderToast.wins>0
              ?<>🔮 Your {orderToast.name} prediction came TRUE! +{50*orderToast.wins} XP, +{25*orderToast.wins} coins! 🎉</>
              :<>🔮 Your {orderToast.name} prediction didn't land this time — markets are tricky! Try another one.</>)}
            {orderToast.type==="insufficient"&&<>⏳ {orderToast.name} hit your target, but you don't have enough cash right now ({fs$(orderToast.needed)} needed). The order is still waiting — sell something or wait for coins!</>}
          </div>
          <span style={{fontSize:14,opacity:.6}}>✕</span>
        </div>
      )}

      {/* Stock alert toast */}
      {alertToast&&(
        <div className={`alert-toast ${alertToast.chg>0?"up":"dn"}`} onClick={()=>setAlertToast(null)}>
          <span style={{fontSize:20}}>{alertToast.icon}</span>
          <div style={{flex:1}}>
            <strong>{alertToast.name}</strong>{" "}is {alertToast.chg>0?"UP":"DOWN"}{" "}{Math.abs(alertToast.chg).toFixed(1)}{"% "}
            {portfolio.find(h=>h.ticker===alertToast.ticker)&&<span>{"— your investment "}{alertToast.chg>0?"gained":"lost"}{" "}{fs$(Math.abs(alertToast.chg/100*(portfolio.find(h=>h.ticker===alertToast.ticker)?.qty||0)*(alertToast.cur||0)))}{"!"}</span>}
          </div>
          <span style={{fontSize:14,opacity:.6}}>✕</span>
        </div>
      )}

      {/* Topbar */}
      <div className="topbar" style={{paddingTop:alertToast?"50px":undefined,transition:"padding .3s"}}>
        <div className="tb-av">{avatar}</div>
        <div style={{flex:1,minWidth:0}}>
          <div className="tb-name">Hey, {user?.name}! 👋</div>
          <div className="tb-sub">Lv{lv} · {mkt.open?"🟢 Mkt open":"🔴 Mkt closed"}{pendingOrders.length>0?` · ⏳${pendingOrders.length}`:""} · 🎮 Practice</div>
        </div>
        <div className="tb-right">
          <div className="tb-chip fire">🔥 {streak}d</div>
          <div className="tb-chip gold">🪙{coins}</div>
          <div className="tb-chip">{fs$(totalValue)}</div>
          <button onClick={()=>{setTourStep(1);setTourDone(false);}} style={{width:30,height:30,borderRadius:"50%",border:"1px solid rgba(255,255,255,.2)",background:"rgba(255,255,255,.1)",color:"rgba(255,255,255,.6)",fontSize:13,cursor:"pointer",flexShrink:0}}>❓</button>
        </div>
      </div>

      {/* Main */}
      <div className="main">

        {/* HOME */}
        {nav==="Home"&&(
          <div>
            {/* Toybox Plus upsell — only for free families */}
            {!isPremium&&(
              <div onClick={()=>{setShowPlus(true);setAskedPlus(false);}} style={{background:"linear-gradient(135deg,#f59e0b,#f97316)",borderRadius:14,padding:"12px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:10,cursor:"pointer",boxShadow:"0 4px 16px rgba(245,158,11,.35)"}}>
                <span style={{fontSize:24}}>⭐</span>
                <div style={{flex:1}}>
                  <div style={{fontFamily:"var(--fd)",fontSize:14,color:"#fff"}}>Unlock Toybox Plus!</div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,.9)",fontWeight:700,marginTop:1}}>More adventures, a royal crown 👑 & family play</div>
                </div>
                <span style={{fontSize:13,fontWeight:800,color:"#fff",background:"rgba(0,0,0,.18)",padding:"5px 10px",borderRadius:100}}>See →</span>
              </div>
            )}
            {/* Welcome back — since last visit */}
            {sinceLastVisit!=null&&Math.abs(sinceLastVisit)>=0.01&&(
              <div style={{background:sinceLastVisit>=0?"rgba(16,185,129,.12)":"rgba(239,68,68,.1)",border:`1px solid ${sinceLastVisit>=0?"rgba(16,185,129,.3)":"rgba(239,68,68,.3)"}`,borderRadius:14,padding:"12px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:22}}>{sinceLastVisit>=0?"📈":"📉"}</span>
                <div>
                  <div style={{fontFamily:"var(--fd)",fontSize:14,color:sinceLastVisit>=0?"#86efac":"#fca5a5"}}>Welcome back, {user?.name}!</div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,.6)",fontWeight:600,marginTop:1}}>Since last time, your garden is {sinceLastVisit>=0?"UP":"DOWN"} {f$(Math.abs(sinceLastVisit))}{sinceLastVisit>=0?" 🎉":" — markets move, stay calm!"}</div>
                </div>
              </div>
            )}
            {/* Money Life nudge — the can't-miss shortcut to the payday loop */}
            {(()=>{
              const jumpMM=()=>{ setMoreView("Invest"); setNav("More"); setMoreOpen(false); };
              const act = career.awaitingInvest; const ready = payReady;
              const hot = act||ready; const waiting = career.awaitingAmt ?? curSave;
              return(
                <div onClick={jumpMM} style={{background:hot?"linear-gradient(135deg,#3b82f6,#2563eb)":"rgba(255,255,255,.05)",border:hot?"none":"1px solid rgba(255,255,255,.12)",borderRadius:16,padding:"13px 15px",marginBottom:12,display:"flex",alignItems:"center",gap:12,cursor:"pointer",boxShadow:hot?"0 5px 18px rgba(59,130,246,.4)":"none",animation:hot?"tapPulse 1.8s ease-in-out infinite":"none"}}>
                  <span style={{fontSize:28,flexShrink:0}}>{act?"📈":ready?"💰":curJob.icon}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontFamily:"var(--fd)",fontSize:15,color:"#fff"}}>{act?`Invest your ${fs$(waiting)} savings!`:ready?`Payday! Collect ${fs$(curJob.pay)} 💼`:`${curJob.name} · Money Machine`}</div>
                    <div style={{fontSize:11,fontWeight:700,color:hot?"rgba(255,255,255,.9)":"rgba(255,255,255,.5)",marginTop:1}}>{act?"Tap to invest it and grow your money 🌱":ready?"Your paycheck is ready — tap to open it":`Next payday in ${payInDays} day${payInDays===1?"":"s"} · tap to visit`}</div>
                  </div>
                  <span style={{fontSize:13,fontWeight:800,color:"#fff",background:"rgba(0,0,0,.18)",padding:"5px 11px",borderRadius:100,flexShrink:0}}>{hot?"Go →":"→"}</span>
                </div>
              );
            })()}

            {/* Pet mascot — feature 7 */}
            <div className="pet-card" style={{borderColor:`${theme.accent}44`,background:`${theme.card}`}}>
              <div className="pet-em">{petState}</div>
              <div style={{flex:1}}>
                <div style={{fontFamily:"var(--fd)",fontSize:14,color:"#fff",marginBottom:4}}>Your Trading Buddy</div>
                <div className="pet-bubble">{petMsg}</div>
              </div>
            </div>

            {/* Money Garden */}
            <div style={{background:`linear-gradient(135deg,${theme.accent}33,${theme.accent}11)`,border:`1px solid ${theme.accent}44`,borderRadius:20,padding:20,marginBottom:12,textAlign:"center"}}>
              <div style={{fontSize:54,animation:"float 3s ease-in-out infinite",display:"block",marginBottom:8,filter:`drop-shadow(0 0 16px ${theme.accent}88)`}}>🌱</div>
              <div style={{fontSize:10,fontWeight:800,color:"rgba(255,255,255,.45)",textTransform:"uppercase",letterSpacing:"1px",marginBottom:4}}>Your Money Garden</div>
              <div style={{fontFamily:"var(--fd)",fontSize:34,color:"#fff",textShadow:`0 0 20px ${theme.accent}88`}}>{f$(totalValue)}</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,.5)",fontWeight:700,marginTop:4}}>💵 {f$(cash)} cash · 📊 {f$(portVal)} invested</div>
              {/* Real money comparison — feature 4 */}
              {allTimeGain!==0&&(
                <div style={{marginTop:10,background:"rgba(255,255,255,.08)",borderRadius:12,padding:"8px 14px",fontSize:12,fontWeight:700,color:allTimeGain>0?"#86efac":"#fca5a5"}}>
                  {allTimeGain>0?"📈 UP":"📉 DOWN"} {f$(Math.abs(allTimeGain))} this month
                  {allTimeGain>0&&<div style={{fontSize:11,color:"rgba(255,255,255,.45)",marginTop:2}}>💡 If this were real money: enough for {toRealMoney(allTimeGain)}!</div>}
                </div>
              )}
            </div>

            {/* Goal setting */}
            {goal==null?(
              <div style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",borderRadius:14,padding:14,marginBottom:12}}>
                <div style={{fontFamily:"var(--fd)",fontSize:14,color:"#fff",marginBottom:4}}>🎯 Set a Goal!</div>
                <div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,.5)",marginBottom:10,lineHeight:1.5}}>Pick a target for your Money Garden. Watching the bar fill up makes investing fun!</div>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                  <span style={{fontSize:12,fontWeight:800,color:"rgba(255,255,255,.6)"}}>Grow to:</span>
                  <input type="range" min={1200} max={3000} step={100} value={goalInput} onChange={e=>setGoalInput(+e.target.value)} style={{flex:1,accentColor:theme.accent}}/>
                  <span style={{fontFamily:"var(--fd)",fontSize:16,color:theme.accent,minWidth:60}}>{f$(goalInput).replace(".00","")}</span>
                </div>
                <button onClick={()=>{setGoal(goalInput);fx("tap",10);}} style={{width:"100%",padding:"11px",borderRadius:12,border:"none",background:`linear-gradient(135deg,${theme.accent},${theme.accent}99)`,color:"#fff",fontFamily:"var(--fd)",fontSize:14,cursor:"pointer"}}>🎯 Set my goal</button>
              </div>
            ):(
              <div style={{background:totalValue>=goal?"rgba(16,185,129,.12)":"rgba(255,255,255,.06)",border:`1px solid ${totalValue>=goal?"rgba(16,185,129,.3)":"rgba(255,255,255,.1)"}`,borderRadius:14,padding:14,marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span style={{fontFamily:"var(--fd)",fontSize:14,color:"#fff"}}>🎯 Goal: {f$(goal).replace(".00","")}</span>
                  <button onClick={()=>setGoal(null)} style={{background:"none",border:"none",color:"rgba(255,255,255,.4)",fontSize:11,fontWeight:700,cursor:"pointer"}}>change</button>
                </div>
                <div style={{height:10,background:"rgba(255,255,255,.08)",borderRadius:100,overflow:"hidden",marginBottom:6}}>
                  <div style={{height:"100%",width:`${Math.min(100,(totalValue/goal)*100)}%`,background:totalValue>=goal?"linear-gradient(90deg,#10b981,#34d399)":`linear-gradient(90deg,${theme.accent},#fff)`,borderRadius:100,transition:"width .6s"}}/>
                </div>
                <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.55)"}}>
                  {totalValue>=goal?"🎉 GOAL REACHED! Amazing investing! Set a bigger one?":`${Math.round((totalValue/goal)*100)}% there · ${f$(goal-totalValue)} to go!`}
                </div>
              </div>
            )}

            {/* XP bar with info button */}
            <div style={{background:"rgba(255,255,255,.06)",borderRadius:13,padding:"10px 14px",marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:10,fontWeight:800,color:"rgba(255,255,255,.45)",marginBottom:5}}>
                <span>⚡ Level {lv} Investor</span>
                <button onClick={()=>setShowInfo(true)} style={{background:"rgba(255,255,255,.1)",border:"none",borderRadius:8,padding:"3px 8px",color:"rgba(255,255,255,.6)",fontSize:10,fontWeight:800,cursor:"pointer"}}>❓ What's XP & coins?</button>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:10,fontWeight:800,color:"rgba(255,255,255,.35)",marginBottom:5}}><span>{xp} XP</span><span>Next level: {lv*500} XP</span></div>
              <div style={{height:6,background:"rgba(255,255,255,.08)",borderRadius:100,overflow:"hidden"}}><div style={{height:"100%",width:`${(xp%(lv*500===0?500:lv*500))/(lv*500===0?500:lv*500)*100}%`,background:`linear-gradient(90deg,${theme.accent},#fff)`,borderRadius:100,transition:"width .5s"}}/></div>
            </div>

            {/* Daily spin — feature 5 */}
            {lastSpin!==new Date().toDateString()&&(
              <div style={{background:"linear-gradient(135deg,rgba(124,58,237,.15),rgba(245,158,11,.08))",border:"2px solid rgba(124,58,237,.35)",borderRadius:16,padding:16,marginBottom:12,textAlign:"center"}}>
                <div style={{fontFamily:"var(--fd)",fontSize:16,color:"#fff",marginBottom:4}}>🎡 Daily Spin!</div>
                <div style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.55)",marginBottom:12}}>Spin once per day for coins, cash or rare cards!</div>
                <div className="wheel-wrap">
                  <div className="wheel-pointer">▼</div>
                  <div className="wheel" style={{transform:`rotate(${spinDeg}deg)`,background:`conic-gradient(${SPIN_PRIZES.map((p,i)=>`${["#7c3aed","#f59e0b","#06b6d4","#ec4899","#10b981","#ef4444","#8b5cf6","#f97316"][i]} ${i/SPIN_PRIZES.length*360}deg ${(i+1)/SPIN_PRIZES.length*360}deg`).join(",")})`}}>
                    {SPIN_PRIZES.map((p,i)=>(
                      <div key={i} style={{position:"absolute",top:"50%",left:"50%",transform:`rotate(${(i+.5)/SPIN_PRIZES.length*360}deg) translateY(-75px) translateX(-50%)`,fontSize:14,fontWeight:800,color:"#fff",textShadow:"0 1px 3px rgba(0,0,0,.5)",whiteSpace:"nowrap"}}>{p.icon}</div>
                    ))}
                  </div>
                </div>
                <button className="spin-btn" onClick={doSpin} disabled={spinning}>{spinning?"Spinning...":"🎡 Spin!"}</button>
                {spinResult&&<div style={{marginTop:10,fontFamily:"var(--fd)",fontSize:16,color:"#f59e0b"}}>You won: {spinResult.icon} {spinResult.label}!</div>}
              </div>
            )}

            {/* Daily story — feature 12 */}
            <div style={{background:`linear-gradient(135deg,${DAILY_STORIES[storyIdx].color}22,${DAILY_STORIES[storyIdx].color}08)`,border:`1px solid ${DAILY_STORIES[storyIdx].color}33`,borderRadius:16,padding:16,marginBottom:12}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <span style={{fontSize:24}}>{DAILY_STORIES[storyIdx].icon}</span>
                <div>
                  <div style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:".5px"}}>📖 Story Time · Learn how markets move</div>
                  <div style={{fontFamily:"var(--fd)",fontSize:14,color:"#fff"}}>{DAILY_STORIES[storyIdx].title}</div>
                </div>
                <button onClick={()=>setStoryIdx(i=>(i+1)%DAILY_STORIES.length)} style={{marginLeft:"auto",background:"rgba(255,255,255,.1)",border:"none",borderRadius:8,padding:"5px 9px",color:"rgba(255,255,255,.6)",cursor:"pointer",fontSize:11,fontWeight:800,flexShrink:0}}>Next →</button>
              </div>
              <div style={{fontSize:13,fontWeight:800,color:"rgba(255,255,255,.9)",lineHeight:1.65,marginBottom:8}}>{DAILY_STORIES[storyIdx].body}</div>
              <div style={{fontSize:12,fontWeight:800,color:DAILY_STORIES[storyIdx].color,background:`${DAILY_STORIES[storyIdx].color}22`,borderRadius:8,padding:"7px 11px"}}>{DAILY_STORIES[storyIdx].lesson}</div>
              <div style={{fontSize:11,fontWeight:800,color:"rgba(255,255,255,.55)",marginTop:8,textAlign:"center"}}>✨ This is a pretend story to help you learn — not real news!</div>
            </div>

            {/* Missions */}
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
              <div style={{fontFamily:"var(--fd)",fontSize:16,color:"#fff"}}>🎯 Today's Missions</div>
              <div style={{fontSize:11,fontWeight:800,color:"rgba(255,255,255,.4)"}}>{doneMission.length}/3 done</div>
            </div>
            {doneMission.length===0&&<div style={{background:"rgba(124,58,237,.12)",border:"1px solid rgba(124,58,237,.3)",borderRadius:12,padding:"10px 13px",marginBottom:10,fontSize:12,fontWeight:700,color:"rgba(255,255,255,.8)",lineHeight:1.5}}>👆 <strong style={{color:"#fff"}}>Start with Mission 1</strong> — tap it to see step-by-step instructions!</div>}
            {MISSIONS.map((m,mi)=>{
              const done=doneMission.includes(m.id);
              const isNext=!done&&MISSIONS.slice(0,mi).every(pm=>doneMission.includes(pm.id));
              return(
                <div key={m.id} style={{background:done?"rgba(16,185,129,.08)":isNext?"rgba(255,255,255,.09)":"rgba(255,255,255,.04)",border:done?"2px solid rgba(16,185,129,.35)":isNext?"2px solid rgba(255,255,255,.22)":"2px solid rgba(255,255,255,.07)",borderRadius:15,padding:14,marginBottom:9,transition:"all .2s"}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                    <div style={{width:34,height:34,borderRadius:"50%",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"var(--fd)",fontSize:done?16:14,background:done?"rgba(16,185,129,.2)":isNext?"rgba(255,255,255,.18)":"rgba(255,255,255,.06)",color:done?"#86efac":isNext?"#fff":"rgba(255,255,255,.25)",border:done?"2px solid rgba(16,185,129,.45)":isNext?"2px solid rgba(255,255,255,.35)":"2px solid rgba(255,255,255,.08)"}}>{done?"✅":mi+1}</div>
                    <div style={{flex:1}}>
                      <div style={{fontFamily:"var(--fd)",fontSize:14,color:done?"#86efac":isNext?"#fff":"rgba(255,255,255,.35)",marginBottom:3}}>{m.title}</div>
                      <div style={{fontSize:11,color:done?"rgba(134,239,172,.65)":"rgba(255,255,255,.45)",fontWeight:600,lineHeight:1.5}}>{done?"Complete! ✅":m.sub}</div>
                      {isNext&&!done&&<button onClick={m.action} style={{marginTop:10,padding:"8px 18px",borderRadius:100,border:"none",background:`linear-gradient(135deg,${theme.accent},${theme.accent}99)`,color:"#fff",fontFamily:"var(--fd)",fontSize:12,cursor:"pointer"}}>Do it now →</button>}
                    </div>
                    {!done&&!isNext&&<span style={{fontSize:18,opacity:.35}}>🔒</span>}
                  </div>
                </div>
              );
            })}

            {/* Family Leaderboard — monthly winners! */}
            {famBoard.length>1&&(
              <>
                <div style={{display:"flex",alignItems:"baseline",gap:8,margin:"14px 0 10px"}}>
                  <div style={{fontFamily:"var(--fd)",fontSize:16,color:"#fff"}}>🏆 Family Leaderboard</div>
                  <div style={{fontSize:10,fontWeight:800,color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:".5px"}}>this month</div>
                </div>
                {famBoard.map((r,i)=>(
                  <div key={r.id} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 12px",background:r.isMe?"rgba(255,255,255,.1)":"rgba(255,255,255,.05)",border:`1px solid ${i===0?"rgba(245,158,11,.45)":"rgba(255,255,255,.09)"}`,borderRadius:13,marginBottom:8}}>
                    <div style={{fontFamily:"var(--fd)",fontSize:15,width:26,textAlign:"center",color:i===0?"#fbbf24":"rgba(255,255,255,.45)"}}>{i===0?"👑":`#${i+1}`}</div>
                    <div style={{fontSize:24}}>{r.avatar||"🙂"}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:800,fontSize:13,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}{r.isMe?" (you)":""}</div>
                      <div style={{fontSize:10,color:"rgba(255,255,255,.45)",fontWeight:600}}>{fs$(r.value)} portfolio</div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      {r.gain!=null
                        ?<div style={{fontWeight:900,fontSize:14,color:r.gain>=0?"#86efac":"#fca5a5"}}>{r.gain>=0?"▲":"▼"} {Math.abs(r.gain).toFixed(1)}%</div>
                        :<div style={{fontWeight:800,fontSize:11,color:"rgba(255,255,255,.35)"}}>not played<br/>this month</div>}
                    </div>
                  </div>
                ))}
                <div style={{fontSize:10,fontWeight:600,color:"rgba(255,255,255,.35)",textAlign:"center",marginBottom:6}}>Best % gain this month wins the crown 👑 — resets on the 1st!</div>
              </>
            )}

            {/* Live market preview */}
            <div style={{fontFamily:"var(--fd)",fontSize:16,color:"#fff",margin:"14px 0 10px"}}>📊 Live Market</div>
            {MARKET.slice(0,4).map(a=>{
              const cur=prices[a.ticker]||a.basePrice;
              const chg=parseFloat(pct(cur,refPrice[a.ticker]||a.basePrice));
              return(
                <div key={a.ticker} onClick={()=>openTrade(a)} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 12px",background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.09)",borderRadius:13,cursor:"pointer",marginBottom:8}}>
                  <div style={{width:36,height:36,borderRadius:10,background:a.color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{a.icon}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:800,fontSize:13,color:"#fff"}}>{a.name}</div>
                    <div style={{fontSize:10,color:"rgba(255,255,255,.45)",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.tagline}</div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{fontWeight:800,fontSize:13,color:"#fff"}}>{fs$(cur)}</div>
                    <div style={{fontSize:10,fontWeight:800,color:chg>=0?"#86efac":"#fca5a5"}}>{chg>=0?"▲":"▼"}{Math.abs(chg)}%</div>
                  </div>
                </div>
              );
            })}
            <button onClick={onLogout} style={{width:"100%",marginTop:16,padding:"11px",borderRadius:13,border:"1px solid rgba(255,255,255,.1)",background:"transparent",color:"rgba(255,255,255,.3)",fontFamily:"var(--fd)",fontSize:13,cursor:"pointer"}}>🚪 Log out</button>
          </div>
        )}

        {/* TRADE */}
        {nav==="Trade"&&(
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,background:tokens>0?"rgba(16,185,129,.1)":"rgba(245,158,11,.12)",border:`1px solid ${tokens>0?"rgba(16,185,129,.25)":"rgba(245,158,11,.3)"}`,borderRadius:13,padding:"10px 13px",marginBottom:12}}>
              <span style={{fontSize:20}}>🎟️</span>
              <div style={{flex:1,fontSize:12,fontWeight:700,color:"rgba(255,255,255,.8)",lineHeight:1.4}}>
                {tokens>0
                  ?<>You have <strong style={{color:"#86efac"}}>{tokens} buy{tokens!==1?"s":""}</strong> left today ({DAILY_TOKENS} fresh each day). Selling is always free! 🎟️</>
                  :<>No buys left today — <strong style={{color:"#fde68a"}}>{DAILY_TOKENS} fresh ones arrive tomorrow</strong>. You can still SELL anytime, and your {fs$(cash)} is safe.</>}
              </div>
            </div>
            <div style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",borderRadius:13,padding:12,marginBottom:14,fontSize:12,fontWeight:600,color:"rgba(255,255,255,.7)",lineHeight:1.6}}>
              💡 Read the news inside each card. Start with 🟢 lower risk before trying 🔴 higher risk. <strong style={{color:"#fff"}}>🧺 Baskets (ETFs)</strong> hold LOTS of companies at once — a safe way to own many! Tap any card to see what could happen.
            </div>
            {(()=>{
              const kidAge = user.age || 8;
              const catLocked = c => { const m=CATS.find(x=>x.k===c); return m ? kidAge < m.minAge : false; };
              const catOf = a => a.cat || (a.type==="crypto"?"crypto":"stock");
              const badgeOf = a => a.badge || (a.cat==="crypto"?"Card":a.cat==="etf"?"Basket":"Block");
              const shown = MARKET.filter(a=> tradeTab==="all" ? !catLocked(catOf(a)) : catOf(a)===tradeTab);
              const lockedTab = tradeTab!=="all" && catLocked(tradeTab);
              const lockMin = CATS.find(x=>x.k===tradeTab)?.minAge;
              return(<>
              <div style={{display:"flex",gap:7,marginBottom:13,overflowX:"auto",scrollbarWidth:"none"}}>
                {CATS.map(c=>{const locked=catLocked(c.k);return(
                  <button key={c.k} onClick={()=>setTradeTab(c.k)} style={{padding:"7px 14px",borderRadius:100,border:`1.5px solid ${tradeTab===c.k?"rgba(255,255,255,.4)":"rgba(255,255,255,.14)"}`,background:tradeTab===c.k?"rgba(255,255,255,.14)":"transparent",color:tradeTab===c.k?"#fff":"rgba(255,255,255,.5)",fontFamily:"var(--fb)",fontSize:12,fontWeight:800,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,opacity:locked?.65:1}}>{c.label}{locked?" 🔒":""}</button>
                );})}
              </div>
              {lockedTab&&(
                <div style={{background:"rgba(124,58,237,.12)",border:"1px solid rgba(124,58,237,.3)",borderRadius:13,padding:14,marginBottom:12,fontSize:13,fontWeight:800,color:"#c4b5fd",lineHeight:1.5,textAlign:"center"}}>
                  🔒 These unlock at <strong style={{color:"#fff"}}>age {lockMin}</strong>. Here's a peek at what's coming — keep learning and leveling up! 👇
                </div>
              )}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {shown.map(a=>{
                  const cur=prices[a.ticker]||a.basePrice;const chg=parseFloat(pct(cur,refPrice[a.ticker]||a.basePrice));
                  const locked=catLocked(catOf(a));
                  if(locked) return(
                    <div key={a.ticker} style={{borderRadius:14,padding:14,position:"relative",overflow:"hidden",background:"rgba(255,255,255,.05)",border:"1px dashed rgba(255,255,255,.18)"}}>
                      <div style={{position:"absolute",top:9,right:9,fontSize:13}}>🔒</div>
                      <div style={{fontSize:28,marginBottom:4,display:"block",filter:"grayscale(1)",opacity:.55}}>{a.icon}</div>
                      <div style={{fontFamily:"var(--fd)",fontSize:13,color:"rgba(255,255,255,.7)",marginBottom:2}}>{a.name}</div>
                      <div style={{fontSize:9,color:"rgba(255,255,255,.4)",fontWeight:600,marginBottom:7,lineHeight:1.3}}>{a.tagline}</div>
                      <div style={{fontSize:10,fontWeight:800,color:"#c4b5fd",background:"rgba(124,58,237,.18)",borderRadius:100,padding:"3px 8px",display:"inline-block"}}>Unlocks at age {a.minAge}</div>
                    </div>
                  );
                  return(
                    <div key={a.ticker} onClick={()=>openTrade(a)} style={{borderRadius:14,padding:14,cursor:"pointer",position:"relative",overflow:"hidden",background:`linear-gradient(135deg,${a.color}bb,${a.color}55)`,border:`1px solid ${a.color}44`,transition:"all .2s"}}>
                      <div style={{position:"absolute",top:9,right:9,fontSize:9,fontWeight:800,background:"rgba(0,0,0,.25)",padding:"2px 7px",borderRadius:100,color:"rgba(255,255,255,.75)",textTransform:"uppercase"}}>{badgeOf(a)}</div>
                      <div style={{fontSize:28,marginBottom:4,display:"block"}}>{a.icon}</div>
                      <div style={{fontFamily:"var(--fd)",fontSize:13,color:"#fff",marginBottom:2}}>{a.name}</div>
                      <div style={{fontSize:9,color:"rgba(255,255,255,.55)",fontWeight:600,marginBottom:7,lineHeight:1.3}}>{a.tagline}</div>
                      <div style={{fontSize:14,fontWeight:900,color:"#fff"}}>{fs$(cur)}</div>
                      <div style={{fontSize:10,fontWeight:700,marginTop:2,color:chg>=0?"#86efac":"#fca5a5"}}>{chg>=0?"▲":"▼"} {Math.abs(chg)}%</div>
                      <div style={{fontSize:9,fontWeight:800,padding:"2px 7px",borderRadius:100,marginTop:5,display:"inline-block",background:a.risk==="low"?"rgba(16,185,129,.25)":a.risk==="medium"?"rgba(245,158,11,.25)":"rgba(239,68,68,.25)",color:a.risk==="low"?"#86efac":a.risk==="medium"?"#fde68a":"#fca5a5"}}>{a.risk==="low"?"🟢 Lower Risk":a.risk==="medium"?"🟠 Medium Risk":"🔴 High Risk"}</div>
                    </div>
                  );
                })}
              </div>
              </>);
            })()}
          </div>
        )}

        {/* LEARN — adventure map */}
        {nav==="Learn"&&(
          <div>
            <div style={{background:"linear-gradient(135deg,rgba(245,158,11,.12),rgba(245,158,11,.04))",border:"1.5px solid rgba(245,158,11,.3)",borderRadius:16,padding:16,marginBottom:18}}>
              <div style={{fontFamily:"var(--fd)",fontSize:15,color:"#f59e0b",marginBottom:6}}>💵 Learn to Earn — Real Trading Cash!</div>
              <div style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.75)",lineHeight:1.6,marginBottom:12}}>Complete lessons to earn <strong style={{color:"#fff"}}>paper money deposited into your Money Garden</strong>. Knowledge = more capital to trade!</div>
              <div style={{display:"flex",gap:8}}>
                <div style={{background:"rgba(245,158,11,.15)",borderRadius:10,padding:"8px 12px",textAlign:"center"}}>
                  <div style={{fontFamily:"var(--fd)",fontSize:17,color:"#f59e0b"}}>{fs$(LESSONS.filter(l=>doneLesson.includes(l.id)).reduce((s,l)=>s+l.cashReward,0))}</div>
                  <div style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,.4)",marginTop:1}}>EARNED</div>
                </div>
                <div style={{background:"rgba(255,255,255,.06)",borderRadius:10,padding:"8px 12px",textAlign:"center"}}>
                  <div style={{fontFamily:"var(--fd)",fontSize:17,color:"rgba(255,255,255,.55)"}}>{fs$(LESSONS.filter(l=>!doneLesson.includes(l.id)).reduce((s,l)=>s+l.cashReward,0))}</div>
                  <div style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,.4)",marginTop:1}}>AVAILABLE</div>
                </div>
                <div style={{background:"rgba(255,255,255,.06)",borderRadius:10,padding:"8px 12px",textAlign:"center"}}>
                  <div style={{fontFamily:"var(--fd)",fontSize:17,color:"#06b6d4"}}>{doneLesson.length}/{LESSONS.length}</div>
                  <div style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,.4)",marginTop:1}}>DONE</div>
                </div>
              </div>
            </div>
            {/* Certificate — Plus */}
            <button onClick={()=>{ if(isPremium) setShowCert(true); else setShowPlus(true); }} style={{width:"100%",marginBottom:18,padding:"13px 15px",borderRadius:15,border:"1px solid rgba(124,58,237,.35)",background:"linear-gradient(135deg,rgba(124,58,237,.18),rgba(245,158,11,.08))",color:"#fff",fontFamily:"var(--fd)",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:26}}>🎓</span>
              <div style={{flex:1,textAlign:"left"}}><div>My Junior Investor Certificate</div><div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,.6)"}}>{doneLesson.length>=LESSONS.length?"All lessons done — get your certificate!":`${doneLesson.length}/${LESSONS.length} lessons — printable when you're a Plus member`}</div></div>
              <span style={{fontSize:10,fontWeight:800,background:"rgba(124,58,237,.3)",color:"#c4b5fd",padding:"3px 9px",borderRadius:100,flexShrink:0}}>⭐ PLUS</span>
            </button>
            {/* Adventure map */}
            <div className="map-wrap">
              <div className="map-path"/>
              {(()=>{
                const ORDERED=COURSE_ORDER.map(id=>LESSONS.find(l=>l.id===id)).filter(Boolean);
                const firstUndone=ORDERED.findIndex(l=>!doneLesson.includes(l.id));
                let prevLevel=0;
                return ORDERED.flatMap((ls,i)=>{
                  const lvl=LEVEL_OF[ls.id]||1; const meta=LEVEL_META[lvl];
                  const plusLocked=!meta.free&&!isPremium;
                  const done=doneLesson.includes(ls.id);
                  const curr=!done&&i===firstUndone&&!plusLocked;
                  const locked=!done&&!curr&&!plusLocked;
                  const isRight=i%2===1;
                  const els=[];
                  if(lvl!==prevLevel){ prevLevel=lvl; els.push(
                    <div key={"lvl"+lvl} style={{textAlign:"center",margin:i===0?"2px 0 14px":"26px 0 14px"}}>
                      <div style={{display:"inline-flex",alignItems:"center",gap:8,background:`${meta.color}18`,border:`1.5px solid ${meta.color}55`,borderRadius:100,padding:"7px 16px"}}>
                        <span style={{fontFamily:"var(--fd)",fontSize:13.5,color:meta.color}}>Level {lvl} · {meta.name}</span>
                        <span style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,.5)"}}>{meta.age}</span>
                        {!meta.free&&<span style={{fontSize:9,fontWeight:800,background:"rgba(124,58,237,.35)",color:"#c4b5fd",padding:"2px 8px",borderRadius:100}}>⭐ PLUS</span>}
                      </div>
                    </div>
                  ); }
                  els.push(
                  <div key={ls.id} className={`map-node ${isRight?"right":""}`}>
                    <div className={`map-circle ${done?"done":curr?"curr":"lock"}`} style={plusLocked?{opacity:.85}:{}}>{done?"✅":plusLocked?"⭐":ls.icon}</div>
                    <div className={`map-content ${done?"done":curr?"curr":""}`} style={{opacity:(locked||plusLocked)?.6:1}}>
                      <div className="map-island" style={{marginBottom:2}}>{ls.island}</div>
                      <div className="map-title" style={{color:(locked||plusLocked)?"rgba(255,255,255,.5)":"#fff"}}>{ls.title}</div>
                      <div className="map-rewards">
                        <div className="map-rew-chip" style={{background:"rgba(245,158,11,.15)",color:"#f59e0b"}}>💵 +{fs$(ls.cashReward)}</div>
                        <div className="map-rew-chip" style={{background:"rgba(6,182,212,.12)",color:"#67e8f9"}}>⚡ +200 XP</div>
                        <div className="map-rew-chip" style={{background:"rgba(245,158,11,.1)",color:"#fde68a"}}>🪙 +50</div>
                      </div>
                      {done&&(()=>{
                        const hasCh=!!LESSON_CHALLENGE[ls.id]; const chDone=doneChallenge.includes(ls.id);
                        return(<div>
                          <div style={{fontSize:11,fontWeight:800,color:"#86efac",marginBottom:hasCh?7:0}}>✅ Completed!{chDone?" Challenge cleared! 🔥":" Cash deposited!"}</div>
                          {hasCh&&!chDone&&<button onClick={()=>openChallenge(ls)} style={{padding:"8px 15px",borderRadius:100,border:"1.5px solid rgba(239,68,68,.5)",background:"linear-gradient(135deg,rgba(239,68,68,.22),rgba(245,158,11,.18))",color:"#fca5a5",fontFamily:"var(--fd)",fontSize:12,cursor:"pointer"}}>🔥 Challenge Round · earn {fs$(ls.cashReward)} more →</button>}
                          {hasCh&&chDone&&<div style={{fontSize:10.5,fontWeight:800,color:"rgba(252,165,165,.7)"}}>🔥 Challenge Round done — you really know this one!</div>}
                        </div>);
                      })()}
                      {curr&&<button onClick={()=>openLesson(ls)} style={{padding:"9px 18px",borderRadius:100,border:"none",background:`linear-gradient(135deg,${ls.color},${ls.color}99)`,color:"#fff",fontFamily:"var(--fd)",fontSize:12,cursor:"pointer",boxShadow:`0 3px 10px ${ls.color}44`}}>Sail here &amp; earn {fs$(ls.cashReward)} →</button>}
                      {plusLocked&&<button onClick={()=>{setShowPlus(true);setAskedPlus(false);}} style={{padding:"9px 16px",borderRadius:100,border:"none",background:"linear-gradient(135deg,#7c3aed,#a855f7)",color:"#fff",fontFamily:"var(--fd)",fontSize:12,cursor:"pointer"}}>⭐ Unlock with Plus</button>}
                      {locked&&<div style={{fontSize:11,color:"rgba(255,255,255,.3)",fontWeight:600}}>🔒 Finish the lesson before this</div>}
                    </div>
                  </div>
                  );
                  return els;
                });
              })()}
            </div>
          </div>
        )}

        {/* ASSETS */}
        {nav==="Assets"&&(
          <div>
            {portfolio.length===0?(
              <div style={{textAlign:"center",padding:"48px 20px"}}>
                <div style={{fontSize:54,marginBottom:14}}>💼</div>
                <div style={{fontFamily:"var(--fd)",fontSize:20,color:"#fff",marginBottom:8}}>Your portfolio is empty!</div>
                <div style={{fontSize:13,color:"rgba(255,255,255,.55)",fontWeight:600,lineHeight:1.6,marginBottom:20}}>Head to Trade ⚡ and make your first investment!</div>
                <button onClick={()=>setNav("Trade")} style={{padding:"13px 28px",borderRadius:14,border:"none",background:`linear-gradient(135deg,${theme.accent},${theme.accent}99)`,color:"#fff",fontFamily:"var(--fd)",fontSize:15,cursor:"pointer"}}>⚡ Go to Trade</button>
              </div>
            ):(
              <div>
                <div style={{display:"flex",gap:10,marginBottom:14,overflowX:"auto",scrollbarWidth:"none"}}>
                  {[["Total",f$(totalValue),theme.accent],["Invested",f$(portVal),"#f59e0b"],["Cash",f$(cash),"#10b981"]].map(([l,v,c])=>(
                    <div key={l} style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.1)",borderRadius:13,padding:"12px 14px",flexShrink:0,minWidth:110}}>
                      <div style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:".4px",marginBottom:2}}>{l}</div>
                      <div style={{fontFamily:"var(--fd)",fontSize:18,color:c}}>{v}</div>
                    </div>
                  ))}
                </div>
                {portfolio.length<3&&<div style={{background:"rgba(194,65,12,.08)",border:"1px solid rgba(194,65,12,.2)",borderRadius:12,padding:"11px 13px",marginBottom:14,fontSize:12,fontWeight:700,color:"#fdba74",lineHeight:1.5}}>🧺 You own {portfolio.length} asset{portfolio.length!==1?"s":""}. Try to own 3-5 — like candy in multiple pockets!</div>}
                {portfolio.map(h=>{
                  const cur=prices[h.ticker]||h.avgCost;
                  const pnl=(cur-h.avgCost)*h.qty;const pp=parseFloat(pct(cur,h.avgCost));
                  const a=MARKET.find(m=>m.ticker===h.ticker);
                  const advice=pp>=15?"🎉 Up big! Like Pokémon at peak hype — consider taking some profit!":pp>=0?"📈 Doing well — keep holding!":"📉 Down a bit — don't panic! Good companies always bounce back.";
                  return(
                    <div key={h.ticker} style={{borderRadius:14,padding:16,marginBottom:12,background:`linear-gradient(135deg,${h.color}bb,${h.color}44)`,border:`1px solid ${h.color}44`}}>
                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}><span style={{fontSize:32}}>{h.icon}</span><div style={{flex:1}}><div style={{fontFamily:"var(--fd)",fontSize:16,color:"#fff"}}>{h.name}</div><div style={{fontSize:10,color:"rgba(255,255,255,.5)",fontWeight:700}}>{h.type==="stock"?"Building Block":"Collector Card"}</div></div><div style={{textAlign:"right"}}><div style={{fontFamily:"var(--fd)",fontSize:18,color:pnl>=0?"#86efac":"#fca5a5"}}>{pnl>=0?"+":""}{f$(pnl)}</div><div style={{fontSize:10,color:"rgba(255,255,255,.5)",fontWeight:700}}>{pp>=0?"+":""}{pp}%</div></div></div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:10}}>{[["Qty",fmtQty(h.qty)],["Buy price",fs$(h.avgCost)],["Price now",fs$(cur)]].map(([k,v])=><div key={k}><div style={{fontSize:9,color:"rgba(255,255,255,.4)",fontWeight:800,textTransform:"uppercase"}}>{k}</div><div style={{fontSize:12,fontWeight:800,color:"rgba(255,255,255,.9)",marginTop:2}}>{v}</div></div>)}</div>
                      <div style={{fontSize:11,fontWeight:700,background:"rgba(255,255,255,.1)",borderRadius:9,padding:"8px 10px",color:"rgba(255,255,255,.8)",marginBottom:10,lineHeight:1.4}}>{advice}</div>
                      <div style={{display:"flex",gap:8}}><button onClick={()=>a&&openTrade(a,"buy")} style={{flex:1,padding:"9px",borderRadius:9,border:"none",background:"rgba(16,185,129,.3)",color:"#86efac",fontFamily:"var(--fd)",fontSize:12,cursor:"pointer"}}>+ Buy more</button><button onClick={()=>a&&openTrade(a,"sell")} style={{flex:1,padding:"9px",borderRadius:9,border:"none",background:"rgba(239,68,68,.3)",color:"#fca5a5",fontFamily:"var(--fd)",fontSize:12,cursor:"pointer"}}>− Sell</button></div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* MORE views */}
        {nav==="More"&&(
          <div>
            <button onClick={()=>setNav("Home")} style={{display:"flex",alignItems:"center",gap:6,background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.12)",borderRadius:100,padding:"7px 14px",color:"rgba(255,255,255,.65)",fontFamily:"var(--fb)",fontSize:12,fontWeight:800,cursor:"pointer",marginBottom:14}}>
              ← Back to Home
            </button>

            {/* MY TASKS — chores & rewards */}
            {moreView==="Tasks"&&(()=>{
              const ready=myTasks.filter(t=>t.status==="approved");
              const todo=myTasks.filter(t=>t.status==="todo");
              const pending=myTasks.filter(t=>t.status==="pending");
              const doneList=myTasks.filter(t=>t.status==="done");
              return(
              <div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                  <div style={{fontFamily:"var(--fd)",fontSize:20,color:"#fff"}}>✅ My Tasks</div>
                  <div style={{background:"rgba(245,158,11,.15)",border:"1px solid rgba(245,158,11,.3)",borderRadius:100,padding:"5px 12px",fontFamily:"var(--fd)",fontSize:14,color:"#fde68a"}}>🪙 {coins}</div>
                </div>
                <div style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.6)",lineHeight:1.5,marginBottom:14}}>Do the tasks your grown-up gave you, tap <strong style={{color:"#fff"}}>“I did it!”</strong>, and earn coins &amp; rewards! 🎉</div>

                {owed>0&&(
                  <div style={{background:"linear-gradient(135deg,rgba(16,185,129,.14),rgba(16,185,129,.05))",border:"1px solid rgba(16,185,129,.3)",borderRadius:14,padding:13,marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:26}}>💵</span>
                    <div style={{flex:1}}><div style={{fontFamily:"var(--fd)",fontSize:16,color:"#86efac"}}>{fs$(owed)} pocket money</div><div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.6)"}}>Your grown-up is keeping this for you — ask them for it! 🙂</div></div>
                  </div>
                )}

                {/* Family gifts */}
                {gifts.map(g=>(
                  <div key={g.id} style={{background:"linear-gradient(135deg,rgba(236,72,153,.16),rgba(124,58,237,.06))",border:"1px solid rgba(236,72,153,.35)",borderRadius:14,padding:14,marginBottom:12}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                      <span style={{fontSize:30}}>{g.emoji||"🎁"}</span>
                      <div style={{flex:1}}><div style={{fontFamily:"var(--fd)",fontSize:15,color:"#fff"}}>A gift from {g.from}! 💛</div>{g.message&&<div style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.7)",fontStyle:"italic"}}>“{g.message}”</div>}</div>
                    </div>
                    <button onClick={()=>collectGift(g)} style={{width:"100%",padding:11,borderRadius:11,border:"none",background:"linear-gradient(135deg,#ec4899,#db2777)",color:"#fff",fontFamily:"var(--fd)",fontSize:14,cursor:"pointer"}}>{g.coins>0?`🎉 Open gift (+${g.coins} coins!)`:"🎉 Open gift"}</button>
                  </div>
                ))}

                {myTasks.length===0&&store.length===0&&(
                  <div style={{background:"rgba(255,255,255,.05)",border:"1px dashed rgba(255,255,255,.18)",borderRadius:16,padding:22,textAlign:"center"}}>
                    <div style={{fontSize:40,marginBottom:8}}>📋</div>
                    <div style={{fontFamily:"var(--fd)",fontSize:16,color:"#fff",marginBottom:6}}>No tasks yet!</div>
                    <div style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.55)",lineHeight:1.5}}>Ask a grown-up to open Toybox → 👔 <strong style={{color:"#fff"}}>Parent</strong> and give you some tasks. They'll pop up here! ✨</div>
                  </div>
                )}

                {/* Ready to collect */}
                {ready.length>0&&<div style={{fontSize:12,fontWeight:800,color:"#86efac",marginBottom:8}}>🎉 Ready to collect!</div>}
                {ready.map(t=>(
                  <div key={t.id} style={{background:"rgba(16,185,129,.12)",border:"1px solid rgba(16,185,129,.4)",borderRadius:14,padding:13,marginBottom:9}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:9}}>
                      <span style={{fontSize:22}}>{catOf(t.cat).icon}</span>
                      <div style={{flex:1}}><div style={{fontSize:14,fontWeight:800,color:"#fff"}}>{t.title}</div><div style={{fontSize:11,fontWeight:700,color:"#86efac"}}>Approved by your grown-up ✓</div></div>
                    </div>
                    <button onClick={()=>collectTask(t)} style={{width:"100%",padding:11,borderRadius:11,border:"none",background:"linear-gradient(135deg,#10b981,#059669)",color:"#fff",fontFamily:"var(--fd)",fontSize:14,cursor:"pointer"}}>{t.reward.type==="coins"?`🎉 Collect ${t.reward.coins} coins!`:`🎁 Collect: ${t.reward.emoji||"🎁"} ${t.reward.label||"reward"}`}</button>
                  </div>
                ))}

                {/* To do */}
                {todo.length>0&&<div style={{fontSize:12,fontWeight:800,color:"rgba(255,255,255,.55)",margin:"6px 0 8px"}}>📋 To do ({todo.length})</div>}
                {todo.map(t=>(
                  <div key={t.id} style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)",borderRadius:14,padding:13,marginBottom:9}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:9}}>
                      <span style={{fontSize:22}}>{catOf(t.cat).icon}</span>
                      <div style={{flex:1}}>
                        <div style={{fontSize:14,fontWeight:800,color:"#fff"}}>{t.title}</div>
                        <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.5)"}}>{catOf(t.cat).label}{t.recurring!=="once"?` · ${t.recurring}`:""} · reward: {t.reward.type==="coins"?`🪙 ${t.reward.coins}`:`${t.reward.emoji||"🎁"} ${t.reward.label||""}`}</div>
                      </div>
                    </div>
                    <button onClick={()=>markTaskDone(t)} style={{width:"100%",padding:11,borderRadius:11,border:"none",background:"linear-gradient(135deg,#7c3aed,#9333ea)",color:"#fff",fontFamily:"var(--fd)",fontSize:14,cursor:"pointer"}}>✋ I did it!</button>
                  </div>
                ))}

                {/* Waiting */}
                {pending.map(t=>(
                  <div key={t.id} style={{background:"rgba(245,158,11,.08)",border:"1px solid rgba(245,158,11,.25)",borderRadius:14,padding:"11px 13px",marginBottom:9,display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:20}}>⏳</span>
                    <div style={{flex:1}}><div style={{fontSize:13,fontWeight:800,color:"#fff"}}>{t.title}</div><div style={{fontSize:11,fontWeight:700,color:"#fde68a"}}>Waiting for your grown-up to check it…</div></div>
                  </div>
                ))}

                {/* Grow coins — invest into trading */}
                {coins>0&&(
                  <div style={{background:"linear-gradient(135deg,rgba(16,185,129,.12),rgba(6,182,212,.06))",border:"1px solid rgba(16,185,129,.3)",borderRadius:16,padding:15,margin:"14px 0"}}>
                    <div style={{fontFamily:"var(--fd)",fontSize:15,color:"#fff",marginBottom:5}}>💰 Grow your coins!</div>
                    <div style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.7)",lineHeight:1.5,marginBottom:investOpen?12:0}}>Turn coins you earned into <strong style={{color:"#fff"}}>trading cash</strong> and grow them by investing! 📈</div>
                    {!investOpen
                      ?<button onClick={()=>setInvestOpen(true)} style={{width:"100%",marginTop:11,padding:11,borderRadius:11,border:"none",background:"linear-gradient(135deg,#10b981,#059669)",color:"#fff",fontFamily:"var(--fd)",fontSize:14,cursor:"pointer"}}>Invest my coins →</button>
                      :<div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                        {[10,25,50].filter(n=>n<=coins).map(n=>(
                          <button key={n} onClick={()=>investCoins(n)} style={{flex:1,minWidth:70,padding:"10px",borderRadius:10,border:"1px solid rgba(16,185,129,.4)",background:"rgba(16,185,129,.15)",color:"#86efac",fontFamily:"var(--fd)",fontSize:13,cursor:"pointer"}}>{n} 🪙</button>
                        ))}
                        <button onClick={()=>investCoins(coins)} style={{flex:1,minWidth:70,padding:"10px",borderRadius:10,border:"1px solid rgba(16,185,129,.4)",background:"rgba(16,185,129,.15)",color:"#86efac",fontFamily:"var(--fd)",fontSize:13,cursor:"pointer"}}>All {coins} 🪙</button>
                        <button onClick={()=>setInvestOpen(false)} style={{width:"100%",padding:"8px",borderRadius:10,border:"none",background:"transparent",color:"rgba(255,255,255,.4)",fontSize:12,fontWeight:700,cursor:"pointer"}}>Cancel</button>
                      </div>}
                  </div>
                )}

                {/* Savings jar (with optional parent match) */}
                <div style={{background:"linear-gradient(135deg,rgba(245,158,11,.1),rgba(245,158,11,.04))",border:"1px solid rgba(245,158,11,.25)",borderRadius:16,padding:15,marginBottom:14}}>
                  <div style={{fontFamily:"var(--fd)",fontSize:15,color:"#fff",marginBottom:8}}>🏦 Savings Jar</div>
                  {savings?(()=>{
                    const pct=Math.min(100,Math.round(savings.saved/savings.target*100));
                    const done=savings.saved>=savings.target;
                    return(<>
                      <div style={{fontSize:13,fontWeight:800,color:"#fff",marginBottom:6}}>{savings.name}</div>
                      <div style={{height:14,borderRadius:100,background:"rgba(255,255,255,.1)",overflow:"hidden",marginBottom:6}}><div style={{height:"100%",width:`${pct}%`,background:"linear-gradient(90deg,#f59e0b,#fbbf24)",transition:"width .4s"}}/></div>
                      <div style={{fontSize:12,fontWeight:800,color:done?"#86efac":"rgba(255,255,255,.7)"}}>{savings.saved} / {savings.target} 🪙 {done?"— you did it! 🎉":`· ${savings.target-savings.saved} to go`}</div>
                      {savings.matchPct>0&&<div style={{fontSize:11,fontWeight:800,color:"#c4b5fd",background:"rgba(124,58,237,.15)",borderRadius:8,padding:"5px 9px",marginTop:8}}>⭐ Grown-up match: every 100 you save, they add {savings.matchPct} bonus! 💜</div>}
                      {!done&&coins>0&&(
                        <div style={{marginTop:10}}>
                          <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.5)",marginBottom:6}}>Move coins into savings:</div>
                          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                            {[10,25,50].filter(n=>n<=coins).map(n=>(<button key={n} onClick={()=>depositSavings(n)} style={{flex:1,minWidth:64,padding:"9px",borderRadius:10,border:"1px solid rgba(245,158,11,.4)",background:"rgba(245,158,11,.14)",color:"#fde68a",fontFamily:"var(--fd)",fontSize:13,cursor:"pointer"}}>+{n}</button>))}
                            <button onClick={()=>depositSavings(coins)} style={{flex:1,minWidth:64,padding:"9px",borderRadius:10,border:"1px solid rgba(245,158,11,.4)",background:"rgba(245,158,11,.14)",color:"#fde68a",fontFamily:"var(--fd)",fontSize:13,cursor:"pointer"}}>All {coins}</button>
                          </div>
                        </div>
                      )}
                      <button onClick={clearSavingsGoal} style={{marginTop:10,background:"none",border:"none",color:"rgba(255,255,255,.35)",fontSize:11,fontWeight:700,cursor:"pointer"}}>{done?"Start a new goal (keep coins)":"Cancel goal (get coins back)"}</button>
                    </>);
                  })():(<>
                    <div style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.6)",lineHeight:1.5,marginBottom:10}}>Set a goal and save up your coins for something big! 🎯</div>
                    <input value={goalName} onChange={e=>setGoalName(e.target.value)} maxLength={40} placeholder="What are you saving for? (e.g. a bike)" style={{width:"100%",padding:"11px 12px",borderRadius:11,border:"1.5px solid rgba(255,255,255,.18)",background:"rgba(255,255,255,.06)",color:"#fff",fontFamily:"var(--fb)",fontSize:14,fontWeight:600,marginBottom:8,boxSizing:"border-box"}}/>
                    <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.45)",marginBottom:6}}>Goal amount:</div>
                    <div style={{display:"flex",gap:7,marginBottom:10}}>
                      {[100,250,500].map(g=>(<button key={g} onClick={()=>setGoalTarget(g)} style={{flex:1,padding:"9px",borderRadius:10,border:`1.5px solid ${goalTarget===g?"rgba(245,158,11,.5)":"rgba(255,255,255,.14)"}`,background:goalTarget===g?"rgba(245,158,11,.14)":"transparent",color:goalTarget===g?"#fde68a":"rgba(255,255,255,.5)",fontFamily:"var(--fd)",fontSize:13,cursor:"pointer"}}>{g} 🪙</button>))}
                    </div>
                    <button onClick={setSavingsGoal} disabled={!goalName.trim()} style={{width:"100%",padding:12,borderRadius:12,border:"none",background:goalName.trim()?"linear-gradient(135deg,#f59e0b,#f97316)":"rgba(255,255,255,.1)",color:goalName.trim()?"#fff":"rgba(255,255,255,.4)",fontFamily:"var(--fd)",fontSize:14,cursor:goalName.trim()?"pointer":"default"}}>Start saving! 🏦</button>
                  </>)}
                </div>

                {/* Reward store */}
                {store.length>0&&(<>
                  <div style={{fontFamily:"var(--fd)",fontSize:16,color:"#fff",marginBottom:8}}>🎁 Reward Store</div>
                  <div style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.55)",marginBottom:10}}>Spend your coins on rewards your grown-up added!</div>
                  {store.map(it=>{
                    const afford=coins>=it.cost;
                    return(
                      <div key={it.id} style={{display:"flex",alignItems:"center",gap:12,background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)",borderRadius:14,padding:12,marginBottom:9}}>
                        <span style={{fontSize:28}}>{it.emoji}</span>
                        <div style={{flex:1}}><div style={{fontSize:14,fontWeight:800,color:"#fff"}}>{it.name}</div><div style={{fontSize:12,fontWeight:800,color:"#fde68a"}}>🪙 {it.cost}</div></div>
                        <button onClick={()=>redeemStoreItem(it)} disabled={!afford} style={{padding:"9px 14px",borderRadius:11,border:"none",background:afford?"linear-gradient(135deg,#f59e0b,#f97316)":"rgba(255,255,255,.08)",color:afford?"#fff":"rgba(255,255,255,.35)",fontFamily:"var(--fd)",fontSize:13,cursor:afford?"pointer":"default"}}>{afford?"Get it!":"Need more"}</button>
                      </div>
                    );
                  })}
                </>)}

                {doneList.length>0&&<div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.35)",textAlign:"center",marginTop:12}}>✅ {doneList.length} task{doneList.length>1?"s":""} finished{doneList.some(t=>t.recurring!=="once")?" — daily/weekly ones come back!":""}</div>}
              </div>
              );
            })()}

            {/* TOGETHER TIME — kids ask a grown-up for time together */}
            {moreView==="Together"&&(()=>{
              const suggestions=REQ_SUGGESTIONS.filter(s=>s.cat===reqCat);
              return(
              <div>
                <div style={{background:"linear-gradient(135deg,rgba(236,72,153,.18),rgba(124,58,237,.08))",border:"1px solid rgba(236,72,153,.3)",borderRadius:"var(--rl)",padding:18,textAlign:"center",marginBottom:16}}>
                  <div style={{fontSize:40,marginBottom:6}}>💛</div>
                  <div style={{fontFamily:"var(--fd)",fontSize:19,color:"#fff",marginBottom:6}}>Together Time</div>
                  <div style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,.75)",lineHeight:1.6}}>Ask a grown-up to spend time with you, teach you something, or do something fun together. The best reward is time together! 🤗</div>
                </div>

                <div style={{fontSize:12,fontWeight:800,color:"#fff",marginBottom:8}}>1. What kind of together time? 👇</div>
                <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:14}}>
                  {REQ_CATS.map(c=>(<button key={c.id} onClick={()=>setReqCat(c.id)} style={{padding:"8px 12px",borderRadius:100,border:`2px solid ${reqCat===c.id?"rgba(236,72,153,.5)":"rgba(255,255,255,.14)"}`,background:reqCat===c.id?"rgba(236,72,153,.16)":"transparent",color:reqCat===c.id?"#fff":"rgba(255,255,255,.55)",fontSize:12,fontWeight:800,cursor:"pointer"}}>{c.icon} {c.label}</button>))}
                </div>

                <div style={{fontSize:12,fontWeight:800,color:"#fff",marginBottom:8}}>2. Pick one, or write your own 💭</div>
                <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
                  {suggestions.map((s,i)=>(<button key={i} onClick={()=>setReqText(s.text)} style={{padding:"12px 14px",borderRadius:12,border:`1.5px solid ${reqText===s.text?"rgba(236,72,153,.5)":"rgba(255,255,255,.12)"}`,background:reqText===s.text?"rgba(236,72,153,.14)":"rgba(255,255,255,.05)",color:"#fff",fontFamily:"var(--fb)",fontSize:14,fontWeight:700,textAlign:"left",cursor:"pointer"}}>{reqCatOf(s.cat).icon} {s.text}</button>))}
                </div>
                <input value={reqText} onChange={e=>setReqText(e.target.value)} maxLength={120} placeholder="Or write your own idea…" style={{width:"100%",padding:"12px 13px",borderRadius:12,border:"1.5px solid rgba(255,255,255,.18)",background:"rgba(255,255,255,.06)",color:"#fff",fontFamily:"var(--fb)",fontSize:14,fontWeight:600,marginBottom:12,boxSizing:"border-box"}}/>
                <button onClick={sendRequest} disabled={!reqText.trim()} style={{width:"100%",padding:14,borderRadius:14,border:"none",background:reqText.trim()?"linear-gradient(135deg,#ec4899,#db2777)":"rgba(255,255,255,.1)",color:reqText.trim()?"#fff":"rgba(255,255,255,.4)",fontFamily:"var(--fd)",fontSize:16,cursor:reqText.trim()?"pointer":"default"}}>💛 Ask my grown-up</button>
                <div style={{textAlign:"center",fontSize:11,fontWeight:700,color:"rgba(255,255,255,.35)",marginTop:10,lineHeight:1.5}}>Grown-ups are busy sometimes — if they can't right away, they'll try to find another time. 💛</div>
              </div>
              );
            })()}

            {/* COIN SHOP */}
            {moreView==="Shop"&&(
              <div>
                <div style={{fontFamily:"var(--fd)",fontSize:16,color:"#fff",marginBottom:4}}>🛍️ Coin Shop</div>
                {/* Crystal-clear explainer */}
                <div style={{background:"rgba(245,158,11,.1)",border:"1px solid rgba(245,158,11,.3)",borderRadius:13,padding:13,marginBottom:14,fontSize:12,fontWeight:700,color:"rgba(255,255,255,.8)",lineHeight:1.6}}>
                  🪙 <strong style={{color:"#f59e0b"}}>Coins are for FUN stuff only!</strong> Buy themes, avatars and pet outfits here. Coins are totally separate from your Money Garden — you can NEVER buy investments with coins. That keeps your investing real!
                </div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(255,255,255,.06)",borderRadius:12,padding:"12px 16px",marginBottom:14}}>
                  <span style={{fontSize:13,fontWeight:800,color:"rgba(255,255,255,.6)"}}>Your coins to spend:</span>
                  <span style={{fontFamily:"var(--fd)",fontSize:22,color:"#f59e0b"}}>🪙 {coins}</span>
                </div>
                {shopMsg&&<div style={{background:"rgba(124,58,237,.15)",border:"1px solid rgba(124,58,237,.3)",borderRadius:11,padding:"10px 13px",marginBottom:12,fontSize:13,fontWeight:800,color:"#fff",textAlign:"center"}}>{shopMsg}</div>}
                {SHOP_ITEMS.map(item=>{
                  const isOwned=owned.includes(item.id);
                  const canAfford=coins>=item.cost;
                  const isEquippable = item.type==="avatar"||item.type==="theme";
                  const themeTid = item.type==="theme" ? item.id.replace("theme_","") : null;
                  const isActive = (item.type==="avatar"&&equipAvatar===item.icon) || (item.type==="theme"&&(equipTheme||user?.theme)===themeTid);
                  return(
                    <div key={item.id} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 14px",background:"rgba(255,255,255,.06)",border:`1px solid ${isActive?"rgba(16,185,129,.4)":"rgba(255,255,255,.1)"}`,borderRadius:14,marginBottom:9,opacity:isOwned&&!isEquippable?.7:1}}>
                      <span style={{fontSize:30,flexShrink:0}}>{item.icon}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontFamily:"var(--fd)",fontSize:14,color:"#fff"}}>{item.name}</div>
                        <div style={{fontSize:11,color:"rgba(255,255,255,.5)",fontWeight:600,lineHeight:1.4}}>{item.desc}</div>
                      </div>
                      {isActive
                        ?<span style={{fontSize:11,fontWeight:800,color:"#86efac",background:"rgba(16,185,129,.15)",padding:"6px 12px",borderRadius:100,flexShrink:0}}>✅ {item.type==="avatar"?"Wearing":"Active"}</span>
                        :isOwned&&isEquippable
                          ?<button onClick={()=>equipItem(item)} style={{flexShrink:0,padding:"9px 14px",borderRadius:11,border:"1.5px solid rgba(16,185,129,.5)",background:"rgba(16,185,129,.12)",color:"#86efac",fontFamily:"var(--fd)",fontSize:13,cursor:"pointer"}}>Use it ✨</button>
                          :isOwned&&!item.consumable
                            ?<span style={{fontSize:11,fontWeight:800,color:"#86efac",background:"rgba(16,185,129,.15)",padding:"6px 12px",borderRadius:100,flexShrink:0}}>✅ Owned</span>
                            :<button onClick={()=>buyItem(item)} disabled={!canAfford} style={{flexShrink:0,padding:"9px 14px",borderRadius:11,border:"none",background:canAfford?"linear-gradient(135deg,#f59e0b,#d97706)":"rgba(255,255,255,.08)",color:canAfford?"#fff":"rgba(255,255,255,.3)",fontFamily:"var(--fd)",fontSize:13,cursor:canAfford?"pointer":"not-allowed"}}>🪙 {item.cost}</button>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* BADGES */}
            {moreView==="Badges"&&(
              <div>
                <div style={{fontFamily:"var(--fd)",fontSize:16,color:"#fff",marginBottom:4}}>🏅 Achievement Badges</div>
                <div style={{fontSize:12,fontWeight:600,color:"rgba(255,255,255,.5)",marginBottom:14}}>Earn badges by hitting milestones. Collect them all to become a Master Investor!</div>
                <div style={{display:"flex",gap:8,marginBottom:14}}>
                  <div style={{flex:1,background:"rgba(124,58,237,.12)",borderRadius:12,padding:"12px",textAlign:"center"}}>
                    <div style={{fontFamily:"var(--fd)",fontSize:22,color:theme.accent}}>{earnedBadges.length}/{BADGES.length}</div>
                    <div style={{fontSize:10,fontWeight:800,color:"rgba(255,255,255,.4)"}}>BADGES EARNED</div>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  {BADGES.map(b=>{
                    const earned=earnedBadges.includes(b.id);
                    return(
                      <div key={b.id} style={{background:earned?"rgba(245,158,11,.12)":"rgba(255,255,255,.04)",border:`1.5px solid ${earned?"rgba(245,158,11,.35)":"rgba(255,255,255,.08)"}`,borderRadius:14,padding:14,textAlign:"center",opacity:earned?1:.55}}>
                        <div style={{fontSize:34,marginBottom:6,filter:earned?"none":"grayscale(1)"}}>{earned?b.icon:"🔒"}</div>
                        <div style={{fontFamily:"var(--fd)",fontSize:13,color:earned?"#fff":"rgba(255,255,255,.5)",marginBottom:3}}>{b.name}</div>
                        <div style={{fontSize:10,fontWeight:600,color:"rgba(255,255,255,.45)",lineHeight:1.4}}>{b.desc}</div>
                        {earned&&<div style={{fontSize:10,fontWeight:800,color:"#f59e0b",marginTop:6}}>✅ Earned!</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* BACKUP / RESTORE */}
            {moreView==="Backup"&&(
              <div>
                <div style={{fontFamily:"var(--fd)",fontSize:16,color:"#fff",marginBottom:4}}>💾 Back Up My Account</div>
                <div style={{fontSize:12,fontWeight:600,color:"rgba(255,255,255,.5)",marginBottom:14}}>Save a backup code so your progress is never lost — even if the tablet's browser gets cleared.</div>

                <div style={{background:"rgba(245,158,11,.1)",border:"1px solid rgba(245,158,11,.3)",borderRadius:13,padding:13,marginBottom:14,fontSize:12,fontWeight:700,color:"rgba(255,255,255,.8)",lineHeight:1.6}}>
                  ⚠️ <strong style={{color:"#f59e0b"}}>Why back up?</strong> Your progress saves on this tablet's browser. If it gets cleared (or on iPad, if you don't open the app for a week), it can disappear. A backup code brings everything back.
                </div>

                <div style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",borderRadius:14,padding:16,marginBottom:12}}>
                  <div style={{fontFamily:"var(--fd)",fontSize:14,color:"#fff",marginBottom:8}}>Step 1: Make your code</div>
                  <button onClick={generateBackup} style={{width:"100%",padding:"13px",borderRadius:13,border:"none",background:`linear-gradient(135deg,${theme.accent},${theme.accent}99)`,color:"#fff",fontFamily:"var(--fd)",fontSize:15,cursor:"pointer"}}>💾 Create backup code</button>
                  {backupCode&&(
                    <div style={{marginTop:12}}>
                      <div style={{fontSize:11,fontWeight:800,color:"rgba(255,255,255,.5)",marginBottom:6}}>Step 2: Copy &amp; keep this safe (text it to your parent!)</div>
                      <div style={{background:"rgba(0,0,0,.3)",border:"1px solid rgba(255,255,255,.12)",borderRadius:10,padding:10,fontSize:10,fontFamily:"monospace",color:"rgba(255,255,255,.7)",wordBreak:"break-all",maxHeight:80,overflowY:"auto",lineHeight:1.5}}>{backupCode}</div>
                      <button onClick={copyBackup} style={{width:"100%",marginTop:8,padding:"11px",borderRadius:12,border:"none",background:copied?"rgba(16,185,129,.3)":"rgba(255,255,255,.12)",color:copied?"#86efac":"#fff",fontFamily:"var(--fd)",fontSize:14,cursor:"pointer"}}>{copied?"✅ Copied!":"📋 Copy code"}</button>
                    </div>
                  )}
                </div>

                <div style={{background:"rgba(6,182,212,.08)",border:"1px solid rgba(6,182,212,.2)",borderRadius:12,padding:13,fontSize:12,fontWeight:600,color:"rgba(255,255,255,.7)",lineHeight:1.6}}>
                  🔑 <strong style={{color:"#67e8f9"}}>To restore later:</strong> On the login screen, tap "Restore from a backup code" and paste your code. Your whole account and progress come right back!
                </div>
              </div>
            )}

            {/* PENDING ORDERS */}
            {moreView==="Orders"&&(
              <div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
                  <div style={{fontFamily:"var(--fd)",fontSize:16,color:"#fff"}}>⏳ My Orders</div>
                  <button onClick={()=>setShowOrderHelp(true)} style={{background:"rgba(124,58,237,.18)",border:"1px solid rgba(124,58,237,.35)",borderRadius:100,padding:"5px 12px",color:"#c4b5fd",fontSize:11,fontWeight:800,cursor:"pointer"}}>❓ How orders work</button>
                </div>
                <div style={{fontSize:12,fontWeight:600,color:"rgba(255,255,255,.5)",marginBottom:14}}>Orders waiting to happen. Limit orders fill when your target price is hit — even while you're at school!</div>

                {/* Market status banner */}
                <div style={{display:"flex",alignItems:"center",gap:10,background:mkt.open?"rgba(16,185,129,.1)":"rgba(245,158,11,.1)",border:`1px solid ${mkt.open?"rgba(16,185,129,.25)":"rgba(245,158,11,.3)"}`,borderRadius:13,padding:13,marginBottom:10}}>
                  <span style={{fontSize:22}}>{mkt.open?"🟢":"🔴"}</span>
                  <div>
                    <div style={{fontFamily:"var(--fd)",fontSize:14,color:"#fff"}}>US Stock Market: {mkt.open?"OPEN":"CLOSED"}</div>
                    <div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,.55)"}}>{mkt.open?"Trades fill instantly right now":`Opens ${mkt.nextOpenText} · Crypto still trades 24/7`}</div>
                  </div>
                </div>
                {pendingOrders.length>0&&(
                  <div style={{background:"rgba(6,182,212,.08)",border:"1px solid rgba(6,182,212,.2)",borderRadius:11,padding:"9px 12px",marginBottom:14,fontSize:11,fontWeight:600,color:"rgba(255,255,255,.7)",lineHeight:1.5}}>
                    💡 Tip: open the app after the market opens to let your orders fill. They fill automatically while the app is open — so check back in once the market's awake!
                  </div>
                )}

                {pendingOrders.length===0?(
                  <div>
                    <div style={{textAlign:"center",padding:"24px 20px 18px",background:"rgba(255,255,255,.04)",borderRadius:14,marginBottom:12}}>
                      <div style={{fontSize:44,marginBottom:10}}>⏳</div>
                      <div style={{fontSize:14,fontWeight:700,color:"rgba(255,255,255,.6)",marginBottom:6}}>No waiting orders yet</div>
                      <div style={{fontSize:12,fontWeight:600,color:"rgba(255,255,255,.45)",lineHeight:1.5}}>Here's what one looks like 👇 Place your own from the Trade screen by choosing "🎯 Limit".</div>
                    </div>
                    {/* Sample/example order (greyed) */}
                    <div style={{opacity:.55,position:"relative"}}>
                      <div style={{position:"absolute",top:8,right:10,fontSize:9,fontWeight:800,background:"rgba(124,58,237,.3)",color:"#c4b5fd",padding:"2px 8px",borderRadius:100,zIndex:1}}>EXAMPLE</div>
                      <div style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(16,185,129,.25)",borderRadius:14,padding:14}}>
                        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                          <span style={{fontSize:26}}>🍎</span>
                          <div style={{flex:1}}>
                            <div style={{fontFamily:"var(--fd)",fontSize:14,color:"#fff"}}>🟢 Buy Apple</div>
                            <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.45)"}}>🎯 Limit order · 1 share · placed today</div>
                          </div>
                        </div>
                        <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.65)",background:"rgba(255,255,255,.05)",borderRadius:9,padding:"8px 10px"}}>Target: <strong style={{color:"#fff"}}>$180.00</strong> · Now: $195.00 ⏳ waiting</div>
                      </div>
                    </div>
                    <button onClick={()=>setNav("Trade")} style={{width:"100%",marginTop:14,padding:"13px",borderRadius:13,border:"none",background:`linear-gradient(135deg,${theme.accent},${theme.accent}99)`,color:"#fff",fontFamily:"var(--fd)",fontSize:14,cursor:"pointer"}}>⚡ Go place a real order</button>
                  </div>
                ):(
                  pendingOrders.map(o=>(
                    <div key={o.id} style={{background:"rgba(255,255,255,.06)",border:`1px solid ${o.side==="buy"?"rgba(16,185,129,.25)":"rgba(239,68,68,.25)"}`,borderRadius:14,padding:14,marginBottom:10}}>
                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                        <span style={{fontSize:26}}>{o.icon}</span>
                        <div style={{flex:1}}>
                          <div style={{fontFamily:"var(--fd)",fontSize:14,color:"#fff"}}>{o.side==="buy"?"🟢 Buy":"🔴 Sell"} {o.name}</div>
                          <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.45)"}}>{o.kind==="limit"?"🎯 Limit order":"⏰ Queued for open"} · {fmtQty(o.qty)} {o.type==="crypto"?"tokens":"shares"} · placed {o.placed}</div>
                        </div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{flex:1,fontSize:11,fontWeight:700,color:"rgba(255,255,255,.65)",background:"rgba(255,255,255,.05)",borderRadius:9,padding:"8px 10px"}}>
                          {o.kind==="limit"
                            ?<>Target: <strong style={{color:"#fff"}}>{fs$(o.limitPrice)}</strong> · Now: {fs$(prices[o.ticker]||0)} {(o.side==="buy"?(prices[o.ticker]<=o.limitPrice):(prices[o.ticker]>=o.limitPrice))?"✅ ready!":"⏳ waiting"}</>
                            :<>Fills at next market open ({mkt.nextOpenText})</>}
                        </div>
                        <button onClick={()=>cancelOrder(o.id)} style={{padding:"8px 14px",borderRadius:10,border:"1px solid rgba(239,68,68,.3)",background:"rgba(239,68,68,.1)",color:"#fca5a5",fontFamily:"var(--fb)",fontSize:11,fontWeight:800,cursor:"pointer",flexShrink:0}}>Cancel</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Performance / P&L — tracks profit across sessions */}
            {moreView==="Performance"&&(
              <div>
                <div style={{fontFamily:"var(--fd)",fontSize:16,color:"#fff",marginBottom:4}}>📈 My Performance</div>
                <div style={{fontSize:12,fontWeight:600,color:"rgba(255,255,255,.5)",marginBottom:14}}>Track every trade and see your real profit or loss — even after closing the app!</div>

                {/* Big P&L summary */}
                <div style={{background:allTimeGain>=0?"rgba(16,185,129,.1)":"rgba(239,68,68,.1)",border:`2px solid ${allTimeGain>=0?"rgba(16,185,129,.3)":"rgba(239,68,68,.3)"}`,borderRadius:16,padding:18,marginBottom:14,textAlign:"center"}}>
                  <div style={{fontSize:11,fontWeight:800,color:"rgba(255,255,255,.5)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Total Garden Value</div>
                  <div style={{fontFamily:"var(--fd)",fontSize:34,color:"#fff"}}>{f$(totalValue)}</div>
                  <div style={{fontSize:13,fontWeight:800,color:allTimeGain>=0?"#86efac":"#fca5a5",marginTop:4}}>
                    {allTimeGain>=0?"📈 UP":"📉 DOWN"} {f$(Math.abs(allTimeGain))} all-time ({allTimeGain>=0?"+":""}{(allTimeGain/1000*100).toFixed(1)}%)
                  </div>
                  {sinceLastVisit!=null&&Math.abs(sinceLastVisit)>=0.01&&(
                    <div style={{marginTop:8,fontSize:11,fontWeight:700,color:"rgba(255,255,255,.6)",background:"rgba(255,255,255,.08)",borderRadius:10,padding:"6px 12px",display:"inline-block"}}>
                      👋 Since you were last here: {sinceLastVisit>=0?"+":""}{f$(sinceLastVisit)}
                    </div>
                  )}
                </div>

                {/* Realized vs Unrealized */}
                <div style={{display:"flex",gap:10,marginBottom:14}}>
                  <div style={{flex:1,background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",borderRadius:14,padding:14}}>
                    <div style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,.4)",textTransform:"uppercase",marginBottom:3}}>💰 Realized P&amp;L</div>
                    <div style={{fontFamily:"var(--fd)",fontSize:20,color:realizedPnl>=0?"#86efac":"#fca5a5"}}>{realizedPnl>=0?"+":""}{f$(realizedPnl)}</div>
                    <div style={{fontSize:10,fontWeight:600,color:"rgba(255,255,255,.4)",marginTop:2}}>From completed sells</div>
                  </div>
                  <div style={{flex:1,background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",borderRadius:14,padding:14}}>
                    <div style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,.4)",textTransform:"uppercase",marginBottom:3}}>📊 Unrealized P&amp;L</div>
                    <div style={{fontFamily:"var(--fd)",fontSize:20,color:unrealizedPnl>=0?"#86efac":"#fca5a5"}}>{unrealizedPnl>=0?"+":""}{f$(unrealizedPnl)}</div>
                    <div style={{fontSize:10,fontWeight:600,color:"rgba(255,255,255,.4)",marginTop:2}}>On what you still hold</div>
                  </div>
                </div>

                <div style={{background:"rgba(6,182,212,.08)",border:"1px solid rgba(6,182,212,.2)",borderRadius:12,padding:12,marginBottom:14,fontSize:11,fontWeight:600,color:"rgba(255,255,255,.7)",lineHeight:1.5}}>
                  💡 <strong style={{color:"#67e8f9"}}>Realized</strong> = profit you've locked in by selling. <strong style={{color:"#67e8f9"}}>Unrealized</strong> = paper profit on stuff you still own — it changes as prices move!
                </div>

                {/* Trade history log */}
                <div style={{fontFamily:"var(--fd)",fontSize:15,color:"#fff",marginBottom:10}}>📋 Trade History ({trades.length})</div>
                {trades.length===0?(
                  <div style={{textAlign:"center",padding:"30px 20px",background:"rgba(255,255,255,.04)",borderRadius:14}}>
                    <div style={{fontSize:40,marginBottom:10}}>📋</div>
                    <div style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,.5)"}}>No trades yet. Buy something to start your history!</div>
                  </div>
                ):(
                  trades.map(t=>(
                    <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.09)",borderRadius:13,marginBottom:8}}>
                      <div style={{width:36,height:36,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0,background:t.side==="BUY"?"rgba(6,182,212,.15)":"rgba(245,158,11,.15)"}}>{t.icon}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:800,fontSize:13,color:"#fff"}}>{t.name}</div>
                        <div style={{fontSize:10,color:"rgba(255,255,255,.45)",fontWeight:600}}>{t.date} at {t.time} · {fmtQty(t.qty)} @ {fs$(t.price)}</div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        <div style={{fontSize:10,fontWeight:800,padding:"2px 8px",borderRadius:100,marginBottom:3,display:"inline-block",background:t.side==="BUY"?"rgba(6,182,212,.15)":"rgba(245,158,11,.15)",color:t.side==="BUY"?"#67e8f9":"#fde68a"}}>{t.side==="BUY"?"🟢 BUY":"🔴 SELL"}</div>
                        <div style={{fontWeight:800,fontSize:12,color:"#fff"}}>{f$(t.total)}</div>
                        {t.side==="SELL"&&t.pnl!=null&&(
                          <div style={{fontSize:11,fontWeight:800,color:t.pnl>=0?"#86efac":"#fca5a5"}}>{t.pnl>=0?"✅ +":"❌ "}{f$(t.pnl)} ({t.pnlPct>=0?"+":""}{t.pnlPct}%)</div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
            {/* Ranks */}
            {moreView==="Ranks"&&(
              <div>
                <div style={{background:`linear-gradient(135deg,${theme.accent}33,${theme.accent}11)`,border:`1px solid ${theme.accent}44`,borderRadius:14,padding:"14px 16px",marginBottom:14}}>
                  <div style={{fontFamily:"var(--fd)",fontSize:13,color:"rgba(255,255,255,.5)",marginBottom:6}}>YOUR POSITION</div>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <span style={{fontSize:32}}>{avatar}</span>
                    <div style={{flex:1}}><div style={{fontFamily:"var(--fd)",fontSize:16,color:"#fff"}}>{user?.name} <span style={{fontSize:11,fontWeight:800,background:`${theme.accent}44`,color:theme.accent,padding:"2px 8px",borderRadius:100}}>YOU</span></div><div style={{fontSize:11,color:"rgba(255,255,255,.5)",fontWeight:600}}>Keep trading to climb! 🚀</div></div>
                    <div style={{fontFamily:"var(--fd)",fontSize:20,color:"#fff"}}>{fs$(totalValue)}</div>
                  </div>
                </div>
                <div style={{fontFamily:"var(--fd)",fontSize:15,color:"#fff",marginBottom:10}}>💎 Diamond Hands — May 2026</div>
                {LB_BASE.map((e,i)=>(
                  <div key={e.name} style={{display:"flex",alignItems:"center",gap:11,padding:"13px 15px",background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.09)",borderRadius:13,marginBottom:8}}>
                    <span style={{fontFamily:"var(--fd)",fontSize:18,width:34,textAlign:"center",color:"rgba(255,255,255,.45)",flexShrink:0}}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}</span>
                    <span style={{fontSize:26,flexShrink:0}}>{e.avatar}</span>
                    <span style={{fontFamily:"var(--fd)",fontSize:14,color:"#fff",flex:1}}>{e.name}</span>
                    <div style={{textAlign:"right"}}><div style={{fontFamily:"var(--fd)",fontSize:14,color:"#fff"}}>{fs$(e.val)}</div><div style={{fontSize:10,fontWeight:700,color:e.up?"#86efac":"#fca5a5"}}>{e.up?"▲":"▼"} {e.chg}</div></div>
                  </div>
                ))}
              </div>
            )}

            {/* Collectible Cards — feature 2 */}
            {moreView==="Cards"&&(
              <div>
                <div style={{fontFamily:"var(--fd)",fontSize:16,color:"#fff",marginBottom:4}}>🎴 My Investment Cards</div>
                <div style={{fontSize:12,fontWeight:600,color:"rgba(255,255,255,.5)",marginBottom:10}}>You collect a card every time you buy — like trading cards! Rare cards glow. Buy the same thing 3 times = 3 cards to collect.</div>
                <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.6)",background:"rgba(99,102,241,.1)",border:"1px solid rgba(99,102,241,.25)",borderRadius:11,padding:"9px 12px",marginBottom:14,lineHeight:1.5}}>💡 These are collectibles, not your holdings. To see how many shares you actually own (combined), check <strong style={{color:"#fff"}}>Assets</strong> or <strong style={{color:"#fff"}}>P&amp;L</strong>.</div>
                {invCards.length===0?(
                  <div style={{textAlign:"center",padding:"40px 20px"}}>
                    <div style={{fontSize:48,marginBottom:12}}>🎴</div>
                    <div style={{fontFamily:"var(--fd)",fontSize:18,color:"#fff",marginBottom:6}}>No cards yet!</div>
                    <div style={{fontSize:12,color:"rgba(255,255,255,.5)",fontWeight:600}}>Make your first trade to earn your first card!</div>
                  </div>
                ):(
                  <div className="cards-grid">
                    {invCards.map(c=>{
                      const cur=prices[c.ticker]||c.buyPrice;
                      const pnlPct=parseFloat(pct(cur,c.buyPrice));
                      const isHolo=pnlPct>10;
                      const tier=pnlPct>15?"🌟 Rare":pnlPct>5?"✨ Uncommon":"⬜ Common";
                      return(
                        <div key={c.id} className={`inv-card ${isHolo?"holo":""}`} style={{background:`linear-gradient(135deg,${c.color}bb,${c.color}55)`,border:`1px solid ${c.color}${isHolo?"99":"44"}`}}>
                          {isHolo&&<div className="card-shine"/>}
                          <div className="card-tier">{tier}</div>
                          <span className="card-ic">{c.icon}</span>
                          <div className="card-nm">{c.name}</div>
                          <div style={{fontSize:9,color:"rgba(255,255,255,.5)",fontWeight:700,marginBottom:6}}>Bought {c.earnedAt} @ {fs$(c.buyPrice)}</div>
                          <div className={`card-pnl ${pnlPct>=0?"":"n"}`} style={{color:pnlPct>=0?"#86efac":"#fca5a5"}}>{pnlPct>=0?"+":""}{pnlPct}% {pnlPct>=10?"🔥":""}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Head-to-head challenges — feature 6 */}
            {moreView==="Challenge"&&(
              <div>
                <div style={{fontFamily:"var(--fd)",fontSize:16,color:"#fff",marginBottom:4}}>⚔️ Head-to-Head Challenges</div>
                <div style={{fontSize:12,fontWeight:600,color:"rgba(255,255,255,.5)",marginBottom:14}}>Challenge a sibling! Who makes more profit this week? Winner gets 100 coins from the loser!</div>
                {challenge?(
                  <div className="challenge-card">
                    <div style={{fontFamily:"var(--fd)",fontSize:13,color:"rgba(255,255,255,.5)",marginBottom:10}}>⚔️ ACTIVE CHALLENGE · Ends {challenge.ends}</div>
                    <div className="vs-row">
                      <div className="vs-player">
                        <div style={{fontSize:36}}>{avatar}</div>
                        <div style={{fontFamily:"var(--fd)",fontSize:15,color:"#fff",marginTop:4}}>{user?.name}</div>
                        <div className="vs-badge" style={{background:`${challenge.myGain>=0?"rgba(16,185,129,.2)":"rgba(239,68,68,.2)"}`,color:challenge.myGain>=0?"#86efac":"#fca5a5"}}>{challenge.myGain>=0?"+":""}{f$(challenge.myGain)}</div>
                      </div>
                      <div className="vs-label">VS</div>
                      <div className="vs-player">
                        <div style={{fontSize:36}}>{challenge.sib.avatar}</div>
                        <div style={{fontFamily:"var(--fd)",fontSize:15,color:"#fff",marginTop:4}}>{challenge.sib.name}</div>
                        <div className="vs-badge" style={{background:`${challenge.sibGain>=0?"rgba(16,185,129,.2)":"rgba(239,68,68,.2)"}`,color:challenge.sibGain>=0?"#86efac":"#fca5a5"}}>{challenge.sibGain>=0?"+":""}{f$(challenge.sibGain)}</div>
                      </div>
                    </div>
                    <div style={{fontSize:11,fontWeight:800,color:"rgba(255,255,255,.5)",marginBottom:5}}>WHO'S WINNING?</div>
                    <div className="challenge-bar">
                      <div className="challenge-fill" style={{width:`${Math.min(100,Math.max(10,(challenge.myGain/(Math.abs(challenge.myGain)+Math.abs(challenge.sibGain)||1))*100))}%`,background:`linear-gradient(90deg,${user?.theme?THEMES.find(t=>t.id===user.theme)?.accent:"#7c3aed"},${challenge.sib.color})`,left:0}}/>
                    </div>
                    <div style={{fontSize:11,fontWeight:800,color:"rgba(255,255,255,.4)",marginTop:6,textAlign:"center"}}>{challenge.myGain>challenge.sibGain?`${user?.name} is leading! Keep going! 🔥`:`${challenge.sib.name} is ahead — time to trade smarter! 💪`}</div>
                  </div>
                ):(
                  <div>
                    <div style={{fontFamily:"var(--fd)",fontSize:14,color:"rgba(255,255,255,.6)",marginBottom:12}}>Pick a sibling to challenge:</div>
                    {SIBLINGS.map(s=>(
                      <div key={s.id} style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.12)",borderRadius:16,padding:16,marginBottom:10,display:"flex",alignItems:"center",gap:12}}>
                        <span style={{fontSize:38}}>{s.avatar}</span>
                        <div style={{flex:1}}>
                          <div style={{fontFamily:"var(--fd)",fontSize:16,color:"#fff"}}>{s.name}</div>
                          <div style={{fontSize:11,color:"rgba(255,255,255,.45)",fontWeight:600}}>{s.lastActive} · {s.portPnl>=0?"Up":"Down"} {f$(Math.abs(s.portPnl))} this month</div>
                        </div>
                        <button onClick={()=>startChallenge(s)} style={{padding:"10px 16px",borderRadius:12,border:"none",background:`linear-gradient(135deg,#7c3aed,#9333ea)`,color:"#fff",fontFamily:"var(--fd)",fontSize:13,cursor:"pointer"}}>Challenge! ⚔️</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Predictions — feature 10 */}
            {moreView==="Predict"&&(
              <div>
                <div style={{fontFamily:"var(--fd)",fontSize:16,color:"#fff",marginBottom:4}}>🔮 Price Predictions</div>
                <div style={{fontSize:12,fontWeight:600,color:"rgba(255,255,255,.5)",marginBottom:14}}>Guess if a stock will be UP or DOWN in 7 days. Correct predictions earn +50 XP and +25 coins! Train your investing brain!</div>
                <div className="pred-card">
                  <div style={{fontFamily:"var(--fd)",fontSize:14,color:"#fff",marginBottom:10}}>Pick an asset to predict:</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
                    {MARKET.slice(0,6).map(a=>{
                      const pending=predictions.some(p=>p.ticker===a.ticker&&p.status==="open");
                      return(
                        <div key={a.ticker} onClick={()=>!pending&&setPredSel(a)} style={{border:`2px solid ${predSel?.ticker===a.ticker?"rgba(255,255,255,.5)":"rgba(255,255,255,.1)"}`,borderRadius:12,padding:"10px 6px",background:predSel?.ticker===a.ticker?"rgba(255,255,255,.12)":"rgba(255,255,255,.04)",cursor:pending?"not-allowed":"pointer",textAlign:"center",opacity:pending?.5:1}}>
                          <div style={{fontSize:22}}>{a.icon}</div>
                          <div style={{fontFamily:"var(--fd)",fontSize:11,color:"#fff",marginTop:3}}>{a.name}</div>
                          {pending&&<div style={{fontSize:9,fontWeight:800,color:"#67e8f9",marginTop:2}}>PENDING</div>}
                        </div>
                      );
                    })}
                  </div>
                  {predSel&&(
                    <>
                      <div style={{fontSize:13,fontWeight:800,color:"rgba(255,255,255,.8)",marginBottom:8}}>Will {predSel.name} go UP or DOWN in 7 days? Current: {fs$(prices[predSel.ticker]||predSel.basePrice)}</div>
                      <div className="pred-btns">
                        <button className="pred-btn-up" onClick={()=>makePred(predSel,"UP")}>📈 UP</button>
                        <button className="pred-btn-dn" onClick={()=>makePred(predSel,"DOWN")}>📉 DOWN</button>
                      </div>
                    </>
                  )}
                </div>
                {predictions.length>0&&(
                  <div>
                    <div style={{fontFamily:"var(--fd)",fontSize:14,color:"#fff",marginBottom:10}}>📋 My Predictions</div>
                    {predictions.map(p=>(
                      <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",borderRadius:13,marginBottom:8}}>
                        <span style={{fontSize:24}}>{p.icon}</span>
                        <div style={{flex:1}}><div style={{fontFamily:"var(--fd)",fontSize:14,color:"#fff"}}>{p.name}</div><div style={{fontSize:11,color:"rgba(255,255,255,.45)",fontWeight:600}}>{p.status==="resolved"
                          ?<>Predicted {p.dir} at {fs$(p.price)} · ended {fs$(p.resultPrice)}</>
                          :<>Predicting {p.dir} · Resolves {new Date(p.id+7*86400000).toLocaleDateString("en-US",{day:"numeric",month:"short"})}</>}</div></div>
                        <div style={{textAlign:"right"}}><div style={{fontFamily:"var(--fd)",fontSize:13,color:p.dir==="UP"?"#86efac":"#fca5a5"}}>{p.dir==="UP"?"📈 UP":"📉 DOWN"}</div><div style={{fontSize:11,fontWeight:800,color:p.status!=="resolved"?"rgba(255,255,255,.4)":p.correct?"#86efac":"#fca5a5"}}>{p.status!=="resolved"?"Open":p.correct?"✅ +25 🪙":"❌ Missed"}</div></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Investment Club — feature 11 */}
            {moreView==="Club"&&(
              <div>
                <div style={{fontFamily:"var(--fd)",fontSize:16,color:"#fff",marginBottom:4}}>🤝 Investment Club</div>
                <div style={{fontSize:12,fontWeight:600,color:"rgba(255,255,255,.5)",marginBottom:14}}>Pool your money with family members to make bigger joint investments! Everyone contributes, everyone shares the profits.</div>
                <div className="club-pool">
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}>
                    <div style={{fontFamily:"var(--fd)",fontSize:14,color:"#fff"}}>Family Pool</div>
                    <div style={{fontFamily:"var(--fd)",fontSize:20,color:"#f59e0b"}}>{f$(clubPool.total)}</div>
                  </div>
                  <div style={{height:6,background:"rgba(255,255,255,.08)",borderRadius:100,overflow:"hidden",marginBottom:12}}>
                    <div style={{height:"100%",width:`${Math.min(100,(clubPool.total/1000)*100)}%`,background:"linear-gradient(90deg,#f59e0b,#ec4899)",borderRadius:100}}/>
                  </div>
                  <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.45)",marginBottom:12}}>Goal: $1,000 to buy 1 Nvidia share together!</div>
                  {clubPool.members.length>0&&clubPool.members.map((m,i)=>(
                    <div key={i} className="member-row">
                      <span style={{fontSize:22}}>{m.avatar||"👤"}</span>
                      <span style={{fontFamily:"var(--fd)",fontSize:14,color:"#fff",flex:1}}>{m.name}</span>
                      <span style={{fontFamily:"var(--fd)",fontSize:14,color:"#f59e0b"}}>{f$(m.amt)}</span>
                    </div>
                  ))}
                  {clubPool.total<1000&&(
                    <div style={{marginTop:14}}>
                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                        <span style={{fontSize:12,fontWeight:800,color:"rgba(255,255,255,.6)"}}>Contribute:</span>
                        <input type="range" min={10} max={Math.min(200,cash)} step={10} value={clubAmt} onChange={e=>setClubAmt(+e.target.value)} style={{flex:1,height:6,borderRadius:100,accentColor:theme.accent}}/>
                        <span style={{fontFamily:"var(--fd)",fontSize:15,color:"#f59e0b",minWidth:45}}>{f$(clubAmt)}</span>
                      </div>
                      <button onClick={()=>joinClub(clubAmt)} disabled={clubAmt>cash} style={{width:"100%",padding:"13px",borderRadius:13,border:"none",background:"linear-gradient(135deg,#047857,#10b981)",color:"#fff",fontFamily:"var(--fd)",fontSize:15,cursor:"pointer",opacity:clubAmt>cash?.4:1}}>
                        🤝 Contribute {f$(clubAmt)}
                      </button>
                    </div>
                  )}
                  {clubPool.total>=1000&&<div style={{textAlign:"center",padding:"14px 0",fontFamily:"var(--fd)",fontSize:16,color:"#f59e0b"}}>🎉 Pool funded! Time to vote on what to buy!</div>}
                </div>
              </div>
            )}

            {/* Report Card — feature 8 */}
            {moreView==="Report"&&(
              <div>
                <div style={{background:"linear-gradient(135deg,rgba(124,58,237,.15),rgba(6,182,212,.08))",border:"1px solid rgba(124,58,237,.3)",borderRadius:"var(--rl)",padding:20,textAlign:"center",marginBottom:16}}>
                  <div className="report-star">📊</div>
                  <div style={{fontFamily:"var(--fd)",fontSize:13,color:"rgba(255,255,255,.5)",marginBottom:4}}>YOUR WEEKLY REPORT CARD</div>
                  <div className="report-grade" style={{color:reportGrade.startsWith("A")?"#86efac":reportGrade==="B"?"#fde68a":reportGrade==="C"?"#fdba74":"#fca5a5"}}>{reportGrade}</div>
                  <div style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.55)"}}>
                    {reportGrade==="A+"?"Outstanding investor! Your Money Garden is thriving! 🌟":reportGrade==="A"?"Great job! Your investments are paying off! 📈":reportGrade==="B"?"Solid work! Keep learning and diversifying! 💪":reportGrade==="C"?"Room to improve — check the Learn tab for tips! 📚":"Rough week, but every investor has them. Study more! 🧘"}
                  </div>
                </div>
                <div style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.1)",borderRadius:16,padding:16}}>
                  {[
                    ["Total Chest Value",f$(totalValue)],
                    ["Cash in Hand",     f$(cash)],
                    ["Assets Owned",     `${portfolio.length}`],
                    ["Portfolio Gain",   `${weekStats.gainPct>=0?"+":""}${weekStats.gainPct}%`],
                    ["Best Asset",       weekStats.best.name||"None yet"],
                    ["Lessons Done",     `${doneLesson.length} of ${LESSONS.length}`],
                    ["Cash from Learning",f$(LESSONS.filter(l=>doneLesson.includes(l.id)).reduce((s,l)=>s+l.cashReward,0))],
                    ["Streak",           `🔥 ${streak} days`],
                  ].map(([k,v])=>(
                    <div key={k} className="stat-row"><span>{k}</span><span className="val">{v}</span></div>
                  ))}
                </div>
                <div style={{background:"rgba(245,158,11,.1)",border:"1px solid rgba(245,158,11,.25)",borderRadius:14,padding:14,marginTop:14}}>
                  <div style={{fontFamily:"var(--fd)",fontSize:14,color:"#f59e0b",marginBottom:6}}>💡 This Week's Tip</div>
                  <div style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.75)",lineHeight:1.6}}>
                    {portfolio.length<3?"You need more diversification! Own 3-5 different assets — like candy in multiple pockets!":doneLesson.length<3?"Complete more lessons! Each one gives you paper money AND makes you a smarter trader.":"Great diversification! Now focus on timing — check the daily news before each trade."}
                  </div>
                </div>
              </div>
            )}

            {/* Grown-Up Money Life — Earn a paycheck → pay bills → invest savings → get promoted */}
            {moreView==="Invest"&&(()=>{
              const hasEtf   = !!autoInvest?.etf;
              const holdAsset= MARKET.find(m=>m.ticker===chosenEtf);
              const holdVal  = holdAsset?(portfolio.find(h=>h.ticker===holdAsset.ticker)?.qty||0)*(prices[holdAsset.ticker]||holdAsset.basePrice):0;
              const invested = autoInvest?.totalInvested||0;
              const availCash= Math.floor(cash);
              const monthly  = Math.round(curSave*2.17);          // ≈ monthly saving, for the Time Machine
              const need     = promoNeed(career.jobIndex);        // paychecks to invest for next promotion
              const promoLeft= nextJob?Math.max(0,need-(career.investsAtJob||0)):0;
              const billRows = Object.entries(curJob.bills);
              const ev       = career.lastEvent;                  // surprise expense this payday (if any)
              const saveAmt  = career.awaitingInvest ? (career.awaitingAmt ?? curSave) : curSave;   // actual savings to invest
              return(
              <div>
                <div style={{background:"linear-gradient(135deg,rgba(59,130,246,.16),rgba(16,185,129,.08))",border:"1px solid rgba(59,130,246,.3)",borderRadius:"var(--rl)",padding:18,textAlign:"center",marginBottom:16}}>
                  <div style={{fontSize:40,marginBottom:6}}>🏦</div>
                  <div style={{fontFamily:"var(--fd)",fontSize:20,color:"#fff",marginBottom:6}}>Money Machine</div>
                  <div style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,.72)",lineHeight:1.6}}>Live the grown-up money loop: <strong style={{color:"#fbbf24"}}>Earn</strong> 💼 → <strong style={{color:"#fca5a5"}}>pay the bills</strong> 🏠 → <strong style={{color:"#60a5fa"}}>invest what's left</strong> 📈 → <strong style={{color:"#86efac"}}>get promoted!</strong> 🚀</div>
                </div>

                {/* Career ladder — climb from lowest to highest by investing */}
                <div style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",borderRadius:14,padding:"12px 12px 10px",marginBottom:16}}>
                  <div style={{fontSize:11,fontWeight:800,color:"rgba(255,255,255,.5)",marginBottom:8,textAlign:"center"}}>🪜 YOUR CAREER LADDER</div>
                  <div style={{display:"flex",gap:4,alignItems:"flex-end"}}>
                    {JOBS.map((j,i)=>{ const done=i<career.jobIndex, cur=i===career.jobIndex;
                      return(<div key={j.id} style={{flex:1,textAlign:"center"}}>
                        <div style={{fontSize:cur?24:16,opacity:done?.9:cur?1:.3,lineHeight:1}}>{i>career.jobIndex?"🔒":j.icon}</div>
                        <div style={{height:4,borderRadius:4,marginTop:5,background:cur?"#fbbf24":done?"#86efac":"rgba(255,255,255,.12)"}}/>
                      </div>);
                    })}
                  </div>
                  <div style={{textAlign:"center",marginTop:8,fontFamily:"var(--fd)",fontSize:14,color:"#fff"}}>{curJob.icon} {curJob.name} <span style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.45)"}}>· {fs$(curJob.pay)}/payday</span></div>
                  <div style={{textAlign:"center",fontSize:10.5,fontWeight:700,color:"rgba(255,255,255,.4)"}}>🎓 {curJob.school}</div>
                </div>

                {/* ── STEP 1 · PAYDAY & BUDGET ── */}
                <div style={{fontSize:13,fontWeight:800,color:"#fbbf24",marginBottom:9}}>💼 Step 1 · Payday &amp; bills</div>
                {career.awaitingInvest?null:payReady?(
                  <div style={{background:"linear-gradient(135deg,rgba(245,158,11,.14),rgba(245,158,11,.05))",border:"1px solid rgba(245,158,11,.3)",borderRadius:16,padding:15,marginBottom:18}}>
                    <div style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.6)",textAlign:"center",marginBottom:11,lineHeight:1.5}}>Time to get paid! Your {curJob.name} paycheck is <strong style={{color:"#fff"}}>{fs$(curJob.pay)}</strong>, but tax takes <strong style={{color:"#fca5a5"}}>{fs$(curTax)}</strong> and bills take <strong style={{color:"#fca5a5"}}>{fs$(curBills)}</strong> — you'll keep <strong style={{color:"#86efac"}}>{fs$(curSave)}</strong> to invest.</div>
                    <button onClick={collectPaycheck} style={{width:"100%",padding:14,borderRadius:13,border:"none",background:"linear-gradient(135deg,#f59e0b,#d97706)",color:"#fff",fontFamily:"var(--fd)",fontSize:16,cursor:"pointer",boxShadow:"0 6px 18px rgba(245,158,11,.4)"}}>💰 Collect payday #{(career.period||0)+1}</button>
                  </div>
                ):(
                  <div style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.12)",borderRadius:16,padding:15,marginBottom:18,textAlign:"center"}}>
                    <div style={{fontSize:30,marginBottom:4}}>📅</div>
                    <div style={{fontFamily:"var(--fd)",fontSize:16,color:"#fff"}}>Next payday in {payInDays} day{payInDays===1?"":"s"}</div>
                    <div style={{fontSize:11.5,fontWeight:700,color:"rgba(255,255,255,.5)",marginTop:4,lineHeight:1.5}}>You get paid every 2 weeks, just like real life. Come back then to collect your {fs$(curJob.pay)} {curJob.name} paycheck! Meanwhile, your investments keep growing 🌱</div>
                  </div>
                )}
                {career.awaitingInvest&&(
                  <div style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.12)",borderRadius:16,padding:15,marginBottom:18}}>
                    <div style={{fontSize:11,fontWeight:800,color:"rgba(255,255,255,.5)",marginBottom:8}}>🧾 YOUR BUDGET THIS PAYDAY</div>
                    <div style={{display:"flex",justifyContent:"space-between",fontFamily:"var(--fd)",fontSize:15,color:"#86efac",marginBottom:6}}><span>{curJob.icon} Paycheck</span><span>+{fs$(curJob.pay)}</span></div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:12.5,fontWeight:700,color:"rgba(255,255,255,.6)",marginBottom:4}}><span>🏛️ Tax</span><span style={{color:"#fca5a5"}}>−{fs$(curTax)}</span></div>
                    {billRows.map(([k,v])=>(
                      <div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:12.5,fontWeight:700,color:"rgba(255,255,255,.6)",marginBottom:4}}><span>{BILL_ICON[k]||"•"} {k==="Other"?"Getting around & fun":k==="Home"?"Home (rent)":k}</span><span style={{color:"#fca5a5"}}>−{fs$(v)}</span></div>
                    ))}
                    {ev&&ev.covered>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:12.5,fontWeight:800,color:"#86efac",marginBottom:4,background:"rgba(16,185,129,.12)",borderRadius:8,padding:"5px 8px"}}><span>🛟 {ev.text} <span style={{fontSize:9,opacity:.8}}>fund paid {fs$(ev.covered)}!</span></span><span>{ev.remainder>0?`−${fs$(ev.remainder)}`:"$0"}</span></div>}
                    {ev&&!ev.covered&&<div style={{display:"flex",justifyContent:"space-between",fontSize:12.5,fontWeight:800,color:"#fca5a5",marginBottom:4,background:"rgba(239,68,68,.12)",borderRadius:8,padding:"5px 8px"}}><span>{ev.emoji} {ev.text} <span style={{fontSize:9,opacity:.8}}>SURPRISE!</span></span><span>−{fs$(ev.cost)}</span></div>}
                    <div style={{height:1,background:"rgba(255,255,255,.12)",margin:"9px 0"}}/>
                    <div style={{display:"flex",justifyContent:"space-between",fontFamily:"var(--fd)",fontSize:16,color:"#fff"}}><span>🐷 Left to invest</span><span style={{color:"#86efac"}}>{fs$(saveAmt)}</span></div>
                    <div style={{fontSize:10.5,fontWeight:700,color:"rgba(255,255,255,.45)",textAlign:"center",marginTop:9,lineHeight:1.5}}>{ev?"A surprise ate into your savings — that's why an emergency fund matters! Invest what's left 👇":"Bills always come first (needs!). Now invest your savings below 👇"}</div>
                  </div>
                )}

                {/* ── STEP 2 · INVEST YOUR SAVINGS ── */}
                <div style={{fontSize:13,fontWeight:800,color:"#60a5fa",marginBottom:9}}>📈 Step 2 · Invest your savings</div>
                {!hasEtf&&(<>
                  <div style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.55)",marginBottom:9}}>First, pick a basket of companies (an ETF) 🧺 — your savings grow inside it.</div>
                  <div style={{display:"flex",gap:9,marginBottom:14}}>
                    {ETFS.map(e=>(
                      <button key={e.ticker} onClick={()=>setInvPickEtf(e.ticker)} style={{flex:1,padding:"13px 10px",borderRadius:13,border:`2px solid ${invPickEtf===e.ticker?"rgba(59,130,246,.6)":"rgba(255,255,255,.14)"}`,background:invPickEtf===e.ticker?"rgba(59,130,246,.16)":"rgba(255,255,255,.05)",color:"#fff",cursor:"pointer",textAlign:"left"}}>
                        <div style={{fontSize:22}}>{e.icon}</div>
                        <div style={{fontFamily:"var(--fd)",fontSize:14,marginTop:3}}>{e.name}</div>
                        <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.5)"}}>{e.ticker} · {fs$(prices[e.ticker]||e.basePrice)}</div>
                      </button>
                    ))}
                  </div>
                </>)}
                {hasEtf&&(
                  <div style={{background:"rgba(59,130,246,.1)",border:"1px solid rgba(59,130,246,.3)",borderRadius:16,padding:14,marginBottom:14}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:11}}>
                      <span style={{fontSize:26}}>{holdAsset?.icon}</span>
                      <div style={{flex:1}}><div style={{fontFamily:"var(--fd)",fontSize:15,color:"#fff"}}>{holdAsset?.name}</div><div style={{fontSize:10.5,fontWeight:700,color:"#86efac"}}>🔒 Long-term — held to grow, not traded away</div></div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                      {[["🏦 Invested",fs$(invested)],["📈 Now worth",fs$(holdVal)],["📅 Paydays",`${autoInvest?.paydays||0}`]].map(([l,v])=>(
                        <div key={l} style={{background:"rgba(255,255,255,.05)",borderRadius:10,padding:"9px 8px",textAlign:"center"}}><div style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,.4)"}}>{l}</div><div style={{fontFamily:"var(--fd)",fontSize:14,color:"#fff"}}>{v}</div></div>
                      ))}
                    </div>
                  </div>
                )}
                {career.awaitingInvest?(
                  <div style={{marginBottom:18}}>
                    <button onClick={()=>investSavings(saveAmt)} disabled={availCash<1} style={{width:"100%",padding:15,borderRadius:15,border:"none",background:availCash<1?"rgba(255,255,255,.1)":"linear-gradient(135deg,#3b82f6,#2563eb)",color:"#fff",fontFamily:"var(--fd)",fontSize:16,cursor:availCash<1?"not-allowed":"pointer",boxShadow:availCash<1?"none":"0 6px 20px rgba(59,130,246,.4)"}}>📈 Invest my {fs$(Math.min(saveAmt,availCash))} savings</button>
                    {saveAmt>1&&<button onClick={()=>investSavings(Math.round(saveAmt/2))} disabled={availCash<1} style={{width:"100%",marginTop:9,padding:11,borderRadius:12,border:"1.5px solid rgba(255,255,255,.18)",background:"transparent",color:"rgba(255,255,255,.7)",fontFamily:"var(--fb)",fontSize:12,fontWeight:800,cursor:availCash<1?"not-allowed":"pointer"}}>Invest half, keep {fs$(saveAmt-Math.round(saveAmt/2))} for fun 🍦</button>}
                    <div style={{fontSize:10.5,fontWeight:700,color:"rgba(255,255,255,.4)",textAlign:"center",marginTop:9,lineHeight:1.5}}>Investing any amount handles this paycheck and counts toward your next promotion.</div>
                  </div>
                ):(
                  <div style={{textAlign:"center",padding:"12px",borderRadius:12,background:"rgba(255,255,255,.04)",fontSize:12,fontWeight:800,color:"rgba(255,255,255,.5)",marginBottom:18}}>✅ This paycheck is handled. Collect your next payday above to invest more!</div>
                )}

                {/* ── EMERGENCY FUND — a safety net for surprises ── */}
                <div style={{fontSize:13,fontWeight:800,color:"#fcd34d",marginBottom:9}}>🛟 Emergency fund</div>
                {(()=>{
                  const emNow=career.emergency||0; const full=emNow>=emGoal; const emPct=Math.min(100,Math.round(emNow/emGoal*100));
                  return(
                <div style={{background:"rgba(252,211,77,.08)",border:"1px solid rgba(252,211,77,.28)",borderRadius:16,padding:15,marginBottom:16}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                    <div style={{fontSize:11.5,fontWeight:700,color:"rgba(255,255,255,.6)",lineHeight:1.5,flex:1,paddingRight:10}}>Set a little aside for surprises. It doesn't grow like investing — but it covers curveballs so they don't hurt your savings.</div>
                    <div style={{textAlign:"right",flexShrink:0}}><div style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,.4)"}}>SAVED UP</div><div style={{fontFamily:"var(--fd)",fontSize:20,color:"#fcd34d"}}>{fs$(emNow)}</div><div style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,.35)"}}>goal {fs$(emGoal)}</div></div>
                  </div>
                  {/* progress toward ~3 months of bills */}
                  <div style={{height:7,background:"rgba(255,255,255,.1)",borderRadius:100,overflow:"hidden",marginBottom:11}}><div style={{height:"100%",width:`${emPct}%`,background:full?"#86efac":"#fcd34d",borderRadius:100,transition:"width .4s ease"}}/></div>
                  {full?(
                    <div style={{textAlign:"center",padding:"9px",borderRadius:11,background:"rgba(16,185,129,.12)",border:"1px solid rgba(16,185,129,.3)",fontSize:12,fontWeight:800,color:"#86efac"}}>✅ Fully funded! You're covered for ~3 months 🎉</div>
                  ):(
                    <div style={{display:"flex",gap:8}}>
                      {[10,25].map(a=>{const dis=availCash<a; return(
                        <button key={a} onClick={()=>addEmergency(a)} disabled={dis} style={{flex:1,padding:"10px",borderRadius:11,border:`1.5px solid ${dis?"rgba(255,255,255,.1)":"rgba(252,211,77,.4)"}`,background:dis?"transparent":"rgba(252,211,77,.12)",color:dis?"rgba(255,255,255,.3)":"#fcd34d",fontFamily:"var(--fd)",fontSize:14,cursor:dis?"not-allowed":"pointer"}}>+ ${a}</button>
                      );})}
                    </div>
                  )}
                  <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.35)",textAlign:"center",marginTop:8}}>{full?"Nice — now put spare cash into investing to grow it! 🌱":"Grown-ups aim for ~3 months of bills saved. Every bit helps! 💛"}</div>
                </div>
                  );
                })()}

                {/* ── PROMOTION TRACKER ── */}
                {nextJob?(
                  <div style={{background:"linear-gradient(135deg,rgba(16,185,129,.12),rgba(59,130,246,.06))",border:"1px solid rgba(16,185,129,.3)",borderRadius:16,padding:15,marginBottom:16}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                      <div style={{fontFamily:"var(--fd)",fontSize:14,color:"#fff"}}>🎯 Next promotion</div>
                      <div style={{fontSize:12,fontWeight:800,color:"#86efac"}}>{nextJob.icon} {nextJob.name}</div>
                    </div>
                    <div style={{display:"flex",gap:6,marginBottom:8}}>
                      {Array.from({length:need}).map((_,i)=>(
                        <div key={i} style={{flex:1,height:9,borderRadius:6,background:i<(career.investsAtJob||0)?"#86efac":"rgba(255,255,255,.12)"}}/>
                      ))}
                    </div>
                    <div style={{fontSize:11.5,fontWeight:700,color:"rgba(255,255,255,.6)",lineHeight:1.5}}>{promoLeft===0?"Invest this payday to get promoted! 🎉":`Invest from ${promoLeft} more payday${promoLeft===1?"":"s"} → promoted to ${nextJob.name} (${fs$(nextJob.pay)}/payday, +${fs$(jobSave(nextJob)-curSave)} more to invest)!`}</div>
                  </div>
                ):(
                  <div style={{background:"linear-gradient(135deg,rgba(245,158,11,.14),rgba(124,58,237,.08))",border:"1px solid rgba(245,158,11,.3)",borderRadius:16,padding:15,marginBottom:16,textAlign:"center"}}>
                    <div style={{fontFamily:"var(--fd)",fontSize:15,color:"#fde68a"}}>🏆 Top of the ladder!</div>
                    <div style={{fontSize:11.5,fontWeight:700,color:"rgba(255,255,255,.6)",marginTop:4,lineHeight:1.5}}>You climbed all the way from Fast-Food Crew to Business Owner by investing every payday. Keep it up and watch your money grow! 🌳</div>
                  </div>
                )}

                {/* Time Machine */}
                <div style={{fontSize:13,fontWeight:800,color:"#86efac",marginBottom:9,marginTop:4}}>🌳 Step 3 · Watch it grow</div>
                <div style={{background:"linear-gradient(135deg,rgba(124,58,237,.14),rgba(245,158,11,.06))",border:"1px solid rgba(124,58,237,.3)",borderRadius:16,padding:16,marginTop:4}}>
                  <div style={{fontFamily:"var(--fd)",fontSize:16,color:"#fff",marginBottom:4}}>⏩ Time Machine</div>
                  <div style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.6)",lineHeight:1.5,marginBottom:12}}>If you keep investing <strong style={{color:"#fff"}}>{fs$(monthly)} a month</strong> and let it grow (~7% a year, like the real stock market)…</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
                    {[1,5,10,20].map(yr=>{const v=projectFuture(yr,totalValue,monthly);return(
                      <div key={yr} style={{background:"rgba(255,255,255,.05)",borderRadius:12,padding:"11px 12px"}}>
                        <div style={{fontSize:10,fontWeight:800,color:"rgba(255,255,255,.45)"}}>In {yr} year{yr>1?"s":""}</div>
                        <div style={{fontFamily:"var(--fd)",fontSize:18,color:"#c4b5fd"}}>{fs$(v)}</div>
                      </div>
                    );})}
                  </div>
                  <div style={{fontSize:11,fontWeight:700,color:"#fde68a",textAlign:"center",marginTop:12,lineHeight:1.5}}>🌱 That's the magic of compound growth — patience makes small amounts HUGE!</div>
                </div>
              </div>
              );
            })()}

            {/* Ask Toby — kid-safe AI money coach (Toybox Plus) */}
            {moreView==="Coach"&&(
              <div>
                <div style={{background:"linear-gradient(135deg,rgba(245,158,11,.16),rgba(124,58,237,.08))",border:"1px solid rgba(245,158,11,.3)",borderRadius:"var(--rl)",padding:18,textAlign:"center",marginBottom:16}}>
                  <div style={{fontSize:40,marginBottom:6}}>🦊</div>
                  <div style={{fontFamily:"var(--fd)",fontSize:20,color:"#fff",marginBottom:6}}>Ask Toby!</div>
                  <div style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,.72)",lineHeight:1.6}}>Your very own money coach. Ask me anything about saving, coins, or your investments — I'll help in easy words! 💛</div>
                </div>
                {!isPremium?(
                  <div style={{background:"linear-gradient(135deg,rgba(124,58,237,.16),rgba(245,158,11,.08))",border:"1px solid rgba(124,58,237,.35)",borderRadius:16,padding:20,textAlign:"center"}}>
                    <div style={{fontSize:34,marginBottom:8}}>⭐</div>
                    <div style={{fontFamily:"var(--fd)",fontSize:16,color:"#fff",marginBottom:8}}>Toby is a Toybox Plus buddy</div>
                    <div style={{fontSize:12.5,fontWeight:700,color:"rgba(255,255,255,.65)",lineHeight:1.6,marginBottom:16}}>Unlock Toybox Plus and Toby will coach you every day — answering your money questions and cheering you on! 🦊</div>
                    <button onClick={()=>{setShowPlus(true);setAskedPlus(false);}} style={{padding:"12px 24px",borderRadius:13,border:"none",background:"linear-gradient(135deg,#7c3aed,#a855f7)",color:"#fff",fontFamily:"var(--fd)",fontSize:15,cursor:"pointer"}}>Meet Toby with Plus ⭐</button>
                  </div>
                ):(<>
                  <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:14}}>
                    {coachMsgs.length===0&&(
                      <div style={{background:"rgba(255,255,255,.05)",borderRadius:14,padding:14,fontSize:13,fontWeight:700,color:"rgba(255,255,255,.75)",lineHeight:1.6}}>
                        🦊 Hi {user?.name}! I'm Toby, your money coach. Tap a question below or type your own!
                      </div>
                    )}
                    {coachMsgs.map((m,i)=>(
                      <div key={i} style={{alignSelf:m.role==="user"?"flex-end":"flex-start",maxWidth:"85%",background:m.role==="user"?"linear-gradient(135deg,#10b981,#059669)":"rgba(255,255,255,.08)",border:m.role==="user"?"none":"1px solid rgba(245,158,11,.25)",borderRadius:16,padding:"11px 14px",fontSize:13.5,fontWeight:600,color:"#fff",lineHeight:1.55}}>
                        {m.role==="assistant"&&<span style={{marginRight:5}}>🦊</span>}{m.content}
                      </div>
                    ))}
                    {coachBusy&&<div style={{alignSelf:"flex-start",fontSize:12,fontWeight:700,color:"rgba(255,255,255,.5)",padding:"4px 8px"}}>🦊 Toby is thinking…</div>}
                  </div>
                  {coachMsgs.length===0&&(
                    <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:14}}>
                      {["What should I save for?","Why do stocks go up and down?","Teach me something new!","How do I make my coins grow?"].map(q=>(
                        <button key={q} onClick={()=>sendCoach(q)} style={{padding:"9px 13px",borderRadius:100,border:"1px solid rgba(245,158,11,.3)",background:"rgba(245,158,11,.1)",color:"#fde68a",fontSize:12,fontWeight:800,cursor:"pointer"}}>{q}</button>
                      ))}
                    </div>
                  )}
                  <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
                    <textarea value={coachInput} onChange={e=>setCoachInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendCoach();}}} maxLength={300} placeholder="Ask Toby a money question…" rows={1} style={{flex:1,padding:"12px 13px",borderRadius:14,border:"1.5px solid rgba(255,255,255,.18)",background:"rgba(255,255,255,.06)",color:"#fff",fontFamily:"var(--fb)",fontSize:14,fontWeight:600,resize:"none",outline:"none",boxSizing:"border-box",lineHeight:1.4}}/>
                    <button onClick={()=>sendCoach()} disabled={!coachInput.trim()||coachBusy} style={{flexShrink:0,width:48,height:48,borderRadius:14,border:"none",background:(!coachInput.trim()||coachBusy)?"rgba(255,255,255,.1)":"linear-gradient(135deg,#f59e0b,#f97316)",color:"#fff",fontSize:20,cursor:(!coachInput.trim()||coachBusy)?"default":"pointer"}}>➤</button>
                  </div>
                  <div style={{fontSize:10.5,fontWeight:600,color:"rgba(255,255,255,.35)",textAlign:"center",marginTop:10,lineHeight:1.5}}>🦊 Toby answers up to 10 questions a day &amp; only talks about money &amp; your game. Never share your real name, address or passwords.</div>
                </>)}
              </div>
            )}

            {/* Get Help — report a bug/problem, kid-friendly, emails support */}
            {moreView==="Help"&&(
              <div>
                <div style={{background:"linear-gradient(135deg,rgba(16,185,129,.15),rgba(6,182,212,.08))",border:"1px solid rgba(16,185,129,.3)",borderRadius:"var(--rl)",padding:18,textAlign:"center",marginBottom:16}}>
                  <div style={{fontSize:38,marginBottom:6}}>🐞</div>
                  <div style={{fontFamily:"var(--fd)",fontSize:18,color:"#fff",marginBottom:6}}>Something not working?</div>
                  <div style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,.7)",lineHeight:1.6}}>Tell us what's wrong and our team will fix it. Your message goes straight to the grown-ups at Toybox! 💚</div>
                </div>

                {bugState==="done"?(
                  <div style={{background:"rgba(16,185,129,.12)",border:"1px solid rgba(16,185,129,.35)",borderRadius:16,padding:22,textAlign:"center"}}>
                    <div style={{fontSize:44,marginBottom:8}}>🎉</div>
                    <div style={{fontFamily:"var(--fd)",fontSize:18,color:"#86efac",marginBottom:6}}>Thank you!</div>
                    <div style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,.75)",lineHeight:1.6,marginBottom:16}}>We got your message and we'll try to fix it fast.{bugConfirmed?" We sent a copy to your email too 📧.":""} You're helping make Toybox better for everyone! 🌟</div>
                    <button onClick={()=>{setBugState("idle");setBugCat("");setBugMsg("");setBugEmail("");}} style={{padding:"11px 22px",borderRadius:13,border:"none",background:"rgba(255,255,255,.14)",color:"#fff",fontFamily:"var(--fd)",fontSize:14,cursor:"pointer"}}>Send another</button>
                  </div>
                ):(
                  <>
                    <div style={{fontSize:13,fontWeight:800,color:"#fff",marginBottom:9}}>1. What's happening? 👇</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:16}}>
                      {BUG_CATS.map(c=>(
                        <button key={c.id} onClick={()=>{setBugCat(c.id);setBugState("idle");}} style={{padding:"13px 10px",borderRadius:13,border:`2px solid ${bugCat===c.id?"rgba(16,185,129,.6)":"rgba(255,255,255,.14)"}`,background:bugCat===c.id?"rgba(16,185,129,.16)":"rgba(255,255,255,.05)",color:bugCat===c.id?"#fff":"rgba(255,255,255,.7)",fontFamily:"var(--fb)",fontSize:12,fontWeight:800,cursor:"pointer",textAlign:"left",lineHeight:1.35,display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontSize:20,flexShrink:0}}>{c.icon}</span>{c.label}
                        </button>
                      ))}
                    </div>
                    <div style={{fontSize:13,fontWeight:800,color:"#fff",marginBottom:8}}>2. Tell us more <span style={{fontWeight:700,color:"rgba(255,255,255,.4)"}}>(you can skip this)</span></div>
                    <textarea value={bugMsg} onChange={e=>setBugMsg(e.target.value)} maxLength={500} placeholder="Like: 'The price of Apple looks stuck' or 'I can't buy Roblox'..." style={{width:"100%",minHeight:90,padding:"12px 13px",borderRadius:13,border:"1.5px solid rgba(255,255,255,.18)",background:"rgba(255,255,255,.06)",color:"#fff",fontFamily:"var(--fb)",fontSize:13,fontWeight:600,lineHeight:1.5,resize:"none",outline:"none",boxSizing:"border-box"}}/>

                    <div style={{fontSize:13,fontWeight:800,color:"#fff",margin:"16px 0 8px"}}>3. A grown-up's email <span style={{fontWeight:700,color:"rgba(255,255,255,.4)"}}>(optional — so we can reply)</span></div>
                    <input value={bugEmail} onChange={e=>setBugEmail(e.target.value)} type="email" inputMode="email" autoComplete="email" placeholder="grown-up@email.com" style={{width:"100%",padding:"12px 13px",borderRadius:13,border:"1.5px solid rgba(255,255,255,.18)",background:"rgba(255,255,255,.06)",color:"#fff",fontFamily:"var(--fb)",fontSize:14,fontWeight:600,outline:"none",boxSizing:"border-box"}}/>
                    <div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,.35)",marginTop:6,lineHeight:1.5}}>💚 Add an email and we'll send a note back when it's fixed. Ask a grown-up first!</div>

                    <button disabled={!bugCat||bugState==="sending"} onClick={sendBug} style={{width:"100%",marginTop:14,padding:15,borderRadius:15,border:"none",background:(!bugCat||bugState==="sending")?"rgba(255,255,255,.1)":"linear-gradient(135deg,#10b981,#059669)",color:(!bugCat||bugState==="sending")?"rgba(255,255,255,.4)":"#fff",fontFamily:"var(--fd)",fontSize:16,cursor:(!bugCat||bugState==="sending")?"default":"pointer",boxShadow:(!bugCat||bugState==="sending")?"none":"0 6px 20px rgba(16,185,129,.4)"}}>
                      {bugState==="sending"?"Sending... 📨":!bugCat?"Pick what's wrong first ☝️":"📨 Send to the Toybox team"}
                    </button>

                    {bugState==="error"&&(
                      <div style={{marginTop:12,background:"rgba(245,158,11,.12)",border:"1px solid rgba(245,158,11,.3)",borderRadius:12,padding:13,fontSize:12,fontWeight:700,color:"#fde68a",lineHeight:1.6,textAlign:"center"}}>
                        Hmm, that didn't send. A grown-up can email us instead:<br/>
                        <a href={`mailto:toyboxtrader.support@gmail.com?subject=${encodeURIComponent("Toybox report: "+(BUG_CATS.find(c=>c.id===bugCat)?.label||"problem"))}&body=${encodeURIComponent(bugMsg)}`} style={{color:"#fff",fontWeight:800}}>toyboxtrader.support@gmail.com</a>
                        {bugErr&&<div style={{marginTop:8,fontSize:10,fontWeight:600,color:"rgba(255,255,255,.4)"}}>(reason: {bugErr})</div>}
                      </div>
                    )}
                    <div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,.35)",textAlign:"center",marginTop:12,lineHeight:1.5}}>Grown-ups can also email <strong style={{color:"rgba(255,255,255,.5)"}}>toyboxtrader.support@gmail.com</strong> anytime.</div>
                  </>
                )}
              </div>
            )}

          </div>
        )}

      </div>{/* end main */}

      {/* Junior Investor Certificate (Plus) */}
      {showCert&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:18,overflowY:"auto"}} onClick={()=>setShowCert(false)}>
          <div onClick={e=>e.stopPropagation()} style={{maxWidth:400,width:"100%"}}>
            <div id="tbx-cert" style={{background:"linear-gradient(135deg,#fdf6e3,#fff)",borderRadius:18,padding:"28px 22px",textAlign:"center",border:"8px double #b8860b",color:"#3a2e0a"}}>
              <div style={{fontSize:44,marginBottom:6}}>🎓</div>
              <div style={{fontFamily:"var(--fd)",fontSize:22,color:"#8a6d0b",letterSpacing:".5px"}}>Certificate of Achievement</div>
              <div style={{fontSize:12,fontWeight:800,color:"#b8860b",textTransform:"uppercase",letterSpacing:"1px",margin:"6px 0 16px"}}>Junior Investor</div>
              <div style={{fontSize:13,fontWeight:700,color:"#6b5a1e"}}>This certifies that</div>
              <div style={{fontFamily:"var(--fd)",fontSize:28,color:"#3a2e0a",margin:"6px 0"}}>{user?.name}</div>
              <div style={{fontSize:13,fontWeight:700,color:"#6b5a1e",lineHeight:1.6,margin:"10px 16px"}}>has completed <strong>{doneLesson.length} of {LESSONS.length}</strong> money lessons, learned to save, invest and grow a Money Garden, and is officially a smart young investor! 🌱📈</div>
              <div style={{display:"flex",justifyContent:"space-around",marginTop:18,fontSize:11,fontWeight:800,color:"#8a6d0b"}}>
                <div>⭐ Level {lv}</div><div>🪙 {coins} coins</div><div>🔥 {streak}d streak</div>
              </div>
              <div style={{marginTop:16,paddingTop:12,borderTop:"1px solid #d9c88a",fontSize:11,fontWeight:700,color:"#8a6d0b"}}>🧸 Toybox Trader · Junior Investor Program</div>
            </div>
            <div style={{display:"flex",gap:8,marginTop:12}}>
              <button onClick={()=>window.print()} style={{flex:1,padding:13,borderRadius:13,border:"none",background:"linear-gradient(135deg,#f59e0b,#f97316)",color:"#fff",fontFamily:"var(--fd)",fontSize:15,cursor:"pointer"}}>🖨️ Print / Save</button>
              <button onClick={()=>setShowCert(false)} style={{flex:1,padding:13,borderRadius:13,border:"1px solid rgba(255,255,255,.2)",background:"rgba(255,255,255,.1)",color:"#fff",fontFamily:"var(--fd)",fontSize:15,cursor:"pointer"}}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Task/reward celebration */}
      {taskCelebrate&&(
        <div className="reward-ov" onClick={()=>setTaskCelebrate(null)}>
          <div style={{fontSize:72,animation:"popUp .4s ease"}}>{taskCelebrate.emoji}</div>
          <div style={{fontFamily:"var(--fd)",fontSize:24,color:"#fff",textAlign:"center"}}>{taskCelebrate.coins!=null?"Nice work!":"Woohoo!"}</div>
          <div style={{fontSize:14,fontWeight:700,color:"rgba(255,255,255,.75)",textAlign:"center",lineHeight:1.5,maxWidth:300}}>{taskCelebrate.title}</div>
          {taskCelebrate.coins!=null&&<div style={{fontFamily:"var(--fd)",fontSize:22,color:"#fde68a"}}>+{taskCelebrate.coins} 🪙</div>}
          {taskCelebrate.label&&<div style={{fontSize:13,fontWeight:800,color:"#86efac",textAlign:"center"}}>{taskCelebrate.label}</div>}
          <button onClick={()=>setTaskCelebrate(null)} style={{marginTop:8,padding:"12px 28px",borderRadius:14,border:"none",background:"linear-gradient(135deg,#7c3aed,#9333ea)",color:"#fff",fontFamily:"var(--fd)",fontSize:16,cursor:"pointer"}}>Yay! 🎉</button>
        </div>
      )}

      {/* Bottom nav */}
      <nav className="bnav">
        {[["🏠","Home"],["⚡","Trade"],["📚","Learn"],["💼","Assets"],["•••","More"]].map(([ic,lb])=>(
          <button key={lb} className={`bnav-btn ${(lb==="More"?nav==="More":nav===lb)?"on":""}`} onClick={()=>{if(lb==="More"){setMoreOpen(true);}else{setNav(lb);}}}>
            <span className="bni">{ic}</span>{lb}
          </button>
        ))}
      </nav>

      {/* Floating helper widget — one button that expands to Toby, sync, reminders
          and report-a-problem. Replaces the separate ☁️/🔔/🐞 buttons (those are
          hidden on kid screens via body[data-kid]). Hidden during the first-run tour. */}
      {tourDone&&(<>
        {fabOpen&&<div onClick={()=>setFabOpen(false)} style={{position:"fixed",inset:0,zIndex:2147482999}}/>}
        <div style={{position:"fixed",bottom:"calc(76px + env(safe-area-inset-bottom,0px))",right:14,zIndex:2147483000,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:10}}>
          {fabOpen&&[
            {ic:"🦊",label:"Ask Toby",plus:!isPremium,bg:"linear-gradient(135deg,#f59e0b,#f97316)",on:()=>{setMoreView("Coach");setNav("More");}},
            {ic:"🐞",label:"Report a problem",bg:"rgba(24,18,48,.95)",on:()=>{setBugState("idle");setMoreView("Help");setNav("More");}},
            {ic:"🔔",label:"Reminders",bg:"rgba(24,18,48,.95)",on:()=>{document.getElementById("tbx-push-btn")?.click();}},
            {ic:"☁️",label:"Family sync",bg:"rgba(24,18,48,.95)",on:()=>{document.getElementById("tbx-sync-btn")?.click();}},
          ].map((it,idx)=>(
            <button key={it.label} onClick={()=>{it.on();setFabOpen(false);}} style={{display:"flex",alignItems:"center",gap:9,border:"none",background:"transparent",cursor:"pointer",padding:0,animation:`fabIn .2s ease ${idx*0.035}s both`}}>
              <span style={{fontSize:12,fontWeight:800,color:"#fff",background:"rgba(24,18,48,.88)",padding:"6px 11px",borderRadius:100,boxShadow:"0 2px 10px rgba(0,0,0,.45)",whiteSpace:"nowrap",backdropFilter:"blur(6px)",display:"inline-flex",alignItems:"center"}}>{it.label}{it.plus&&<span style={{marginLeft:6,fontSize:8.5,fontWeight:800,background:"rgba(124,58,237,.55)",color:"#e9d5ff",padding:"1px 6px",borderRadius:100}}>PLUS</span>}</span>
              <span style={{width:46,height:46,borderRadius:"50%",background:it.bg,color:"#fff",fontSize:21,lineHeight:"46px",textAlign:"center",boxShadow:"0 4px 14px rgba(0,0,0,.45)",flexShrink:0}}>{it.ic}</span>
            </button>
          ))}
          <button onClick={()=>setFabOpen(o=>!o)} aria-label="Helpers" title="Helpers" style={{width:54,height:54,borderRadius:"50%",border:"none",cursor:"pointer",background:fabOpen?"rgba(24,18,48,.96)":"linear-gradient(135deg,#7c3aed,#a855f7)",color:"#fff",fontSize:fabOpen?20:24,lineHeight:"54px",textAlign:"center",boxShadow:"0 6px 20px rgba(124,58,237,.5)",transition:"transform .2s",transform:fabOpen?"rotate(90deg)":"none",padding:0}}>{fabOpen?"✕":"✨"}</button>
        </div>
      </>)}

      {/* More drawer */}
      {moreOpen&&(
        <div className="drawer-ov" onClick={()=>setMoreOpen(false)}>
          <div className="drawer" onClick={e=>e.stopPropagation()}>
            <div style={{width:36,height:4,borderRadius:100,background:"rgba(255,255,255,.15)",margin:"0 auto 16px"}}/>
            <div style={{fontFamily:"var(--fd)",fontSize:16,color:"#fff",marginBottom:4}}>More Features</div>
            {MORE_GROUPS.map(g=>(
              <div key={g.title} style={{marginTop:14}}>
                <div style={{fontSize:11,fontWeight:800,color:"rgba(255,255,255,.45)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>{g.title}</div>
                <div className="drawer-grid">
                  {g.items.map(m=>(
                    <button key={m.id} className={`drawer-btn ${moreView===m.id&&nav==="More"?"on":""}`} onClick={()=>{setMoreView(m.id);setNav("More");setMoreOpen(false);}}>
                      <span className="di">{m.icon}</span>{m.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tour overlay */}
      {!tourDone&&tourStep<=4&&tourS&&(
        <div className="tour-ov">
          <div className="tour-bg"/>
          {tourStep===4&&<div style={{position:"absolute",bottom:64,left:0,right:0,textAlign:"center",zIndex:1}}><div style={{display:"inline-block",background:"rgba(255,255,255,.15)",border:"2px solid #fff",borderRadius:14,padding:"6px 20px",fontSize:11,fontWeight:800,color:"#fff"}}>👆 Your toolbar is right here</div></div>}
          <div className="tour-card">
            <div style={{display:"flex",gap:6,justifyContent:"center",marginBottom:16}}>{[1,2,3,4].map(i=><div key={i} style={{height:6,borderRadius:100,background:i<=tourStep?"#fff":"rgba(255,255,255,.2)",width:i===tourStep?22:6,transition:"all .3s"}}/>)}</div>
            <div style={{fontSize:48,textAlign:"center",marginBottom:12,animation:"popUp .4s ease"}}>{tourS.icon}</div>
            <div style={{fontFamily:"var(--fd)",fontSize:20,color:"#fff",textAlign:"center",marginBottom:10,lineHeight:1.25}}>{tourS.title}</div>
            <div style={{fontSize:13,color:"rgba(255,255,255,.7)",fontWeight:600,lineHeight:1.75,textAlign:"center",marginBottom:20}}>{tourS.body}</div>
            <button onClick={()=>{if(tourS.goTo)setNav(tourS.goTo);if(tourStep<4)setTourStep(s=>s+1);else setTourDone(true);}} style={{width:"100%",padding:16,borderRadius:15,border:"none",background:`linear-gradient(135deg,${theme.accent},${theme.accent}99)`,color:"#fff",fontFamily:"var(--fd)",fontSize:17,cursor:"pointer",boxShadow:`0 6px 22px ${theme.accent}55`}}>{tourS.cta}</button>
            {tourStep>1&&<button onClick={()=>setTourStep(s=>s-1)} style={{display:"block",margin:"10px auto 0",background:"none",border:"none",color:"rgba(255,255,255,.35)",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"var(--fb)"}}>← Back</button>}
          </div>
        </div>
      )}

      {/* Trade modal */}
      {tradeAsset&&(
        <div className="trade-ov" onClick={()=>setTradeAsset(null)}>
          <div className="trade-modal" onClick={e=>e.stopPropagation()}>
            <div className="handle"/>
            <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:"rgba(255,255,255,.06)",borderRadius:13,marginBottom:12}}>
              <span style={{fontSize:38}}>{tradeAsset.icon}</span>
              <div style={{flex:1}}><div style={{fontFamily:"var(--fd)",fontSize:18,color:"#fff"}}>{tradeAsset.name}</div><div style={{fontSize:12,color:"rgba(255,255,255,.5)",fontWeight:700}}>{fs$(prices[tradeAsset.ticker]||tradeAsset.basePrice)} · {tradeAsset.risk==="low"?"🟢 Lower Risk":tradeAsset.risk==="medium"?"🟠 Medium Risk":"🔴 High Risk"}</div></div>
            </div>
            <div style={{background:"rgba(124,58,237,.12)",border:"1px solid rgba(124,58,237,.2)",borderRadius:12,padding:12,marginBottom:11,fontSize:12,fontWeight:700,color:"rgba(255,255,255,.85)",lineHeight:1.55}}>🧒 {tradeAsset.kidEx}</div>
            <div style={{borderRadius:12,padding:"11px 13px",marginBottom:12,fontSize:13,fontWeight:800,lineHeight:1.5,background:tradeAsset.newsGood?"rgba(4,120,87,.08)":"rgba(239,68,68,.07)",border:`1px solid ${tradeAsset.newsGood?"rgba(4,120,87,.25)":"rgba(239,68,68,.25)"}`,color:tradeAsset.newsGood?"#86efac":"#fca5a5"}}>{tradeAsset.news}</div>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              <button onClick={()=>setTradeMode("buy")} style={{flex:1,padding:"10px",borderRadius:11,border:`1.5px solid ${tradeMode==="buy"?"rgba(16,185,129,.6)":"rgba(255,255,255,.15)"}`,background:tradeMode==="buy"?"rgba(16,185,129,.2)":"transparent",color:tradeMode==="buy"?"#86efac":"rgba(255,255,255,.5)",fontFamily:"var(--fd)",fontSize:14,cursor:"pointer"}}>🟢 Buy</button>
              <button onClick={()=>setTradeMode("sell")} style={{flex:1,padding:"10px",borderRadius:11,border:`1.5px solid ${tradeMode==="sell"?"rgba(239,68,68,.6)":"rgba(255,255,255,.15)"}`,background:tradeMode==="sell"?"rgba(239,68,68,.2)":"transparent",color:tradeMode==="sell"?"#fca5a5":"rgba(255,255,255,.5)",fontFamily:"var(--fd)",fontSize:14,cursor:"pointer"}}>🔴 Sell {(()=>{const h=portfolio.find(p=>p.ticker===tradeAsset.ticker);return h?`(${tradeAsset.type==="crypto"?h.qty.toFixed(2):h.qty})`:""})()}</button>
            </div>

            {/* Market status + order type */}
            {(()=>{
              const isCrypto=tradeAsset.type==="crypto";
              return(
                <div style={{marginBottom:12}}>
                  {/* Status line */}
                  <div style={{display:"flex",alignItems:"center",gap:8,background:isCrypto||mkt.open?"rgba(16,185,129,.1)":"rgba(245,158,11,.1)",border:`1px solid ${isCrypto||mkt.open?"rgba(16,185,129,.25)":"rgba(245,158,11,.3)"}`,borderRadius:11,padding:"9px 12px",marginBottom:10}}>
                    <span style={{fontSize:14}}>{isCrypto?"🌐":mkt.open?"🟢":"🔴"}</span>
                    <span style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.8)",lineHeight:1.4}}>
                      {isCrypto
                        ?"Crypto trades 24/7 — buy or sell anytime, instantly!"
                        :mkt.open
                          ?"US market is OPEN — your order fills right away."
                          :`US market is CLOSED. A market order will queue for ${mkt.nextOpenText}.`}
                    </span>
                  </div>
                  {/* Order type toggle */}
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>setOrderType("market")} style={{flex:1,padding:"9px",borderRadius:10,border:`1.5px solid ${orderType==="market"?"rgba(124,58,237,.6)":"rgba(255,255,255,.12)"}`,background:orderType==="market"?"rgba(124,58,237,.18)":"transparent",color:orderType==="market"?"#fff":"rgba(255,255,255,.5)",fontFamily:"var(--fd)",fontSize:12,cursor:"pointer"}}>⚡ Market<div style={{fontSize:9,fontWeight:600,opacity:.7,fontFamily:"var(--fb)"}}>Buy now at any price</div></button>
                    <button onClick={()=>{setOrderType("limit");if(!seenOrderHelp){setShowOrderHelp(true);setSeenOrderHelp(true);}}} style={{flex:1,padding:"9px",borderRadius:10,border:`1.5px solid ${orderType==="limit"?"rgba(124,58,237,.6)":"rgba(255,255,255,.12)"}`,background:orderType==="limit"?"rgba(124,58,237,.18)":"transparent",color:orderType==="limit"?"#fff":"rgba(255,255,255,.5)",fontFamily:"var(--fd)",fontSize:12,cursor:"pointer"}}>🎯 Limit<div style={{fontSize:9,fontWeight:600,opacity:.7,fontFamily:"var(--fb)"}}>Set your target price</div></button>
                  </div>
                  {/* Limit price input */}
                  {orderType==="limit"&&(()=>{
                    const nowP = prices[tradeAsset.ticker]||tradeAsset.basePrice;
                    // Suggest a SMALL, realistic move so a kid's limit order
                    // actually fills during play — not an 8–15% swing that
                    // almost never happens in one sitting.
                    const dip  = isCrypto ? 0.97 : 0.98;  // buy ~2–3% below now
                    const rise = isCrypto ? 1.05 : 1.03;  // sell ~3–5% above now
                    const exTarget = tradeMode==="buy" ? +(nowP*dip).toFixed(isCrypto?0:2) : +(nowP*rise).toFixed(isCrypto?0:2);
                    const canFillNow = isCrypto || mkt.open;
                    // Live coaching on whatever the kid typed.
                    const lp = +limitPrice || 0;
                    let hint = null;
                    if(lp>0){
                      if(tradeMode==="buy"){
                        if(lp>=nowP) hint={good:true, txt:canFillNow?"✅ This buys right away — your target is at or above today's price!":"✅ Ready! This buys the moment the market opens."};
                        else { const d=(nowP-lp)/nowP*100;
                          if(d<=4) hint={good:true, txt:`👍 Great target! A small ${d.toFixed(0)}% dip like this happens a lot — good chance it fills.`};
                          else if(d<=9) hint={good:false, txt:`⏳ That's a ${d.toFixed(0)}% drop — it might take a while to happen.`};
                          else hint={good:false, txt:`🐢 That's a BIG ${d.toFixed(0)}% drop — it could wait a very long time. Try a price closer to ${fs$(nowP)}.`}; }
                      } else {
                        if(lp<=nowP) hint={good:true, txt:canFillNow?"✅ This sells right away — your target is at or below today's price!":"✅ Ready! This sells the moment the market opens."};
                        else { const u=(lp-nowP)/nowP*100;
                          if(u<=5) hint={good:true, txt:`👍 Great target! A small ${u.toFixed(0)}% rise like this happens a lot — good chance it fills.`};
                          else if(u<=12) hint={good:false, txt:`⏳ That's a ${u.toFixed(0)}% rise — it might take a while to happen.`};
                          else hint={good:false, txt:`🐢 That's a BIG ${u.toFixed(0)}% jump — it could wait a very long time. Try a price closer to ${fs$(nowP)}.`}; }
                      }
                    }
                    return(
                    <div style={{marginTop:10,background:"rgba(124,58,237,.08)",border:"1px solid rgba(124,58,237,.2)",borderRadius:11,padding:12}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                        <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.75)",lineHeight:1.5,flex:1}}>
                          {tradeMode==="buy"
                            ?`🎯 Buy ONLY when the price drops to your target. Great for "buy on sale"!`
                            :`🎯 Sell ONLY when the price rises to your target. Great for "take profit"!`}
                        </div>
                        <button onClick={()=>setShowOrderHelp(true)} style={{flexShrink:0,marginLeft:8,background:"rgba(255,255,255,.12)",border:"none",borderRadius:8,padding:"4px 9px",color:"rgba(255,255,255,.7)",fontSize:10,fontWeight:800,cursor:"pointer"}}>❓ How?</button>
                      </div>
                      {/* Worked example with THIS asset's real numbers */}
                      <div style={{background:"rgba(0,0,0,.2)",borderRadius:9,padding:"9px 11px",marginBottom:9,fontSize:11,fontWeight:600,color:"rgba(255,255,255,.7)",lineHeight:1.6}}>
                        💡 <strong style={{color:"#c4b5fd"}}>Example:</strong> {tradeAsset.name} is {fs$(nowP)} right now.
                        {tradeMode==="buy"
                          ?<> A good target is <strong style={{color:"#fff"}}>{fs$(exTarget)}</strong> — just a little below. If it dips that low while you're at school, we buy it for you automatically — like a note saying "grab it when it's on sale!"</>
                          :<> A good target is <strong style={{color:"#fff"}}>{fs$(exTarget)}</strong> — just a little above. If it climbs that high, we sell automatically and lock in your profit — even if you're asleep!</>}
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:13,fontWeight:800,color:"rgba(255,255,255,.6)"}}>Target $</span>
                        <input type="number" value={limitPrice} onChange={e=>setLimitPrice(+e.target.value)} step={isCrypto?100:1} style={{flex:1,padding:"10px 12px",borderRadius:10,border:"1.5px solid rgba(255,255,255,.2)",background:"rgba(255,255,255,.08)",color:"#fff",fontFamily:"var(--fd)",fontSize:16,outline:"none"}}/>
                        <button onClick={()=>setLimitPrice(exTarget)} style={{flexShrink:0,padding:"8px 10px",borderRadius:9,border:"1px solid rgba(124,58,237,.4)",background:"rgba(124,58,237,.2)",color:"#c4b5fd",fontSize:11,fontWeight:800,cursor:"pointer"}}>Use {fs$(exTarget)}</button>
                      </div>
                      {hint&&<div style={{fontSize:12,fontWeight:800,color:hint.good?"#86efac":"#fcd34d",background:hint.good?"rgba(16,185,129,.12)":"rgba(245,158,11,.12)",border:`1px solid ${hint.good?"rgba(16,185,129,.3)":"rgba(245,158,11,.3)"}`,borderRadius:9,padding:"8px 10px",marginTop:8,lineHeight:1.45}}>{hint.txt}</div>}
                      <div style={{fontSize:10,fontWeight:600,color:"rgba(255,255,255,.4)",marginTop:6}}>Now: {fs$(nowP)} · Your order waits until the target is hit (even while you're at school!).</div>
                    </div>
                    );
                  })()}
                </div>
              );
            })()}
            <div className="qty-row">
              <button className="qty-btn" onClick={()=>setTradeQty(q=>Math.max(tradeAsset.type==="crypto"?.01:1,tradeAsset.type==="crypto"?+(q-.1).toFixed(2):q-1))}>−</button>
              <div style={{flex:1,textAlign:"center"}}><div style={{fontFamily:"var(--fd)",fontSize:32,color:"#fff"}}>{tradeAsset.type==="crypto"?tradeQty.toFixed(2):tradeQty}</div><div style={{fontSize:10,color:"rgba(255,255,255,.4)",fontWeight:700,marginTop:-4}}>{tradeAsset.type==="crypto"?"tokens":"shares"} · {fs$((prices[tradeAsset.ticker]||tradeAsset.basePrice)*tradeQty)}</div></div>
              <button className="qty-btn" onClick={()=>setTradeQty(q=>tradeAsset.type==="crypto"?+(q+.1).toFixed(2):q+1)}>+</button>
            </div>
            {tradeMode==="buy"&&(()=>{const total=(prices[tradeAsset.ticker]||tradeAsset.basePrice)*tradeQty;return(
              <div style={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:800,color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:".4px",marginBottom:6}}>🎲 What could happen to your {fs$(total)}?</div>
                {[[`📈 UP 20%`,`+${fs$(total*.2)}`,`≈ ${toRobux(total*.2)} Robux!`,"rgba(16,185,129,.08)","rgba(16,185,129,.22)","#86efac"],[`➡️ Flat`,`$0`,`No change`,"rgba(100,116,139,.07)","rgba(100,116,139,.15)","rgba(255,255,255,.4)"],[`📉 DOWN 10%`,`-${fs$(total*.1)}`,`Like losing ${toRobux(total*.1)} Robux`,"rgba(239,68,68,.07)","rgba(239,68,68,.22)","#fca5a5"]].map(([l,a,s,bg,bdr,col])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"9px 12px",background:bg,border:`1px solid ${bdr}`,borderRadius:10,marginBottom:3}}>
                    <div><div style={{fontSize:12,fontWeight:800,color:col}}>{l}</div><div style={{fontSize:9,color:"rgba(255,255,255,.35)",fontWeight:600}}>{s}</div></div>
                    <div style={{fontFamily:"var(--fd)",fontSize:14,color:col}}>{a}</div>
                  </div>
                ))}
              </div>
            );})()}
            <div style={{display:"flex",gap:8}}>
              <button onClick={execTrade} disabled={(tradeMode==="buy"&&tokens===0)||(tradeMode==="buy"&&(orderType==="limit"?limitPrice:prices[tradeAsset.ticker]||tradeAsset.basePrice)*tradeQty>cash)} style={{flex:2,padding:"14px",borderRadius:14,border:"none",background:tradeMode==="buy"?"linear-gradient(135deg,#10b981,#059669)":"linear-gradient(135deg,#ef4444,#dc2626)",color:"#fff",fontFamily:"var(--fd)",fontSize:15,cursor:"pointer",opacity:(tradeMode==="buy"&&tokens===0)?.4:1}}>
                {(()=>{
                  const isCrypto=tradeAsset.type==="crypto";
                  if(orderType==="limit") return tradeMode==="buy"?"🎯 Place Buy Limit":"🎯 Place Sell Limit";
                  if(!isCrypto&&!mkt.open) return "⏰ Queue for open";
                  return tradeMode==="buy"?"🟢 Confirm Buy":"🔴 Confirm Sell";
                })()}
              </button>
              <button onClick={()=>setTradeAsset(null)} style={{flex:1,padding:"14px",borderRadius:14,border:"1.5px solid rgba(255,255,255,.15)",background:"transparent",color:"rgba(255,255,255,.5)",fontFamily:"var(--fd)",fontSize:13,cursor:"pointer"}}>Cancel</button>
            </div>
            {tradeMode==="buy"&&tokens===0&&<div style={{textAlign:"center",marginTop:8,fontSize:11,fontWeight:700,color:"#fca5a5",lineHeight:1.5}}>⚠️ You've used all {DAILY_TOKENS} of today's BUY trades! (Selling is always free.) You have {fs$(cash)} ready — {DAILY_TOKENS} fresh buys arrive tomorrow, or grab an Extra Trade Token in the Coin Shop 🪙</div>}
            {tradeMode==="sell"&&<div style={{textAlign:"center",marginTop:8,fontSize:11,fontWeight:700,color:"#86efac",lineHeight:1.5}}>✅ Selling is always free — no trade token needed!</div>}
            {tradeMode==="buy"&&tokens>0&&(orderType==="limit"?limitPrice:prices[tradeAsset.ticker]||tradeAsset.basePrice)*tradeQty>cash&&<div style={{textAlign:"center",marginTop:8,fontSize:11,fontWeight:700,color:"#fca5a5"}}>⚠️ Not enough cash for this many — reduce the quantity!</div>}
          </div>
        </div>
      )}

      {/* Limit-order explainer (replayable) */}
      {showOrderHelp&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:310,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setShowOrderHelp(false)}>
          <div style={{background:"#111827",border:"1px solid rgba(124,58,237,.3)",borderRadius:22,padding:24,maxWidth:400,width:"100%",maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:44,textAlign:"center",marginBottom:8}}>🎯</div>
            <div style={{fontFamily:"var(--fd)",fontSize:20,color:"#fff",textAlign:"center",marginBottom:6}}>What's a Limit Order?</div>
            <div style={{fontSize:13,fontWeight:600,color:"rgba(255,255,255,.65)",textAlign:"center",lineHeight:1.6,marginBottom:16}}>It's how you trade even when you're at school! 🎒</div>
            {[
              {ic:"🎒",t:"The problem",d:"The US stock market is only open while you're in class (about 2:30pm–9pm UK time). You can't watch prices all day!"},
              {ic:"📝",t:"The clever trick",d:"A limit order is like leaving a note with a friend: 'If my favorite sneakers drop to $40, buy them for me!' You set your price and walk away."},
              {ic:"🟢",t:"Buy limit = wait for a sale",d:"Apple is $195? Set a buy limit at $180. If it ever dips to $180 — even at 3am — the app buys it for you automatically. You never overpay!"},
              {ic:"🔴",t:"Sell limit = lock in profit",d:"Own Roblox at $50 and want to take profit at $60? Set a sell limit at $60. The moment it hits, the app sells and banks your gain — even while you sleep."},
              {ic:"⏳",t:"Check your orders anytime",d:"All your waiting orders live in ••• → Orders. You can see which are ready, and cancel any you change your mind about."},
            ].map(x=>(
              <div key={x.t} style={{background:"rgba(255,255,255,.05)",borderRadius:13,padding:13,marginBottom:9,display:"flex",gap:11}}>
                <span style={{fontSize:26,flexShrink:0}}>{x.ic}</span>
                <div><div style={{fontFamily:"var(--fd)",fontSize:14,color:"#c4b5fd",marginBottom:3}}>{x.t}</div><div style={{fontSize:12,fontWeight:600,color:"rgba(255,255,255,.65)",lineHeight:1.55}}>{x.d}</div></div>
              </div>
            ))}
            <div style={{background:"rgba(124,58,237,.12)",borderRadius:12,padding:12,marginBottom:14,fontSize:12,fontWeight:700,color:"rgba(255,255,255,.8)",textAlign:"center",lineHeight:1.5}}>
              🧠 Remember: <strong style={{color:"#86efac"}}>Buy low</strong> (set target below now) · <strong style={{color:"#fca5a5"}}>Sell high</strong> (set target above now)
            </div>
            <button onClick={()=>setShowOrderHelp(false)} style={{width:"100%",padding:14,borderRadius:14,border:"none",background:`linear-gradient(135deg,${theme.accent},${theme.accent}99)`,color:"#fff",fontFamily:"var(--fd)",fontSize:15,cursor:"pointer"}}>Got it — let's try! 🎯</button>
          </div>
        </div>
      )}

      {/* XP / Coin / Money explainer */}
      {showInfo&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setShowInfo(false)}>
          <div style={{background:"#111827",border:"1px solid rgba(124,58,237,.3)",borderRadius:22,padding:24,maxWidth:400,width:"100%"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontFamily:"var(--fd)",fontSize:20,color:"#fff",textAlign:"center",marginBottom:16}}>3 things you collect 🎮</div>
            {[
              {ic:"💵",col:"#86efac",name:"Money Garden",desc:"Your REAL investing money. You buy stocks with this and try to grow it. This is what the whole game is about — making it bigger!"},
              {ic:"⚡",col:"#67e8f9",name:"XP (Experience)",desc:"Shows how much you've LEARNED. Earn it by trading, learning and completing missions. More XP = higher Level = more experienced investor. You can't spend XP — it's your skill score!"},
              {ic:"🪙",col:"#f59e0b",name:"Coins",desc:"Fun reward money! Spend coins in the Shop on themes, avatars and pet outfits. Coins are JUST for fun — you can never buy investments with them."},
            ].map(x=>(
              <div key={x.name} style={{background:"rgba(255,255,255,.05)",borderRadius:14,padding:14,marginBottom:10,display:"flex",gap:12}}>
                <span style={{fontSize:30,flexShrink:0}}>{x.ic}</span>
                <div>
                  <div style={{fontFamily:"var(--fd)",fontSize:15,color:x.col,marginBottom:3}}>{x.name}</div>
                  <div style={{fontSize:12,fontWeight:600,color:"rgba(255,255,255,.65)",lineHeight:1.55}}>{x.desc}</div>
                </div>
              </div>
            ))}
            <div style={{background:"rgba(124,58,237,.12)",borderRadius:12,padding:12,marginBottom:14,fontSize:12,fontWeight:700,color:"rgba(255,255,255,.8)",textAlign:"center",lineHeight:1.5}}>
              🧠 Easy way to remember:<br/><strong style={{color:"#86efac"}}>Money</strong> = invest · <strong style={{color:"#67e8f9"}}>XP</strong> = level up · <strong style={{color:"#f59e0b"}}>Coins</strong> = fun shop
            </div>
            <button onClick={()=>setShowInfo(false)} style={{width:"100%",padding:14,borderRadius:14,border:"none",background:`linear-gradient(135deg,${theme.accent},${theme.accent}99)`,color:"#fff",fontFamily:"var(--fd)",fontSize:15,cursor:"pointer"}}>Got it! 👍</button>
          </div>
        </div>
      )}

      {/* New badge earned popup */}
      {/* Daily login bonus */}
      {showDailyBonus&&(()=>{
        const todayIdx=(Math.max(1,streak)-1)%7;
        const learnedThisWeek=lastLessonAt&&(Date.now()-lastLessonAt<7*86400000);
        const rewardText=r=>[r.coins&&`🪙 ${r.coins}`,r.cash&&`💵 $${r.cash}`,r.tokens&&`🎟️ ${r.tokens}`,r.card&&`✨ Rare Card`].filter(Boolean).join("  ");
        return(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.92)",zIndex:360,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:14,padding:24}}>
          {!bonusResult?(
            <div style={{background:"#141028",border:"1px solid rgba(255,255,255,.14)",borderRadius:20,padding:24,maxWidth:360,width:"100%",textAlign:"center"}}>
              <div style={{fontSize:56,animation:"popUp .6s cubic-bezier(.34,1.56,.64,1)"}}>🎁</div>
              <div style={{fontFamily:"var(--fd)",fontSize:22,color:"#fff",marginTop:4}}>Daily Bonus!</div>
              <div style={{fontSize:13,fontWeight:800,color:"#fbbf24",marginBottom:14}}>🔥 {Math.max(1,streak)}-day streak — welcome back, {user?.name}!</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:5,marginBottom:16}}>
                {DAILY_BONUS.map((r,i)=>{
                  const done=i<todayIdx, today=i===todayIdx;
                  return(
                    <div key={i} style={{borderRadius:9,padding:"7px 2px",background:today?"rgba(251,191,36,.22)":done?"rgba(16,185,129,.16)":"rgba(255,255,255,.05)",border:`1.5px solid ${today?"#fbbf24":done?"rgba(16,185,129,.4)":"rgba(255,255,255,.1)"}`}}>
                      <div style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,.5)"}}>D{i+1}</div>
                      <div style={{fontSize:15}}>{r.jackpot?"🎁":done?"✅":r.card?"✨":"🪙"}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.6)",marginBottom:4}}>Today you get</div>
              <div style={{fontFamily:"var(--fd)",fontSize:18,color:"#fff",marginBottom:10}}>{rewardText(DAILY_BONUS[todayIdx])}</div>
              {DAILY_BONUS[todayIdx].jackpot&&(
                <div style={{fontSize:12,fontWeight:800,color:learnedThisWeek?"#86efac":"#fca5a5",background:learnedThisWeek?"rgba(16,185,129,.12)":"rgba(239,68,68,.12)",borderRadius:11,padding:"9px 12px",marginBottom:12,lineHeight:1.5}}>
                  {learnedThisWeek?"🎉 JACKPOT UNLOCKED — you did a lesson this week!":"🔒 Jackpot locked! Do any lesson this week to unlock the full $100 + 300 🪙. For now you'll get 100 🪙."}
                </div>
              )}
              <button onClick={claimDailyBonus} style={{width:"100%",padding:15,borderRadius:14,border:"none",background:"linear-gradient(135deg,#f59e0b,#f97316)",color:"#fff",fontFamily:"var(--fd)",fontSize:17,cursor:"pointer",boxShadow:"0 6px 22px rgba(245,158,11,.45)"}}>Claim reward! 🎉</button>
            </div>
          ):(
            <div style={{background:"#141028",border:"1px solid rgba(255,255,255,.14)",borderRadius:20,padding:26,maxWidth:340,width:"100%",textAlign:"center"}}>
              <div style={{fontSize:64,animation:"popUp .6s cubic-bezier(.34,1.56,.64,1)"}}>{bonusResult.jackpot&&!bonusResult.locked?"🎁":"🪙"}</div>
              <div style={{fontFamily:"var(--fd)",fontSize:22,color:"#fff",margin:"6px 0"}}>{bonusResult.jackpot&&!bonusResult.locked?"JACKPOT!":"Nice!"}</div>
              <div style={{fontSize:15,fontWeight:800,color:"#fbbf24",marginBottom:6}}>{rewardText(bonusResult)||`🪙 ${bonusResult.coins}`}</div>
              {bonusResult.locked&&<div style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.55)",marginBottom:10,lineHeight:1.5}}>Do a lesson this week and next Day 7 you'll grab the full jackpot! 📚</div>}
              <div style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.5)",marginBottom:14}}>Come back tomorrow to keep your streak alive! 🔥</div>
              <button onClick={()=>{setShowDailyBonus(false);setBonusResult(null);}} style={{width:"100%",padding:14,borderRadius:13,border:"none",background:"linear-gradient(135deg,#7c3aed,#9333ea)",color:"#fff",fontFamily:"var(--fd)",fontSize:15,cursor:"pointer"}}>Let's go! 🚀</button>
            </div>
          )}
        </div>
      );})()}

      {/* Toybox Plus upsell modal — the "ask a grown-up" bridge */}
      {showPlus&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.92)",zIndex:361,display:"flex",alignItems:"center",justifyContent:"center",padding:22}}>
          <div style={{background:"#141028",border:"1px solid rgba(245,158,11,.4)",borderRadius:20,padding:24,maxWidth:360,width:"100%",textAlign:"center"}}>
            <div style={{fontSize:52}}>⭐</div>
            <div style={{fontFamily:"var(--fd)",fontSize:23,color:"#fff",margin:"2px 0 4px"}}>Toybox Plus</div>
            <div style={{fontSize:12.5,fontWeight:700,color:"rgba(255,255,255,.6)",marginBottom:14}}>Unlock the full adventure!</div>
            <div style={{textAlign:"left",display:"flex",flexDirection:"column",gap:9,marginBottom:16}}>
              {[["👑","A royal Golden Crown for your pet + gold name frame"],["📚","20+ more lessons & new adventure levels"],["🧊","Streak Freeze — never lose your streak"],["👨‍👩‍👧‍👦","Add your brothers & sisters + the family leaderboard"],["💰","500 bonus coins the moment you unlock!"]].map(([ic,t])=>(
                <div key={t} style={{display:"flex",gap:10,alignItems:"center"}}>
                  <span style={{fontSize:20}}>{ic}</span>
                  <span style={{fontSize:12.5,fontWeight:700,color:"rgba(255,255,255,.85)",lineHeight:1.4}}>{t}</span>
                </div>
              ))}
            </div>
            {askedPlus?(
              <div style={{background:"rgba(16,185,129,.12)",border:"1px solid rgba(16,185,129,.3)",borderRadius:13,padding:13,marginBottom:12}}>
                <div style={{fontFamily:"var(--fd)",fontSize:15,color:"#6ee7b7"}}>Asked! 🎉</div>
                <div style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.7)",marginTop:3,lineHeight:1.5}}>Tell your grown-up to check their phone 📲 — or open ☁️ → Unlock Toybox Plus.</div>
              </div>
            ):(
              <button onClick={askGrownup} style={{width:"100%",padding:15,borderRadius:14,border:"none",background:"linear-gradient(135deg,#f59e0b,#f97316)",color:"#fff",fontFamily:"var(--fd)",fontSize:16,cursor:"pointer",boxShadow:"0 6px 22px rgba(245,158,11,.45)"}}>⭐ Ask a grown-up to unlock</button>
            )}
            <button onClick={()=>setShowPlus(false)} style={{width:"100%",marginTop:10,background:"transparent",border:"1px solid rgba(255,255,255,.2)",color:"rgba(255,255,255,.6)",borderRadius:12,padding:11,fontWeight:700,fontSize:13.5,cursor:"pointer",fontFamily:"var(--fb)"}}>Maybe later</button>
          </div>
        </div>
      )}

      {/* Fresh Plus unlock — celebrate + reward */}
      {plusCelebrate&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.92)",zIndex:362,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,padding:24}}>
          <div style={{fontSize:76,animation:"popUp .6s cubic-bezier(.34,1.56,.64,1)"}}>👑</div>
          <div style={{fontFamily:"var(--fd)",fontSize:26,color:"#fbbf24",textAlign:"center"}}>You're a Plus member!</div>
          <div style={{fontSize:14,fontWeight:700,color:"rgba(255,255,255,.85)",textAlign:"center",maxWidth:300,lineHeight:1.5}}>Thank your grown-up! 💛 You got <strong style={{color:"#fbbf24"}}>500 coins</strong>, a <strong>Golden Crown</strong> for your pet, and a <strong>gold name frame</strong>!</div>
          <button onClick={()=>setPlusCelebrate(false)} style={{marginTop:8,padding:"13px 30px",borderRadius:14,border:"none",background:"linear-gradient(135deg,#f59e0b,#f97316)",color:"#fff",fontFamily:"var(--fd)",fontSize:16,cursor:"pointer"}}>Awesome! 🚀</button>
        </div>
      )}

      {newBadge&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.9)",zIndex:350,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:14,padding:24}}>
          <div style={{fontSize:80,animation:"popUp .6s cubic-bezier(.34,1.56,.64,1)"}}>{newBadge.icon}</div>
          <div style={{fontFamily:"var(--fd)",fontSize:13,color:"#f59e0b",letterSpacing:"1px"}}>🏅 NEW BADGE EARNED!</div>
          <div style={{fontFamily:"var(--fd)",fontSize:24,color:"#fff",textAlign:"center"}}>{newBadge.name}</div>
          <div style={{fontSize:13,color:"rgba(255,255,255,.6)",fontWeight:700,textAlign:"center",maxWidth:260}}>{newBadge.desc}</div>
        </div>
      )}

      {/* Success */}
      {success&&(
        <div className="success-ov">
          <div style={{fontSize:72,animation:"popUp .6s cubic-bezier(.34,1.56,.64,1)"}}>{success.icon}</div>
          <div style={{fontFamily:"var(--fd)",fontSize:22,color:"#fff"}}>{success.mode==="buy"?"Added to Chest! 🎉":"Sold! 💸"}</div>
          <div style={{fontSize:13,color:"rgba(255,255,255,.55)",fontWeight:700}}>{success.name} · {fs$(success.total)} · +50 XP +10 Coins</div>
          {success.mode==="buy"&&<div style={{fontSize:12,fontWeight:800,color:"#f59e0b"}}>🎴 New investment card earned!</div>}
        </div>
      )}

      {/* Cash reward from lesson */}
      {cashReward&&(
        <div className="reward-ov">
          <div style={{fontSize:70,animation:"popUp .5s cubic-bezier(.34,1.56,.64,1)"}}>💵</div>
          <div style={{fontFamily:"var(--fd)",fontSize:26,color:"#f59e0b",textShadow:"0 0 20px rgba(245,158,11,.5)"}}>+{fs$(cashReward.amount)} Paper Money!</div>
          <div style={{fontFamily:"var(--fd)",fontSize:18,color:"#fff"}}>Lesson Complete! 🎓</div>
          <div style={{fontSize:13,color:"rgba(255,255,255,.6)",fontWeight:700,textAlign:"center",lineHeight:1.6,maxWidth:280}}>You learned something real — so you earned real trading capital. Knowledge = money! 🧠</div>
          <div style={{background:"rgba(245,158,11,.12)",border:"1px solid rgba(245,158,11,.3)",borderRadius:16,padding:"14px 24px",textAlign:"center",marginTop:4,display:"flex",gap:18}}>
            <div><div style={{fontFamily:"var(--fd)",fontSize:22,color:"#06b6d4"}}>+200</div><div style={{fontSize:10,fontWeight:800,color:"rgba(255,255,255,.4)"}}>XP</div></div>
            <div style={{width:1,background:"rgba(255,255,255,.1)"}}/>
            <div><div style={{fontFamily:"var(--fd)",fontSize:22,color:"#f59e0b"}}>+50</div><div style={{fontSize:10,fontWeight:800,color:"rgba(255,255,255,.4)"}}>COINS</div></div>
          </div>
          {cashReward.tryIt&&(
            <div style={{marginTop:18,width:"100%",maxWidth:300}}>
              <div style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.55)",textAlign:"center",marginBottom:10}}>Now put it into practice! 👇</div>
              <button onClick={()=>{
                setCashReward(null);
                if(cashReward.tryIt.act==="limit"){ setNav("Trade"); setShowOrderHelp(true); }
                else { setNav("Trade"); }
              }} style={{width:"100%",padding:14,borderRadius:14,border:"none",background:`linear-gradient(135deg,${theme.accent},${theme.accent}99)`,color:"#fff",fontFamily:"var(--fd)",fontSize:15,cursor:"pointer",marginBottom:8}}>{cashReward.tryIt.label} →</button>
              <button onClick={()=>setCashReward(null)} style={{width:"100%",padding:10,borderRadius:12,border:"none",background:"transparent",color:"rgba(255,255,255,.4)",fontFamily:"var(--fb)",fontSize:12,fontWeight:800,cursor:"pointer"}}>Maybe later</button>
            </div>
          )}
        </div>
      )}

      {/* Lesson modal — slides then quiz */}
      {lesson&&(
        <div className="lesson-ov">
          <div className="lesson-modal">
            {!inQuiz?(<>
              {/* ── SLIDES ── */}
              <div className="lesson-prog"><div className="lesson-prog-fill" style={{width:`${(lessonSlide/lesson.slides.length)*100}%`,background:`linear-gradient(90deg,${lesson.color},${lesson.color}88)`}}/></div>
              <div className="lesson-body">
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <span style={{fontFamily:"var(--fd)",fontSize:13,color:lesson.color}}>{lesson.title}</span>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:11,color:"rgba(255,255,255,.35)",fontWeight:700}}>{lessonSlide+1}/{lesson.slides.length}</span>
                    <button onClick={closeLesson} style={{background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.15)",borderRadius:8,padding:"4px 9px",color:"rgba(255,255,255,.5)",fontSize:11,fontWeight:800,cursor:"pointer"}}>✕ Save</button>
                  </div>
                </div>
                <span className="lesson-ic">{lesson.slides[lessonSlide].icon}</span>
                <div className="lesson-title">{lesson.slides[lessonSlide].title}</div>
                <div className="lesson-txt">{lesson.slides[lessonSlide].body}</div>
                <div className="lesson-ex" style={{background:`${lesson.color}22`,border:`1px solid ${lesson.color}44`,color:lesson.color}}>{lesson.slides[lessonSlide].example}</div>
                {!slideReady&&(
                  <div style={{marginTop:10,display:"flex",alignItems:"center",gap:8}}>
                    <div style={{flex:1,height:4,background:"rgba(255,255,255,.08)",borderRadius:100,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(100,(slideTimer/3)*100)}%`,background:lesson.color,borderRadius:100,transition:"width 1s linear"}}/></div>
                    <span style={{fontSize:10,fontWeight:800,color:"rgba(255,255,255,.35)",flexShrink:0}}>{Math.max(0,3-slideTimer)}s</span>
                  </div>
                )}
                {slideReady&&<div style={{marginTop:8,fontSize:10,fontWeight:800,color:lesson.color,textAlign:"center"}}>✅ Read! You can continue.</div>}
              </div>
              <div className="lesson-footer">
                {lessonSlide>0
                  ?<button className="lesson-back" onClick={()=>{setLessonSlide(s=>s-1);setSlideReady(false);setSlideTimer(0);}}>← Back</button>
                  :<button className="lesson-back" onClick={closeLesson}>✕ Close</button>}
                {lessonSlide===lesson.slides.length-1
                  ?<button className="lesson-next" disabled={!slideReady} style={{background:slideReady?`linear-gradient(135deg,${lesson.color},${lesson.color}88)`:"rgba(255,255,255,.08)",cursor:slideReady?"pointer":"not-allowed"}} onClick={()=>slideReady&&startGame()}>
                      {slideReady?"🎮 Play the Level!":"⏳ Reading..."}
                    </button>
                  :<button className="lesson-next" disabled={!slideReady} style={{background:slideReady?`linear-gradient(135deg,${lesson.color},${lesson.color}88)`:"rgba(255,255,255,.08)",cursor:slideReady?"pointer":"not-allowed"}} onClick={advanceSlide}>
                      {slideReady?"Next →":`⏳ ${Math.max(0,3-slideTimer)}s`}
                    </button>}
              </div>
            </>):(<>
              {/* ── ADVENTURE LEVEL ── */}
              {(()=>{
                const quizArr = challengeMode&&LESSON_CHALLENGE[lesson.id]?LESSON_CHALLENGE[lesson.id]:lesson.quiz;
                const cp = quizArr[qIdx];
                const total = quizArr.length;
                const buddyObj = STARTERS.find(s=>s.id===buddy)||STARTERS[0];
                return(
                  <div style={{position:"relative",overflow:"hidden"}} className={shake?"shake":""}>
                    {/* red flash on wrong */}
                    {qWrong&&<div style={{position:"absolute",inset:0,background:"#ef4444",opacity:0,animation:"redFlash .5s ease forwards",pointerEvents:"none",zIndex:5,borderRadius:14}}/>}
                    <div className="lesson-body" style={{paddingTop:16}}>
                      {challengeMode&&<div style={{textAlign:"center",marginBottom:10}}><span style={{display:"inline-block",fontSize:11,fontWeight:800,color:"#fca5a5",background:"rgba(239,68,68,.15)",border:"1px solid rgba(239,68,68,.35)",borderRadius:100,padding:"4px 12px"}}>🔥 CHALLENGE ROUND · think back to earlier lessons!</span></div>}
                      {/* HUD: hearts + combo + checkpoint */}
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                        <div style={{display:"flex",gap:3}}>{[0,1,2].map(h=><span key={h} style={{fontSize:18,opacity:h<hearts?1:.25,transition:"opacity .3s"}}>{h<hearts?"❤️":"🖤"}</span>)}</div>
                        {combo>=2&&<div style={{fontFamily:"var(--fd)",fontSize:13,color:"#f59e0b",animation:"popUp .3s ease"}}>🔥 {combo} streak!</div>}
                        <div style={{fontSize:11,color:"rgba(255,255,255,.45)",fontWeight:800}}>Flag {qIdx+1}/{total}</div>
                      </div>

                      {/* The adventure path */}
                      <div style={{position:"relative",background:`linear-gradient(180deg,${lesson.color}18,rgba(0,0,0,.2))`,border:`1px solid ${lesson.color}33`,borderRadius:16,padding:"14px 12px",marginBottom:16,minHeight:96}}>
                        <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",height:64,position:"relative"}}>
                          {quizArr.map((_,n)=>{
                            const done=n<qIdx, current=n===qIdx;
                            return(
                              <div key={n} style={{display:"flex",flexDirection:"column",alignItems:"center",flex:1,position:"relative"}}>
                                {/* buddy sits on current node */}
                                {current&&(
                                  <div style={{position:"absolute",bottom:34,left:"50%",transform:"translateX(-50%)",zIndex:3}}>
                                    <span className={`game-buddy ${buddyAnim}`} style={{fontSize:40,filter:`drop-shadow(0 4px 8px ${buddyObj.glow}88)`}}>{buddyObj.emoji}</span>
                                    {/* dust puff under buddy on hop */}
                                    {buddyAnim==="hop"&&<div style={{position:"absolute",bottom:-4,left:"50%",transform:"translateX(-50%)",width:24,height:10,borderRadius:"50%",background:"rgba(255,255,255,.4)",animation:"dustPuff .5s ease forwards"}}/>}
                                  </div>
                                )}
                                {/* checkpoint flag */}
                                <span style={{fontSize:20,filter:done?"none":current?"none":"grayscale(.7)",opacity:done||current?1:.5}}>{done?"🚩":current?"⛳":"🏳️"}</span>
                                {/* path dot */}
                                <div style={{width:"100%",height:3,background:done?lesson.color:"rgba(255,255,255,.12)",marginTop:4}}/>
                              </div>
                            );
                          })}
                          {/* goal at the end */}
                          <div style={{display:"flex",flexDirection:"column",alignItems:"center",flexShrink:0,paddingLeft:4}}>
                            <span style={{fontSize:24,filter:levelWon?"none":"grayscale(.4)"}}>{levelWon?"🎉":"🏰"}</span>
                          </div>
                        </div>
                        {/* coin burst */}
                        {coinBurst&&[0,1,2,3].map(c=><div key={c} style={{position:"absolute",top:30,left:`${30+c*12}%`,fontSize:18,animation:"coinFly .7s ease forwards",["--cx"]:`${(c-1.5)*30}px`}}>🪙</div>)}
                      </div>

                      {levelWon?(
                        <div style={{textAlign:"center",padding:"10px 0"}}>
                          <div style={{fontFamily:"var(--fd)",fontSize:22,color:"#86efac"}}>🎉 Level Complete!</div>
                          <div style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,.6)",marginTop:6}}>{buddyObj.name} reached the castle! Collecting your reward...</div>
                        </div>
                      ):(
                        <>
                          <div style={{fontSize:11,fontWeight:800,color:lesson.color,textTransform:"uppercase",letterSpacing:".5px",textAlign:"center",marginBottom:8}}>⛳ Checkpoint {qIdx+1}</div>
                          <div style={{fontFamily:"var(--fd)",fontSize:17,color:"#fff",textAlign:"center",marginBottom:16,lineHeight:1.4}}>{cp.q}</div>
                          <div style={{display:"flex",flexDirection:"column",gap:9}}>
                            {cp.opts.map((opt,i)=>{
                              const isSel=qAnswer===i, isCorrect=i===cp.correct, showResult=qAnswer!==null;
                              let bg="rgba(255,255,255,.06)",bd="rgba(255,255,255,.12)",col="#fff";
                              if(showResult&&isCorrect){bg="rgba(16,185,129,.18)";bd="rgba(16,185,129,.5)";col="#86efac";}
                              else if(showResult&&isSel&&!isCorrect){bg="rgba(239,68,68,.15)";bd="rgba(239,68,68,.5)";col="#fca5a5";}
                              return(
                                <button key={i} disabled={qAnswer!==null} onClick={()=>answerGame(i)} style={{padding:"13px 15px",borderRadius:13,border:`2px solid ${bd}`,background:bg,color:col,fontFamily:"var(--fb)",fontSize:14,fontWeight:800,cursor:qAnswer!==null?"default":"pointer",textAlign:"left",transition:"all .2s",display:"flex",alignItems:"center",gap:10}}>
                                  <span style={{width:24,height:24,borderRadius:"50%",border:`2px solid ${bd}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,flexShrink:0}}>{showResult&&isCorrect?"✓":showResult&&isSel?"✗":String.fromCharCode(65+i)}</span>
                                  {opt}
                                </button>
                              );
                            })}
                          </div>
                          {qWrong&&(
                            <div style={{marginTop:14,background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.3)",borderRadius:13,padding:13}}>
                              <div style={{fontFamily:"var(--fd)",fontSize:13,color:"#fca5a5",marginBottom:5}}>{hearts>0?`Ouch! ${buddyObj.name} stumbled — ${hearts} ❤️ left`:`${buddyObj.name} tumbled back to the start! 😵`}</div>
                              <div style={{fontSize:12,fontWeight:600,color:"rgba(255,255,255,.7)",lineHeight:1.5,marginBottom:10}}>{cp.why}</div>
                              {hearts>0&&<div style={{display:"flex",gap:8}}>
                                <button onClick={retryCheckpoint} style={{flex:1,padding:"10px",borderRadius:11,border:"none",background:`linear-gradient(135deg,${lesson.color},${lesson.color}88)`,color:"#fff",fontFamily:"var(--fd)",fontSize:13,cursor:"pointer"}}>🔄 Try this flag again</button>
                                <button onClick={reviewLesson} style={{flex:1,padding:"10px",borderRadius:11,border:"1.5px solid rgba(255,255,255,.2)",background:"transparent",color:"rgba(255,255,255,.7)",fontFamily:"var(--fd)",fontSize:13,cursor:"pointer"}}>📖 Review</button>
                              </div>}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {!levelWon&&(
                      <div className="lesson-footer">
                        <button className="lesson-back" onClick={reviewLesson}>📖 Review lesson</button>
                        <button className="lesson-back" onClick={closeLesson} style={{flex:1}}>✕ Close</button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </>)}
          </div>
        </div>
      )}

      {/* Starter buddy picker */}
      {pickBuddy&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.9)",zIndex:340,display:"flex",alignItems:"center",justifyContent:"center",padding:18}}>
          <div style={{background:"#111827",border:"1px solid rgba(124,58,237,.3)",borderRadius:22,padding:22,maxWidth:420,width:"100%",maxHeight:"88vh",overflowY:"auto"}}>
            <div style={{fontSize:40,textAlign:"center",marginBottom:6}}>🥚</div>
            <div style={{fontFamily:"var(--fd)",fontSize:21,color:"#fff",textAlign:"center",marginBottom:6}}>Choose your buddy!</div>
            <div style={{fontSize:12,fontWeight:600,color:"rgba(255,255,255,.6)",textAlign:"center",lineHeight:1.5,marginBottom:16}}>This little friend joins you on every lesson adventure. Pick the one you like best!</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {STARTERS.map(s=>(
                <button key={s.id} onClick={()=>{setBuddy(s.id);setPickBuddy(false);fx("reward",25);setTimeout(()=>startGame(),300);}} style={{display:"flex",alignItems:"center",gap:14,padding:14,borderRadius:16,border:`2px solid ${s.color}55`,background:`linear-gradient(135deg,${s.color}22,${s.color}08)`,cursor:"pointer",textAlign:"left"}}>
                  <span style={{fontSize:42,filter:`drop-shadow(0 4px 8px ${s.glow}88)`}}>{s.emoji}</span>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:"var(--fd)",fontSize:17,color:"#fff"}}>{s.name} <span style={{fontSize:10,fontWeight:800,background:`${s.color}44`,color:s.glow,padding:"2px 8px",borderRadius:100,marginLeft:4}}>{s.type}</span></div>
                    <div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,.55)",marginTop:3,lineHeight:1.4}}>{s.blurb}</div>
                  </div>
                  <span style={{fontSize:18,color:s.glow}}>→</span>
                </button>
              ))}
            </div>
            <button onClick={()=>setPickBuddy(false)} style={{display:"block",margin:"14px auto 0",background:"none",border:"none",color:"rgba(255,255,255,.4)",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"var(--fb)"}}>Maybe later</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// PARENT DASHBOARD
// ═══════════════════════════════════════════════════
function ParentDash({kids,onResetKid,onLogout}){
  const [kidStates,setKidStates]=useState({});
  const [confirmReset,setConfirmReset]=useState(null);  // {kid, mode}
  const [resetGain,setResetGain]=useState(0);           // starting gain to leave after a money reset ($)
  const [pv,setPv]=useState("perf");                    // perf | tasks
  const [tasks,setTasks]=useState([]);
  const [store,setStore]=useState([]);
  const [claims,setClaims]=useState([]);
  // New-task form
  const [nKid,setNKid]=useState("");
  const [nTitle,setNTitle]=useState("");
  const [nCat,setNCat]=useState("chores");
  const [nType,setNType]=useState("coins");             // coins | custom
  const [nCoins,setNCoins]=useState(20);
  const [nLabel,setNLabel]=useState("");
  const [nEmoji,setNEmoji]=useState("🎁");
  const [nRecur,setNRecur]=useState("once");
  const [nMoney,setNMoney]=useState(2);                 // pocket-money amount (tracking only)
  // New reward-store item
  const [sName,setSName]=useState(""); const [sEmoji,setSEmoji]=useState("🎁"); const [sCost,setSCost]=useState(50);
  // Pocket-money ledger + Together Time + savings match + premium
  const [owed,setOwed]=useState({}); const [tt,setTt]=useState(false); const [requests,setRequests]=useState([]);
  const [savings,setSavingsMap]=useState({}); const [prem,setPrem]=useState(false);
  const [allowance,setAllowance]=useState({}); const [members,setMembers]=useState([]);
  const [mName,setMName]=useState(""); const [mEmoji,setMEmoji]=useState("👵");
  const [giftFrom,setGiftFrom]=useState(""); const [giftKid,setGiftKid]=useState(""); const [giftCoins,setGiftCoins]=useState(20); const [giftMsg,setGiftMsg]=useState("");
  // Collapsible sections keep the Tasks tab short — open only what you need.
  const [showStore,setShowStore]=useState(false); const [showExtras,setShowExtras]=useState(false);

  // Load each kid's saved state to show real performance
  useEffect(()=>{ (async()=>{
    const out={};
    for(const k of kids){ const st=await loadData(stateKey(k.id)); if(st) out[k.id]=st; }
    setKidStates(out);
  })(); },[kids]);
  useEffect(()=>{ (async()=>{ setTasks(await loadTasks()); setStore(await loadStore()); setClaims(await loadClaims()); setOwed(await loadOwed()); setTt(!!(await loadSettings()).togetherTime); setRequests(await loadRequests()); setSavingsMap(await loadSavings()); setAllowance(await loadAllowance()); setMembers(await loadFamily()); const r=await loadData("toybox:family:premium"); setPrem(r===true||r==="1"||r===1); })(); },[]);
  const setMatch=(kidId,pct)=>{ const sv={...savings}; if(sv[kidId]){ sv[kidId]={...sv[kidId],matchPct:pct}; setSavingsMap(sv); saveSavings(sv); } };
  const setAllow=(kidId,patch)=>{ const a={...allowance}; a[kidId]={amount:20,type:"coins",enabled:false,...(a[kidId]||{}),...patch}; setAllowance(a); saveAllowance(a); };
  const addMember=()=>{ const name=mName.trim(); if(!name) return; const next=[...members,{id:uid(),name,emoji:mEmoji||"👤"}]; setMembers(next); saveFamily(next); setMName(""); if(!giftFrom) setGiftFrom(name); };
  const delMember=(id)=>{ const next=members.filter(m=>m.id!==id); setMembers(next); saveFamily(next); };
  const sendGift=()=>{ if(!giftKid||!giftFrom) return; (async()=>{ const g=await loadGifts(); g.unshift({id:uid(),kidId:giftKid,from:giftFrom,emoji:"🎁",coins:Math.max(0,+giftCoins||0),message:giftMsg.trim(),at:Date.now()}); await saveGifts(g); })(); try{ window.toyboxSync?.notify?.(`🎁 ${giftFrom} sent ${kidName(giftKid)} a gift! They'll open it in Toybox.`); }catch(e){} setGiftMsg(""); };
  useEffect(()=>{ if(!nKid && kids.length) setNKid(kids[0].id); },[kids]);
  const toggleTt=()=>{ const v=!tt; setTt(v); saveSettings({togetherTime:v}); };
  const markPaid=(kidId)=>{ const o={...owed,[kidId]:0}; setOwed(o); saveOwed(o); };
  const answerRequest=(id,status)=>{ const next=requests.map(r=>r.id===id?{...r,status}:r); setRequests(next); saveRequests(next); if(status==="yes"){ const r=requests.find(x=>x.id===id); try{ window.toyboxSync?.notify?.(`💛 You said YES to ${kidName(r?.kidId)}'s together-time wish: "${r?.text}". They'll be so happy!`); }catch(e){} } };
  const delRequest=(id)=>{ const next=requests.filter(r=>r.id!==id); setRequests(next); saveRequests(next); };

  const kidTotal=(k)=>{ const st=kidStates[k.id]; if(!st) return k.cash||1000; return (st.lastValue ?? ((st.cash||0))); };
  const kidGain=(k)=>kidTotal(k)-1000;
  const kidName=(id)=>kids.find(k=>k.id===id)?.name||"Your child";

  const assignTask=()=>{
    const title=nTitle.trim(); if(!title||!nKid) return;
    const reward=nType==="coins"?{type:"coins",coins:Math.max(1,+nCoins||1)}
      :nType==="money"?{type:"money",money:Math.max(0.5,+nMoney||1)}
      :{type:"custom",label:nLabel.trim()||"a reward",emoji:nEmoji||"🎁"};
    const t={id:uid(),kidId:nKid,title,cat:nCat,reward,recurring:nRecur,status:"todo",createdAt:Date.now()};
    const next=[t,...tasks]; setTasks(next); saveTasks(next);
    setNTitle(""); setNLabel("");
    try{ window.toyboxSync?.notify?.(`📋 New task for ${kidName(nKid)}: "${title}". They'll see it in Toybox → ✅ My Tasks.`); }catch(e){}
  };
  const setTaskStatus=(id,status)=>{ const next=tasks.map(t=>t.id===id?{...t,status}:t); setTasks(next); saveTasks(next); };
  const delTask=(id)=>{ const next=tasks.filter(t=>t.id!==id); setTasks(next); saveTasks(next); };
  const addStoreItem=()=>{ const name=sName.trim(); if(!name) return; const next=[{id:uid(),name,emoji:sEmoji||"🎁",cost:Math.max(1,+sCost||1)},...store]; setStore(next); saveStore(next); setSName(""); };
  const delStoreItem=(id)=>{ const next=store.filter(s=>s.id!==id); setStore(next); saveStore(next); };
  const fulfillClaim=(id)=>{ const next=claims.map(c=>c.id===id?{...c,given:true}:c); setClaims(next); saveClaims(next); };

  const pending=tasks.filter(t=>t.status==="pending");
  const openClaims=claims.filter(c=>!c.given);
  // Everything that needs the parent to act — drives the Tasks tab badge.
  const attention=pending.length+openClaims.length+kids.filter(k=>(owed[k.id]||0)>0).length+requests.filter(r=>r.status==="asked").length;

  return(
    <div className="dash" style={{background:"linear-gradient(160deg,#021a0e 0%,#052e16 50%,#021a0e 100%)"}}>
      <div className="topbar">
        <div className="tb-av" style={{fontSize:22}}>👔</div>
        <div style={{flex:1}}><div className="tb-name">Parent Dashboard</div><div className="tb-sub">Track your kids' performance</div></div>
        <div className="tb-chip" style={{background:"rgba(16,185,129,.15)",border:"1px solid rgba(16,185,129,.25)",color:"#86efac"}}>🔐 Verified</div>
      </div>
      <div className="main">
        {kids.length>0&&(
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            {[["perf","📊 Kids"],["tasks","✅ Tasks"],["report","📈 Report"]].map(([k,l])=>(
              <button key={k} onClick={()=>setPv(k)} style={{position:"relative",flex:1,padding:"9px 4px",borderRadius:11,border:`1.5px solid ${pv===k?"rgba(16,185,129,.5)":"rgba(255,255,255,.14)"}`,background:pv===k?"rgba(16,185,129,.16)":"transparent",color:pv===k?"#fff":"rgba(255,255,255,.5)",fontFamily:"var(--fd)",fontSize:12,cursor:"pointer"}}>{l}
                {k==="tasks"&&attention>0&&(
                  <span onClick={e=>{e.stopPropagation();setPv("tasks");}} title={`${attention} thing${attention>1?"s":""} need your attention`} style={{position:"absolute",top:-7,right:-6,minWidth:20,height:20,padding:"0 5px",borderRadius:100,background:"#ef4444",color:"#fff",fontFamily:"var(--fd)",fontSize:11,lineHeight:"20px",boxShadow:"0 2px 6px rgba(239,68,68,.5)",border:"2px solid #052e16",boxSizing:"border-box",cursor:"pointer"}}>{attention>9?"9+":attention}</span>
                )}
              </button>
            ))}
          </div>
        )}
        {pv==="perf"&&(<>
        {kids.length===0?(
          <div style={{textAlign:"center",padding:"48px 20px"}}>
            <div style={{fontSize:54,marginBottom:14}}>👶</div>
            <div style={{fontFamily:"var(--fd)",fontSize:20,color:"#fff",marginBottom:8}}>No kids registered yet!</div>
            <div style={{fontSize:13,color:"rgba(255,255,255,.55)",fontWeight:600,lineHeight:1.65}}>Ask your kids to open Toybox Trader and create their own account. Their profiles and performance will appear here automatically!</div>
          </div>
        ):(
          kids.map(k=>{
            const st=kidStates[k.id];
            const total=kidTotal(k);
            const gain=kidGain(k);
            const realized=st?.trades?.filter(t=>t.side==="SELL"&&t.pnl!=null).reduce((s,t)=>s+t.pnl,0)||0;
            const tradeCount=st?.trades?.length||0;
            const lessonsDone=st?.doneLesson?.length||0;
            return(
              <div key={k.id} style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.12)",borderRadius:"var(--rl)",padding:16,marginBottom:12}}>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                  <div style={{fontSize:38}}>{k.avatar}</div>
                  <div style={{flex:1}}><div style={{fontFamily:"var(--fd)",fontSize:18,color:"#fff"}}>{k.name}</div><div style={{fontSize:11,color:"rgba(255,255,255,.45)",fontWeight:600}}>Age {k.age} · Joined {k.joinedAt}</div></div>
                  <div style={{textAlign:"right"}}><div style={{fontFamily:"var(--fd)",fontSize:18,color:"#fff"}}>{f$(total)}</div><div style={{fontSize:10,color:"rgba(255,255,255,.4)",fontWeight:700}}>Money Garden</div></div>
                </div>
                {/* Performance row */}
                <div style={{display:"flex",gap:8,marginBottom:10}}>
                  <div style={{flex:1,background:gain>=0?"rgba(16,185,129,.1)":"rgba(239,68,68,.1)",borderRadius:10,padding:"8px 10px",textAlign:"center"}}>
                    <div style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,.4)",textTransform:"uppercase"}}>All-time</div>
                    <div style={{fontFamily:"var(--fd)",fontSize:15,color:gain>=0?"#86efac":"#fca5a5"}}>{gain>=0?"+":""}{f$(gain)}</div>
                  </div>
                  <div style={{flex:1,background:realized>=0?"rgba(16,185,129,.1)":"rgba(239,68,68,.1)",borderRadius:10,padding:"8px 10px",textAlign:"center"}}>
                    <div style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,.4)",textTransform:"uppercase"}}>Realized</div>
                    <div style={{fontFamily:"var(--fd)",fontSize:15,color:realized>=0?"#86efac":"#fca5a5"}}>{realized>=0?"+":""}{f$(realized)}</div>
                  </div>
                  <div style={{flex:1,background:"rgba(255,255,255,.06)",borderRadius:10,padding:"8px 10px",textAlign:"center"}}>
                    <div style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,.4)",textTransform:"uppercase"}}>Trades</div>
                    <div style={{fontFamily:"var(--fd)",fontSize:15,color:"#fff"}}>{tradeCount}</div>
                  </div>
                </div>
                <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                  {[["🔐","2FA"],["🪙",`${st?.coins??k.coins} coins`],["🎓",`${lessonsDone}/${LESSONS.length} lessons`],["🔥",`${st?.streak??0}d streak`]].map(([ic,lb])=>(
                    <div key={lb} style={{fontSize:11,fontWeight:800,background:"rgba(255,255,255,.09)",color:"rgba(255,255,255,.7)",padding:"4px 10px",borderRadius:100}}>{ic} {lb}</div>
                  ))}
                </div>
                {/* Recent trades */}
                {st?.trades?.length>0&&(
                  <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid rgba(255,255,255,.08)"}}>
                    <div style={{fontSize:10,fontWeight:800,color:"rgba(255,255,255,.4)",textTransform:"uppercase",marginBottom:8}}>Recent Trades</div>
                    {st.trades.slice(0,3).map(t=>(
                      <div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",fontSize:12}}>
                        <span style={{fontSize:16}}>{t.icon}</span>
                        <span style={{fontWeight:700,color:"rgba(255,255,255,.7)",flex:1}}>{t.side} {t.name}</span>
                        <span style={{fontWeight:700,color:"rgba(255,255,255,.5)"}}>{t.date}</span>
                        {t.side==="SELL"&&t.pnl!=null&&<span style={{fontWeight:800,color:t.pnl>=0?"#86efac":"#fca5a5"}}>{t.pnl>=0?"+":""}{f$(t.pnl)}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {/* ── Weekly update + discussion prompts ── */}
                {(()=>{
                  const allTrades = st?.trades||[];
                  const sells = allTrades.filter(t=>t.side==="SELL"&&t.pnl!=null);
                  const bestSell = sells.length? sells.reduce((b,t)=>t.pnl>b.pnl?t:b, sells[0]) : null;
                  const worstSell= sells.length? sells.reduce((w,t)=>t.pnl<w.pnl?t:w, sells[0]) : null;
                  const lastBuy = allTrades.find(t=>t.side==="BUY");
                  // Build discussion prompts from real activity
                  const prompts=[];
                  if(bestSell&&bestSell.pnl>0) prompts.push(`Ask ${k.name} why selling ${bestSell.name} worked out — what was the clue it was a good time?`);
                  if(worstSell&&worstSell.pnl<0) prompts.push(`${k.name} lost money on ${worstSell.name}. Ask what they learned — would they do it differently?`);
                  if(lastBuy) prompts.push(`Ask ${k.name} what ${lastBuy.name} actually does as a company — do they understand what they own?`);
                  if(lessonsDone<8) prompts.push(`${k.name} has ${8-lessonsDone} lessons left. Ask which one they want to try next!`);
                  if(allTrades.length===0) prompts.push(`${k.name} hasn't traded yet. Ask what's holding them back — maybe explore the market together!`);
                  if(prompts.length===0) prompts.push(`Ask ${k.name} what their strategy is for growing their Money Garden this month.`);
                  return(
                    <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid rgba(255,255,255,.08)"}}>
                      <div style={{fontSize:10,fontWeight:800,color:"rgba(255,255,255,.4)",textTransform:"uppercase",marginBottom:8}}>📅 This Week's Summary</div>
                      <div style={{background:"rgba(255,255,255,.05)",borderRadius:12,padding:12,marginBottom:10}}>
                        <div style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.75)",lineHeight:1.7}}>
                          {k.name} made <strong style={{color:"#fff"}}>{allTrades.length} trade{allTrades.length!==1?"s":""}</strong>, completed <strong style={{color:"#fff"}}>{lessonsDone} lesson{lessonsDone!==1?"s":""}</strong>, and is <strong style={{color:gain>=0?"#86efac":"#fca5a5"}}>{gain>=0?"up":"down"} {f$(Math.abs(gain))}</strong> overall.
                          {bestSell&&bestSell.pnl>0&&<> Best trade: <strong style={{color:"#86efac"}}>{bestSell.name} (+{f$(bestSell.pnl)})</strong>.</>}
                        </div>
                      </div>
                      <div style={{fontSize:10,fontWeight:800,color:"rgba(255,255,255,.4)",textTransform:"uppercase",marginBottom:8}}>💬 Talk About It Together</div>
                      {prompts.slice(0,3).map((p,i)=>(
                        <div key={i} style={{display:"flex",gap:8,padding:"7px 0",fontSize:12,fontWeight:600,color:"rgba(255,255,255,.7)",lineHeight:1.5}}>
                          <span style={{flexShrink:0}}>💬</span>{p}
                        </div>
                      ))}
                      {/* Parent controls */}
                      <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid rgba(255,255,255,.08)",display:"flex",gap:8}}>
                        <button onClick={()=>{setResetGain(75);setConfirmReset({kid:k,mode:"money"});}} style={{flex:1,padding:"9px 4px",borderRadius:10,border:"1px solid rgba(16,185,129,.35)",background:"rgba(16,185,129,.12)",color:"#86efac",fontFamily:"var(--fb)",fontSize:11,fontWeight:800,cursor:"pointer",lineHeight:1.25}}>💵 Reset money</button>
                        <button onClick={()=>setConfirmReset({kid:k,mode:"reset"})} style={{flex:1,padding:"9px 4px",borderRadius:10,border:"1px solid rgba(245,158,11,.3)",background:"rgba(245,158,11,.1)",color:"#fde68a",fontFamily:"var(--fb)",fontSize:11,fontWeight:800,cursor:"pointer",lineHeight:1.25}}>🔄 Reset all</button>
                        <button onClick={()=>setConfirmReset({kid:k,mode:"remove"})} style={{flex:1,padding:"9px 4px",borderRadius:10,border:"1px solid rgba(239,68,68,.3)",background:"rgba(239,68,68,.1)",color:"#fca5a5",fontFamily:"var(--fb)",fontSize:11,fontWeight:800,cursor:"pointer",lineHeight:1.25}}>🗑️ Remove</button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })
        )}
        <div style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",borderRadius:14,padding:14,marginTop:8}}>
          <div style={{fontFamily:"var(--fd)",fontSize:14,color:"#fff",marginBottom:10}}>📋 How it works</div>
          {["Each kid's progress saves automatically — closing the app never loses their data","You see real profit/loss tracking: all-time gains AND realized P&L from sells","Every buy and sell is logged with date and profit/loss","Kids can't access parent mode — it's behind a separate PIN + 2FA"].map((t,i)=>(
            <div key={i} style={{fontSize:12,fontWeight:600,color:"rgba(255,255,255,.6)",padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,.07)",display:"flex",gap:8}}><span style={{color:"#86efac",flexShrink:0}}>→</span>{t}</div>
          ))}
        </div>
        </>)}

        {pv==="tasks"&&(<>
          {kids.length===0?(
            <div style={{textAlign:"center",padding:"40px 20px"}}>
              <div style={{fontSize:48,marginBottom:12}}>✅</div>
              <div style={{fontFamily:"var(--fd)",fontSize:18,color:"#fff",marginBottom:8}}>Assign tasks & rewards</div>
              <div style={{fontSize:13,color:"rgba(255,255,255,.55)",fontWeight:600,lineHeight:1.6}}>Once your kids have accounts, give them tasks (homework, chores, reading…) and reward them with coins or your own rewards. No real money — coins live in the app and can even be invested!</div>
            </div>
          ):(<>
            {/* Pending approvals */}
            {pending.length>0&&(
              <div style={{marginBottom:16}}>
                <div style={{fontFamily:"var(--fd)",fontSize:15,color:"#fde68a",marginBottom:8}}>⏳ Waiting for your OK ({pending.length})</div>
                {pending.map(t=>(
                  <div key={t.id} style={{background:"rgba(245,158,11,.1)",border:"1px solid rgba(245,158,11,.3)",borderRadius:14,padding:13,marginBottom:9}}>
                    <div style={{fontSize:13,fontWeight:800,color:"#fff",marginBottom:2}}>{catOf(t.cat).icon} {t.title}</div>
                    <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.55)",marginBottom:10}}>{kidName(t.kidId)} says it's done · reward {t.reward.type==="coins"?`🪙 ${t.reward.coins}`:`${t.reward.emoji} ${t.reward.label}`}</div>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>setTaskStatus(t.id,"approved")} style={{flex:1,padding:"9px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#10b981,#059669)",color:"#fff",fontFamily:"var(--fd)",fontSize:13,cursor:"pointer"}}>✓ Approve</button>
                      <button onClick={()=>setTaskStatus(t.id,"todo")} style={{flex:1,padding:"9px",borderRadius:10,border:"1px solid rgba(255,255,255,.2)",background:"transparent",color:"rgba(255,255,255,.6)",fontFamily:"var(--fd)",fontSize:13,cursor:"pointer"}}>↩ Not yet</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Claims to fulfill */}
            {openClaims.length>0&&(
              <div style={{marginBottom:16}}>
                <div style={{fontFamily:"var(--fd)",fontSize:15,color:"#c4b5fd",marginBottom:8}}>🎁 Rewards to give ({openClaims.length})</div>
                {openClaims.map(c=>(
                  <div key={c.id} style={{display:"flex",alignItems:"center",gap:10,background:"rgba(124,58,237,.1)",border:"1px solid rgba(124,58,237,.3)",borderRadius:14,padding:12,marginBottom:9}}>
                    <span style={{fontSize:24}}>{c.emoji}</span>
                    <div style={{flex:1}}><div style={{fontSize:13,fontWeight:800,color:"#fff"}}>{c.itemName}</div><div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.55)"}}>{kidName(c.kidId)} redeemed for {c.cost} 🪙</div></div>
                    <button onClick={()=>fulfillClaim(c.id)} style={{padding:"8px 12px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#10b981,#059669)",color:"#fff",fontFamily:"var(--fd)",fontSize:12,cursor:"pointer"}}>✓ Given</button>
                  </div>
                ))}
              </div>
            )}

            {/* Pocket-money ledger (tracking only) */}
            {kids.some(k=>(owed[k.id]||0)>0)&&(
              <div style={{background:"rgba(16,185,129,.08)",border:"1px solid rgba(16,185,129,.25)",borderRadius:16,padding:15,marginBottom:16}}>
                <div style={{fontFamily:"var(--fd)",fontSize:15,color:"#86efac",marginBottom:3}}>💵 Pocket money to pay</div>
                <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.5)",lineHeight:1.5,marginBottom:11}}>The app only tracks this — pay your child directly, then tap “Paid”.</div>
                {kids.filter(k=>(owed[k.id]||0)>0).map(k=>(
                  <div key={k.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0"}}>
                    <span style={{fontSize:22}}>{k.avatar}</span>
                    <div style={{flex:1}}><div style={{fontSize:14,fontWeight:800,color:"#fff"}}>{k.name}</div><div style={{fontFamily:"var(--fd)",fontSize:15,color:"#86efac"}}>{f$(owed[k.id])}</div></div>
                    <button onClick={()=>markPaid(k.id)} style={{padding:"8px 14px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#10b981,#059669)",color:"#fff",fontFamily:"var(--fd)",fontSize:12,cursor:"pointer"}}>✓ Paid</button>
                  </div>
                ))}
              </div>
            )}

            {/* Assign a task */}
            <div style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)",borderRadius:16,padding:15,marginBottom:16}}>
              <div style={{fontFamily:"var(--fd)",fontSize:16,color:"#fff",marginBottom:12}}>➕ Give a task</div>
              <div style={{fontSize:11,fontWeight:800,color:"rgba(255,255,255,.45)",marginBottom:6}}>WHO</div>
              <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:12}}>
                {kids.map(k=>(<button key={k.id} onClick={()=>setNKid(k.id)} style={{padding:"7px 13px",borderRadius:100,border:`1.5px solid ${nKid===k.id?"rgba(16,185,129,.5)":"rgba(255,255,255,.15)"}`,background:nKid===k.id?"rgba(16,185,129,.16)":"transparent",color:nKid===k.id?"#fff":"rgba(255,255,255,.55)",fontFamily:"var(--fb)",fontSize:12,fontWeight:800,cursor:"pointer"}}>{k.avatar} {k.name}</button>))}
              </div>
              <div style={{fontSize:11,fontWeight:800,color:"rgba(255,255,255,.45)",marginBottom:6}}>WHAT</div>
              <input value={nTitle} onChange={e=>setNTitle(e.target.value)} placeholder="e.g. Read for 20 minutes" style={{width:"100%",padding:"11px 12px",borderRadius:11,border:"1.5px solid rgba(255,255,255,.18)",background:"rgba(255,255,255,.06)",color:"#fff",fontFamily:"var(--fb)",fontSize:14,fontWeight:600,marginBottom:8,boxSizing:"border-box"}}/>
              <div style={{display:"flex",gap:6,overflowX:"auto",marginBottom:12,scrollbarWidth:"none"}}>
                {TEMPLATES.map((tp,i)=>(<button key={i} onClick={()=>{setNTitle(tp.title);setNCat(tp.cat);}} style={{flexShrink:0,padding:"6px 11px",borderRadius:100,border:"1px solid rgba(255,255,255,.14)",background:"rgba(255,255,255,.05)",color:"rgba(255,255,255,.65)",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>{catOf(tp.cat).icon} {tp.title}</button>))}
              </div>
              <div style={{fontSize:11,fontWeight:800,color:"rgba(255,255,255,.45)",marginBottom:6}}>CATEGORY</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                {TASK_CATS.map(c=>(<button key={c.id} onClick={()=>setNCat(c.id)} style={{padding:"6px 11px",borderRadius:100,border:`1.5px solid ${nCat===c.id?"rgba(124,58,237,.5)":"rgba(255,255,255,.14)"}`,background:nCat===c.id?"rgba(124,58,237,.16)":"transparent",color:nCat===c.id?"#fff":"rgba(255,255,255,.5)",fontSize:11,fontWeight:800,cursor:"pointer"}}>{c.icon} {c.label}</button>))}
              </div>
              <div style={{fontSize:11,fontWeight:800,color:"rgba(255,255,255,.45)",marginBottom:6}}>REWARD</div>
              <div style={{display:"flex",gap:6,marginBottom:8}}>
                <button onClick={()=>setNType("coins")} style={{flex:1,padding:"9px 4px",borderRadius:10,border:`1.5px solid ${nType==="coins"?"rgba(245,158,11,.5)":"rgba(255,255,255,.14)"}`,background:nType==="coins"?"rgba(245,158,11,.14)":"transparent",color:nType==="coins"?"#fde68a":"rgba(255,255,255,.5)",fontFamily:"var(--fd)",fontSize:12,cursor:"pointer"}}>🪙 Coins</button>
                <button onClick={()=>setNType("money")} style={{flex:1,padding:"9px 4px",borderRadius:10,border:`1.5px solid ${nType==="money"?"rgba(16,185,129,.5)":"rgba(255,255,255,.14)"}`,background:nType==="money"?"rgba(16,185,129,.14)":"transparent",color:nType==="money"?"#86efac":"rgba(255,255,255,.5)",fontFamily:"var(--fd)",fontSize:12,cursor:"pointer"}}>💵 Money</button>
                <button onClick={()=>setNType("custom")} style={{flex:1,padding:"9px 4px",borderRadius:10,border:`1.5px solid ${nType==="custom"?"rgba(124,58,237,.5)":"rgba(255,255,255,.14)"}`,background:nType==="custom"?"rgba(124,58,237,.14)":"transparent",color:nType==="custom"?"#fff":"rgba(255,255,255,.5)",fontFamily:"var(--fd)",fontSize:12,cursor:"pointer"}}>🎁 Custom</button>
              </div>
              {nType==="coins"?(
                <div style={{display:"flex",gap:7,marginBottom:12}}>
                  {[10,20,50,100].map(n=>(<button key={n} onClick={()=>setNCoins(n)} style={{flex:1,padding:"9px",borderRadius:10,border:`1.5px solid ${nCoins===n?"rgba(245,158,11,.5)":"rgba(255,255,255,.14)"}`,background:nCoins===n?"rgba(245,158,11,.14)":"transparent",color:nCoins===n?"#fde68a":"rgba(255,255,255,.5)",fontFamily:"var(--fd)",fontSize:13,cursor:"pointer"}}>{n}</button>))}
                </div>
              ):nType==="money"?(
                <div style={{marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                    <span style={{fontFamily:"var(--fd)",fontSize:18,color:"#86efac"}}>$</span>
                    <input value={nMoney} onChange={e=>setNMoney(e.target.value.replace(/[^\d.]/g,""))} inputMode="decimal" style={{flex:1,padding:"10px 12px",borderRadius:11,border:"1.5px solid rgba(255,255,255,.18)",background:"rgba(255,255,255,.06)",color:"#fff",fontFamily:"var(--fd)",fontSize:16,boxSizing:"border-box"}}/>
                    <div style={{display:"flex",gap:5}}>{[1,2,5].map(n=>(<button key={n} onClick={()=>setNMoney(n)} style={{padding:"8px 10px",borderRadius:9,border:"1px solid rgba(16,185,129,.3)",background:"rgba(16,185,129,.1)",color:"#86efac",fontFamily:"var(--fd)",fontSize:12,cursor:"pointer"}}>${n}</button>))}</div>
                  </div>
                  <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.4)",lineHeight:1.5}}>💡 The app only <strong style={{color:"rgba(255,255,255,.6)"}}>keeps track</strong> of this pocket money — it never moves real money. You pay your child directly, however you like. This is family allowance, not a job.</div>
                </div>
              ):(
                <div style={{display:"flex",gap:7,marginBottom:12}}>
                  <input value={nEmoji} onChange={e=>setNEmoji(e.target.value.slice(0,2))} style={{width:52,padding:"11px",borderRadius:11,border:"1.5px solid rgba(255,255,255,.18)",background:"rgba(255,255,255,.06)",color:"#fff",fontSize:20,textAlign:"center",boxSizing:"border-box"}}/>
                  <input value={nLabel} onChange={e=>setNLabel(e.target.value)} placeholder="e.g. 30 min screen time, a Lego set…" style={{flex:1,padding:"11px 12px",borderRadius:11,border:"1.5px solid rgba(255,255,255,.18)",background:"rgba(255,255,255,.06)",color:"#fff",fontFamily:"var(--fb)",fontSize:13,fontWeight:600,boxSizing:"border-box"}}/>
                </div>
              )}
              <div style={{fontSize:11,fontWeight:800,color:"rgba(255,255,255,.45)",marginBottom:6}}>HOW OFTEN</div>
              <div style={{display:"flex",gap:7,marginBottom:14}}>
                {[["once","Once"],["daily","Every day"],["weekly","Every week"]].map(([v,l])=>(<button key={v} onClick={()=>setNRecur(v)} style={{flex:1,padding:"9px",borderRadius:10,border:`1.5px solid ${nRecur===v?"rgba(255,255,255,.4)":"rgba(255,255,255,.14)"}`,background:nRecur===v?"rgba(255,255,255,.12)":"transparent",color:nRecur===v?"#fff":"rgba(255,255,255,.5)",fontFamily:"var(--fb)",fontSize:12,fontWeight:800,cursor:"pointer"}}>{l}</button>))}
              </div>
              <button onClick={assignTask} disabled={!nTitle.trim()} style={{width:"100%",padding:13,borderRadius:13,border:"none",background:nTitle.trim()?"linear-gradient(135deg,#10b981,#059669)":"rgba(255,255,255,.1)",color:nTitle.trim()?"#fff":"rgba(255,255,255,.4)",fontFamily:"var(--fd)",fontSize:15,cursor:nTitle.trim()?"pointer":"default"}}>Give this task 📋</button>
            </div>

            {/* Active tasks */}
            {tasks.filter(t=>t.status!=="done").length>0&&(
              <div style={{marginBottom:16}}>
                <div style={{fontFamily:"var(--fd)",fontSize:14,color:"#fff",marginBottom:8}}>📋 Active tasks</div>
                {tasks.filter(t=>t.status!=="done").map(t=>(
                  <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,background:"rgba(255,255,255,.05)",borderRadius:12,padding:"10px 12px",marginBottom:7}}>
                    <span style={{fontSize:18}}>{catOf(t.cat).icon}</span>
                    <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:800,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.title}</div><div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.45)"}}>{kidName(t.kidId)} · {t.status==="pending"?"⏳ waiting":t.status==="approved"?"✓ approved":"to do"} · {t.reward.type==="coins"?`🪙${t.reward.coins}`:t.reward.emoji}</div></div>
                    <button onClick={()=>delTask(t.id)} style={{background:"none",border:"none",color:"rgba(255,255,255,.3)",fontSize:16,cursor:"pointer"}}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* Reward store editor — collapsible */}
            <div style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)",borderRadius:16,padding:15,marginBottom:16}}>
              <button onClick={()=>setShowStore(s=>!s)} style={{width:"100%",display:"flex",alignItems:"center",gap:8,background:"none",border:"none",padding:0,cursor:"pointer",textAlign:"left"}}>
                <div style={{flex:1}}>
                  <div style={{fontFamily:"var(--fd)",fontSize:16,color:"#fff"}}>🎁 Reward Store {store.length>0&&<span style={{fontSize:11,fontWeight:800,color:"rgba(255,255,255,.4)"}}>· {store.length}</span>}</div>
                  <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.5)",marginTop:2}}>Things kids buy with saved coins</div>
                </div>
                <span style={{fontSize:14,color:"rgba(255,255,255,.5)",transform:showStore?"rotate(180deg)":"none",transition:"transform .2s"}}>▾</span>
              </button>
              {showStore&&(<div style={{marginTop:12}}>
              <div style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.55)",lineHeight:1.5,marginBottom:12}}>Add rewards kids can buy with saved coins (a toy, screen time, an outing). You give the real reward when they redeem it.</div>
              {store.map(it=>(
                <div key={it.id} style={{display:"flex",alignItems:"center",gap:10,background:"rgba(255,255,255,.05)",borderRadius:11,padding:"9px 11px",marginBottom:7}}>
                  <span style={{fontSize:22}}>{it.emoji}</span>
                  <div style={{flex:1}}><div style={{fontSize:13,fontWeight:800,color:"#fff"}}>{it.name}</div><div style={{fontSize:11,fontWeight:800,color:"#fde68a"}}>🪙 {it.cost}</div></div>
                  <button onClick={()=>delStoreItem(it.id)} style={{background:"none",border:"none",color:"rgba(255,255,255,.3)",fontSize:16,cursor:"pointer"}}>✕</button>
                </div>
              ))}
              <div style={{display:"flex",gap:7,marginTop:8}}>
                <input value={sEmoji} onChange={e=>setSEmoji(e.target.value.slice(0,2))} style={{width:48,padding:"10px",borderRadius:10,border:"1.5px solid rgba(255,255,255,.18)",background:"rgba(255,255,255,.06)",color:"#fff",fontSize:18,textAlign:"center",boxSizing:"border-box"}}/>
                <input value={sName} onChange={e=>setSName(e.target.value)} placeholder="Reward name" style={{flex:1,padding:"10px 11px",borderRadius:10,border:"1.5px solid rgba(255,255,255,.18)",background:"rgba(255,255,255,.06)",color:"#fff",fontFamily:"var(--fb)",fontSize:13,fontWeight:600,boxSizing:"border-box"}}/>
                <input value={sCost} onChange={e=>setSCost(e.target.value.replace(/\D/g,""))} inputMode="numeric" style={{width:60,padding:"10px",borderRadius:10,border:"1.5px solid rgba(255,255,255,.18)",background:"rgba(255,255,255,.06)",color:"#fff",fontSize:14,textAlign:"center",boxSizing:"border-box"}}/>
              </div>
              <button onClick={addStoreItem} disabled={!sName.trim()} style={{width:"100%",marginTop:8,padding:11,borderRadius:11,border:"none",background:sName.trim()?"rgba(124,58,237,.3)":"rgba(255,255,255,.08)",color:sName.trim()?"#fff":"rgba(255,255,255,.4)",fontFamily:"var(--fd)",fontSize:13,cursor:sName.trim()?"pointer":"default"}}>+ Add reward</button>
              </div>)}
            </div>

            {/* More Family Tools — collapsible group for bonding + Plus features */}
            <button onClick={()=>setShowExtras(s=>!s)} style={{width:"100%",display:"flex",alignItems:"center",gap:10,background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)",borderRadius:16,padding:15,marginBottom:16,cursor:"pointer",textAlign:"left"}}>
              <span style={{fontSize:22}}>⭐</span>
              <div style={{flex:1}}>
                <div style={{fontFamily:"var(--fd)",fontSize:16,color:"#fff"}}>More Family Tools</div>
                <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.5)",marginTop:2}}>Together Time, Savings Match, Allowance & Family Circle</div>
              </div>
              <span style={{fontSize:14,color:"rgba(255,255,255,.5)",transform:showExtras?"rotate(180deg)":"none",transition:"transform .2s"}}>▾</span>
            </button>
            {showExtras&&(<>

            {/* Together Time — kids ask parents for shared time (toggle) */}
            <div style={{background:"rgba(236,72,153,.08)",border:"1px solid rgba(236,72,153,.25)",borderRadius:16,padding:15,marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                <div style={{flex:1}}>
                  <div style={{fontFamily:"var(--fd)",fontSize:16,color:"#fff"}}>💛 Together Time</div>
                  <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.55)",lineHeight:1.5,marginTop:2}}>Let your kids ask you to spend time together, teach them something, or do a fun activity. Builds your bond — no coins involved.</div>
                </div>
                <button onClick={toggleTt} aria-label="Toggle Together Time" style={{flexShrink:0,width:54,height:30,borderRadius:100,border:"none",background:tt?"#ec4899":"rgba(255,255,255,.15)",position:"relative",cursor:"pointer",transition:"background .2s"}}>
                  <span style={{position:"absolute",top:3,left:tt?27:3,width:24,height:24,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
                </button>
              </div>
              {!tt&&<div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.4)",marginTop:6}}>Turn this on to let your kids send you together-time wishes. 💛</div>}
              {tt&&(<>
                {requests.filter(r=>r.status!=="done").length===0
                  ?<div style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.5)",marginTop:10,textAlign:"center",lineHeight:1.5}}>It's on! When your kids send a wish, it'll show up here. 🤗</div>
                  :requests.filter(r=>r.status!=="done").map(r=>(
                    <div key={r.id} style={{background:"rgba(255,255,255,.05)",borderRadius:12,padding:12,marginTop:10}}>
                      <div style={{fontSize:13,fontWeight:800,color:"#fff",marginBottom:2}}>{reqCatOf(r.cat).icon} {r.text}</div>
                      <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.5)",marginBottom:10}}>from {kidName(r.kidId)}{r.status==="yes"?" · you said yes 💛":""}</div>
                      <div style={{display:"flex",gap:8}}>
                        {r.status==="asked"?(<>
                          <button onClick={()=>answerRequest(r.id,"yes")} style={{flex:1,padding:"9px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#ec4899,#db2777)",color:"#fff",fontFamily:"var(--fd)",fontSize:13,cursor:"pointer"}}>💛 Yes!</button>
                          <button onClick={()=>delRequest(r.id)} style={{flex:1,padding:"9px",borderRadius:10,border:"1px solid rgba(255,255,255,.2)",background:"transparent",color:"rgba(255,255,255,.6)",fontFamily:"var(--fd)",fontSize:13,cursor:"pointer"}}>Maybe later</button>
                        </>):(
                          <button onClick={()=>answerRequest(r.id,"done")} style={{flex:1,padding:"9px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#10b981,#059669)",color:"#fff",fontFamily:"var(--fd)",fontSize:13,cursor:"pointer"}}>✓ We did it together!</button>
                        )}
                      </div>
                    </div>
                  ))}
              </>)}
            </div>

            {/* Savings Match — PLUS feature */}
            <div style={{background:"linear-gradient(135deg,rgba(124,58,237,.12),rgba(245,158,11,.06))",border:"1px solid rgba(124,58,237,.3)",borderRadius:16,padding:15,marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <div style={{fontFamily:"var(--fd)",fontSize:16,color:"#fff"}}>🏦 Savings Match</div>
                <span style={{fontSize:10,fontWeight:800,background:"rgba(124,58,237,.3)",color:"#c4b5fd",padding:"2px 8px",borderRadius:100}}>⭐ PLUS</span>
              </div>
              <div style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.6)",lineHeight:1.5,marginBottom:12}}>Reward saving! For every 100 coins your child puts in their Savings Jar, you add a bonus — teaching them how a savings “match” grows money (just like grown-up retirement accounts). 💜</div>
              {!prem?(
                <div style={{background:"rgba(124,58,237,.1)",border:"1px solid rgba(124,58,237,.25)",borderRadius:12,padding:13,textAlign:"center"}}>
                  <div style={{fontSize:12,fontWeight:800,color:"#c4b5fd",lineHeight:1.5}}>Unlock <strong style={{color:"#fff"}}>Toybox Plus</strong> to add a savings match. Tap the ☁️ button → Toybox Plus.</div>
                </div>
              ):kids.length===0?(
                <div style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.5)"}}>Kids need accounts first.</div>
              ):kids.map(k=>{
                const g=savings[k.id];
                return(
                  <div key={k.id} style={{background:"rgba(255,255,255,.05)",borderRadius:12,padding:12,marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:g?8:0}}>
                      <span style={{fontSize:20}}>{k.avatar}</span>
                      <div style={{flex:1}}><div style={{fontSize:13,fontWeight:800,color:"#fff"}}>{k.name}</div><div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.5)"}}>{g?`Saving for "${g.name}" · ${g.saved}/${g.target} 🪙`:"No savings goal yet"}</div></div>
                    </div>
                    {g&&(
                      <div style={{display:"flex",gap:6}}>
                        {[0,25,50,100].map(pct=>(<button key={pct} onClick={()=>setMatch(k.id,pct)} style={{flex:1,padding:"8px",borderRadius:9,border:`1.5px solid ${(g.matchPct||0)===pct?"rgba(124,58,237,.5)":"rgba(255,255,255,.14)"}`,background:(g.matchPct||0)===pct?"rgba(124,58,237,.18)":"transparent",color:(g.matchPct||0)===pct?"#fff":"rgba(255,255,255,.5)",fontFamily:"var(--fd)",fontSize:12,cursor:"pointer"}}>{pct===0?"Off":`+${pct}%`}</button>))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Auto-Allowance — PLUS */}
            <div style={{background:"rgba(16,185,129,.08)",border:"1px solid rgba(16,185,129,.25)",borderRadius:16,padding:15,marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <div style={{fontFamily:"var(--fd)",fontSize:16,color:"#fff"}}>💰 Auto-Allowance</div>
                <span style={{fontSize:10,fontWeight:800,background:"rgba(124,58,237,.3)",color:"#c4b5fd",padding:"2px 8px",borderRadius:100}}>⭐ PLUS</span>
              </div>
              <div style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.6)",lineHeight:1.5,marginBottom:12}}>A weekly allowance that lands automatically — no reminders. Teaches kids to make money last the week. 📅</div>
              {!prem?(
                <div style={{background:"rgba(124,58,237,.1)",border:"1px solid rgba(124,58,237,.25)",borderRadius:12,padding:13,textAlign:"center",fontSize:12,fontWeight:800,color:"#c4b5fd",lineHeight:1.5}}>Unlock <strong style={{color:"#fff"}}>Toybox Plus</strong> to set up auto-allowance. Tap ☁️ → Toybox Plus.</div>
              ):kids.map(k=>{ const a=allowance[k.id]||{amount:20,type:"coins",enabled:false}; return(
                <div key={k.id} style={{background:"rgba(255,255,255,.05)",borderRadius:12,padding:12,marginBottom:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:a.enabled?10:0}}>
                    <span style={{fontSize:20}}>{k.avatar}</span>
                    <div style={{flex:1}}><div style={{fontSize:13,fontWeight:800,color:"#fff"}}>{k.name}</div><div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.5)"}}>{a.enabled?`${a.type==="money"?"$":""}${a.amount}${a.type==="coins"?" 🪙":""} every week`:"Off"}</div></div>
                    <button onClick={()=>setAllow(k.id,{enabled:!a.enabled})} aria-label={`allowance ${k.name}`} style={{flexShrink:0,width:50,height:28,borderRadius:100,border:"none",background:a.enabled?"#10b981":"rgba(255,255,255,.15)",position:"relative",cursor:"pointer"}}><span style={{position:"absolute",top:3,left:a.enabled?25:3,width:22,height:22,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/></button>
                  </div>
                  {a.enabled&&(
                    <div>
                      <div style={{display:"flex",gap:6,marginBottom:6}}>
                        <button onClick={()=>setAllow(k.id,{type:"coins"})} style={{flex:1,padding:"7px",borderRadius:9,border:`1.5px solid ${a.type==="coins"?"rgba(245,158,11,.5)":"rgba(255,255,255,.14)"}`,background:a.type==="coins"?"rgba(245,158,11,.14)":"transparent",color:a.type==="coins"?"#fde68a":"rgba(255,255,255,.5)",fontFamily:"var(--fd)",fontSize:12,cursor:"pointer"}}>🪙 Coins</button>
                        <button onClick={()=>setAllow(k.id,{type:"money"})} style={{flex:1,padding:"7px",borderRadius:9,border:`1.5px solid ${a.type==="money"?"rgba(16,185,129,.5)":"rgba(255,255,255,.14)"}`,background:a.type==="money"?"rgba(16,185,129,.14)":"transparent",color:a.type==="money"?"#86efac":"rgba(255,255,255,.5)",fontFamily:"var(--fd)",fontSize:12,cursor:"pointer"}}>💵 Money</button>
                      </div>
                      <div style={{display:"flex",gap:6}}>
                        {(a.type==="money"?[1,2,5,10]:[10,20,50,100]).map(n=>(<button key={n} onClick={()=>setAllow(k.id,{amount:n})} style={{flex:1,padding:"7px",borderRadius:9,border:`1.5px solid ${a.amount===n?"rgba(255,255,255,.4)":"rgba(255,255,255,.14)"}`,background:a.amount===n?"rgba(255,255,255,.12)":"transparent",color:a.amount===n?"#fff":"rgba(255,255,255,.5)",fontFamily:"var(--fd)",fontSize:12,cursor:"pointer"}}>{a.type==="money"?`$${n}`:n}</button>))}
                      </div>
                    </div>
                  )}
                </div>
              );})}
            </div>

            {/* Family Circle — PLUS */}
            <div style={{background:"rgba(236,72,153,.08)",border:"1px solid rgba(236,72,153,.25)",borderRadius:16,padding:15,marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <div style={{fontFamily:"var(--fd)",fontSize:16,color:"#fff"}}>👵 Family Circle</div>
                <span style={{fontSize:10,fontWeight:800,background:"rgba(124,58,237,.3)",color:"#c4b5fd",padding:"2px 8px",borderRadius:100}}>⭐ PLUS</span>
              </div>
              <div style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.6)",lineHeight:1.5,marginBottom:12}}>Add grandparents, aunts &amp; uncles, then send the kids a gift of coins and a sweet message from them! 💛</div>
              {!prem?(
                <div style={{background:"rgba(124,58,237,.1)",border:"1px solid rgba(124,58,237,.25)",borderRadius:12,padding:13,textAlign:"center",fontSize:12,fontWeight:800,color:"#c4b5fd",lineHeight:1.5}}>Unlock <strong style={{color:"#fff"}}>Toybox Plus</strong> for the family circle. Tap ☁️ → Toybox Plus.</div>
              ):(<>
                {members.map(m=>(<div key={m.id} style={{display:"inline-flex",alignItems:"center",gap:6,background:"rgba(255,255,255,.06)",borderRadius:100,padding:"5px 10px",margin:"0 6px 6px 0"}}><span>{m.emoji}</span><span style={{fontSize:12,fontWeight:800,color:"#fff"}}>{m.name}</span><button onClick={()=>delMember(m.id)} style={{background:"none",border:"none",color:"rgba(255,255,255,.4)",fontSize:13,cursor:"pointer",padding:0}}>✕</button></div>))}
                <div style={{display:"flex",gap:6,marginTop:members.length?4:0,marginBottom:12}}>
                  <input value={mEmoji} onChange={e=>setMEmoji(e.target.value.slice(0,2))} style={{width:46,padding:"9px",borderRadius:10,border:"1.5px solid rgba(255,255,255,.18)",background:"rgba(255,255,255,.06)",color:"#fff",fontSize:18,textAlign:"center",boxSizing:"border-box"}}/>
                  <input value={mName} onChange={e=>setMName(e.target.value)} placeholder="e.g. Grandma" style={{flex:1,padding:"9px 11px",borderRadius:10,border:"1.5px solid rgba(255,255,255,.18)",background:"rgba(255,255,255,.06)",color:"#fff",fontFamily:"var(--fb)",fontSize:13,fontWeight:600,boxSizing:"border-box"}}/>
                  <button onClick={addMember} disabled={!mName.trim()} style={{padding:"9px 13px",borderRadius:10,border:"none",background:mName.trim()?"rgba(236,72,153,.3)":"rgba(255,255,255,.08)",color:mName.trim()?"#fff":"rgba(255,255,255,.4)",fontFamily:"var(--fd)",fontSize:13,cursor:mName.trim()?"pointer":"default"}}>+ Add</button>
                </div>
                {members.length>0&&kids.length>0&&(
                  <div style={{borderTop:"1px solid rgba(255,255,255,.08)",paddingTop:12}}>
                    <div style={{fontSize:11,fontWeight:800,color:"rgba(255,255,255,.45)",marginBottom:6}}>SEND A GIFT</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                      {members.map(m=>(<button key={m.id} onClick={()=>setGiftFrom(m.name)} style={{padding:"6px 11px",borderRadius:100,border:`1.5px solid ${giftFrom===m.name?"rgba(236,72,153,.5)":"rgba(255,255,255,.14)"}`,background:giftFrom===m.name?"rgba(236,72,153,.16)":"transparent",color:giftFrom===m.name?"#fff":"rgba(255,255,255,.5)",fontSize:12,fontWeight:800,cursor:"pointer"}}>{m.emoji} {m.name}</button>))}
                    </div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                      {kids.map(k=>(<button key={k.id} onClick={()=>setGiftKid(k.id)} style={{padding:"6px 11px",borderRadius:100,border:`1.5px solid ${giftKid===k.id?"rgba(16,185,129,.5)":"rgba(255,255,255,.14)"}`,background:giftKid===k.id?"rgba(16,185,129,.16)":"transparent",color:giftKid===k.id?"#fff":"rgba(255,255,255,.5)",fontSize:12,fontWeight:800,cursor:"pointer"}}>{k.avatar} {k.name}</button>))}
                    </div>
                    <div style={{display:"flex",gap:6,marginBottom:8}}>
                      {[0,10,25,50].map(n=>(<button key={n} onClick={()=>setGiftCoins(n)} style={{flex:1,padding:"7px",borderRadius:9,border:`1.5px solid ${giftCoins===n?"rgba(245,158,11,.5)":"rgba(255,255,255,.14)"}`,background:giftCoins===n?"rgba(245,158,11,.14)":"transparent",color:giftCoins===n?"#fde68a":"rgba(255,255,255,.5)",fontFamily:"var(--fd)",fontSize:12,cursor:"pointer"}}>{n===0?"No coins":`${n}🪙`}</button>))}
                    </div>
                    <input value={giftMsg} onChange={e=>setGiftMsg(e.target.value)} maxLength={100} placeholder="A sweet message… (e.g. So proud of you!)" style={{width:"100%",padding:"10px 12px",borderRadius:11,border:"1.5px solid rgba(255,255,255,.18)",background:"rgba(255,255,255,.06)",color:"#fff",fontFamily:"var(--fb)",fontSize:13,fontWeight:600,marginBottom:8,boxSizing:"border-box"}}/>
                    <button onClick={sendGift} disabled={!giftFrom||!giftKid} style={{width:"100%",padding:12,borderRadius:12,border:"none",background:(giftFrom&&giftKid)?"linear-gradient(135deg,#ec4899,#db2777)":"rgba(255,255,255,.1)",color:(giftFrom&&giftKid)?"#fff":"rgba(255,255,255,.4)",fontFamily:"var(--fd)",fontSize:14,cursor:(giftFrom&&giftKid)?"pointer":"default"}}>💛 Send gift</button>
                  </div>
                )}
              </>)}
            </div>
            </>)}
          </>)}
        </>)}

        {pv==="report"&&(<>
          {!prem?(
            <div style={{textAlign:"center",padding:"36px 18px"}}>
              <div style={{fontSize:48,marginBottom:12}}>📈</div>
              <div style={{fontFamily:"var(--fd)",fontSize:19,color:"#fff",marginBottom:8}}>Family Money Report</div>
              <div style={{fontSize:13,color:"rgba(255,255,255,.6)",fontWeight:600,lineHeight:1.6,marginBottom:16}}>A weekly at-a-glance digest of every kid — money grown, chores done, coins saved, lessons and streaks, plus a talking point to chat about together.</div>
              <div style={{background:"rgba(124,58,237,.12)",border:"1px solid rgba(124,58,237,.3)",borderRadius:14,padding:14,display:"inline-block"}}>
                <div style={{fontSize:12,fontWeight:800,color:"#c4b5fd",lineHeight:1.5}}>⭐ A <strong style={{color:"#fff"}}>Toybox Plus</strong> feature — unlock via the ☁️ button → Toybox Plus.</div>
              </div>
            </div>
          ):kids.length===0?(
            <div style={{textAlign:"center",padding:"40px 20px",fontSize:13,color:"rgba(255,255,255,.55)",fontWeight:600}}>Kids need accounts before there's a report to show.</div>
          ):(<>
            <div style={{fontFamily:"var(--fd)",fontSize:18,color:"#fff",marginBottom:4}}>📈 Parent Insight — this week</div>
            <div style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.5)",marginBottom:14}}>What each kid learned, and a question to chat about together. Also sent to you every Sunday.</div>
            {kids.map(k=>{
              const st=kidStates[k.id];
              const total=kidTotal(k), gain=total-1000;
              const doneTasks=tasks.filter(t=>t.kidId===k.id&&(t.status==="done"||t.status==="approved")).length;
              const sv=savings[k.id];
              const pm=owed[k.id]||0;
              const lessons=st?.doneLesson?.length||0;
              const insight=buildInsight(st||{},{name:k.name,sinceTs:Date.now()-7*24*3600*1000,value:total});
              return(
                <div key={k.id} style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)",borderRadius:16,padding:15,marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                    <span style={{fontSize:30}}>{k.avatar}</span>
                    <div style={{flex:1}}><div style={{fontFamily:"var(--fd)",fontSize:16,color:"#fff"}}>{k.name}’s Money Week</div><div style={{fontSize:10.5,fontWeight:700,color:"rgba(255,255,255,.4)"}}>This week{insight.levelName?` · ${insight.levelName}`:""}</div></div>
                    <div style={{textAlign:"right"}}><div style={{fontFamily:"var(--fd)",fontSize:16,color:gain>=0?"#86efac":"#fca5a5"}}>{gain>=0?"+":""}{f$(gain)}</div><div style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,.4)"}}>MONEY GARDEN</div></div>
                  </div>
                  <div style={{display:"flex",gap:10,padding:"12px 0",borderTop:"1px solid rgba(255,255,255,.08)"}}>
                    <span style={{fontSize:18}}>🎓</span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:10,fontWeight:800,letterSpacing:".06em",color:"rgba(255,255,255,.4)",textTransform:"uppercase",marginBottom:3}}>What {k.name} learned</div>
                      {insight.learned.length?(
                        <div style={{fontSize:13,fontWeight:600,color:"#fff",lineHeight:1.5}}>Learned <strong style={{color:"#c4b5fd"}}>{insight.learned.map(l=>l.concept).join(" & ")}</strong> — {insight.learned.length} lesson{insight.learned.length>1?"s":""} this week{insight.leveledUp&&insight.levelName?<span> · 🏅 reached <strong style={{color:"#fde68a"}}>{insight.levelName}</strong>!</span>:null}</div>
                      ):(
                        <div style={{fontSize:13,fontWeight:600,color:"rgba(255,255,255,.72)",lineHeight:1.5}}>Took it easy this week{insight.inProgressTitle?<> — partway through <strong style={{color:"#c4b5fd"}}>“{insight.inProgressTitle}”</strong></>:null}. A great week to jump back in!</div>
                      )}
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,margin:"2px 0 12px"}}>
                    {[["📚 Lessons",`${lessons}/${insight.totalCount}`],["⚡ Trades (7d)",`${insight.trades}`],["✅ Tasks done",`${doneTasks}`],["🏦 Saved",sv?`${sv.saved} 🪙`:pm>0?f$(pm)+" 💵":"—"]].map(([lbl,val])=>(
                      <div key={lbl} style={{background:"rgba(255,255,255,.05)",borderRadius:10,padding:"9px 11px"}}><div style={{fontSize:10,fontWeight:800,color:"rgba(255,255,255,.4)"}}>{lbl}</div><div style={{fontFamily:"var(--fd)",fontSize:15,color:"#fff"}}>{val}</div></div>
                    ))}
                  </div>
                  <div style={{background:"rgba(236,72,153,.1)",border:"1px solid rgba(236,72,153,.28)",borderRadius:12,padding:12}}>
                    <div style={{fontSize:10,fontWeight:800,letterSpacing:".06em",color:"#f472b6",textTransform:"uppercase",marginBottom:5}}>💬 Talk about it together</div>
                    <div style={{fontSize:13.5,fontWeight:700,color:"#fff",lineHeight:1.5}}>“{insight.question}”</div>
                  </div>
                  {insight.nextUp&&insight.learned.length>0&&(
                    <div style={{fontSize:11.5,fontWeight:700,color:"rgba(255,255,255,.5)",marginTop:10}}>➡️ Next up: <strong style={{color:"#fff"}}>{insight.nextUp.title}</strong></div>
                  )}
                </div>
              );
            })}
          </>)}
        </>)}

        <button onClick={onLogout} style={{width:"100%",marginTop:16,padding:"12px",borderRadius:13,border:"1px solid rgba(255,255,255,.1)",background:"transparent",color:"rgba(255,255,255,.3)",fontFamily:"var(--fd)",fontSize:13,cursor:"pointer"}}>🚪 Log out of Parent Mode</button>
      </div>

      {/* Reset / remove confirmation */}
      {confirmReset&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setConfirmReset(null)}>
          <div style={{background:"#111827",border:"1px solid rgba(239,68,68,.3)",borderRadius:20,padding:24,maxWidth:380,width:"100%"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:40,textAlign:"center",marginBottom:10}}>{confirmReset.mode==="remove"?"🗑️":confirmReset.mode==="money"?"💵":"🔄"}</div>
            <div style={{fontFamily:"var(--fd)",fontSize:19,color:"#fff",textAlign:"center",marginBottom:10}}>
              {confirmReset.mode==="remove"?`Remove ${confirmReset.kid.name}'s account?`:confirmReset.mode==="money"?`Reset ${confirmReset.kid.name}'s trading money?`:`Reset ${confirmReset.kid.name}'s progress?`}
            </div>
            <div style={{fontSize:13,fontWeight:600,color:"rgba(255,255,255,.65)",textAlign:"center",lineHeight:1.6,marginBottom:18}}>
              {confirmReset.mode==="remove"
                ?<>This deletes the account and all progress from this device. They'll need to create a new account (or restore from a backup code).<br/><br/><strong style={{color:"#fca5a5"}}>This can't be undone</strong> unless you have a backup code.</>
                :confirmReset.mode==="money"
                ?(()=>{const lc=(kidStates[confirmReset.kid.id]?.doneLesson||[]).reduce((s,id)=>s+(LESSONS.find(l=>l.id===id)?.cashReward||0),0);const total=(lc+resetGain)>0?lc+resetGain:1000;const parts=[lc>0?`$${lc.toLocaleString()} earned from lessons`:"",resetGain>0?`+$${resetGain} stock gain`:""].filter(Boolean);return(
                  <>Clears holdings & trades and sets their Money Garden to <strong style={{color:"#86efac"}}>${total.toLocaleString()}</strong>{parts.length?<> ({parts.join(" · ")} 🌱)</>:<> (fresh $1,000)</>}, but <strong style={{color:"#86efac"}}>keeps their lessons, badges and coins</strong>.</>
                );})()
                :<>This wipes their portfolio, lessons, badges and trades. They'll start fresh with $1,000. The account stays.<br/><br/><strong style={{color:"#fca5a5"}}>This can't be undone</strong> unless you have a backup code.</>}
            </div>
            {confirmReset.mode==="money"&&(
              <div style={{marginBottom:18}}>
                <div style={{fontSize:11,fontWeight:800,color:"rgba(255,255,255,.5)",textAlign:"center",marginBottom:8}}>GAIN FROM THEIR STOCK HOLDING? (lesson cash is kept)</div>
                <div style={{display:"flex",gap:7,justifyContent:"center",flexWrap:"wrap"}}>
                  {[0,75,250,500].map(g=>(
                    <button key={g} onClick={()=>setResetGain(g)} style={{padding:"8px 13px",borderRadius:10,border:`1.5px solid ${resetGain===g?"rgba(16,185,129,.6)":"rgba(255,255,255,.15)"}`,background:resetGain===g?"rgba(16,185,129,.16)":"transparent",color:resetGain===g?"#86efac":"rgba(255,255,255,.6)",fontFamily:"var(--fd)",fontSize:13,cursor:"pointer"}}>{g===0?"None":`+$${g}`}</button>
                  ))}
                </div>
              </div>
            )}
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setConfirmReset(null)} style={{flex:1,padding:"13px",borderRadius:13,border:"1.5px solid rgba(255,255,255,.2)",background:"transparent",color:"rgba(255,255,255,.7)",fontFamily:"var(--fd)",fontSize:14,cursor:"pointer"}}>Cancel</button>
              <button onClick={async()=>{const kid=confirmReset.kid;const mode=confirmReset.mode;const gain=resetGain;setConfirmReset(null);await onResetKid(kid.id,mode,gain);if(mode==="money"){const st=await loadData(stateKey(kid.id));setKidStates(s=>({...s,[kid.id]:st}));}else{setKidStates(s=>{const n={...s};delete n[kid.id];return n;});}}} style={{flex:1,padding:"13px",borderRadius:13,border:"none",background:confirmReset.mode==="money"?"linear-gradient(135deg,#10b981,#059669)":"linear-gradient(135deg,#ef4444,#dc2626)",color:"#fff",fontFamily:"var(--fd)",fontSize:14,cursor:"pointer"}}>{confirmReset.mode==="remove"?"Remove":confirmReset.mode==="money"?"Reset money":"Reset all"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

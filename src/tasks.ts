// Chores & Rewards — shared data layer. Tasks and the reward store live in
// FAMILY storage (via window.storage), so a parent creates them and the kid's
// device sees them (synced through Neon when signed in). No real money: rewards
// are in-app coins or parent-defined custom rewards (toys, screen time, outings).

// "money" is POCKET-MONEY only: the app tracks an amount the parent chooses to
// owe, and never moves any real money. Parents settle it in real life.
export type Reward = { type: "coins" | "custom" | "money"; coins?: number; label?: string; emoji?: string; money?: number };
export type TaskStatus = "todo" | "pending" | "approved" | "done";
export type Task = {
  id: string;
  kidId: string;
  title: string;
  cat: string;                 // category id
  reward: Reward;
  recurring: "once" | "daily" | "weekly";
  status: TaskStatus;
  createdAt: number;
  doneAt?: number;             // when kid marked "I did it"
  lastDone?: string;           // date string of last completion (for recurring reset)
  mission?: number;            // Brave (Confidence) mission id, 1-10
  brave?: { before: number; after: number; helped: string; tried: boolean; smaller: boolean };
};
export type StoreItem = { id: string; name: string; emoji: string; cost: number };
export type Claim = { id: string; kidId: string; itemName: string; emoji: string; cost: number; at: number; given?: boolean };

export const CATS = [
  { id: "homework", icon: "📚", label: "Homework" },
  { id: "reading", icon: "📖", label: "Reading" },
  { id: "chores", icon: "🧹", label: "Chores" },
  { id: "family", icon: "👵", label: "Help Family" },
  { id: "project", icon: "🎨", label: "Project" },
  { id: "kindness", icon: "💛", label: "Kindness" },
  { id: "brave", icon: "🦁", label: "Brave" },
];
export const catOf = (id: string) => CATS.find((c) => c.id === id) || CATS[2];

export const TEMPLATES = [
  { cat: "homework", title: "Finish today's homework" },
  { cat: "reading", title: "Read for 20 minutes" },
  { cat: "chores", title: "Make your bed" },
  { cat: "chores", title: "Tidy your room" },
  { cat: "chores", title: "Help with the dishes" },
  { cat: "chores", title: "Take out the trash" },
  { cat: "family", title: "Help grandma or grandpa" },
  { cat: "project", title: "Work on your project" },
  { cat: "kindness", title: "Do something kind for someone" },
];

const TASKS_KEY = "toybox:tasks:v1";
const STORE_KEY = "toybox:rewardstore:v1";
const CLAIMS_KEY = "toybox:rewardclaims:v1";

const w = () => (typeof window !== "undefined" ? (window as any).storage : null);
async function load<T>(key: string, fallback: T): Promise<T> {
  try { const r = await w()?.get(key, false); return r ? JSON.parse(r.value) : fallback; } catch { return fallback; }
}
async function save(key: string, value: any) { try { await w()?.set(key, JSON.stringify(value), false); } catch {} }

export const loadTasks = () => load<Task[]>(TASKS_KEY, []);
export const saveTasks = (t: Task[]) => save(TASKS_KEY, t);
export const loadStore = () => load<StoreItem[]>(STORE_KEY, []);
export const saveStore = (s: StoreItem[]) => save(STORE_KEY, s);
export const loadClaims = () => load<Claim[]>(CLAIMS_KEY, []);
export const saveClaims = (c: Claim[]) => save(CLAIMS_KEY, c);

// Pocket-money ledger — a per-kid running total the parent owes. TRACKING ONLY;
// the app never moves money. { [kidId]: amount }.
const OWED_KEY = "toybox:pocketmoney:v1";
export const loadOwed = () => load<Record<string, number>>(OWED_KEY, {});
export const saveOwed = (o: Record<string, number>) => save(OWED_KEY, o);

// Savings goals with optional PARENT MATCH (Plus). Family-shared so the parent
// sets the match % and the kid saves toward the goal. matchPct is coins added
// per 100 coins deposited (e.g. 25 = +25%). "saved" is in-app coins only.
export type Savings = { name: string; target: number; saved: number; matchPct: number };
const SAVINGS_KEY = "toybox:savings:v1";
export const loadSavings = () => load<Record<string, Savings>>(SAVINGS_KEY, {});
export const saveSavings = (s: Record<string, Savings>) => save(SAVINGS_KEY, s);

// Auto-allowance (Plus) — a weekly allowance that credits automatically.
// { [kidId]: { amount, type:"coins"|"money", enabled, lastPaid(dateString) } }
export type Allowance = { amount: number; type: "coins" | "money"; enabled: boolean; lastPaid?: string };
const ALLOWANCE_KEY = "toybox:allowance:v1";
export const loadAllowance = () => load<Record<string, Allowance>>(ALLOWANCE_KEY, {});
export const saveAllowance = (a: Record<string, Allowance>) => save(ALLOWANCE_KEY, a);

// Family Circle (Plus) — extra family members + gifts they send to kids.
export type Member = { id: string; name: string; emoji: string };
export type Gift = { id: string; kidId: string; from: string; emoji: string; coins: number; message: string; at: number; collected?: boolean };
const FAMILY_KEY = "toybox:family:members";
const GIFTS_KEY = "toybox:gifts:v1";
export const loadFamily = () => load<Member[]>(FAMILY_KEY, []);
export const saveFamily = (m: Member[]) => save(FAMILY_KEY, m);
export const loadGifts = () => load<Gift[]>(GIFTS_KEY, []);
export const saveGifts = (g: Gift[]) => save(GIFTS_KEY, g);

// Family settings (e.g., whether kids can send "Together Time" requests).
export type Settings = { togetherTime: boolean };
const SETTINGS_KEY = "toybox:family:settings";
export const loadSettings = () => load<Settings>(SETTINGS_KEY, { togetherTime: false });
export const saveSettings = (s: Settings) => save(SETTINGS_KEY, s);

// Together Time — kids ASK parents for time/teaching/activities (relationship
// building, not chores). No coins; the reward is the shared time itself.
export type Request = { id: string; kidId: string; text: string; cat: string; status: "asked" | "yes" | "done"; createdAt: number };
const REQUESTS_KEY = "toybox:togethertime:v1";
export const loadRequests = () => load<Request[]>(REQUESTS_KEY, []);
export const saveRequests = (r: Request[]) => save(REQUESTS_KEY, r);

export const REQ_CATS = [
  { id: "together", icon: "🤝", label: "Do together" },
  { id: "teach", icon: "🧠", label: "Teach me" },
  { id: "time", icon: "⏰", label: "Time together" },
  { id: "story", icon: "📚", label: "Read / story" },
  { id: "go", icon: "🏞️", label: "Go somewhere" },
];
export const reqCatOf = (id: string) => REQ_CATS.find((c) => c.id === id) || REQ_CATS[0];
export const REQ_SUGGESTIONS = [
  { cat: "together", text: "Build a Lego set with me" },
  { cat: "together", text: "Play a board game with me" },
  { cat: "together", text: "Draw or paint together" },
  { cat: "teach", text: "Teach me to cook something yummy" },
  { cat: "teach", text: "Show me how to ride a bike" },
  { cat: "teach", text: "Help me with my project" },
  { cat: "time", text: "Just hang out and chat with me" },
  { cat: "story", text: "Read me a bedtime story" },
  { cat: "go", text: "Take me to the park" },
];

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);

// Recurring tasks reset to "todo" once their day/week has passed since last done.
export function applyRecurringResets(tasks: Task[]): Task[] {
  const today = new Date().toDateString();
  const weekOf = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x.toDateString(); };
  const thisWeek = weekOf(new Date());
  let changed = false;
  const out = tasks.map((t) => {
    if (t.recurring === "once" || t.status !== "done" || !t.lastDone) return t;
    const done = new Date(t.lastDone);
    const stale = t.recurring === "daily" ? done.toDateString() !== today : weekOf(done) !== thisWeek;
    if (stale) { changed = true; return { ...t, status: "todo" as TaskStatus, doneAt: undefined }; }
    return t;
  });
  return changed ? out : tasks;
}

// ── Brave Missions (Confidence track) ─────────────────────────────────────────
// Real-world practice, parent checks it off. Each mission is done 3 times to
// master it (repetition builds confidence). "Tried it" earns the same as "Did it".
// No voice, no photos, nothing typed by the kid — only taps.
export type Mission = { id: number; level: 1 | 2 | 3; icon: string; title: string; kid: string; teen: string; smaller: string; parent: string };
export const BRAVE_LEVELS = [
  { level: 1, name: "Warm-Up", icon: "🌱" },
  { level: 2, name: "Getting Braver", icon: "🔥" },
  { level: 3, name: "Big Brave", icon: "🦁" },
];
export const MISSIONS: Mission[] = [
  { id: 1, level: 1, icon: "👋", title: "Say Hi First", kid: "Say hi first to someone today — a neighbor, a cashier, or a classmate. Smile and say hi!", teen: "Start a short chat with someone new — two or three lines is enough.", smaller: "Wave or smile at someone first.", parent: "Say: \"I saw you go first. That took guts.\"" },
  { id: 2, level: 1, icon: "💬", title: "Real Compliment", kid: "Give one real compliment, like \"You were really patient with your sister.\"", teen: "Compliment someone you don't know well.", smaller: "Write the compliment on a note instead.", parent: "Ask: \"How did they react?\"" },
  { id: 3, level: 1, icon: "💛", title: "Name Your Feeling", kid: "At dinner, share one feeling: \"I felt ___ when ___.\"", teen: "Share the feeling and what you did about it.", smaller: "Point to an emoji that matches your feeling.", parent: "Share one feeling too. Then just listen — no fixing." },
  { id: 4, level: 2, icon: "🍔", title: "Order for Yourself", kid: "Order your own food, or ask a store worker for help.", teen: "Call a store or place with a question.", smaller: "Your grown-up stands next to you; you say one word.", parent: "Stay quiet and let them do it. Don't rescue." },
  { id: 5, level: 2, icon: "✋", title: "Ask One Question", kid: "Raise your hand once in class, or ask a teacher or coach a question.", teen: "Email a teacher or coach a question.", smaller: "Ask one-on-one after class.", parent: "Say: \"Asking means you're learning.\"" },
  { id: 6, level: 2, icon: "🧗", title: "Try Something Hard", kid: "Try something new or tricky for 10 minutes.", teen: "Try something you might fail at, in front of someone.", smaller: "Try it for just 5 minutes.", parent: "Praise the effort: \"You kept going.\"" },
  { id: 7, level: 2, icon: "🤝", title: "Join In", kid: "Ask to join a game, or invite a kid who's sitting alone.", teen: "Invite someone new to lunch or a group.", smaller: "Sit near the group first.", parent: "Ask: \"What helped you walk over?\"" },
  { id: 8, level: 3, icon: "🛡️", title: "Say No Kindly", kid: "Say \"No thanks, I don't want to\" when you mean it. If someone is being teased, stand next to them or get a grown-up.", teen: "Stand with someone being teased, or get an adult. Never fight.", smaller: "Practice \"No thanks\" at home 3 times.", parent: "Say: \"Your no matters.\"" },
  { id: 9, level: 3, icon: "🔧", title: "Own a Mistake", kid: "Tell someone about a mistake and how you'll fix it.", teen: "Own a mistake and fix it without being asked.", smaller: "Tell your grown-up first.", parent: "Say: \"Everyone messes up. Fixing it is the brave part.\"" },
  { id: 10, level: 3, icon: "🎤", title: "Stand Tall Talk", kid: "Give a 1-minute talk to your family about something you love. Stand tall, loud voice!", teen: "Give a 2-minute talk to family or a club.", smaller: "Talk for 30 seconds, sitting down.", parent: "Make it a moment — clap, and celebrate the Confidence badge!" },
];
export const MISSION_REPS = 3;                    // do it 3 times to master
export const braveCoins = (rep: number) => [15, 10, 5][Math.min(rep, 2)]; // small, fades with repeats
export const BRAVE_HELPS = [
  { id: "breathe", icon: "🌬️", label: "Belly breathing" },
  { id: "sentence", icon: "💪", label: "My brave sentence" },
  { id: "practice", icon: "🎭", label: "Practicing first" },
  { id: "someone", icon: "🧑‍🤝‍🧑", label: "Someone with me" },
];
export const missionOf = (id?: number) => MISSIONS.find((m) => m.id === id);

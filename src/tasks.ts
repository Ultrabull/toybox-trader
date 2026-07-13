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

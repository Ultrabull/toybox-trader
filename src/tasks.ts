// Chores & Rewards — shared data layer. Tasks and the reward store live in
// FAMILY storage (via window.storage), so a parent creates them and the kid's
// device sees them (synced through Neon when signed in). No real money: rewards
// are in-app coins or parent-defined custom rewards (toys, screen time, outings).

export type Reward = { type: "coins" | "custom"; coins?: number; label?: string; emoji?: string };
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

// Dream Jobs — build a career space in 3D, then role-play money/life-lesson
// scenarios. v1 ships one fully-playable career (My Home / money theme); more
// are teased as "coming soon". Coins earned flow into the kid's Money Garden.
import { useState } from "react";
import VoxelBuilder, { VoxColor } from "./VoxelBuilder";

type Scenario = { icon: string; q: string; choices: { label: string; good: boolean }[]; lesson: string };
type Career = {
  id: string; icon: string; name: string; tag: string; live: boolean;
  sky?: number; base?: number; colors?: VoxColor[]; goal?: number; goalText?: string;
  scenarios?: Scenario[];
};

const HOME_COLORS: VoxColor[] = [
  { name: "Wood", hex: 0xb5834b }, { name: "Brick", hex: 0xc0392b }, { name: "Wall", hex: 0xf4f7fb },
  { name: "Roof", hex: 0x556270 }, { name: "Glass", hex: 0x7ec8e3 }, { name: "Door", hex: 0x8a5a2b },
  { name: "Grass", hex: 0x6abe30 }, { name: "Sunny", hex: 0xf4c430 },
];

const CAREERS: Career[] = [
  {
    id: "home", icon: "🏠", name: "My Home", tag: "Build a house & learn about money", live: true,
    sky: 0x87b7e8, base: 0x6abe30, colors: HOME_COLORS, goal: 12,
    goalText: "Build up your home — stack 12 blocks on the grass! (walls, a roof, a door…)",
    scenarios: [
      { icon: "🛒", q: "You have $20 for the week. Food costs $12, but you also spot a $15 toy. What's the smart move?",
        choices: [{ label: "Buy the food first 🥦", good: true }, { label: "Grab the toy 🧸", good: false }],
        lesson: "Needs come before wants! Food is a need; a toy is a want. Smart grown-ups pay for needs first, then treats." },
      { icon: "🐷", q: "You have $10 left over this week. What do you do with it?",
        choices: [{ label: "Save some for later 🐷", good: true }, { label: "Spend it all on candy 🍬", good: false }],
        lesson: "Saving a little every week adds up fast — that's how families afford big things like trips and bikes!" },
      { icon: "🧹", q: "The whole house needs tidying up. What do you do?",
        choices: [{ label: "Pitch in and help 🤝", good: true }, { label: "Leave it for someone else 🙈", good: false }],
        lesson: "A home runs on teamwork. When everyone helps a little, nobody has to do a lot. That's fairness!" },
      { icon: "📅", q: "Money comes in once a month. Do you…",
        choices: [{ label: "Plan it across the weeks 📅", good: true }, { label: "Spend it all on day one 💸", good: false }],
        lesson: "Making money last the whole month is called budgeting. Plan first, spend slowly — no scary empty pockets!" },
    ],
  },
  { id: "fire", icon: "🚒", name: "Firehouse", tag: "Build a fire station • coming soon", live: false },
  { id: "shop", icon: "🏪", name: "My Shop", tag: "Run a store • coming soon", live: false },
  { id: "school", icon: "🏫", name: "Classroom", tag: "Be the teacher • coming soon", live: false },
];

const BASE_BLOCKS = 64; // 8×8 grass platform the builder starts with

export default function DreamJobs({ user, onEarn, onClose }: { user: any; onEarn: (n: number) => void; onClose: () => void }) {
  const [career, setCareer] = useState<Career | null>(null);
  const [phase, setPhase] = useState<"build" | "play" | "done">("build");
  const [count, setCount] = useState(0);
  const [built, setBuilt] = useState(false);        // build reward given
  const [sIdx, setSIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [earned, setEarned] = useState(0);

  const added = Math.max(0, count - BASE_BLOCKS);
  const goal = career?.goal ?? 12;
  const pct = Math.min(100, Math.round((added / goal) * 100));

  const award = (n: number) => { setEarned((e) => e + n); onEarn(n); };

  const finishBuild = () => { if (!built) { setBuilt(true); award(40); } setPhase("play"); };
  const answer = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    const good = career!.scenarios![sIdx].choices[i].good;
    award(good ? 15 : 5);
  };
  const nextScenario = () => {
    if (sIdx < career!.scenarios!.length - 1) { setSIdx(sIdx + 1); setPicked(null); }
    else setPhase("done");
  };

  const frame = (children: any) => (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, display: "flex", flexDirection: "column", background: "#0d1b2e", color: "#fff", fontFamily: "'Nunito',system-ui,sans-serif" }}>{children}</div>
  );

  // ── Career picker ──
  if (!career) return frame(
    <div style={{ padding: "18px 16px calc(18px + env(safe-area-inset-bottom,0px))", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: 22 }}>🏗️ Dream Jobs</div>
        <button onClick={onClose} style={{ background: "rgba(255,255,255,.1)", border: "none", borderRadius: 10, padding: "8px 12px", color: "#fff", fontWeight: 800, cursor: "pointer" }}>✕ Close</button>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.7)", lineHeight: 1.5, marginBottom: 16 }}>
        Pick a job, <strong>build your place in 3D</strong>, then play real-life choices to earn coins for your Money Garden! 🪙
      </div>
      {CAREERS.map((c) => (
        <button key={c.id} disabled={!c.live} onClick={() => c.live && setCareer(c)}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 14, padding: 16, marginBottom: 11, borderRadius: 16, textAlign: "left", cursor: c.live ? "pointer" : "default",
            border: `2px solid ${c.live ? "rgba(124,58,237,.5)" : "rgba(255,255,255,.1)"}`, background: c.live ? "linear-gradient(135deg,rgba(124,58,237,.22),rgba(6,182,212,.08))" : "rgba(255,255,255,.04)", opacity: c.live ? 1 : 0.6 }}>
          <span style={{ fontSize: 40, filter: c.live ? "none" : "grayscale(.6)" }}>{c.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: 17 }}>{c.name} {!c.live && "🔒"}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.55)", marginTop: 2 }}>{c.tag}</div>
          </div>
          {c.live && <span style={{ fontSize: 18, color: "#c4b5fd" }}>→</span>}
        </button>
      ))}
      <div style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.3)", marginTop: 8 }}>More jobs coming soon — each teaches a real-life lesson. 🚀</div>
    </div>
  );

  // ── Build phase ──
  if (phase === "build") return frame(<>
    <div style={{ padding: "12px 14px 8px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: 17 }}>{career.icon} {career.name}</div>
        <button onClick={() => setCareer(null)} style={{ background: "rgba(255,255,255,.1)", border: "none", borderRadius: 9, padding: "6px 10px", color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>← Jobs</button>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.7)", lineHeight: 1.4, marginBottom: 8 }}>🎯 {career.goalText}</div>
      <div style={{ height: 10, borderRadius: 100, background: "rgba(255,255,255,.12)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,#10b981,#34d399)", transition: "width .3s" }} />
      </div>
      <div style={{ fontSize: 11, fontWeight: 800, color: pct >= 100 ? "#86efac" : "rgba(255,255,255,.5)", marginTop: 4, textAlign: "center" }}>
        {pct >= 100 ? "🎉 Built it! Tap Continue below." : `${added} / ${goal} blocks — drag to spin, tap a block to stack!`}
      </div>
    </div>
    <VoxelBuilder colors={career.colors!} sky={career.sky} baseHex={career.base} saveKey={`toybox:dreamjobs:${user?.id || "guest"}:${career.id}`} onCount={setCount} />
    <div style={{ padding: "8px 12px calc(12px + env(safe-area-inset-bottom,0px))", background: "rgba(13,42,74,.9)" }}>
      <button onClick={finishBuild} disabled={pct < 100}
        style={{ width: "100%", padding: 14, borderRadius: 14, border: "none", cursor: pct < 100 ? "default" : "pointer",
          background: pct < 100 ? "rgba(255,255,255,.1)" : "linear-gradient(135deg,#10b981,#059669)", color: pct < 100 ? "rgba(255,255,255,.4)" : "#fff", fontFamily: "'Fredoka One',cursive", fontSize: 16 }}>
        {pct < 100 ? `Keep building… (${added}/${goal})` : "✅ Continue → Run your home!"}
      </button>
    </div>
  </>);

  // ── Scenario phase ──
  if (phase === "play") {
    const sc = career.scenarios![sIdx];
    return frame(
      <div style={{ padding: "18px 16px", overflowY: "auto", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: 16 }}>{career.icon} Run your {career.name}</div>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#fde68a" }}>🪙 {earned}</div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,.4)", marginBottom: 10 }}>Choice {sIdx + 1} of {career.scenarios!.length}</div>
        <div style={{ background: "linear-gradient(135deg,rgba(124,58,237,.18),rgba(6,182,212,.06))", border: "1px solid rgba(124,58,237,.3)", borderRadius: 18, padding: 18, textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 42, marginBottom: 8 }}>{sc.icon}</div>
          <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: 16, lineHeight: 1.4 }}>{sc.q}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sc.choices.map((ch, i) => {
            const show = picked !== null, isPick = picked === i;
            let bg = "rgba(255,255,255,.06)", bd = "rgba(255,255,255,.14)", col = "#fff";
            if (show && ch.good) { bg = "rgba(16,185,129,.18)"; bd = "rgba(16,185,129,.5)"; col = "#86efac"; }
            else if (show && isPick && !ch.good) { bg = "rgba(245,158,11,.15)"; bd = "rgba(245,158,11,.5)"; col = "#fde68a"; }
            return (
              <button key={i} disabled={show} onClick={() => answer(i)}
                style={{ padding: "14px 16px", borderRadius: 14, border: `2px solid ${bd}`, background: bg, color: col, fontFamily: "'Nunito',sans-serif", fontSize: 15, fontWeight: 800, textAlign: "left", cursor: show ? "default" : "pointer" }}>
                {ch.label}{show && ch.good ? "  ✓" : ""}
              </button>
            );
          })}
        </div>
        {picked !== null && (
          <div style={{ marginTop: 16 }}>
            <div style={{ background: "rgba(16,185,129,.1)", border: "1px solid rgba(16,185,129,.3)", borderRadius: 14, padding: 14, fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.85)", lineHeight: 1.6 }}>
              💡 {sc.lesson}
            </div>
            <div style={{ textAlign: "center", fontSize: 13, fontWeight: 800, color: "#fde68a", marginTop: 10 }}>+{career.scenarios![sIdx].choices[picked].good ? 15 : 5} coins 🪙</div>
            <button onClick={nextScenario} style={{ width: "100%", marginTop: 12, padding: 14, borderRadius: 14, border: "none", background: "linear-gradient(135deg,#7c3aed,#9333ea)", color: "#fff", fontFamily: "'Fredoka One',cursive", fontSize: 16, cursor: "pointer" }}>
              {sIdx < career.scenarios!.length - 1 ? "Next →" : "Finish 🎉"}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Done ──
  return frame(
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
      <div style={{ fontSize: 64, marginBottom: 8 }}>🏆</div>
      <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: 24, marginBottom: 8 }}>Career Complete!</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,.75)", lineHeight: 1.6, marginBottom: 6 }}>
        You built your place and made smart real-life choices. 🎉
      </div>
      <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: 20, color: "#fde68a", marginBottom: 20 }}>🪙 {earned} coins earned!</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.5)", marginBottom: 24 }}>Your coins are waiting in your Money Garden. 🌱</div>
      <button onClick={() => { setCareer(null); setPhase("build"); setSIdx(0); setPicked(null); setBuilt(false); setEarned(0); }}
        style={{ padding: "13px 26px", borderRadius: 14, border: "none", background: "rgba(255,255,255,.14)", color: "#fff", fontFamily: "'Fredoka One',cursive", fontSize: 15, cursor: "pointer", marginBottom: 10 }}>Try another job</button>
      <button onClick={onClose} style={{ padding: "13px 26px", borderRadius: 14, border: "none", background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff", fontFamily: "'Fredoka One',cursive", fontSize: 15, cursor: "pointer" }}>Back to Toybox 🧸</button>
    </div>
  );
}

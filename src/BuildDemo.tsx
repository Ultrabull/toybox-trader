// Isometric room-builder PROTOTYPE ("feel it" slice).
// Tap a furniture item, then tap a floor tile to place it. Pure React + SVG —
// no game engine — so it runs great on phones/tablets and scales responsively.
// Reachable at /?build so it can be felt without logging in.
import { useState } from "react";

const GRID = 6;                 // 6×6 room
const TW = 60, TH = 30;         // iso tile: 2:1 diamond
const WALL = 66;                // wall height
const OX = (GRID * TW) / 2;     // origin x (centres the room)
const OY = WALL + TH / 2;       // origin y (leaves room for walls)

// screen centre of a floor cell
const cx = (r: number, c: number) => OX + (c - r) * (TW / 2);
const cy = (r: number, c: number) => OY + (c + r) * (TH / 2);
const VBW = GRID * TW;                         // viewBox width
const VBH = OY + GRID * TH + TH;               // viewBox height

const ERASER = "🧹";
const ITEMS = ["🛏️", "🛋️", "🪑", "🪵", "📺", "🪴", "🖼️", "🕯️", "🧸", "📚", "🪟", "🚪", "🛁", "🪞", "⏰", "🎸", "🏀", "🪀"];

const key = (r: number, c: number) => `${r},${c}`;
const SAVE = "toybox:builddemo:v1";
const load = (): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(SAVE) || "{}"); } catch { return {}; }
};

export default function BuildDemo() {
  const [placed, setPlaced] = useState<Record<string, string>>(load);
  const [sel, setSel] = useState(ITEMS[0]);

  const save = (next: Record<string, string>) => {
    setPlaced(next);
    try { localStorage.setItem(SAVE, JSON.stringify(next)); } catch {}
  };

  const tap = (r: number, c: number) => {
    const k = key(r, c);
    const next = { ...placed };
    if (sel === ERASER) { delete next[k]; }
    else if (next[k] === sel) { delete next[k]; }   // tap same item again to remove
    else { next[k] = sel; }                          // place / replace
    save(next);
    try { navigator.vibrate?.(8); } catch {}
  };

  // floor cells
  const cells = [];
  for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) cells.push({ r, c });
  // furniture drawn back→front so nearer items overlap
  const furniture = cells
    .filter(({ r, c }) => placed[key(r, c)])
    .sort((a, b) => a.r + a.c - (b.r + b.c));

  const count = Object.keys(placed).length;

  // wall corners
  const T = [OX, OY - TH / 2];                         // back corner
  const R = [OX + GRID * (TW / 2), OY + (GRID - 1) * (TH / 2) + TH / 2];
  const L = [OX - GRID * (TW / 2), OY + (GRID - 1) * (TH / 2) + TH / 2];

  return (
    <div style={{ minHeight: "100dvh", background: "linear-gradient(160deg,#0d0621,#1a0e3a 55%,#080c14)", display: "flex", flexDirection: "column", color: "#fff", fontFamily: "'Nunito',system-ui,sans-serif" }}>
      {/* header */}
      <div style={{ padding: "16px 16px 6px", textAlign: "center" }}>
        <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: 22 }}>🏠 Build Your Room!</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.65)", marginTop: 4, lineHeight: 1.4 }}>
          Pick something below, then tap the floor to place it. Tap it again to pick it up. ✨
        </div>
        <div style={{ fontSize: 12, fontWeight: 800, color: count >= 5 ? "#86efac" : "rgba(255,255,255,.4)", marginTop: 6 }}>
          {count === 0 ? "Your room is empty — let's decorate!" : count >= 8 ? "🌟 Wow, what a cozy room!" : `${count} placed — looking good!`}
        </div>
      </div>

      {/* the isometric room */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "6px 10px" }}>
        <svg viewBox={`0 0 ${VBW} ${VBH}`} style={{ width: "100%", maxWidth: 520, height: "auto", filter: "drop-shadow(0 20px 40px rgba(0,0,0,.5))" }}>
          {/* walls */}
          <polygon points={`${L[0]},${L[1]} ${T[0]},${T[1]} ${T[0]},${T[1] - WALL} ${L[0]},${L[1] - WALL}`} fill="#2b2150" stroke="#3a2d6b" strokeWidth="1" />
          <polygon points={`${T[0]},${T[1]} ${R[0]},${R[1]} ${R[0]},${R[1] - WALL} ${T[0]},${T[1] - WALL}`} fill="#221a44" stroke="#3a2d6b" strokeWidth="1" />
          {/* baseboards */}
          <polyline points={`${L[0]},${L[1]} ${T[0]},${T[1]} ${R[0]},${R[1]}`} fill="none" stroke="#4c3c85" strokeWidth="2" />

          {/* floor tiles */}
          {cells.map(({ r, c }) => {
            const x = cx(r, c), y = cy(r, c);
            const light = (r + c) % 2 === 0;
            return (
              <polygon
                key={key(r, c)}
                points={`${x},${y - TH / 2} ${x + TW / 2},${y} ${x},${y + TH / 2} ${x - TW / 2},${y}`}
                fill={light ? "#6d5bb0" : "#5c4c99"}
                stroke="#4a3c80" strokeWidth="1"
                style={{ cursor: "pointer" }}
                onClick={() => tap(r, c)}
              />
            );
          })}

          {/* furniture (with a soft ground shadow) */}
          {furniture.map(({ r, c }) => {
            const x = cx(r, c), y = cy(r, c);
            return (
              <g key={key(r, c)} style={{ cursor: "pointer", pointerEvents: "none" }}>
                <ellipse cx={x} cy={y + 4} rx={17} ry={6} fill="rgba(0,0,0,.28)" />
                <text x={x} y={y + 8} fontSize={34} textAnchor="middle">{placed[key(r, c)]}</text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* palette */}
      <div style={{ padding: "8px 10px calc(14px + env(safe-area-inset-bottom,0px))" }}>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "6px 2px", scrollbarWidth: "none" }}>
          {[ERASER, ...ITEMS].map((it) => (
            <button key={it} onClick={() => setSel(it)}
              style={{
                flexShrink: 0, width: 52, height: 52, borderRadius: 14, fontSize: 26, cursor: "pointer",
                border: `2px solid ${sel === it ? "#a78bfa" : "rgba(255,255,255,.14)"}`,
                background: sel === it ? "rgba(167,139,250,.28)" : "rgba(255,255,255,.06)",
                boxShadow: sel === it ? "0 4px 14px rgba(167,139,250,.4)" : "none",
              }}>
              {it}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={() => save({})} style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.06)", color: "rgba(255,255,255,.75)", fontFamily: "'Fredoka One',cursive", fontSize: 14, cursor: "pointer" }}>🧺 Clear room</button>
          <a href="/" style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.06)", color: "rgba(255,255,255,.75)", fontFamily: "'Fredoka One',cursive", fontSize: 14, textAlign: "center", textDecoration: "none" }}>← Back to app</a>
        </div>
        <div style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.3)", marginTop: 8 }}>Prototype — this is the "buildable" feel. Real version adds careers, characters & life lessons.</div>
      </div>
    </div>
  );
}

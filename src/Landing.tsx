// Marketing landing page — the first thing a visitor sees at the root URL.
// Sells parents on the app, then the CTA flows into the real app (role select).
// Returning users skip it (a localStorage flag is set on Start).
const P = "#7c3aed", GOLD = "#f59e0b", GREEN = "#10b981", PINK = "#ec4899";

export default function Landing({ onStart }: { onStart: () => void }) {
  const Chip = ({ children }: any) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 100, padding: "6px 12px", fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,.85)", whiteSpace: "nowrap" }}>{children}</span>
  );
  const CTA = ({ label = "Start Free 🚀", big = false }: any) => (
    <button onClick={onStart} style={{ width: "100%", maxWidth: 340, padding: big ? "18px" : "16px", borderRadius: 16, border: "none", cursor: "pointer", background: "linear-gradient(135deg,#fff,#f3f0ff)", color: "#4c1d95", fontFamily: "'Fredoka One',cursive", fontSize: big ? 20 : 18, boxShadow: "0 10px 30px rgba(124,58,237,.4)" }}>{label}</button>
  );
  const H = ({ children, id }: any) => (
    <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: 24, color: "#fff", textAlign: "center", marginBottom: 8, lineHeight: 1.2 }}>{children}</div>
  );
  const Sub = ({ children }: any) => (
    <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,.6)", textAlign: "center", lineHeight: 1.6, maxWidth: 460, margin: "0 auto 22px" }}>{children}</div>
  );
  const Card = ({ children, style }: any) => (
    <div style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 18, padding: 18, ...style }}>{children}</div>
  );
  const section: any = { maxWidth: 560, margin: "0 auto", padding: "40px 20px" };

  return (
    <div style={{ position: "absolute", inset: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", background: "linear-gradient(180deg,#0d0621 0%,#1a0e3a 40%,#12082e 100%)", fontFamily: "'Nunito',system-ui,sans-serif", color: "#fff" }}>

      {/* HERO */}
      <div style={{ ...section, paddingTop: "calc(46px + env(safe-area-inset-top,0px))", textAlign: "center" }}>
        <div style={{ fontSize: 72, marginBottom: 4, filter: "drop-shadow(0 8px 24px rgba(124,58,237,.5))" }}>🧸</div>
        <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: 15, color: "rgba(255,255,255,.55)", letterSpacing: ".5px", marginBottom: 14 }}>Toybox Trader</div>
        <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: 34, lineHeight: 1.15, marginBottom: 12 }}>Raise a<br /><span style={{ background: `linear-gradient(120deg,${GOLD},${PINK})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>money-smart kid</span> 🌱</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,.72)", lineHeight: 1.6, maxWidth: 440, margin: "0 auto 22px" }}>The playful app where kids <strong style={{ color: "#fff" }}>earn, save &amp; invest</strong> and learn about real money — safely. Screen time you'll actually feel good about.</div>
        <CTA />
        <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.45)", marginTop: 10 }}>Free to start · No credit card needed</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 22 }}>
          <Chip>🔒 Kid-safe</Chip><Chip>🚫 No real money</Chip><Chip>👶 Ages 8–17</Chip><Chip>✨ No ads</Chip>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <div style={section}>
        <H>How it works</H>
        <Sub>Three simple steps that turn screen time into real money skills.</Sub>
        {[
          { n: 1, icon: "🎮", c: P, t: "Play & learn", d: "Kids trade real companies — Apple, Roblox, Bitcoin — with pretend money, and complete fun bite-size money lessons." },
          { n: 2, icon: "✅", c: GREEN, t: "Earn by doing", d: "You assign chores, homework or kindness tasks. Kids complete them and earn coins — or real allowance you track (never moved)." },
          { n: 3, icon: "🏦", c: GOLD, t: "Save & grow", d: "Kids turn earnings into savings goals and investments, and watch their money grow. Real habits, zero risk." },
        ].map((s) => (
          <Card key={s.n} style={{ marginBottom: 12, display: "flex", gap: 14, alignItems: "flex-start" }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, background: `${s.c}22`, border: `1px solid ${s.c}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{s.icon}</div>
            <div><div style={{ fontFamily: "'Fredoka One',cursive", fontSize: 16, marginBottom: 3 }}><span style={{ color: s.c }}>{s.n}.</span> {s.t}</div><div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,.65)", lineHeight: 1.55 }}>{s.d}</div></div>
          </Card>
        ))}
      </div>

      {/* WHAT'S INSIDE */}
      <div style={section}>
        <H>Everything in the toybox</H>
        <Sub>One app that grows with your family.</Sub>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            ["📈", "Real market prices", "Live stock & crypto prices — with play money"],
            ["📚", "Money lessons", "Fun lessons + a Junior Investor certificate"],
            ["✅", "Chores & rewards", "Assign tasks, kids earn coins or allowance"],
            ["🏦", "Savings + match", "Goals with a parent match, like a 401(k)"],
            ["👨‍👩‍👧", "Family accounts", "All your kids, each with their own profile"],
            ["👵", "Grandparents", "Family circle can cheer & send gifts"],
            ["💛", "Together Time", "Kids ask for time & teaching, not just stuff"],
            ["🎨", "Fun & rewards", "Themes, avatars, streaks and daily bonuses"],
          ].map(([i, t, d]) => (
            <Card key={t as string} style={{ padding: 14 }}>
              <div style={{ fontSize: 26, marginBottom: 6 }}>{i}</div>
              <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: 14, marginBottom: 3 }}>{t}</div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: "rgba(255,255,255,.55)", lineHeight: 1.45 }}>{d}</div>
            </Card>
          ))}
        </div>
      </div>

      {/* WHY PARENTS LOVE IT */}
      <div style={section}>
        <H>Why parents love it 💜</H>
        <Card style={{ background: "linear-gradient(135deg,rgba(124,58,237,.14),rgba(236,72,153,.06))", border: "1px solid rgba(124,58,237,.3)" }}>
          {[
            "Screen time that builds real life skills",
            "Teaches the whole money cycle: earn → save → invest",
            "Brings the family closer, not glued to a screen alone",
            "Cheaper than the debit-card apps — and no card needed",
            "100% safe: no ads, no strangers, no real money moved",
          ].map((t) => (
            <div key={t} style={{ display: "flex", gap: 10, padding: "8px 0", fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,.88)", lineHeight: 1.5 }}><span style={{ color: GREEN, flexShrink: 0, fontSize: 16 }}>✓</span>{t}</div>
          ))}
        </Card>
      </div>

      {/* PRICING */}
      <div style={section}>
        <H>Start free. Upgrade if you love it.</H>
        <Sub>The core game is free forever. Toybox Plus unlocks the whole family experience.</Sub>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card>
            <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: 18, marginBottom: 4 }}>Free <span style={{ fontSize: 13, color: "rgba(255,255,255,.5)" }}>· forever</span></div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,.65)", lineHeight: 1.6 }}>The trading game, money lessons, 1 kid account, and basic chores &amp; rewards.</div>
          </Card>
          <Card style={{ border: `2px solid ${P}`, background: "linear-gradient(135deg,rgba(124,58,237,.18),rgba(245,158,11,.06))" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: 18 }}>⭐ Toybox Plus</div>
              <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: 16, color: "#fff" }}>$29.99<span style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>/yr</span></div>
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,.7)", lineHeight: 1.6, marginBottom: 6 }}>All your kids · full allowance &amp; savings match · family gifts · weekly reports · certificate · all themes.</div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#c4b5fd" }}>or $4.99/month — cancel anytime. Save 50% with yearly.</div>
          </Card>
        </div>
      </div>

      {/* SAFETY */}
      <div style={section}>
        <Card style={{ textAlign: "center", background: "rgba(16,185,129,.07)", border: "1px solid rgba(16,185,129,.25)" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🔒</div>
          <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: 18, marginBottom: 8 }}>Safe by design</div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "rgba(255,255,255,.7)", lineHeight: 1.65 }}>No real money ever moves. No ads. No strangers or chat. Parent-controlled, and your kids' progress is always yours. Just your family, learning together.</div>
        </Card>
      </div>

      {/* FAQ */}
      <div style={section}>
        <H>Questions?</H>
        {[
          ["Is it really safe for kids?", "Yes — no ads, no strangers, no chat, and no real money. It's parent-controlled and private to your family."],
          ["Does the app move real money?", "Never. Allowance is only tracked as a friendly note — you pay your child directly, however you like."],
          ["What ages is it for?", "Built for kids roughly 8–17, and grows with them from first chores to real investing concepts."],
          ["Do I need a credit card?", "No. Start completely free — upgrade only if you love it."],
        ].map(([q, a]) => (
          <Card key={q} style={{ marginBottom: 10 }}>
            <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: 14, marginBottom: 4 }}>{q}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,.65)", lineHeight: 1.55 }}>{a}</div>
          </Card>
        ))}
      </div>

      {/* FINAL CTA */}
      <div style={{ ...section, textAlign: "center", paddingBottom: 20 }}>
        <div style={{ fontSize: 54, marginBottom: 8 }}>🧸📈</div>
        <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: 26, marginBottom: 8 }}>Ready to start?</div>
        <Sub>Give your kids a head start on money — free, safe, and fun.</Sub>
        <div style={{ display: "flex", justifyContent: "center" }}><CTA label="Start Free Today 🚀" big /></div>
      </div>

      {/* FOOTER */}
      <div style={{ textAlign: "center", padding: "24px 20px calc(30px + env(safe-area-inset-bottom,0px))", borderTop: "1px solid rgba(255,255,255,.08)", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.4)", lineHeight: 1.8 }}>
        <div>🧸 <strong style={{ color: "rgba(255,255,255,.6)" }}>Toybox Trader</strong></div>
        <div style={{ margin: "6px 0" }}>Play money only — an educational simulator, not real trading.</div>
        <div><a href="/privacy.html" style={{ color: "rgba(167,139,250,.85)", textDecoration: "none" }}>Privacy Policy</a> · <a href="mailto:toyboxtrader.support@gmail.com" style={{ color: "rgba(167,139,250,.85)", textDecoration: "none" }}>Contact</a></div>
        <div style={{ marginTop: 6, opacity: .7 }}>© 2026 Toybox Trader</div>
      </div>
    </div>
  );
}

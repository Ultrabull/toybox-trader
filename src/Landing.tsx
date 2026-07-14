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
        <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: 33, lineHeight: 1.15, marginBottom: 12 }}>Give your kid a<br /><span style={{ background: `linear-gradient(120deg,${GOLD},${PINK})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>money-smart brain</span> 🧠</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,.72)", lineHeight: 1.6, maxWidth: 448, margin: "0 auto 22px" }}>A guided <strong style={{ color: "#fff" }}>money course</strong>, a personal <strong style={{ color: "#fff" }}>tutor</strong>, and a <strong style={{ color: "#fff" }}>weekly note</strong> showing what they learned — while kids earn, save &amp; invest with play money. Screen time that actually makes them smarter.</div>
        <CTA />
        <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.45)", marginTop: 10 }}>Free to start · No credit card needed</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 22 }}>
          <Chip>🔒 Kid-safe</Chip><Chip>🚫 No real money</Chip><Chip>👶 Ages 8–17</Chip><Chip>✨ No ads</Chip>
        </div>
      </div>

      {/* THE DIFFERENCE */}
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "8px 20px 12px" }}>
        <Card style={{ textAlign: "center", background: "linear-gradient(135deg,rgba(245,158,11,.12),rgba(236,72,153,.06))", border: "1px solid rgba(245,158,11,.28)" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", lineHeight: 1.55 }}>Other apps hand your kid a <span style={{ color: "rgba(255,255,255,.55)" }}>debit card</span >.<br />Toybox builds the <span style={{ color: GOLD }}>brain to use it well</span>.</div>
        </Card>
      </div>

      {/* HOW IT WORKS */}
      <div style={section}>
        <H>How it works</H>
        <Sub>A real money education, disguised as a game they love.</Sub>
        {[
          { n: 1, icon: "📚", c: P, t: "They learn", d: "A guided course takes kids from allowance and saving all the way to real investing — one fun, bite-size level at a time." },
          { n: 2, icon: "🎮", c: GREEN, t: "They practice", d: "Kids put it to work trading real companies — Apple, Roblox, Bitcoin — with play money. All the learning, zero risk." },
          { n: 3, icon: "📈", c: GOLD, t: "You see it stick", d: "Every Sunday, a note shows you what your kid learned that week — plus a question to ask them at dinner. Proof it's working." },
        ].map((s) => (
          <Card key={s.n} style={{ marginBottom: 12, display: "flex", gap: 14, alignItems: "flex-start" }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, background: `${s.c}22`, border: `1px solid ${s.c}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{s.icon}</div>
            <div><div style={{ fontFamily: "'Fredoka One',cursive", fontSize: 16, marginBottom: 3 }}><span style={{ color: s.c }}>{s.n}.</span> {s.t}</div><div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,.65)", lineHeight: 1.55 }}>{s.d}</div></div>
          </Card>
        ))}
      </div>

      {/* WHAT'S INSIDE */}
      <div style={section}>
        <H>What builds the brain</H>
        <Sub>A whole money education in one app — plus the family tools around it.</Sub>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            ["📚", "A real course", "4 levels: allowance → saving → real investing"],
            ["🦊", "Toby, AI tutor", "A personal money coach your kid can ask anything"],
            ["📈", "Weekly Parent Insight", "What they learned + a question to ask you"],
            ["🎓", "Junior Investor Certificate", "A real credential when they finish the course"],
            ["📊", "Real market practice", "Trade real companies with play money, zero risk"],
            ["👨‍👩‍👧", "All your kids", "Each with their own profile and progress"],
            ["✅", "Chores & allowance", "Assign tasks; track allowance (never moved)"],
            ["🏦", "Savings + match", "Goals with a parent match, like a 401(k)"],
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
            "It actually teaches — a real course, not a random game",
            "You SEE it working: a weekly note on what your kid learned",
            "A patient tutor answers the money questions you can't",
            "Builds lifelong money habits — earn, save, invest — zero risk",
            "100% safe: no ads, no strangers, no real money moved",
          ].map((t) => (
            <div key={t} style={{ display: "flex", gap: 10, padding: "8px 0", fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,.88)", lineHeight: 1.5 }}><span style={{ color: GREEN, flexShrink: 0, fontSize: 16 }}>✓</span>{t}</div>
          ))}
        </Card>
      </div>

      {/* PRICING */}
      <div style={section}>
        <H>Less than a coffee a month</H>
        <Sub>Start free with the first half of the course. Upgrade when you see it working.</Sub>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card>
            <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: 18, marginBottom: 4 }}>Free <span style={{ fontSize: 13, color: "rgba(255,255,255,.5)" }}>· forever</span></div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,.65)", lineHeight: 1.6 }}>The first 2 course levels, the trading game, and basic chores — for 1 kid. A real taste, free forever.</div>
          </Card>
          <Card style={{ border: `2px solid ${P}`, background: "linear-gradient(135deg,rgba(124,58,237,.18),rgba(245,158,11,.06))" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: 18 }}>⭐ Toybox Plus</div>
              <div style={{ fontFamily: "'Fredoka One',cursive", fontSize: 16, color: "#fff" }}>$29.99<span style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>/yr</span></div>
            </div>
            {[
              "📚 The full course — all 4 levels + certificate",
              "🦊 Toby — your kid's personal AI money tutor",
              "📈 Weekly Parent Insight — proof of what they learned",
              "👨‍👩‍👧 All your kids + allowance, savings match & family tools",
            ].map((t) => (
              <div key={t} style={{ display: "flex", gap: 8, padding: "3px 0", fontSize: 12.5, fontWeight: 700, color: "rgba(255,255,255,.85)", lineHeight: 1.5 }}><span style={{ color: GREEN, flexShrink: 0 }}>✓</span>{t}</div>
            ))}
            <div style={{ fontSize: 11, fontWeight: 800, color: "#c4b5fd", marginTop: 8 }}>or $4.99/month — cancel anytime. Save 50% with yearly.</div>
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
          ["Will it actually teach my kid?", "Yes — it's a structured course from allowance to investing, with a personal tutor and a weekly note showing you what stuck. The first half is free, so you can see for yourself."],
          ["What do I get with Toybox Plus?", "The full 4-level course + certificate, Toby (your kid's AI tutor), the weekly Parent Insight, all your kids, and the family tools like allowance and savings match."],
          ["Is it really safe for kids?", "Yes — no ads, no strangers, no chat, and no real money. It's parent-controlled and private to your family."],
          ["Does the app move real money?", "Never. Allowance is only tracked as a friendly note — you pay your child directly, however you like."],
          ["What ages is it for?", "Built for kids roughly 8–17, and grows with them from first chores to real investing concepts."],
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
        <Sub>Build your kid a money-smart brain — free to start, safe, and actually fun.</Sub>
        <div style={{ display: "flex", justifyContent: "center" }}><CTA label="Start Free Today 🚀" big /></div>
      </div>

      {/* FOOTER */}
      <div style={{ textAlign: "center", padding: "24px 20px calc(30px + env(safe-area-inset-bottom,0px))", borderTop: "1px solid rgba(255,255,255,.08)", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.4)", lineHeight: 1.8 }}>
        <div>🧸 <strong style={{ color: "rgba(255,255,255,.6)" }}>Toybox Trader</strong></div>
        <div style={{ margin: "6px 0" }}>Play money only — an educational simulator, not real trading.</div>
        <div><a href="/privacy.html" style={{ color: "rgba(167,139,250,.85)", textDecoration: "none" }}>Privacy Policy</a> · <a href="/terms.html" style={{ color: "rgba(167,139,250,.85)", textDecoration: "none" }}>Terms</a> · <a href="mailto:toyboxtrader.support@gmail.com" style={{ color: "rgba(167,139,250,.85)", textDecoration: "none" }}>Contact</a></div>
        <div style={{ marginTop: 6, opacity: .7 }}>© 2026 Toybox Trader</div>
      </div>
    </div>
  );
}

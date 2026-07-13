# Handoff — "A Day in Mom/Dad's Shoes" (next project)

> A standalone 3D life-sim, separate from Toybox Trader. This doc captures the
> idea, the design, the tech plan, and what we learned from the prototypes so
> the new project can start with a clear head. Move this file into the new repo
> when it's created.

## The goal (this is the north star)
**Kids understand what parents go through.** Not "a fun 3D game" for its own
sake — the win is a kid finishing a session and thinking *"ohhh, now I get why
Mom/Dad says no sometimes / is tired / can't buy everything."* Empathy first;
everything else serves that.

## The core concept — "A Day in Mom/Dad's Shoes"
The kid plays the parent for a day and juggles **three things that run out**:

- 💰 **Money** — a real budget; every yes to one thing is a no to another
- ⏰ **Time** — the day ticks by; everyone needs you at once
- ⚡ **Energy** — you get tired but still have to keep going

Against those limits they work a **to-do list the family needs** (breakfast,
school run, earn money at work, groceries on budget, pay a bill, tidy up,
bedtime), while **temptations** (coffee, a toy, rest) and **surprises** (extra
bill, spilled juice, car needs gas) push back. **You can't do it all — you must
prioritize and sacrifice.** That tension *is* the lesson.

Each day ends with a **debrief** (was the kid happy? bills paid? money left?
are you exhausted?) and a **reflection card** connecting it to their real
parent.

## The empathy engine (the features that make the goal land)
Movement alone won't teach empathy. These will:

- **Scarcity + impossible choices** — the money/time/energy squeeze is the heart.
- 🙅 **The "saying no" moment** — the kid-NPC asks for a toy; you're out of
  money; you have to say "not today." Kids feel the *other side* of that.
- ⚖️ **Sacrifice mechanic** — help yourself vs the family visibly trade off;
  choosing family gives a warm "good parent" beat.
- 📊 **"Your parent does this ~30 times a month"** — a stat that lands reality.
- 💌 **"Say thanks" ending** — a little note the kid can show their real
  grown-up. (Emotionally powerful; parents will love it.)
- 🎚️ **Age-tuned difficulty** — gentle "helper day" for little kids, tougher
  "real week" for older ones.
- 🌱 **Money through-line** — the parent also has to save a little for the
  family's future. (Bridges to Toybox Trader's core money theme if we ever
  link them.)

## Where 3D movement fits
Walking / running / **driving** is the **immersion layer** — it makes the day
feel real and memorable (physically go to the kitchen, drive to school). It is
NOT the point. **Design the world to funnel the kid toward the tradeoff
moments** (home → shop → school → work) so movement always leads to a
meaningful choice — never aimless free-roam.

## Recommended tech stack (web-first, phone-friendly, kid-safe)
Chosen so it can be built/maintained in code sessions AND grow elaborate:

- **react-three-fiber** (React + Three.js) **+ Rapier physics**
  (`@react-three/rapier`) — third-person character controller (walk/run),
  collisions, driving; large ecosystem.
- **Vite** build → **Cloudflare Pages** hosting → **Capacitor** wrap for the
  App/Play stores (same pipeline Toybox Trader already uses).
- **Free CC0 low-poly assets** for characters + walk/run animations
  (Quaternius, Mixamo) — looks good, no budget. Start with a simple blocky
  character to prove feel, then upgrade art.
- **Kid-safe by design**: single-player, no strangers, no chat.

### Honest scope note
A rich, growing 3D life-sim on web + phone is realistic. Literal *Minecraft
scale* (infinite worlds, multiplayer servers) is not, for a hobby web project.
"Elaborate" is achieved via a solid foundation + steady phases, not one big
push.

## Phased plan
- **Phase A — Parent's Morning (first prototype):** a walkable character in a
  small home; the 3 meters; a couple of tasks; one temptation; one surprise;
  the debrief + "say thanks" reflection. Proves the *empathy feel*.
- **Phase B — Driving & a town:** enter/drive a car between home, shop, school,
  work; a full-day schedule.
- **Phase C — A week:** harder surprises; the "save for the future" money
  tie-in; longer arcs.
- **Phase D — More roles (same engine):** teacher juggling 20 kids, nurse,
  etc. Parent stays the flagship.

## What we prototyped in Toybox Trader (and then removed)
To choose a direction we built three throwaway prototypes inside the trading
app, then **removed them** so that app stays lean:

- **Isometric 2.5D room builder** (tap-to-place furniture) — cheap, smooth,
  looked like The Sims.
- **True 3D voxel builder** (Three.js, Minecraft-style) — drag/spin/stack.
- **"Dream Jobs"** — build a home in 3D → hit a goal → money/life-lesson
  choice cards → coins.

**What we learned:**
1. **3D won** on feel — the user preferred true 3D over isometric.
2. **Building + cards wasn't enough** — the real goal (empathy) needs the
   money/time/energy tradeoff engine + reflection, not just building and
   quizzes.
3. **Keep it separate** — a life-sim doesn't belong bolted into the trading
   app; it needs its own repo, stack, and release pace.

(These were removed from `ToyboxFull.tsx`; the `three` dependency was
uninstalled. History is in git if any code is worth referencing.)

## Open questions to settle at kickoff
1. **Name** — candidates: *Big Shoes*, *A Day in My Shoes*, *Grown-Up Land*,
   *Parentville*, *Toybox Life*.
2. **Kids' ages** — sets how hard/real the tradeoffs should be.
3. **Standalone vs linked** — start standalone; optionally share the Toybox
   family login and let coins/lessons flow between the two apps later.

## First setup steps (new repo)
1. Create a new GitHub repo (e.g. `parent-life-sim`).
2. Scaffold Vite + react-three-fiber + @react-three/rapier + drei.
3. Build **Phase A (Parent's Morning)** as the first playable slice.
4. Deploy to its own Cloudflare Pages URL to feel it on a phone.
5. Leave Toybox Trader untouched.

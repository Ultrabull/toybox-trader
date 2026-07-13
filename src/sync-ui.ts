import { apiUrl } from "./api";
// Floating "☁️" family-login widget. Lets a parent set up sync once per device:
//   • Create family  — first time, on the device that has the kids' progress.
//   • Sign in        — on any other device, to load the same kids.
//   • Signed-in view — shows who's signed in, with a Sign out button.
//
// Kids never need this — once a device is signed in it stays signed in, so they
// just open the app and use their profiles as normal. Built with plain DOM so
// it can't interfere with the game.

export function mountSyncUI() {
  if (typeof document === "undefined") return;
  if (document.getElementById("tbx-sync-btn")) return;
  const sync = window.toyboxSync;
  if (!sync) return;

  const style = document.createElement("style");
  style.textContent = `
    #tbx-sync-btn{position:fixed;bottom:14px;right:14px;z-index:2147483000;
      width:44px;height:44px;border-radius:50%;border:none;cursor:pointer;
      background:rgba(20,16,40,.72);color:#fff;font-size:20px;line-height:44px;
      box-shadow:0 4px 16px rgba(0,0,0,.4);backdrop-filter:blur(6px);opacity:.85}
    #tbx-sync-btn:hover{opacity:1;transform:scale(1.05)}
    #tbx-sync-ov{position:fixed;inset:0;z-index:2147483001;display:none;
      align-items:center;justify-content:center;background:rgba(0,0,0,.6);
      padding:18px;font-family:'Nunito',system-ui,sans-serif}
    #tbx-sync-ov.open{display:flex}
    #tbx-sync-panel{width:100%;max-width:370px;background:#141028;color:#fff;
      border:1px solid rgba(255,255,255,.14);border-radius:18px;padding:22px;
      box-shadow:0 20px 60px rgba(0,0,0,.5);max-height:92vh;overflow:auto}
    #tbx-sync-panel h3{margin:0 0 4px;font-size:20px}
    #tbx-sync-panel .muted{color:rgba(255,255,255,.6);font-size:12.5px;line-height:1.55}
    #tbx-sync-panel label{display:block;font-size:12px;font-weight:800;
      color:rgba(255,255,255,.6);margin:14px 0 5px}
    #tbx-sync-panel input{width:100%;background:rgba(255,255,255,.07);
      border:1px solid rgba(255,255,255,.14);border-radius:11px;color:#fff;
      padding:12px 13px;font-size:15px}
    #tbx-sync-panel input:focus{outline:none;border-color:#9333ea}
    #tbx-sync-panel button.act{width:100%;margin-top:16px;border:none;border-radius:12px;
      cursor:pointer;font-weight:800;font-size:15px;padding:13px;color:#fff;
      background:linear-gradient(135deg,#7c3aed,#9333ea)}
    #tbx-sync-panel button.act:disabled{opacity:.5;cursor:default}
    #tbx-sync-panel .link{background:none;border:none;color:#c4b5fd;cursor:pointer;
      font-size:13px;font-weight:700;padding:0;margin-top:14px;text-decoration:underline}
    #tbx-sync-panel .ghost{width:100%;margin-top:10px;background:transparent;
      border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.75);border-radius:12px;
      cursor:pointer;padding:11px;font-weight:700;font-size:13.5px}
    #tbx-sync-panel .status{display:inline-block;font-size:11px;font-weight:800;
      padding:3px 9px;border-radius:100px;margin-top:2px}
    #tbx-sync-panel .status.cloud{background:rgba(16,185,129,.18);color:#6ee7b7}
    #tbx-sync-panel .status.offline{background:rgba(148,163,184,.18);color:#cbd5e1}
    #tbx-sync-msg{font-size:12.5px;margin-top:12px;min-height:16px;line-height:1.5}
    #tbx-sync-close{margin-top:16px}
    #tbx-sync-panel hr.sep{border:none;border-top:1px solid rgba(255,255,255,.1);margin:18px 0}
    #tbx-sync-panel .lbl2{font-size:13px;font-weight:800;margin:0 0 4px}
    #tbx-sync-panel .rowb{display:flex;gap:8px;margin-top:10px}
    #tbx-sync-panel .rowb button{margin-top:0}
    #tbx-tg-state{font-size:12px;font-weight:800;margin:10px 0 2px}
    #tbx-tg-msg{font-size:12px;margin-top:8px;min-height:14px;line-height:1.5}
  `;
  document.head.appendChild(style);

  const btn = document.createElement("button");
  btn.id = "tbx-sync-btn";
  btn.type = "button";
  btn.textContent = "☁️";
  btn.title = "Family sync / sign in";
  document.body.appendChild(btn);

  const ov = document.createElement("div");
  ov.id = "tbx-sync-ov";
  const panel = document.createElement("div");
  panel.id = "tbx-sync-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Family sync");
  ov.appendChild(panel);
  document.body.appendChild(ov);

  let mode: "signin" | "create" = "signin";

  const close = () => ov.classList.remove("open");

  function render() {
    const st = sync.state();
    if (st.signedIn) {
      panel.innerHTML = `
        <h3>☁️ Family sync</h3>
        <div><span class="status ${st.status === "cloud" ? "cloud" : "offline"}">${
          st.status === "cloud" ? "Synced" : "Offline — will resync when online"
        }</span></div>
        <p class="muted" style="margin-top:12px">Signed in as <strong>${escapeHtml(
          st.email || "",
        )}</strong>.<br/>Your kids' accounts sync automatically across every device you sign in on. The kids just open the app as usual.</p>

        <hr class="sep" />
        <div class="lbl2">🔔 Telegram alerts</div>
        <p class="muted">Get a Telegram message when your kids trade or earn a badge. Paste your Telegram <strong>chat ID</strong> below (message <strong>@userinfobot</strong> on Telegram to get it).</p>
        <div id="tbx-tg-state">Checking…</div>
        <input id="tbx-tg-chat" type="text" inputmode="numeric" placeholder="e.g. 123456789" autocomplete="off" />
        <div class="rowb">
          <button class="act" id="tbx-tg-save" type="button">Connect</button>
          <button class="ghost" id="tbx-tg-test" type="button">Send test</button>
        </div>
        <div id="tbx-tg-msg"></div>

        <hr class="sep" />
        <div class="lbl2">📧 Email updates</div>
        <p class="muted">Get a weekly &amp; monthly summary of your kids' trades, portfolio and progress by email.</p>
        <div id="tbx-em-state">Checking…</div>
        <input id="tbx-em-addr" type="email" inputmode="email" placeholder="parent@example.com" autocomplete="email" spellcheck="false" />
        <div class="rowb">
          <button class="act" id="tbx-em-save" type="button">Save</button>
          <button class="ghost" id="tbx-em-test" type="button">Send test</button>
        </div>
        <div id="tbx-em-msg"></div>

        <hr class="sep" />
        <div class="lbl2">⭐ Toybox Plus</div>
        <div id="tbx-plus-body"></div>

        <hr class="sep" />
        <button class="ghost" id="tbx-signout" type="button">Sign out on this device</button>
        <button class="ghost" id="tbx-del-open" type="button" style="color:#fca5a5;border-color:rgba(239,68,68,.35)">Delete account &amp; all data</button>
        <div id="tbx-del-box"></div>
        <button class="ghost" id="tbx-sync-close" type="button">Close</button>`;

      // ── Account deletion (behind a parental gate) ──
      const delBox = panel.querySelector<HTMLElement>("#tbx-del-box")!;
      panel.querySelector<HTMLButtonElement>("#tbx-del-open")!.onclick = () => {
        if (delBox.dataset.open) {
          delBox.dataset.open = "";
          delBox.innerHTML = "";
          return;
        }
        delBox.dataset.open = "1";
        // Simple math parental gate — a young child shouldn't pass it.
        const a = 6 + Math.floor((Date.now() / 1000) % 4); // 6..9, varies
        const b = 7 + Math.floor((Date.now() / 700) % 3); // 7..9, varies
        delBox.innerHTML = `
          <div style="border:1px solid rgba(239,68,68,.35);border-radius:12px;padding:14px;margin-top:10px;text-align:left">
            <div style="font-size:12.5px;color:#fca5a5;font-weight:800;margin-bottom:6px">⚠️ This permanently deletes ALL your kids' accounts and progress on every device. It can't be undone.</div>
            <div style="font-size:12px;color:rgba(255,255,255,.6);margin-bottom:10px">Grown-up check: what is <strong>${a} × ${b}</strong>? Then type <strong>DELETE</strong> to confirm.</div>
            <input id="tbx-del-math" inputmode="numeric" placeholder="Answer to ${a} × ${b}" style="width:100%;margin-bottom:8px" />
            <input id="tbx-del-word" placeholder="Type DELETE" autocomplete="off" style="width:100%;margin-bottom:10px" />
            <button class="ghost" id="tbx-del-go" type="button" style="color:#fff;background:linear-gradient(135deg,#ef4444,#dc2626);border:none">Permanently delete everything</button>
            <div id="tbx-del-msg" style="font-size:12px;margin-top:8px;min-height:14px"></div>
          </div>`;
        const mathIn = delBox.querySelector<HTMLInputElement>("#tbx-del-math")!;
        const wordIn = delBox.querySelector<HTMLInputElement>("#tbx-del-word")!;
        const delMsg = delBox.querySelector<HTMLElement>("#tbx-del-msg")!;
        delBox.querySelector<HTMLButtonElement>("#tbx-del-go")!.onclick = async () => {
          if (parseInt(mathIn.value, 10) !== a * b) {
            delMsg.style.color = "#fca5a5";
            delMsg.textContent = "That math answer isn't right — ask a grown-up.";
            return;
          }
          if (wordIn.value.trim().toUpperCase() !== "DELETE") {
            delMsg.style.color = "#fca5a5";
            delMsg.textContent = 'Please type DELETE to confirm.';
            return;
          }
          delMsg.style.color = "rgba(255,255,255,.75)";
          delMsg.textContent = "Deleting everything…";
          await sync.deleteAccount();
          delMsg.style.color = "#6ee7b7";
          delMsg.textContent = "Deleted. Reloading…";
          setTimeout(() => location.reload(), 900);
        };
      };

      const chatInput = panel.querySelector<HTMLInputElement>("#tbx-tg-chat")!;
      const tgState = panel.querySelector<HTMLElement>("#tbx-tg-state")!;
      const tgMsg = panel.querySelector<HTMLElement>("#tbx-tg-msg")!;
      const setMsg = (t: string, color: string) => {
        tgMsg.style.color = color;
        tgMsg.textContent = t;
      };

      // Load the currently linked chat id (if any).
      window.storage?.get("toybox:telegram:chat").then((r) => {
        const chat = (r?.value || "").trim();
        if (chat) {
          tgState.style.color = "#6ee7b7";
          tgState.textContent = "✅ Connected";
          chatInput.value = chat;
        } else {
          tgState.style.color = "rgba(255,255,255,.6)";
          tgState.textContent = "Not connected yet.";
        }
      });

      panel.querySelector<HTMLButtonElement>("#tbx-tg-save")!.onclick = async () => {
        const id = chatInput.value.trim();
        if (!/^-?\d{5,}$/.test(id)) {
          setMsg("That doesn't look like a chat ID (it's a number). Message @userinfobot to get yours.", "#fca5a5");
          return;
        }
        await window.storage?.set("toybox:telegram:chat", id);
        tgState.style.color = "#6ee7b7";
        tgState.textContent = "✅ Connected";
        setMsg("Saved. Tap “Send test” to check it works.", "#6ee7b7");
      };

      panel.querySelector<HTMLButtonElement>("#tbx-tg-test")!.onclick = async () => {
        const id = chatInput.value.trim();
        if (id) await window.storage?.set("toybox:telegram:chat", id);
        setMsg("Sending test…", "rgba(255,255,255,.75)");
        // Give the cloud write a moment to land before the server reads it.
        await new Promise((r) => setTimeout(r, 900));
        const res = await sync.notify("🧸 Toybox Trader test alert — you're all set! ✅");
        if (res.ok) setMsg("Sent! Check your Telegram. ✅", "#6ee7b7");
        else setMsg(msgForError(res.error), "#fca5a5");
      };

      const disc = document.createElement("button");
      disc.className = "ghost";
      disc.textContent = "Disconnect Telegram";
      disc.type = "button";
      tgMsg.after(disc);
      disc.onclick = async () => {
        await window.storage?.delete("toybox:telegram:chat");
        chatInput.value = "";
        tgState.style.color = "rgba(255,255,255,.6)";
        tgState.textContent = "Not connected yet.";
        setMsg("Disconnected.", "rgba(255,255,255,.6)");
      };

      // ── Email updates ──
      const emAddr = panel.querySelector<HTMLInputElement>("#tbx-em-addr")!;
      const emState = panel.querySelector<HTMLElement>("#tbx-em-state")!;
      const emMsg = panel.querySelector<HTMLElement>("#tbx-em-msg")!;
      const emSet = (t: string, c: string) => {
        emMsg.style.color = c;
        emMsg.textContent = t;
      };
      window.storage?.get("toybox:email:notify").then((r) => {
        const em = (r?.value || "").trim();
        if (em) {
          emState.style.color = "#6ee7b7";
          emState.textContent = "✅ Sending to " + em;
          emAddr.value = em;
        } else {
          emState.style.color = "rgba(255,255,255,.6)";
          emState.textContent = "Not set up yet.";
        }
      });
      panel.querySelector<HTMLButtonElement>("#tbx-em-save")!.onclick = async () => {
        const em = emAddr.value.trim();
        if (!/.+@.+\..+/.test(em)) {
          emSet("That doesn't look like an email address.", "#fca5a5");
          return;
        }
        await window.storage?.set("toybox:email:notify", em);
        emState.style.color = "#6ee7b7";
        emState.textContent = "✅ Sending to " + em;
        emSet("Saved. You'll get weekly & monthly summaries.", "#6ee7b7");
      };
      panel.querySelector<HTMLButtonElement>("#tbx-em-test")!.onclick = async () => {
        const em = emAddr.value.trim();
        if (em) await window.storage?.set("toybox:email:notify", em);
        emSet("Sending test email…", "rgba(255,255,255,.75)");
        await new Promise((r) => setTimeout(r, 900)); // let the save reach the cloud
        try {
          const res = await fetch(apiUrl("/api/email-test"), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ space: (localStorage.getItem("toybox:sync:space") || "") }),
          });
          const d = await res.json().catch(() => ({}));
          if (d?.ok) emSet("Sent! Check your inbox (and spam). ✅", "#6ee7b7");
          else if (d?.error === "email-not-configured") emSet("Email isn't set up on the server yet (needs RESEND_API_KEY).", "#fca5a5");
          else emSet("Couldn't send: " + (d?.error || "unknown") + ".", "#fca5a5");
        } catch {
          emSet("Couldn't reach the server.", "#fca5a5");
        }
      };

      // ── Toybox Plus (parent unlock) ──
      // The signed-in panel is already parent-only (needs the family password),
      // so this acts as the parental gate. Today it flips a synced flag; once
      // real in-app purchases are added, this button becomes "Subscribe".
      const plusBody = panel.querySelector<HTMLElement>("#tbx-plus-body")!;
      const renderPlus = (active: boolean) => {
        if (active) {
          plusBody.innerHTML = `<div style="font-size:12.5px;color:#6ee7b7;font-weight:800">✓ Toybox Plus is active for your family 🎉</div>`;
          return;
        }
        plusBody.innerHTML = `
          <p class="muted">Unlock more lessons, family accounts, the leaderboard, parent reports, and exclusive pet crowns. Your kids get an instant reward when you unlock. 💛</p>
          <button class="act" id="tbx-plus-unlock" type="button" style="margin-top:8px">⭐ Unlock Toybox Plus</button>
          <div id="tbx-plus-msg" style="font-size:12px;margin-top:8px;min-height:14px"></div>`;
        plusBody.querySelector<HTMLButtonElement>("#tbx-plus-unlock")!.onclick = async () => {
          const msg = plusBody.querySelector<HTMLElement>("#tbx-plus-msg")!;
          msg.style.color = "rgba(255,255,255,.75)";
          msg.textContent = "Unlocking…";
          await window.storage?.set("toybox:family:premium", "true");
          msg.style.color = "#6ee7b7";
          msg.textContent = "Unlocked! Reloading…";
          setTimeout(() => location.reload(), 900);
        };
      };
      window.storage?.get("toybox:family:premium").then((r) => {
        const v = (r?.value || "").trim();
        renderPlus(v === "true" || v === "1");
      });

      panel.querySelector<HTMLButtonElement>("#tbx-signout")!.onclick = () => {
        sync.signOut();
        mode = "signin";
        render();
      };
      panel.querySelector<HTMLButtonElement>("#tbx-sync-close")!.onclick = close;
      return;
    }

    const creating = mode === "create";
    panel.innerHTML = `
      <h3>☁️ ${creating ? "Create your family" : "Sign in to sync"}</h3>
      <p class="muted">${
        creating
          ? "Do this once, on the device that has your kids' accounts. Then sign in with the same email &amp; password on any other device to see them there."
          : "Sign in with your family email &amp; password to load your kids on this device."
      }</p>
      <label for="tbx-email">Email</label>
      <input id="tbx-email" type="email" inputmode="email" autocomplete="username"
        placeholder="you@example.com" spellcheck="false" />
      <label for="tbx-pass">Password</label>
      <input id="tbx-pass" type="password" autocomplete="${creating ? "new-password" : "current-password"}"
        placeholder="${creating ? "Choose a password (6+ characters)" : "Your password"}" />
      <button class="act" id="tbx-submit" type="button">${creating ? "Create family & sync" : "Sign in"}</button>
      <div id="tbx-sync-msg"></div>
      <button class="link" id="tbx-toggle" type="button">${
        creating ? "Already set up? Sign in" : "First time? Create your family"
      }</button>
      <button class="ghost" id="tbx-sync-close" type="button">Close</button>`;

    const email = panel.querySelector<HTMLInputElement>("#tbx-email")!;
    const pass = panel.querySelector<HTMLInputElement>("#tbx-pass")!;
    const submit = panel.querySelector<HTMLButtonElement>("#tbx-submit")!;
    const msg = panel.querySelector<HTMLElement>("#tbx-sync-msg")!;
    email.value = lastEmail;

    submit.onclick = async () => {
      lastEmail = email.value;
      msg.style.color = "rgba(255,255,255,.75)";
      msg.textContent = creating ? "Creating…" : "Signing in…";
      submit.disabled = true;
      const res = creating
        ? await sync.createFamily(email.value, pass.value)
        : await sync.signIn(email.value, pass.value);
      submit.disabled = false;
      if (res.ok) {
        msg.style.color = "#6ee7b7";
        msg.textContent = creating ? "Family created! Reloading…" : "Signed in! Loading your kids…";
        setTimeout(() => location.reload(), 700);
      } else {
        msg.style.color = "#fca5a5";
        msg.textContent = res.error || "Something went wrong.";
      }
    };
    pass.onkeydown = (e) => {
      if (e.key === "Enter") submit.click();
    };
    panel.querySelector<HTMLButtonElement>("#tbx-toggle")!.onclick = () => {
      mode = creating ? "signin" : "create";
      render();
    };
    panel.querySelector<HTMLButtonElement>("#tbx-sync-close")!.onclick = close;
  }

  let lastEmail = "";

  btn.addEventListener("click", () => {
    render();
    ov.classList.add("open");
  });
  ov.addEventListener("click", (e) => {
    if (e.target === ov) close();
  });
}

function msgForError(error?: string): string {
  switch (error) {
    case "not-connected":
      return "Saved, but no chat is linked yet — tap Connect first, then test.";
    case "telegram-not-configured":
      return "The bot isn't set up on the server yet. Add TELEGRAM_BOT_TOKEN in Netlify (see setup steps).";
    case "no-database":
      return "Cloud storage isn't connected. Set up Neon first.";
    case "Sign in to enable alerts.":
      return "Sign in to your family first.";
    default:
      return error || "Couldn't send. Double-check the chat ID and that you've messaged your bot once.";
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

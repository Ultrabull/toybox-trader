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
        <button class="ghost" id="tbx-signout" type="button">Sign out on this device</button>
        <button class="ghost" id="tbx-sync-close" type="button">Close</button>`;
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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

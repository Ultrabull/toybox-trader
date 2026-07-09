// A small, self-contained floating "☁️" widget that lets a parent:
//   • see this household's Family Sync Code (and copy it),
//   • link a NEW device by pasting a code from an existing device.
//
// It's built with plain DOM (no React) and mounted outside the app's root, so
// it can never interfere with the game itself.

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
    #tbx-sync-panel{width:100%;max-width:380px;background:#141028;color:#fff;
      border:1px solid rgba(255,255,255,.14);border-radius:18px;padding:20px;
      box-shadow:0 20px 60px rgba(0,0,0,.5);max-height:90vh;overflow:auto}
    #tbx-sync-panel h3{margin:0 0 2px;font-size:19px}
    #tbx-sync-panel .muted{color:rgba(255,255,255,.6);font-size:12.5px;line-height:1.5}
    #tbx-sync-panel .lbl{font-size:12px;font-weight:800;letter-spacing:.02em;
      text-transform:uppercase;color:rgba(255,255,255,.55);margin:16px 0 6px}
    #tbx-sync-code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;
      word-break:break-all;background:rgba(255,255,255,.07);border-radius:10px;
      padding:10px 12px;border:1px solid rgba(255,255,255,.12)}
    #tbx-sync-panel .row{display:flex;gap:8px;margin-top:8px}
    #tbx-sync-panel input{flex:1;min-width:0;background:rgba(255,255,255,.07);
      border:1px solid rgba(255,255,255,.14);border-radius:10px;color:#fff;
      padding:10px 12px;font-size:14px}
    #tbx-sync-panel button.act{border:none;border-radius:10px;cursor:pointer;
      font-weight:800;font-size:13.5px;padding:10px 14px;color:#fff;
      background:linear-gradient(135deg,#7c3aed,#9333ea)}
    #tbx-sync-panel button.ghost{background:transparent;border:1px solid rgba(255,255,255,.2);
      color:rgba(255,255,255,.75);border-radius:10px;cursor:pointer;padding:10px 14px;
      font-weight:700;font-size:13.5px}
    #tbx-sync-panel .status{display:inline-block;font-size:11px;font-weight:800;
      padding:3px 9px;border-radius:100px;margin-top:8px}
    #tbx-sync-panel .status.cloud{background:rgba(16,185,129,.18);color:#6ee7b7}
    #tbx-sync-panel .status.offline{background:rgba(148,163,184,.18);color:#cbd5e1}
    #tbx-sync-msg{font-size:12.5px;margin-top:8px;min-height:16px}
    #tbx-sync-hr{border:none;border-top:1px solid rgba(255,255,255,.1);margin:18px 0}
  `;
  document.head.appendChild(style);

  const btn = document.createElement("button");
  btn.id = "tbx-sync-btn";
  btn.type = "button";
  btn.textContent = "☁️";
  btn.title = "Sync across devices";
  document.body.appendChild(btn);

  const ov = document.createElement("div");
  ov.id = "tbx-sync-ov";
  const isCloud = sync.status() === "cloud";
  ov.innerHTML = `
    <div id="tbx-sync-panel" role="dialog" aria-label="Sync across devices">
      <h3>☁️ Sync across devices</h3>
      <div class="muted">Your kids' accounts &amp; progress are saved to the cloud.
        Use the code below to load them on another phone, tablet, or computer.</div>
      <div><span class="status ${isCloud ? "cloud" : "offline"}">${
        isCloud ? "Cloud connected" : "Offline — local only"
      }</span></div>

      <div class="lbl">Your Family Sync Code</div>
      <div id="tbx-sync-code"></div>
      <div class="row">
        <button class="act" id="tbx-sync-copy" type="button">Copy code</button>
      </div>
      <div class="muted" style="margin-top:8px">Enter this on a new device to load your kids' accounts.</div>

      <hr id="tbx-sync-hr" />

      <div class="lbl">Link this device</div>
      <div class="muted">Paste a Family Sync Code from another device to load its
        accounts here. <strong>This replaces whatever is on this device.</strong></div>
      <div class="row">
        <input id="tbx-sync-input" placeholder="fam_…" autocomplete="off" spellcheck="false" />
        <button class="act" id="tbx-sync-link" type="button">Link</button>
      </div>
      <div id="tbx-sync-msg"></div>

      <hr id="tbx-sync-hr" />
      <div class="row" style="justify-content:flex-end">
        <button class="ghost" id="tbx-sync-close" type="button">Close</button>
      </div>
    </div>`;
  document.body.appendChild(ov);

  const $ = (id: string) => ov.querySelector<HTMLElement>("#" + id)!;
  const codeEl = $("tbx-sync-code");
  const msgEl = $("tbx-sync-msg");
  const input = $("tbx-sync-input") as HTMLInputElement;

  const refreshCode = () => {
    codeEl.textContent = sync.getCode();
  };
  const open = () => {
    refreshCode();
    msgEl.textContent = "";
    input.value = "";
    ov.classList.add("open");
  };
  const close = () => ov.classList.remove("open");

  btn.addEventListener("click", open);
  $("tbx-sync-close").addEventListener("click", close);
  ov.addEventListener("click", (e) => {
    if (e.target === ov) close();
  });

  $("tbx-sync-copy").addEventListener("click", async () => {
    const code = sync.getCode();
    try {
      await navigator.clipboard.writeText(code);
      msgEl.style.color = "#6ee7b7";
      msgEl.textContent = "Copied! ✓";
    } catch {
      msgEl.style.color = "#fca5a5";
      msgEl.textContent = "Couldn't copy automatically — select the code and copy it.";
    }
  });

  $("tbx-sync-link").addEventListener("click", async () => {
    const code = input.value.trim();
    msgEl.style.color = "rgba(255,255,255,.75)";
    msgEl.textContent = "Linking…";
    const res = await sync.link(code);
    if (res.ok) {
      msgEl.style.color = "#6ee7b7";
      msgEl.textContent = "Linked! Reloading…";
      setTimeout(() => location.reload(), 700);
    } else {
      msgEl.style.color = "#fca5a5";
      msgEl.textContent = res.error || "Couldn't link this device.";
    }
  });
}

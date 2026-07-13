// Small floating "🔔" button that lets a kid turn on daily reminders on this
// device. Plain DOM, mounted outside the app root so it can't affect the game.
// Sits just above the ☁️ sync button.

import { enablePush, disablePush, isSubscribed, pushState } from "./push";

export async function mountPushUI() {
  if (typeof document === "undefined") return;
  if (document.getElementById("tbx-push-btn")) return;
  // Hide entirely on devices that can't ever do push (keeps the UI clean).
  if (pushState() === "unsupported") return;

  const style = document.createElement("style");
  style.textContent = `
    #tbx-push-btn{position:fixed;bottom:calc(128px + env(safe-area-inset-bottom,0px));right:14px;z-index:2147483000;
      width:44px;height:44px;border-radius:50%;border:none;cursor:pointer;
      background:rgba(20,16,40,.72);color:#fff;font-size:20px;line-height:44px;
      box-shadow:0 4px 16px rgba(0,0,0,.4);backdrop-filter:blur(6px);opacity:.85}
    #tbx-push-btn:hover{opacity:1;transform:scale(1.05)}
    #tbx-push-btn.on{background:rgba(16,185,129,.85)}
    #tbx-push-ov{position:fixed;inset:0;z-index:2147483001;display:none;
      align-items:center;justify-content:center;background:rgba(0,0,0,.6);
      padding:18px;font-family:'Nunito',system-ui,sans-serif}
    #tbx-push-ov.open{display:flex}
    #tbx-push-panel{width:100%;max-width:340px;background:#141028;color:#fff;
      border:1px solid rgba(255,255,255,.14);border-radius:18px;padding:22px;text-align:center;
      box-shadow:0 20px 60px rgba(0,0,0,.5)}
    #tbx-push-panel h3{margin:0 0 8px;font-size:19px}
    #tbx-push-panel p{color:rgba(255,255,255,.62);font-size:13px;line-height:1.55;margin:0 0 14px}
    #tbx-push-panel button.act{width:100%;border:none;border-radius:12px;cursor:pointer;
      font-weight:800;font-size:15px;padding:13px;color:#fff;background:linear-gradient(135deg,#7c3aed,#9333ea)}
    #tbx-push-panel button.ghost{width:100%;margin-top:10px;background:transparent;
      border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.75);border-radius:12px;
      cursor:pointer;padding:11px;font-weight:700;font-size:13.5px}
    #tbx-push-msg{font-size:12.5px;margin-top:10px;min-height:15px;line-height:1.5}
  `;
  document.head.appendChild(style);

  const btn = document.createElement("button");
  btn.id = "tbx-push-btn";
  btn.type = "button";
  btn.textContent = "🔔";
  btn.title = "Daily reminders";
  document.body.appendChild(btn);

  const ov = document.createElement("div");
  ov.id = "tbx-push-ov";
  ov.innerHTML = `
    <div id="tbx-push-panel" role="dialog" aria-label="Reminders">
      <div style="font-size:44px">🔔</div>
      <h3>Daily reminders</h3>
      <p>Get a little nudge when your daily bonus is ready and when a price prediction resolves. Keeps your streak alive! 🔥</p>
      <div id="tbx-push-body"></div>
      <div id="tbx-push-msg"></div>
      <button class="ghost" id="tbx-push-close" type="button">Close</button>
    </div>`;
  document.body.appendChild(ov);

  const $ = (id: string) => ov.querySelector<HTMLElement>("#" + id)!;
  const body = $("tbx-push-body");
  const msg = $("tbx-push-msg");

  async function refresh() {
    const on = await isSubscribed();
    btn.classList.toggle("on", on);
    const state = pushState();
    if (on) {
      body.innerHTML = `<button class="ghost" id="tbx-push-off" type="button">Turn off reminders</button>`;
      $("tbx-push-off").onclick = async () => {
        await disablePush();
        msg.style.color = "rgba(255,255,255,.6)";
        msg.textContent = "Reminders turned off.";
        refresh();
      };
    } else if (state === "needs-install") {
      body.innerHTML = "";
      msg.style.color = "#fca5a5";
      msg.textContent = "On iPhone/iPad: tap Share → Add to Home Screen, open it from your home screen, then turn on reminders.";
    } else {
      body.innerHTML = `<button class="act" id="tbx-push-on" type="button">Turn on reminders 🔔</button>`;
      $("tbx-push-on").onclick = async () => {
        msg.style.color = "rgba(255,255,255,.75)";
        msg.textContent = "Setting up…";
        const res = await enablePush();
        if (res.ok) {
          msg.style.color = "#6ee7b7";
          msg.textContent = "Reminders are on! 🎉";
        } else {
          msg.style.color = "#fca5a5";
          msg.textContent = res.error || "Couldn't turn on reminders.";
        }
        refresh();
      };
    }
  }

  btn.addEventListener("click", () => {
    msg.textContent = "";
    refresh();
    ov.classList.add("open");
  });
  $("tbx-push-close").onclick = () => ov.classList.remove("open");
  ov.addEventListener("click", (e) => {
    if (e.target === ov) ov.classList.remove("open");
  });

  // Reflect current state on the button badge at load.
  isSubscribed().then((on) => btn.classList.toggle("on", on));
}

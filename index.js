<div id="nyx-widget-canon-root"></div>

<style>
  #nyx-canon-launcher{position:fixed;right:18px;bottom:18px;z-index:2147483000;border:0;border-radius:999px;padding:12px 14px;font:600 14px/1.2 system-ui,-apple-system,Segoe UI,Roboto,Arial;cursor:pointer;background:#111;color:#fff;box-shadow:0 12px 28px rgba(0,0,0,.35)}
  #nyx-canon-panel{position:fixed;right:18px;bottom:70px;z-index:2147483000;width:360px;max-width:92vw;height:min(70vh,620px);border-radius:18px;overflow:hidden;background:#0b0b0f;color:#fff;box-shadow:0 16px 44px rgba(0,0,0,.45);display:none}
  #nyx-canon-header{padding:12px 12px 10px;border-bottom:1px solid rgba(255,255,255,.10);display:flex;align-items:center;gap:10px}
  #nyx-canon-dot{width:10px;height:10px;border-radius:50%;background:#e11d48;box-shadow:0 0 18px rgba(225,29,72,.7)}
  #nyx-canon-title{font:700 14px/1.2 system-ui,-apple-system,Segoe UI,Roboto,Arial}
  #nyx-canon-sub{margin-left:auto;font:500 12px/1 system-ui,-apple-system,Segoe UI,Roboto,Arial;opacity:.75}
  #nyx-canon-chips{padding:10px 12px;display:flex;flex-wrap:wrap;gap:8px;border-bottom:1px solid rgba(255,255,255,.08)}
  .nyx-chip{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;border-radius:999px;padding:6px 10px;font:600 12px/1 system-ui;cursor:pointer}
  .nyx-chip[data-active="1"]{border-color:rgba(225,29,72,.7);box-shadow:0 0 0 3px rgba(225,29,72,.18) inset}
  #nyx-canon-messages{padding:12px;height:calc(100% - 140px);overflow:auto;display:flex;flex-direction:column;gap:10px}
  .nyx-msg{max-width:88%;padding:10px 12px;border-radius:14px;font:500 13px/1.35 system-ui;white-space:pre-wrap}
  .nyx-user{align-self:flex-end;background:rgba(225,29,72,.22);border:1px solid rgba(225,29,72,.35)}
  .nyx-bot{align-self:flex-start;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10)}
  #nyx-canon-compose{padding:10px 10px 12px;border-top:1px solid rgba(255,255,255,.10);display:flex;gap:8px}
  #nyx-canon-input{flex:1;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;padding:10px 10px;font:500 13px/1.2 system-ui;outline:none}
  #nyx-canon-send{border:0;border-radius:12px;padding:10px 12px;font:700 13px/1 system-ui;cursor:pointer;background:#e11d48;color:#fff}
  #nyx-canon-send:disabled{opacity:.55;cursor:not-allowed}
</style>

<script>
(function(){
  // Kill prior copies (if any)
  try{
    var old = document.querySelectorAll("#nyx-canon-launcher,#nyx-canon-panel");
    for(var i=0;i<old.length;i++){ old[i].remove(); }
  }catch(e){}

  var API_BASE = "https://sandblast-backend.onrender.com";
  var GPT_PATH = "/api/sandblast-gpt";
  var META_KEY = "NYX_META_CANON_V2";

  function jparse(s){ try{return JSON.parse(s);}catch(e){return null;} }
  function jstr(o){ try{return JSON.stringify(o);}catch(e){return ""; } }

  function loadMeta(){
    var m = jparse(localStorage.getItem(META_KEY));
    if(m && typeof m === "object") return m;
    return { sessionId:null, currentLane:"general", lastDomain:"general", laneDetail:{ chart:"Billboard Hot 100" }, mem:{} };
  }
  function saveMeta(m){ try{ localStorage.setItem(META_KEY, jstr(m)); }catch(e){} }

  var meta = loadMeta();

  // UI
  var launcher = document.createElement("button");
  launcher.id = "nyx-canon-launcher";
  launcher.textContent = "Nyx";

  var panel = document.createElement("div");
  panel.id = "nyx-canon-panel";
  panel.innerHTML = `
    <div id="nyx-canon-header">
      <div id="nyx-canon-dot"></div>
      <div>
        <div id="nyx-canon-title">Nyx</div>
        <div style="font:500 12px/1.2 system-ui;opacity:.75">Sandblast Assistant</div>
      </div>
      <div id="nyx-canon-sub"></div>
    </div>
    <div id="nyx-canon-chips">
      <button class="nyx-chip" data-lane="music_history">Music</button>
      <button class="nyx-chip" data-lane="tv">TV</button>
      <button class="nyx-chip" data-lane="news_canada">News Canada</button>
      <button class="nyx-chip" data-lane="sponsors">Sponsors</button>
      <button class="nyx-chip" data-lane="general">General</button>
    </div>
    <div id="nyx-canon-messages"></div>
    <div id="nyx-canon-compose">
      <input id="nyx-canon-input" placeholder="Type here…" autocomplete="off" />
      <button id="nyx-canon-send">Send</button>
    </div>
  `;

  document.body.appendChild(launcher);
  document.body.appendChild(panel);

  var sub = panel.querySelector("#nyx-canon-sub");
  var msgs = panel.querySelector("#nyx-canon-messages");
  var input = panel.querySelector("#nyx-canon-input");
  var sendBtn = panel.querySelector("#nyx-canon-send");
  var chips = Array.prototype.slice.call(panel.querySelectorAll(".nyx-chip"));

  function setLane(lane){
    meta.currentLane = lane;
    meta.lastDomain = lane === "general" ? "general" : lane;
    if(!meta.laneDetail) meta.laneDetail = {};
    if(!meta.laneDetail.chart) meta.laneDetail.chart = "Billboard Hot 100";
    saveMeta(meta);

    chips.forEach(function(b){ b.dataset.active = (b.dataset.lane===lane) ? "1":"0"; });
    sub.textContent = lane.replace("_"," ");

    // Tell backend explicitly (no ambiguity)
    sendToNyx("set lane " + lane, true);
  }

  function addMsg(who, text){
    var div = document.createElement("div");
    div.className = "nyx-msg " + (who==="user" ? "nyx-user":"nyx-bot");
    div.textContent = text;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  async function sendToNyx(text, silentUserEcho){
    var msg = (text||"").trim();
    if(!msg) return;

    sendBtn.disabled = true;

    if(!silentUserEcho) addMsg("user", msg);

    try{
      var r = await fetch(API_BASE + GPT_PATH, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        cache:"no-store",
        body: JSON.stringify({ message: msg, meta: meta })
      });

      var j = await r.json();
      if(j && j.meta){
        meta = j.meta;
        saveMeta(meta);
        // keep chip highlight in sync with server
        if(meta.currentLane){
          chips.forEach(function(b){ b.dataset.active = (b.dataset.lane===meta.currentLane) ? "1":"0"; });
          sub.textContent = String(meta.currentLane).replace("_"," ");
        }
      }

      if(j && j.reply){
        addMsg("nyx", j.reply);
      } else {
        addMsg("nyx", "I hit a weird silence. Try again.");
      }
    }catch(e){
      addMsg("nyx", "Backend unreachable. Pick a lane and try again.");
    }finally{
      sendBtn.disabled = false;
    }
  }

  launcher.onclick = function(){
    var open = panel.style.display === "block";
    panel.style.display = open ? "none" : "block";
    if(!open && msgs.childElementCount===0){
      addMsg("nyx", "Hi — I’m Nyx. Click a lane (Music/TV/News/Sponsors), then give me your request.");
      chips.forEach(function(b){ b.dataset.active = (b.dataset.lane===meta.currentLane) ? "1":"0"; });
      sub.textContent = String(meta.currentLane||"general").replace("_"," ");
    }
  };

  sendBtn.onclick = function(){
    var v = input.value;
    input.value = "";
    sendToNyx(v, false);
  };

  input.addEventListener("keydown", function(e){
    if(e.key==="Enter"){ e.preventDefault(); sendBtn.click(); }
  });

  chips.forEach(function(b){
    b.addEventListener("click", function(){
      setLane(b.dataset.lane);
    });
  });

  // boot highlight
  chips.forEach(function(b){ b.dataset.active = (b.dataset.lane===meta.currentLane) ? "1":"0"; });
  sub.textContent = String(meta.currentLane||"general").replace("_"," ");

  console.log("[NYX] Canon widget running: nyx-widget-canon-v2.1 mode=public");
})();
</script>

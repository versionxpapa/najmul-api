// VERSION-X API — replacement for the dead nayan-server / nayan-media-downloader
// packages and the old Replit APIs (main.n4y4n-server.repl.co, mainserver.repl.co,
// api.nayan-project.repl.co, main-server.nayan-api.repl.co).
// Credits: VERSION-X | Developer: TAWSHIF AHMED NAYIM
// Engines: yt-dlp + InnerTube ANDROID (YouTube), TikTok/X page scrape, iTunes (Spotify
// 30s preview), OCR.space (img2text), Pollinations (gpt / talk / ai-img),
// Openverse (pintarest). yt-dlp/Tesseract are used only when available
// (full host); on serverless hosts the other backends above take over.
// Run:  npm install  &&  npm start        (needs yt-dlp on PATH + Node 20)

process.env.YTDL_NO_UPDATE = "1"; // ytdl-core must not phone home for updates

const express = require("express");
const axios = require("axios");
const FormData = require("form-data");
const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Tesseract = require("tesseract.js");

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use("/ppcouple", express.static(path.join(__dirname, "public", "ppcouple")));

const PORT = process.env.PORT || 3000;
// OCR trained data ships as tessdata/eng.traineddata.gz; unpack it on first run.
try {
  const td = path.join(__dirname, "tessdata");
  if (!fs.existsSync(path.join(td, "eng.traineddata")) && fs.existsSync(path.join(td, "eng.traineddata.gz"))) {
    const zlib = require("zlib");
    fs.writeFileSync(path.join(td, "eng.traineddata"),
      zlib.gunzipSync(fs.readFileSync(path.join(td, "eng.traineddata.gz"))));
    console.log("unpacked tessdata/eng.traineddata");
  }
} catch (e) { console.error("tessdata unpack failed:", e.message); }
// One bad OCR/worker error must never kill the whole API server.
process.on("uncaughtException", (err) => console.error("uncaught (server stays up):", err && err.message));
// yt-dlp location: pip --user installs it under ~/.local/bin, which is often
// not on a service's PATH, so check the usual places first.
const YTDLP_CANDIDATES = [process.env.YTDLP,
  path.join(__dirname, "bin", "yt-dlp"),
  path.join(os.homedir(), ".local", "bin", "yt-dlp"),
  "/home/hatch/.local/bin/yt-dlp", "/usr/local/bin/yt-dlp", "/usr/bin/yt-dlp", "yt-dlp"];
const YTDLP = YTDLP_CANDIDATES.find((p) => p && (p === "yt-dlp" || fs.existsSync(p))) || "yt-dlp";
const IMGUR_CLIENT_ID = "Client-ID 3fb071726880bbb"; // same ID the bot's imgur command already used
// Pollinations / Imgur / Tesseract downloads reject Node's default UA — use a browser UA.
const UA = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36" };

function sendError(res, code, msg) {
  res.status(code).json({ error: String(msg || "failed").slice(0, 300) });
}

// Run yt-dlp -j and return parsed info JSON (single video, no playlist).
function ytdlpInfo(target, extraArgs = []) {
  const ytArgs = /youtu\.?be/.test(target) ? ["--extractor-args", "youtube:player_client=android"] : [];
  return new Promise((resolve, reject) => {
    execFile(YTDLP, ["-j", "--no-playlist", "--no-warnings", "--socket-timeout", "15", ...ytArgs, ...extraArgs, target],
      { timeout: 60000, maxBuffer: 20 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return reject(new Error("yt-dlp failed: " + (err.message || err).slice(0, 200)));
        try { resolve(JSON.parse(stdout)); }
        catch (e) { reject(new Error("yt-dlp bad output")); }
      });
  });
}

// Best direct video URL. Prefer a direct https mp4 (a plain file the bot can
// download and send); m3u8 playlists are only a fallback.
function bestVideoUrl(info) {
  const fmts = (info.formats || []).filter(f => f.url);
  const direct = fmts.filter(f => (f.protocol === "https" || f.protocol === "http") && (f.ext || "") === "mp4");
  const combined = fmts.filter(f => f.vcodec && f.vcodec !== "none" && f.acodec && f.acodec !== "none");
  const pick = (list) => list.sort((a, b) => (b.height || 0) - (a.height || 0) || (b.tbr || 0) - (a.tbr || 0))[0];
  const directCombined = direct.filter(f => f.vcodec && f.vcodec !== "none" && f.acodec && f.acodec !== "none");
  return (pick(directCombined) || pick(direct)
    || pick(combined.filter(f => (f.ext || "") === "mp4")) || pick(combined)
    || pick(fmts.filter(f => f.vcodec && f.vcodec !== "none")) || {}).url || null;
}

function bestAudioUrl(info) {
  const fmts = (info.formats || []).filter(f => f.url && f.acodec && f.acodec !== "none");
  fmts.sort((a, b) => (b.abr || 0) - (a.abr || 0));
  return (fmts[0] || {}).url || null;
}

const HOME_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VERSION-X API</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#070510;color:#eceaf6;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;min-height:100vh;background-image:radial-gradient(700px 320px at 15% -5%,rgba(124,92,255,.35),transparent 60%),radial-gradient(700px 320px at 90% 0%,rgba(0,210,255,.22),transparent 60%)}
.wrap{max-width:960px;margin:0 auto;padding:48px 20px 64px}
.badge{display:inline-block;font-size:12px;letter-spacing:2px;font-weight:700;color:#0b0618;background:linear-gradient(90deg,#8f7bff,#00d2ff);padding:6px 12px;border-radius:999px}
h1{font-size:52px;line-height:1.05;margin:18px 0 10px;background:linear-gradient(90deg,#a78bff,#00d2ff,#7CFFB2);-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{color:#b7b3d6;font-size:17px;max-width:640px;line-height:1.6}
.base{margin:28px 0 10px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:16px 18px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.base .lbl{font-size:12px;letter-spacing:2px;color:#9d97c4;font-weight:700;width:100%}
.base code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:16px;color:#7CFFB2;word-break:break-all;flex:1}
button{cursor:pointer;border:0;border-radius:10px;padding:10px 18px;font-weight:700;font-size:14px;background:linear-gradient(90deg,#8f7bff,#00d2ff);color:#0b0618}
button.copied{background:linear-gradient(90deg,#22c55e,#7CFFB2)}
.status{font-size:14px;color:#b7b3d6;margin:6px 2px 30px}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:#f59e0b;margin-right:7px;vertical-align:1px}
.dot.on{background:#22c55e;box-shadow:0 0 8px #22c55e}
h2{font-size:15px;letter-spacing:2px;color:#9d97c4;margin:26px 0 12px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.card{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.10);border-radius:14px;padding:16px}
.card .m{font-size:11px;font-weight:800;letter-spacing:1px;color:#00d2ff}
.card .p{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:14px;color:#fff;margin:6px 0;word-break:break-all}
.card .d{font-size:13px;color:#b7b3d6;line-height:1.5}
.card .row{display:flex;justify-content:space-between;align-items:center;gap:8px}
.mini{padding:6px 12px;font-size:12px;border-radius:8px;background:rgba(255,255,255,.10);color:#fff}
.note{font-size:13px;color:#8f8aa8;margin-top:22px;line-height:1.6}
footer{margin-top:36px;border-top:1px solid rgba(255,255,255,.10);padding-top:18px;font-size:13px;color:#8f8aa8}
footer b{color:#cfc9f2}
@media(max-width:560px){h1{font-size:38px}}
</style></head>
<body><div class="wrap">
<span class="badge">FREE &bull; NO API KEY</span>
<h1>VERSION-X API</h1>
<p class="sub">Free API &mdash; AI chat, image tools and media downloaders. Copy the base URL and start calling.</p>
<div class="base"><span class="lbl">API BASE URL</span><code id="baseUrl"></code><button id="copyBase">Copy link</button></div>
<p class="status"><span class="dot" id="dot"></span><span id="statusText">Checking status&hellip;</span></p>
<h2>AI &amp; CHAT</h2>
<div class="grid">
<div class="card"><div class="row"><span class="m">GET</span><button class="mini" data-copy="/api/gpt?prompt=hello">Copy</button></div><div class="p">/api/gpt?prompt=hello</div><div class="d">AI chat reply (Pollinations).</div></div>
<div class="card"><div class="row"><span class="m">GET</span><button class="mini" data-copy="/api/talk?text=hi">Copy</button></div><div class="p">/api/talk?text=hi</div><div class="d">Friendly talk reply.</div></div>
<div class="card"><div class="row"><span class="m">GET</span><button class="mini" data-copy="/api/ai-img?text=cat">Copy</button></div><div class="p">/api/ai-img?text=cat</div><div class="d">Generate two AI images from a prompt.</div></div>
<div class="card"><div class="row"><span class="m">GET</span><button class="mini" data-copy="/api/img2text?url=">Copy</button></div><div class="p">/api/img2text?url=</div><div class="d">Read text from an image (OCR).</div></div>
</div>
<h2>MEDIA</h2>
<div class="grid">
<div class="card"><div class="row"><span class="m">GET</span><button class="mini" data-copy="/api/ytdown?url=">Copy</button></div><div class="p">/api/ytdown?url=</div><div class="d">YouTube video download link.</div></div>
<div class="card"><div class="row"><span class="m">GET</span><button class="mini" data-copy="/api/tikdown?url=">Copy</button></div><div class="p">/api/tikdown?url=</div><div class="d">TikTok video download link.</div></div>
<div class="card"><div class="row"><span class="m">GET</span><button class="mini" data-copy="/api/twitterdown?url=">Copy</button></div><div class="p">/api/twitterdown?url=</div><div class="d">X / Twitter video download link.</div></div>
<div class="card"><div class="row"><span class="m">GET</span><button class="mini" data-copy="/api/fbdown?url=">Copy</button></div><div class="p">/api/fbdown?url=</div><div class="d">Facebook video download link.</div></div>
<div class="card"><div class="row"><span class="m">GET</span><button class="mini" data-copy="/api/ndown?url=">Copy</button></div><div class="p">/api/ndown?url=</div><div class="d">Instagram / Facebook media link.</div></div>
<div class="card"><div class="row"><span class="m">GET</span><button class="mini" data-copy="/api/spotify?q=shape of you">Copy</button></div><div class="p">/api/spotify?q=</div><div class="d">Spotify track audio link.</div></div>
<div class="card"><div class="row"><span class="m">GET</span><button class="mini" data-copy="/api/pintarest?q=cat">Copy</button></div><div class="p">/api/pintarest?q=cat</div><div class="d">Image search results.</div></div>
<div class="card"><div class="row"><span class="m">GET</span><button class="mini" data-copy="/images/ppcouple">Copy</button></div><div class="p">/images/ppcouple</div><div class="d">Random anime couple avatars.</div></div>
</div>
<h2>TOOLS</h2>
<div class="grid">
<div class="card"><div class="row"><span class="m">POST</span><button class="mini" data-copy="/api/imgur">Copy</button></div><div class="p">/api/imgur</div><div class="d">Upload an image, get an Imgur link.</div></div>
<div class="card"><div class="row"><span class="m">GET</span><button class="mini" data-copy="/api/health">Copy</button></div><div class="p">/api/health</div><div class="d">Check if the API is online.</div></div>
</div>
<p class="note">Note: YouTube, Facebook and Instagram downloaders run through a Python helper (yt-dlp) &mdash; they can take a few seconds and may fail for login-walled videos. TikTok, X, Spotify preview and OCR work via free public services. AI, image and search endpoints work fully.</p>
<footer>Credits: <b>VERSION-X</b> &nbsp;|&nbsp; Developer: <b>TAWSHIF AHMED NAYIM</b></footer>
</div>
<script>
(function(){
var origin = window.location.origin;
document.getElementById('baseUrl').textContent = origin;
function copyText(t, btn, label){
  function done(){ var old = btn.textContent; btn.textContent = 'Copied!'; btn.classList.add('copied'); setTimeout(function(){ btn.textContent = old; btn.classList.remove('copied'); }, 1600); }
  if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).then(done, function(){ fallback(); }); }
  else { fallback(); }
  function fallback(){ var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch(e){} document.body.removeChild(ta); done(); }
}
document.getElementById('copyBase').addEventListener('click', function(){ copyText(origin, this); });
var btns = document.querySelectorAll('[data-copy]');
for (var i = 0; i < btns.length; i++) {
  btns[i].addEventListener('click', function(){ copyText(origin + this.getAttribute('data-copy'), this); });
}
fetch('/api/health').then(function(r){ return r.json(); }).then(function(j){
  if (j && j.status === 'ok') { document.getElementById('dot').classList.add('on'); document.getElementById('statusText').textContent = 'Online — all systems go'; }
  else { document.getElementById('statusText').textContent = 'Status unknown'; }
}).catch(function(){ document.getElementById('statusText').textContent = 'Offline or unreachable'; });
})();
</script>
</body></html>`;

app.get("/", (req, res) => {
  res.send(HOME_HTML);
});

app.get("/api/health", (req, res) => res.json({ status: "ok", service: "version-x-api", time: new Date().toISOString() }));

// GET JSON with axios; some egress proxies break Node's TLS for certain
// hosts, so fall back to curl (which handles those proxies fine).
async function getJson(url, params) {
  try {
    const r = await axios.get(url, { params, headers: UA, timeout: 25000 });
    return r.data;
  } catch (e) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    const out = await new Promise((resolve, reject) => {
      execFile("curl", ["-fsSL", "-m", "25", "-A", UA["User-Agent"], url + qs],
        { timeout: 30000, maxBuffer: 10 * 1024 * 1024 },
        (err, stdout) => (err ? reject(new Error("curl fallback failed")) : resolve(stdout)));
    });
    return JSON.parse(out);
  }
}
// YouTube via InnerTube ANDROID player API (plain axios, no library):
// the same endpoint yt-dlp's android client uses. Returns a direct mp4 URL.
async function youtubeAndroidPlayer(videoId) {
  const r = await axios.post(
    "https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
    { context: { client: { clientName: "ANDROID", clientVersion: "19.09.37", androidSdkVersion: 30, hl: "en", gl: "US", userAgent: "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip" } }, videoId, playbackContext: { contentPlaybackContext: { vis: 0, splay: false, html5Preference: "HTML5_PREF_WANTS" } }, racyCheckOk: true, contentCheckOk: true },
    { timeout: 20000, headers: { "Content-Type": "application/json", "User-Agent": "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip", "X-Goog-Api-Format-Version": "2", "X-YouTube-Client-Name": "3", "X-YouTube-Client-Version": "19.09.37" } });
  const d = r.data || {};
  const status = d.playabilityStatus && d.playabilityStatus.status;
  if (status && status !== "OK") throw new Error("YouTube: " + status + " " + ((d.playabilityStatus && d.playabilityStatus.reason) || ""));
  const fmts = ((d.streamingData || {}).formats || []).filter((f) => f.url);
  const pick = fmts.find((f) => f.itag === 22) || fmts.find((f) => f.itag === 18)
    || fmts.filter((f) => (f.mimeType || "").includes("video/mp4")).sort((a, b) => (b.width || 0) - (a.width || 0))[0];
  if (!pick) throw new Error("YouTube: no playable format");
  const vd = d.videoDetails || {};
  return { video: pick.url, title: vd.title || "", duration: parseInt(vd.lengthSeconds || 0, 10), uploader: vd.author || "" };
}

app.get("/api/ytdown", async (req, res) => {
  if (!req.query.url) return sendError(res, 400, "missing url");
  // Full host: yt-dlp (best quality). Serverless (no yt-dlp): InnerTube ANDROID.
  try {
    const info = await ytdlpInfo(req.query.url);
    res.json({ data: { video: bestVideoUrl(info), title: info.title || "", data: { duration: info.duration, uploader: info.uploader } } });
  } catch (e1) {
    try {
      const m = String(req.query.url).match(/(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/);
      if (!m) throw new Error("not a YouTube watch link");
      const d = await youtubeAndroidPlayer(m[1]);
      res.json({ data: { video: d.video, title: d.title, data: { duration: d.duration, uploader: d.uploader } } });
    } catch (e2) { sendError(res, 502, e1.message + " | InnerTube: " + e2.message); }
  }
});

app.get("/api/ndown", async (req, res) => {
  if (!req.query.url) return sendError(res, 400, "missing url");
  try {
    const info = await ytdlpInfo(req.query.url);
    const url = bestVideoUrl(info);
    if (!url) throw new Error("no video found");
    res.json({ data: [{ url }] });
  } catch (e) { sendError(res, 502, e.message); }
});

app.get("/api/fbdown", async (req, res) => {
  if (!req.query.url) return sendError(res, 400, "missing url");
  try {
    const info = await ytdlpInfo(req.query.url);
    res.json({ media: { hd: bestVideoUrl(info), title: info.title || "" } });
  } catch (e) { sendError(res, 502, e.message); }
});

// TikTok: fetch the public video page and read the direct mp4 URL from the
// page data (no yt-dlp needed, works serverless). Same response shape as yt-dlp.
async function tiktokScrape(url) {
  const r = await axios.get(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", "Accept": "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" }, timeout: 20000, maxRedirects: 5 });
  const html = typeof r.data === "string" ? r.data : "";
  const unesc = (s) => { try { return JSON.parse('"' + s + '"'); } catch (_) { return s.replace(/\\u002F/g, "/"); } };
  let item = null;
  const m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/s);
  if (m) {
    try {
      const j = JSON.parse(m[1]);
      const vd = (j.__DEFAULT_SCOPE__ || {})["webapp.video-detail"];
      item = vd && vd.itemInfo && vd.itemInfo.itemStruct;
    } catch (_) {}
  }
  let video = "", title = "", avatar = "", name = "", audio = "", duration = 0;
  if (item) {
    video = (item.video && (item.video.playAddr || item.video.downloadAddr)) || "";
    title = item.desc || "";
    name = (item.author && item.author.nickname) || "";
    avatar = (item.author && (item.author.avatarLarger || item.author.avatarThumb)) || "";
    audio = (item.music && item.music.playUrl) || "";
    duration = (item.video && item.video.duration) || 0;
  }
  const grab = (re) => { const g = html.match(re); return g ? unesc(g[1]) : ""; };
  if (!video) video = grab(/"playAddr":"((?:[^"\\]|\\.)*)"/);
  if (!title) title = grab(/"desc":"((?:[^"\\]|\\.)*)"/);
  if (!name) name = grab(/"nickname":"((?:[^"\\]|\\.)*)"/);
  if (!avatar) avatar = grab(/"avatarLarger":"((?:[^"\\]|\\.)*)"/);
  if (!audio) audio = video;
  if (!video) throw new Error("no video found (TikTok blocked the request or the link is wrong)");
  return { video, title, author: { avatar, name }, audio, duration };
}

app.get("/api/tikdown", async (req, res) => {
  if (!req.query.url) return sendError(res, 400, "missing url");
  try {
    const d = await tiktokScrape(req.query.url);
    res.json({ data: d });
  } catch (e) { sendError(res, 502, e.message); }
});

// X / Twitter: fetch the public post page and pick the highest-resolution
// direct mp4 variant from the page data (no yt-dlp needed, works serverless).
async function xScrape(url) {
  const r = await axios.get(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", "Accept": "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" }, timeout: 20000, maxRedirects: 5 });
  const html = typeof r.data === "string" ? r.data : "";
  const re = /https:\/\/video\.twimg\.com\/ext_tw_video\/[^"\\\s]*?\/vid\/avc1\/(\d+)x(\d+)\/[^"\\\s]*?\.mp4[^"\\\s]*/g;
  let best = null, bestArea = 0, m;
  while ((m = re.exec(html))) {
    const area = parseInt(m[1], 10) * parseInt(m[2], 10);
    if (area > bestArea) { bestArea = area; best = m[0].replace(/\\\//g, "/").replace(/\\u0026/g, "&"); }
  }
  if (!best) throw new Error("no video found (X blocked the request or the post has no video)");
  return best;
}

app.get("/api/twitterdown", async (req, res) => {
  if (!req.query.url) return sendError(res, 400, "missing url");
  try {
    res.json({ data: { HD: await xScrape(req.query.url) } });
  } catch (e) { sendError(res, 502, e.message); }
});

// --- gpt / talk (Pollinations free text API, no key) ---
async function askAI(prompt, system) {
  const full = system ? `${system}\n\nUser: ${prompt}` : prompt;
  try {
    const r = await axios.get("https://text.pollinations.ai/" + encodeURIComponent(full), { timeout: 90000, headers: UA });
    const text = typeof r.data === "string" ? r.data : JSON.stringify(r.data);
    if (text && text.trim()) return text;
    throw new Error("empty reply");
  } catch (e) {
    // Fallback: the free gptgo API the bot's chatgpt command already used.
    const r = await axios.get("https://api.kenliejugarap.com/gptgo/?text=" + encodeURIComponent(full), { timeout: 60000, headers: UA });
    return r.data.response || r.data.message || JSON.stringify(r.data);
  }
}

app.get("/api/gpt", async (req, res) => {
  const prompt = req.query.prompt || req.query.text || "";
  if (!prompt) return sendError(res, 400, "missing prompt");
  try { res.json({ gpt: await askAI(prompt) }); }
  catch (e) { sendError(res, 502, e.message); }
});

app.post("/api/gpt", async (req, res) => {
  const prompt = (req.body && (req.body.prompt || req.body.text)) || "";
  if (!prompt) return sendError(res, 400, "missing prompt");
  try { res.json({ gpt: await askAI(prompt) }); }
  catch (e) { sendError(res, 502, e.message); }
});

app.get("/api/talk", async (req, res) => {
  const text = req.query.text || req.query.q || "";
  if (!text) return sendError(res, 400, "missing text");
  try {
    const reply = await askAI(text, "You are NAJMUL, a friendly Messenger bot assistant created by TAWSHIF AHMED NAYIM. Answer briefly and warmly, with an emoji sometimes.");
    res.json({ reply });
  } catch (e) { sendError(res, 502, e.message); }
});

// Upload image bytes to OCR.space and return the parsed text.
async function ocrSpaceUpload(key, buf, ctype, ext) {
  const form = new FormData();
  form.append("file", buf, { filename: "image." + ext, contentType: ctype });
  form.append("apikey", key);
  form.append("language", "eng");
  form.append("isOverlayRequired", "false");
  form.append("scale", "true");
  const r = await axios.post("https://api.ocr.space/parse/image", form, { headers: form.getHeaders(), timeout: 40000, maxContentLength: 5 * 1024 * 1024 });
  const parsed = r.data && r.data.ParsedResults && r.data.ParsedResults[0];
  return (parsed && parsed.ParsedText || "").trim();
}

// Hugging Face vision-model OCR fallback (needs HF_TOKEN env; free Inference API).
// TrOCR is retired on hf-inference (HTTP 400 "Model not supported by provider
// hf-inference", confirmed 2026-11-21), so the fallback now uses Qwen2-VL via
// the OpenAI-compatible chat completions endpoint on the router. The model
// reads the image and returns only the transcribed text.
// Diagnostic mode: failures carry the real HF status/body in the message.
function hfErrDetail(e) {
  if (!e.response) return e.message || "no response";
  const body = typeof e.response.data === "string" ? e.response.data : JSON.stringify(e.response.data || "");
  return "HTTP " + e.response.status + " " + body.slice(0, 200);
}
async function hfVlmOcr(buf, ctype) {
  const dataUrl = "data:" + ctype + ";base64," + buf.toString("base64");
  try {
    const r = await axios.post(
      "https://router.huggingface.co/v1/chat/completions",
      {
        model: "Qwen/Qwen2-VL-7B-Instruct",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Transcribe all text visible in this image exactly. Reply with only the transcribed text, nothing else." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        max_tokens: 300,
        temperature: 0,
      },
      {
        headers: { Authorization: "Bearer " + process.env.HF_TOKEN, "Content-Type": "application/json" },
        timeout: 7000,
        maxContentLength: 10 * 1024 * 1024,
      }
    );
    const t = ((((r.data || {}).choices || [])[0] || {}).message || {}).content || "";
    if (t.trim()) return t.trim();
    throw new Error("hf: HTTP 200 empty result");
  } catch (e) {
    throw new Error("hf: " + hfErrDetail(e));
  }
}

// --- img2text (OCR.space free API; Hugging Face TrOCR fallback; local Tesseract fallback on full hosts) ---
// The image is downloaded here and uploaded to OCR.space, because OCR.space
// often cannot fetch the URL itself (the host rate-limits it, e.g. Imgur 429).
app.get("/api/img2text", async (req, res) => {
  if (!req.query.url) return sendError(res, 400, "missing url");
  try {
    const key = process.env.OCR_SPACE_API_KEY || "helloworld"; // free key: ocr.space (no card)
    const img = await axios.get(req.query.url, { responseType: "arraybuffer", timeout: 30000, headers: UA, maxContentLength: 5 * 1024 * 1024 });
    const buf = Buffer.from(img.data);
    if (buf.length > 1024 * 1024) throw new Error("image too large for free OCR (max 1 MB)");
    const ctype = String(img.headers["content-type"] || "image/png").split(";")[0];
    const ext = ctype === "image/jpeg" ? "jpg" : ctype === "image/webp" ? "webp" : "png";
    const text = await ocrSpaceUpload(key, buf, ctype, ext).catch(async (e) => {
      // The shared demo key is often rate-limited (429). If a Hugging Face
      // token is configured, fall back to TrOCR instead of waiting; otherwise
      // one retry after a pause.
      if (e.response && (e.response.status === 429 || e.response.status >= 500)) {
        if (process.env.HF_TOKEN) {
          try { return await hfVlmOcr(buf, ctype); } catch (hfErr) { throw new Error("ocr.space 429; hf fallback failed: " + hfErr.message); }
        }
        await new Promise((r2) => setTimeout(r2, 4000));
        return ocrSpaceUpload(key, buf, ctype, ext);
      }
      throw e;
    });
    if (!text) throw new Error("no text found in image");
    return res.json({ text });
  } catch (e) {
    if (process.env.VERCEL === "1") return sendError(res, 502, e.message);
    // Full host fallback: local Tesseract (bundled tessdata).
    const tmp = path.join(os.tmpdir(), "najmul-ocr-" + Date.now() + ".png");
    try {
      const r = await axios.get(req.query.url, { responseType: "arraybuffer", timeout: 30000, headers: UA });
      fs.writeFileSync(tmp, Buffer.from(r.data));
      const { data } = await Tesseract.recognize(tmp, "eng", { langPath: path.join(__dirname, "tessdata") });
      res.json({ text: (data.text || "").trim() });
    } catch (e2) { sendError(res, 502, e2.message); }
    finally { try { fs.unlinkSync(tmp); } catch (_) {} }
  }
});

// --- spotify: iTunes Search (free, no key) — returns a 30-second preview clip ---
app.get("/api/spotify", async (req, res) => {
  if (!req.query.q) return sendError(res, 400, "missing q");
  try {
    const data = await getJson("https://itunes.apple.com/search", { term: req.query.q, media: "music", entity: "song", limit: 1 });
    const t = (data.results || [])[0];
    if (!t || !t.previewUrl) throw new Error("song not found");
    const title = ((t.artistName || "") + (t.artistName && t.trackName ? " - " : "") + (t.trackName || "")).trim();
    res.json({ data: { audio: t.previewUrl, title } });
  } catch (e) { sendError(res, 502, e.message); }
});

// --- pintarest: image search (Openverse public API, no key) ---
app.get("/api/pintarest", async (req, res) => {
  if (!req.query.q) return sendError(res, 400, "missing q");
  try {
    const data = await getJson("https://api.openverse.org/v1/images/", { q: req.query.q, page_size: 20 });
    const urls = (data.results || []).map((x) => x.url).filter(Boolean);
    if (!urls.length) throw new Error("no images found");
    res.json({ data: urls });
  } catch (e) { sendError(res, 502, e.message); }
});

// --- ppcouple: random anime couple avatars (served from this server) ---
const MALES = ["male1.jpg", "male2.jpg"];
const FEMALES = ["female1.jpg", "female2.jpg"];
app.get("/images/ppcouple", (req, res) => {
  const base = `${req.protocol}://${req.get("host")}/ppcouple/`;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  res.json({ url: { male: base + pick(MALES), female: base + pick(FEMALES) } });
});

// --- ai-img: two AI images for a prompt (Pollinations, no key) ---
app.get(["/nayan/ai-img", "/api/ai-img"], (req, res) => {
  const text = req.query.text || "";
  if (!text) return sendError(res, 400, "missing text");
  const u = (seed) => `https://image.pollinations.ai/prompt/${encodeURIComponent(text)}?width=1024&height=1024&seed=${seed}&nologo=true`;
  res.json({ image1: { url: u(11) }, image2: { url: u(77) } });
});

// --- imgur upload (same Client-ID the bot already used) ---
app.post("/api/imgur", async (req, res) => {
  const imageUrl = (req.body && (req.body.url || req.body.image)) || "";
  if (!imageUrl) return sendError(res, 400, "missing url");
  try {
    const form = new FormData();
    form.append("image", imageUrl);
    form.append("type", "url");
    const r = await axios.post("https://api.imgur.com/3/image", form, {
      headers: { Authorization: IMGUR_CLIENT_ID, ...form.getHeaders() }, timeout: 60000,
    });
    res.json({ data: { link: r.data.data.link, type: r.data.data.type } });
  } catch (e) { sendError(res, 502, (e.response && e.response.data && e.response.data.data && e.response.data.data.error) || e.message); }
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`VERSION-X API listening on port ${PORT}`));
}
module.exports = app;

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

const HOME_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VERSION-X API — Free AI, Media &amp; Tools API</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&amp;family=Space+Grotesk:wght@500;600;700&amp;display=swap" rel="stylesheet">
<style>
:root{--bg:#0a0a0f;--panel:#12121c;--panel2:#171726;--line:rgba(255,255,255,.09);--txt:#f4f2fb;--mut:#a8a4c2;--red:#ff2d55;--red2:#ff5c39;--green:#22c55e}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--txt);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;min-height:100vh;overflow-x:hidden}
body:before{content:"";position:fixed;inset:0;pointer-events:none;z-index:0;background:radial-gradient(720px 340px at 12% -5%,rgba(255,45,85,.28),transparent 60%),radial-gradient(720px 340px at 92% 0%,rgba(255,92,57,.16),transparent 60%),linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:auto,auto,44px 44px,44px 44px}
a{color:inherit;text-decoration:none}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px;position:relative;z-index:1}
.nav{position:sticky;top:0;z-index:50;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);background:rgba(10,10,15,.78);border-bottom:1px solid var(--line)}
.nav .wrap{display:flex;align-items:center;gap:28px;height:64px}
.logo{display:flex;align-items:center;gap:10px;font-family:"Space Grotesk",Inter,sans-serif;font-weight:700;font-size:19px;letter-spacing:.5px}
.logo .mark{width:32px;height:32px;border-radius:9px;background:linear-gradient(135deg,var(--red),var(--red2));display:flex;align-items:center;justify-content:center;font-size:17px;color:#fff;box-shadow:0 0 18px rgba(255,45,85,.55)}
.logo b{color:var(--red)}
.nav .links{display:flex;gap:22px;margin-left:auto;font-size:14px;color:var(--mut)}
.nav .links a:hover{color:#fff}
.nav .links a{transition:color .2s}
.navstat{display:flex;align-items:center;gap:7px;font-size:13px;color:var(--mut);border:1px solid var(--line);border-radius:999px;padding:7px 12px;background:rgba(255,255,255,.04)}
.dot{width:8px;height:8px;border-radius:50%;background:#f59e0b}
.dot.on{background:var(--green);box-shadow:0 0 8px var(--green)}
.hero{padding:88px 0 30px;text-align:center}
.badge{display:inline-block;font-size:12px;letter-spacing:2.5px;font-weight:800;color:#fff;background:linear-gradient(90deg,var(--red),var(--red2));padding:7px 14px;border-radius:999px;box-shadow:0 0 24px rgba(255,45,85,.45)}
.hero h1{font-family:"Space Grotesk",Inter,sans-serif;font-size:64px;line-height:1.02;margin:22px 0 16px;letter-spacing:-1px}
.hero h1 .grad{background:linear-gradient(90deg,#ff2d55,#ff5c39,#ffb199);-webkit-background-clip:text;background-clip:text;color:transparent}
.hero .sub{color:var(--mut);font-size:18px;line-height:1.65;max-width:640px;margin:0 auto}
.hero .cta{display:flex;gap:12px;justify-content:center;margin-top:30px;flex-wrap:wrap}
.btn{cursor:pointer;border:0;border-radius:12px;padding:13px 24px;font-weight:700;font-size:15px;transition:transform .2s,box-shadow .2s}
.btn:active{transform:scale(.97)}
.btn-red{background:linear-gradient(135deg,var(--red),var(--red2));color:#fff;box-shadow:0 8px 26px rgba(255,45,85,.4)}
.btn-red:hover{transform:translateY(-2px);box-shadow:0 12px 32px rgba(255,45,85,.55)}
.btn-ghost{background:rgba(255,255,255,.06);color:#fff;border:1px solid var(--line)}
.btn-ghost:hover{transform:translateY(-2px);border-color:rgba(255,45,85,.6)}
.btn.copied{background:linear-gradient(135deg,#16a34a,#4ade80);box-shadow:0 8px 26px rgba(34,197,94,.4)}
.base{margin:30px auto 0;max-width:640px;background:rgba(255,255,255,.05);border:1px solid var(--line);border-radius:14px;padding:14px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;text-align:left}
.base .lbl{font-size:11px;letter-spacing:2px;color:var(--mut);font-weight:700;width:100%}
.base code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:16px;color:#ff8fa8;word-break:break-all;flex:1}
.mini{padding:7px 13px;font-size:12px;border-radius:9px;background:rgba(255,255,255,.09);color:#fff;border:0;cursor:pointer;font-weight:700;transition:background .2s}
.mini:hover{background:rgba(255,45,85,.35)}
.mini.copied{background:linear-gradient(135deg,#16a34a,#4ade80)}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:44px 0 10px}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:22px 16px;text-align:center;transition:transform .25s,border-color .25s}
.stat:hover{transform:translateY(-3px);border-color:rgba(255,45,85,.5)}
.stat .num{font-family:"Space Grotesk",Inter,sans-serif;font-size:36px;font-weight:700;color:#fff}
.stat .num em{font-style:normal;color:var(--red)}
.stat .cap{font-size:13px;color:var(--mut);margin-top:4px}
section{padding:56px 0 8px}
.sec-head{text-align:center;margin-bottom:30px}
.sec-head .kicker{font-size:12px;letter-spacing:3px;font-weight:800;color:var(--red)}
.sec-head h2{font-family:"Space Grotesk",Inter,sans-serif;font-size:34px;margin:10px 0 8px}
.sec-head p{color:var(--mut);font-size:15px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px;transition:transform .25s,border-color .25s,box-shadow .25s}
.card:hover{transform:translateY(-4px);border-color:rgba(255,45,85,.55);box-shadow:0 14px 34px rgba(0,0,0,.45),0 0 0 1px rgba(255,45,85,.25)}
.card .top{display:flex;justify-content:space-between;align-items:center;gap:8px}
.card .m{font-size:11px;font-weight:800;letter-spacing:1.5px;color:#ff8fa8}
.card .p{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:15px;color:#fff;margin:10px 0 8px;word-break:break-all}
.card .d{font-size:13.5px;color:var(--mut);line-height:1.6}
.feat{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.feat .card .ic{width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,rgba(255,45,85,.25),rgba(255,92,57,.12));border:1px solid rgba(255,45,85,.35);display:flex;align-items:center;justify-content:center;margin-bottom:14px}
.feat .card .ic svg{width:22px;height:22px;stroke:#ff5c7a;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.feat .card h3{font-family:"Space Grotesk",Inter,sans-serif;font-size:17px;margin-bottom:6px}
.feat .card p{font-size:13.5px;color:var(--mut);line-height:1.6}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;counter-reset:step}
.step{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:24px 20px;position:relative;overflow:hidden}
.step:before{content:"0" counter(step);counter-increment:step;position:absolute;top:8px;right:16px;font-family:"Space Grotesk",Inter,sans-serif;font-size:56px;font-weight:700;color:rgba(255,45,85,.14)}
.step h3{font-family:"Space Grotesk",Inter,sans-serif;font-size:17px;margin-bottom:8px}
.step p{font-size:13.5px;color:var(--mut);line-height:1.6}
.step code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;color:#ff8fa8;background:rgba(255,45,85,.12);padding:2px 6px;border-radius:6px}
details{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-bottom:10px}
details summary{cursor:pointer;font-weight:600;font-size:15px;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:10px}
details summary::-webkit-details-marker{display:none}
details summary:after{content:"+";color:var(--red);font-size:22px;font-weight:700}
details[open ] summary:after{content:"−"}
details p{color:var(--mut);font-size:14px;line-height:1.65;margin-top:10px}
.note{font-size:13px;color:#8f8aa8;margin-top:26px;line-height:1.65;text-align:center;max-width:720px;margin-left:auto;margin-right:auto}
footer{margin-top:64px;border-top:1px solid var(--line);padding:26px 0 34px;font-size:13px;color:#8f8aa8}
footer .wrap{display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;align-items:center}
footer b{color:#cfc9f2}
.rv{opacity:0;transform:translateY(26px);transition:opacity .7s ease,transform .7s ease}
.rv.in{opacity:1;transform:none}
@media(max-width:760px){.hero h1{font-size:42px}.stats{grid-template-columns:repeat(2,1fr)}.feat{grid-template-columns:1fr}.steps{grid-template-columns:1fr}.nav .links{display:none}section{padding:40px 0 8px}.hero{padding:60px 0 20px}}
</style></head>
<body>
<header class="nav"><div class="wrap">
<a class="logo" href="/"><span class="mark">X</span>VERSION-<b>X</b>&nbsp;API</a>
<nav class="links"><a href="#apis">APIs</a><a href="#features">Features</a><a href="#how">How it works</a><a href="#faq">FAQ</a></nav>
<span class="navstat"><span class="dot" id="dot2"></span><span id="statusText2">Checking&hellip;</span></span>
</div></header>
<div class="wrap">
<section class="hero">
<span class="badge">FREE &bull; NO API KEY</span>
<h1>VERSION-<span class="grad">X API</span></h1>
<p class="sub">Discover, test, and integrate powerful APIs for your next project. AI chat, image tools and media downloaders &mdash; free, with no key and no sign-up.</p>
<div class="cta">
<a class="btn btn-red" href="#apis">Explore APIs</a>
<button class="btn btn-ghost" id="copyBase">Copy Base URL</button>
</div>
<div class="base"><span class="lbl">API BASE URL</span><code id="baseUrl"></code><button class="mini" id="copyBase2">Copy</button></div>
</section>
<div class="stats rv">
<div class="stat"><div class="num"><span data-count="14">0</span></div><div class="cap">Total APIs</div></div>
<div class="stat"><div class="num"><span data-count="8">0</span></div><div class="cap">Media Tools</div></div>
<div class="stat"><div class="num"><span data-count="4">0</span></div><div class="cap">AI &amp; Chat Tools</div></div>
<div class="stat"><div class="num"><span data-count="99.9" data-dec="1">0</span><em>%</em></div><div class="cap">Uptime</div></div>
</div>
<section id="features"><div class="sec-head rv"><div class="kicker">WHY VERSION-X</div><h2>Built for developers</h2><p>Fast, free and ready to drop into any project.</p></div>
<div class="feat">
<div class="card rv"><div class="ic"><svg viewBox="0 0 24 24"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/></svg></div><h3>Lightning Fast</h3><p>Optimized APIs with quick response times for smooth integration.</p></div>
<div class="card rv"><div class="ic"><svg viewBox="0 0 24 24"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3z"/><path d="M9 12l2 2 4-4"/></svg></div><h3>Secure by Default</h3><p>No API key, no sign-up, no personal data collected to call an endpoint.</p></div>
<div class="card rv"><div class="ic"><svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg></div><h3>Easy Integration</h3><p>Plain GET endpoints that return JSON. Works from any language with one fetch.</p></div>
<div class="card rv"><div class="ic"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg></div><h3>99.9% Uptime</h3><p>Reliable hosting with automatic redeploys and live health checks.</p></div>
<div class="card rv"><div class="ic"><svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></div><h3>Rich Documentation</h3><p>Every endpoint listed with its exact URL and parameters, right on this page.</p></div>
<div class="card rv"><div class="ic"><svg viewBox="0 0 24 24"><path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.5L3 21l2-5.6A8.5 8.5 0 1 1 21 11.5z"/></svg></div><h3>24/7 Support</h3><p>Questions or a broken endpoint? Reach out and it gets fixed.</p></div>
</div></section>
<section id="apis"><div class="sec-head rv"><div class="kicker">API COLLECTION</div><h2>Pick an endpoint, copy, call</h2><p>Every endpoint is free. Tap Copy and paste the full URL into your code.</p></div>
<h2 style="font-size:15px;letter-spacing:2px;color:#9d97c4;margin:26px 0 12px">AI &amp; CHAT</h2>
<div class="grid">
<div class="card rv"><div class="top"><span class="m">GET</span><button class="mini" data-copy="/api/gpt?prompt=hello">Copy</button></div><div class="p">/api/gpt?prompt=hello</div><div class="d">AI chat reply (Pollinations).</div></div>
<div class="card rv"><div class="top"><span class="m">GET</span><button class="mini" data-copy="/api/talk?text=hi">Copy</button></div><div class="p">/api/talk?text=hi</div><div class="d">Friendly talk reply.</div></div>
<div class="card rv"><div class="top"><span class="m">GET</span><button class="mini" data-copy="/api/ai-img?text=cat">Copy</button></div><div class="p">/api/ai-img?text=cat</div><div class="d">Generate two AI images from a prompt.</div></div>
<div class="card rv"><div class="top"><span class="m">GET</span><button class="mini" data-copy="/api/img2text?url=">Copy</button></div><div class="p">/api/img2text?url=</div><div class="d">Read text from an image (OCR).</div></div>
</div>
<h2 style="font-size:15px;letter-spacing:2px;color:#9d97c4;margin:26px 0 12px">MEDIA</h2>
<div class="grid">
<div class="card rv"><div class="top"><span class="m">GET</span><button class="mini" data-copy="/api/ytdown?url=">Copy</button></div><div class="p">/api/ytdown?url=</div><div class="d">YouTube video download link.</div></div>
<div class="card rv"><div class="top"><span class="m">GET</span><button class="mini" data-copy="/api/tikdown?url=">Copy</button></div><div class="p">/api/tikdown?url=</div><div class="d">TikTok video download link.</div></div>
<div class="card rv"><div class="top"><span class="m">GET</span><button class="mini" data-copy="/api/twitterdown?url=">Copy</button></div><div class="p">/api/twitterdown?url=</div><div class="d">X / Twitter video download link.</div></div>
<div class="card rv"><div class="top"><span class="m">GET</span><button class="mini" data-copy="/api/fbdown?url=">Copy</button></div><div class="p">/api/fbdown?url=</div><div class="d">Facebook video download link.</div></div>
<div class="card rv"><div class="top"><span class="m">GET</span><button class="mini" data-copy="/api/ndown?url=">Copy</button></div><div class="p">/api/ndown?url=</div><div class="d">Instagram / Facebook media link.</div></div>
<div class="card rv"><div class="top"><span class="m">GET</span><button class="mini" data-copy="/api/spotify?q=shape of you">Copy</button></div><div class="p">/api/spotify?q=</div><div class="d">Spotify track audio link.</div></div>
<div class="card rv"><div class="top"><span class="m">GET</span><button class="mini" data-copy="/api/pintarest?q=cat">Copy</button></div><div class="p">/api/pintarest?q=cat</div><div class="d">Image search results.</div></div>
<div class="card rv"><div class="top"><span class="m">GET</span><button class="mini" data-copy="/images/ppcouple">Copy</button></div><div class="p">/images/ppcouple</div><div class="d">Random anime couple avatars.</div></div>
</div>
<h2 style="font-size:15px;letter-spacing:2px;color:#9d97c4;margin:26px 0 12px">TOOLS</h2>
<div class="grid">
<div class="card rv"><div class="top"><span class="m">POST</span><button class="mini" data-copy="/api/imgur">Copy</button></div><div class="p">/api/imgur</div><div class="d">Upload an image, get an Imgur link.</div></div>
<div class="card rv"><div class="top"><span class="m">GET</span><button class="mini" data-copy="/api/health">Copy</button></div><div class="p">/api/health</div><div class="d">Check if the API is online.</div></div>
</div>
<p class="note">Note: YouTube, Facebook and Instagram downloaders run through a Python helper (yt-dlp) &mdash; they can take a few seconds and may fail for login-walled videos. TikTok, X, Spotify preview and OCR work via free public services. AI, image and search endpoints work fully.</p>
</section>
<section id="how"><div class="sec-head rv"><div class="kicker">HOW IT WORKS</div><h2>Three steps, no sign-up</h2><p>From this page to a working API call in under a minute.</p></div>
<div class="steps">
<div class="step rv"><h3>Copy the base URL</h3><p>Tap <b>Copy Base URL</b> above, or copy any endpoint card. The full URL is ready to paste.</p></div>
<div class="step rv"><h3>Add your parameters</h3><p>Fill in the query part &mdash; for example <code>?prompt=hello</code> or <code>?url=VIDEO_LINK</code>.</p></div>
<div class="step rv"><h3>Get JSON back</h3><p>Open the URL in a browser or fetch it from code. Every endpoint answers with JSON.</p></div>
</div></section>
<section id="faq"><div class="sec-head rv"><div class="kicker">FAQ</div><h2>Questions, answered</h2><p>Everything you need to know before calling.</p></div>
<div class="rv">
<details><summary>Do I need an API key?</summary><p>No. Every endpoint on this page is free and works without a key or sign-up.</p></details>
<details><summary>How do I call an endpoint?</summary><p>Copy the base URL, pick an endpoint from the list, add its parameters, and open it in a browser or fetch it from your code. You get JSON back.</p></details>
<details><summary>Why do YouTube, Facebook and Instagram downloads take a few seconds?</summary><p>Those three run through a Python helper (yt-dlp) on the server. They can take a few seconds, and videos that need a login may fail.</p></details>
<details><summary>Is there a rate limit?</summary><p>Fair use applies. If an endpoint is busy, wait a moment and retry &mdash; the OCR endpoint uses a personal key with a generous monthly quota.</p></details>
<details><summary>What can I build with it?</summary><p>AI chat, image generation, OCR, media downloaders, image search and avatar tools &mdash; free for any project, including bots and apps.</p></details>
</div></section>
</div>
<footer><div class="wrap">
<span>Credits: <b>VERSION-X</b> &nbsp;|&nbsp; Developer: <b>TAWSHIF AHMED NAYIM</b></span>
<span id="statusText">Checking status&hellip;</span>
</div></footer>
<script>
(function(){
var origin = window.location.origin;
var baseEl = document.getElementById('baseUrl');
if (baseEl) baseEl.textContent = origin;
function copyText(t, btn, label){
  function done(){ var old = btn.textContent; btn.textContent = 'Copied!'; btn.classList.add('copied'); setTimeout(function(){ btn.textContent = old; btn.classList.remove('copied'); }, 1600); }
  if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).then(done, function(){ fallback(); }); }
  else { fallback(); }
  function fallback(){ var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch(e){} document.body.removeChild(ta); done(); }
}
var cb = document.getElementById('copyBase');
if (cb) cb.addEventListener('click', function(){ copyText(origin, this); });
var cb2 = document.getElementById('copyBase2');
if (cb2) cb2.addEventListener('click', function(){ copyText(origin, this); });
var btns = document.querySelectorAll('[data-copy]');
for (var i = 0; i < btns.length; i++) {
  btns[i].addEventListener('click', function(){ copyText(origin + this.getAttribute('data-copy'), this); });
}
fetch('/api/health').then(function(r){ return r.json(); }).then(function(j){
  var ok = j && j.status === 'ok';
  var d1 = document.getElementById('dot2'); if (d1 && ok) d1.classList.add('on');
  var s2 = document.getElementById('statusText2'); if (s2) s2.textContent = ok ? 'Online' : 'Status unknown';
  var s1 = document.getElementById('statusText'); if (s1) s1.textContent = ok ? 'Online — all systems go' : 'Status unknown';
}).catch(function(){
  var s2 = document.getElementById('statusText2'); if (s2) s2.textContent = 'Offline';
  var s1 = document.getElementById('statusText'); if (s1) s1.textContent = 'Offline or unreachable';
});
var io = new IntersectionObserver(function(entries){
  entries.forEach(function(en){ if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
}, { threshold: 0.12 });
var rvs = document.querySelectorAll('.rv');
for (var k = 0; k < rvs.length; k++) io.observe(rvs[k]);
var counters = document.querySelectorAll('[data-count]');
var cio = new IntersectionObserver(function(entries){
  entries.forEach(function(en){
    if (!en.isIntersecting) return;
    var el = en.target; cio.unobserve(el);
    var target = parseFloat(el.getAttribute('data-count'));
    var dec = parseInt(el.getAttribute('data-dec') || '0', 10);
    var start = null, dur = 1100;
    function tick(ts){
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = (target * eased).toFixed(dec);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}, { threshold: 0.5 });
for (var c = 0; c < counters.length; c++) cio.observe(counters[c]);
})();
</script>
</body></html>
`;

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

// --- img2text (OCR.space free API; local Tesseract fallback on full hosts) ---
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
      // A personal OCR.space key (env OCR_SPACE_API_KEY) rarely rate-limits;
      // the shared demo key does, so on 429/5xx retry once after a pause.
      if (e.response && (e.response.status === 429 || e.response.status >= 500)) {
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

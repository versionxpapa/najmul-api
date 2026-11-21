// NAJMUL API — replacement for the dead nayan-server / nayan-media-downloader
// packages and the old Replit APIs (main.n4y4n-server.repl.co, mainserver.repl.co,
// api.nayan-project.repl.co, main-server.nayan-api.repl.co).
// Credits: VERSION-X | Developer: TAWSHIF AHMED NAYIM
// Engines: yt-dlp (video downloaders), Pollinations (gpt / talk / ai-img),
// Tesseract.js (img2text OCR), DuckDuckGo images (pintarest).
// Run:  npm install  &&  npm start        (needs yt-dlp on PATH + Node 20)

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

app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>NAJMUL API</title>
<style>body{background:#0d0b1e;color:#eee;font-family:Arial,sans-serif;padding:40px}
h1{letter-spacing:3px}a{color:#8f7bff}code{background:#1d1838;padding:2px 6px;border-radius:6px}</style></head>
<body><h1>NAJMUL API</h1><p>Replacement APIs for the NAJMUL Messenger bot. Credits: <b>VERSION-X</b> |
Developer: <b>TAWSHIF AHMED NAYIM</b></p>
<p>Endpoints: <code>/api/ytdown?url=</code> <code>/api/ndown?url=</code> <code>/api/fbdown?url=</code>
<code>/api/tikdown?url=</code> <code>/api/twitterdown?url=</code> <code>/api/gpt</code>
<code>/api/img2text?url=</code> <code>/api/spotify?q=</code> <code>/api/pintarest?q=</code>
<code>/images/ppcouple</code> <code>/nayan/ai-img?text=</code> <code>/api/talk?text=</code>
<code>/api/imgur</code> <code>/api/health</code></p>
<p>Docs: <a href="/api/health">/api/health</a></p></body></html>`);
});

app.get("/api/health", (req, res) => res.json({ status: "ok", service: "najmul-api", time: new Date().toISOString() }));

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
app.get("/api/ytdown", async (req, res) => {
  if (!req.query.url) return sendError(res, 400, "missing url");
  try {
    const info = await ytdlpInfo(req.query.url);
    res.json({ data: { video: bestVideoUrl(info), title: info.title || "", data: { duration: info.duration, uploader: info.uploader } } });
  } catch (e) { sendError(res, 502, e.message); }
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

app.get("/api/tikdown", async (req, res) => {
  if (!req.query.url) return sendError(res, 400, "missing url");
  try {
    const info = await ytdlpInfo(req.query.url);
    res.json({ data: {
      video: bestVideoUrl(info),
      title: info.title || "",
      author: { avatar: info.thumbnail || "", name: info.uploader || "" },
      audio: bestAudioUrl(info),
      duration: info.duration || 0,
    } });
  } catch (e) { sendError(res, 502, e.message); }
});

app.get("/api/twitterdown", async (req, res) => {
  if (!req.query.url) return sendError(res, 400, "missing url");
  try {
    const info = await ytdlpInfo(req.query.url);
    res.json({ data: { HD: bestVideoUrl(info) } });
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

// --- img2text (OCR with Tesseract.js) ---
app.get("/api/img2text", async (req, res) => {
  if (!req.query.url) return sendError(res, 400, "missing url");
  const tmp = path.join(os.tmpdir(), "najmul-ocr-" + Date.now() + ".png");
  try {
    const r = await axios.get(req.query.url, { responseType: "arraybuffer", timeout: 30000, headers: UA });
    fs.writeFileSync(tmp, Buffer.from(r.data));
    // Trained data is bundled in ./tessdata, so no download happens at runtime.
    const { data } = await Tesseract.recognize(tmp, "eng", { langPath: path.join(__dirname, "tessdata") });
    res.json({ text: (data.text || "").trim() });
  } catch (e) { sendError(res, 502, e.message); }
  finally { try { fs.unlinkSync(tmp); } catch (_) {} }
});

// --- spotify: search the song on YouTube, return playable audio URL ---
app.get("/api/spotify", async (req, res) => {
  if (!req.query.q) return sendError(res, 400, "missing q");
  try {
    const info = await ytdlpInfo("ytsearch1:" + req.query.q, ["--flat-playlist"]);
    const entry = (info.entries && info.entries[0]) || info;
    const full = await ytdlpInfo(entry.webpage_url || entry.url);
    res.json({ data: { audio: bestAudioUrl(full), title: full.title || entry.title || "" } });
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
app.get("/nayan/ai-img", (req, res) => {
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

app.listen(PORT, () => console.log(`NAJMUL API listening on port ${PORT}`));

# NAJMUL API

বটের নিজের API — মরা `nayan-server` / `nayan-media-downloader` প্যাকেজ আর পুরনো
Replit API (`main.n4y4n-server.repl.co`, `mainserver.repl.co`,
`api.nayan-project.repl.co`, `main-server.nayan-api.repl.co`)-র বদলে নতুন করে বানানো।

- **Credits:** VERSION-X
- **Developer:** TAWSHIF AHMED NAYIM
- **Stack:** Node 20 + Express, yt-dlp (ডাউনলোডার), Pollinations (gpt/talk/ai-img),
  Tesseract.js (img2text OCR), Openverse (pintarest ছবি খোঁজা), Imgur (আপলোড)।

## চালানো (লোকাল)

```bash
npm install
# yt-dlp লাগবে:  pip install yt-dlp   (অথবা ডাউনলোড করে PATH-এ রাখো)
npm start          # PORT env দিয়ে পোর্ট বদলানো যায়, ডিফল্ট 3000
```

## হোস্ট করা (ফ্রি)

**Render (সবচেয়ে সহজ, ফ্রি):**
1. এই ফোল্ডারটা GitHub-এ পুশ করো।
2. Render-এ গিয়ে New → Blueprint → রিপো সিলেক্ট করো (`render.yaml` আছে)।
3. Deploy শেষে যে URL দেবে (যেমন `https://najmul-api.onrender.com`), সেটাই বটের
   `NAJMUL_API_URL` হবে।

**Replit:** রিপো Import করো → Run-এ `npm start` → Shell-এ `pip install yt-dlp`।

**VPS/Docker:** `docker build -t najmul-api . && docker run -p 3000:3000 najmul-api`
অথবা `start.sh` দিয়ে systemd/PM2-এ চালাও।

## এন্ডপয়েন্ট (বট যেভাবে ডাকবে)

| এন্ডপয়েন্ট | বদলে যা ছিল | রিটার্ন |
|---|---|---|
| `GET /api/ytdown?url=` | `ytdown()` | `{data:{video, title, data}}` |
| `GET /api/ndown?url=` | `ndown()` (FB/Insta) | `{data:[{url}]}` |
| `GET /api/fbdown?url=` | `fbdown()` | `{media:{hd, title}}` |
| `GET /api/tikdown?url=` | `tikdown()` | `{data:{video, title, author:{avatar}, audio, duration}}` |
| `GET /api/twitterdown?url=` | `twitterdown()` | `{data:{HD}}` |
| `GET /api/gpt?prompt=` | `gpt()` | `{gpt:"..."}` |
| `POST /api/gpt` `{prompt}` | `gpt()` | `{gpt:"..."}` |
| `GET /api/talk?text=` | talk API | `{reply:"..."}` |
| `GET /api/img2text?url=` | `img2text()` | `{text:"..."}` |
| `GET /api/spotify?q=` | `spotify()` | `{data:{audio, title}}` |
| `GET /api/pintarest?q=` | `pintarest()` | `{data:[imageUrl, ...]}` |
| `GET /images/ppcouple` | ppcouple API | `{url:{male, female}}` |
| `GET /nayan/ai-img?text=` | ai-img API | `{image1:{url}, image2:{url}}` |
| `POST /api/imgur` `{url}` | imgur-upload-api | `{data:{link, type}}` |
| `GET /api/health` | — | `{status:"ok"}` |

## টেস্ট করা হয়েছে (2026-11-21, লাইভ)

- ytdown (YouTube), tikdown (TikTok), spotify, gpt, talk, pintarest, img2text (OCR),
  imgur আপলোড, ppcouple, ai-img — সবগুলো আসল রিকোয়েস্ট দিয়ে চেক করা।
- twitterdown / ndown / fbdown — ytdown-এর মতোই yt-dlp কোডপাথ; X-এর লাইভ লিংক
  দিয়ে চেক বাকি (পাবলিক ভিডিও লিংক দিলে যাচাই করা যাবে)। Facebook-এর কিছু
  ভিডিও লগইন ছাড়া নাও মিলতে পারে — এটা yt-dlp-এর সীমা, সার্ভারের বাগ নয়।

## নোট

- `public/ppcouple/` — অ্যানিমে কাপল অবতারের ছবি, এই সার্ভার থেকেই সার্ভ হয়।
- `tessdata/` — OCR-এর জন্য বান্ডেল করা `eng.traineddata` (রানটাইমে ডাউনলোড লাগে না)।
- কোনো API key লাগে না। Imgur আপলোডে বটের কোডে আগে থেকে থাকা Client-ID-ই ব্যবহার হয়।

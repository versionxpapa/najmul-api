// Vercel serverless entry point: the Express app from server.js.
// On Vercel the video downloaders (yt-dlp) and OCR (tesseract traineddata)
// are unavailable/limited — those endpoints return a 502 error JSON instead
// of crashing. The pure-HTTP endpoints (gpt, talk, ai-img, pintarest, imgur,
// ppcouple, health) work normally.
module.exports = require("../server.js");

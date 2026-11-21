# YouTube downloader as a Python serverless function (Vercel).
# The Node app has no yt-dlp binary on serverless hosts, but the yt-dlp
# *Python package* installs here and extracts video info in-process.
# Same response shape as the Node handler: {data:{video,title,data:{...}}}
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        qs = parse_qs(urlparse(self.path).query)
        url = (qs.get("url") or [""])[0]
        if not url:
            return self._send(400, {"error": "missing url"})
        try:
            import yt_dlp

            is_yt = ("youtu" in url) or ("youtube" in url)
            opts = {
                "quiet": True,
                "noplaylist": True,
                "socket_timeout": 8,
                "retries": 1,
            }
            if is_yt:
                opts["extractor_args"] = {"youtube": {"player_client": ["android"]}}
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False)
            fmts = [f for f in (info.get("formats") or []) if f.get("url")]
            direct = [
                f
                for f in fmts
                if f.get("ext") == "mp4"
                and f.get("vcodec") not in (None, "none")
                and f.get("acodec") not in (None, "none")
            ]
            pool = direct or fmts
            pool.sort(
                key=lambda f: ((f.get("height") or 0), (f.get("tbr") or 0)),
                reverse=True,
            )
            if not pool:
                return self._send(502, {"error": "no video found"})
            video = pool[0]["url"]
            return self._send(
                200,
                {
                    "data": {
                        "video": video,
                        "title": info.get("title") or "",
                        "data": {
                            "duration": info.get("duration"),
                            "uploader": info.get("uploader"),
                        },
                    }
                },
            )
        except Exception as e:
            return self._send(502, {"error": str(e)[:300]})

    def _send(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass

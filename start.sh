#!/bin/bash
# Start the NAJMUL API locally (needs Node 20 + yt-dlp on PATH).
cd "$(dirname "$0")"
export PORT="${PORT:-3000}"
exec node server.js

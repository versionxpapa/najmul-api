FROM node:20-slim
RUN apt-get update && apt-get install -y python3 python3-pip curl ffmpeg && rm -rf /var/lib/apt/lists/*
RUN pip3 install --break-system-packages yt-dlp
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY . .
EXPOSE 3000
CMD ["npm", "start"]

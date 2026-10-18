<div align="center">

<img src="app/assets/icon.png" alt="Ludok Home icon" width="96">

# Ludok Home

**Your private home organizer: an Android app plus a Raspberry Pi.**

Today's tasks, medicines, car expenses, lists, things to check later, the day's news as audio, and your Pi's Docker containers.<br>
Your data lives on your own hardware. No accounts. No subscriptions. No AI cloud services.

[![License: MIT](https://img.shields.io/github/license/iamLudok/Ludok-home?style=flat-square&color=blue)](LICENSE)
[![Android](https://img.shields.io/badge/Android-app-3DDC84?style=flat-square&logo=android&logoColor=white)](app/README.md)
[![Expo SDK 57](https://img.shields.io/badge/Expo-SDK%2057-000020?style=flat-square&logo=expo&logoColor=white)](https://docs.expo.dev/)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![Raspberry Pi](https://img.shields.io/badge/Raspberry%20Pi-4%20%7C%205-A22846?style=flat-square&logo=raspberrypi&logoColor=white)](https://www.raspberrypi.com/)
[![Nextcloud](https://img.shields.io/badge/Nextcloud-self--hosted-0082C9?style=flat-square&logo=nextcloud&logoColor=white)](https://nextcloud.com/)
[![Docker](https://img.shields.io/badge/Docker-managed-2496ED?style=flat-square&logo=docker&logoColor=white)](deploy/docker-api)
[![Tailscale](https://img.shields.io/badge/Tailscale-private%20access-242424?style=flat-square&logo=tailscale&logoColor=white)](https://tailscale.com/)

[Features](#features) · [Installation](#installation) · [App docs](app/README.md) · [News audio](docs/features.md) · [License](#license)

</div>

---

## Table of Contents

- [Why Ludok Home?](#why-ludok-home)
- [How it fits together](#how-it-fits-together)
- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Project Structure](#project-structure)
- [Cron, Services & Logs](#cron-services--logs)
- [Contributing](#contributing)
- [License](#license)

---

## Why Ludok Home?

Most assistants send your personal data to external servers. Ludok Home is built around a different principle: **your data stays yours**.

- 📱 **Local-first app**: medicines, car expenses, lists, notes and saved links live in SQLite on your phone, with a daily JSON backup to your own Nextcloud. Android's Google Drive backup is turned off on purpose.
- 🏠 **Self-hosted everything else**: tasks and events come from your Nextcloud (CalDAV, Deck boards included); the news comes from your Nextcloud News feeds.
- 🔒 **Local processing**: the news audio is synthesized on the Pi with Piper. No data is sent to AI or analytics providers.
- 🖥️ **Your server, from your phone**: start, stop, update and inspect your Docker containers, see the Pi's temperature and who is on your home network. Nothing runs on the Pi for this until you open the screen.
- 🌍 **Away from home over Tailscale**: the app talks to the same addresses; nothing is exposed to the internet.

> **What does leave your network:** link previews. When you save a link, the phone fetches that page to get its picture and title, as any browser would. Everything else stays between your phone, your Pi and your Nextcloud.

---

## How it fits together

```
 Nextcloud News ──► Raspberry Pi (5:45, cron) ──► noticias.ogg + noticias.json
                     Piper TTS, runs locally          in your Nextcloud
                                                            │
 Nextcloud Deck / Calendar (CalDAV) ───────────────────────┤
                                                            ▼
                                        Ludok Home app (Android, SQLite)
                                          │                 │
                    Docker API (Caddy, ◄──┘                 └──► daily backup JSON
                    password, Tailscale                          back to Nextcloud
                    + home Wi-Fi only)
```

| Layer | Technology | Role |
|---|---|---|
| App | Expo SDK 57, expo-router, SQLite | Everything you touch: Today, Car, Medicines, Lists, Saved and Server |
| Self-hosted data | Nextcloud | Tasks, events, news feeds, backups and the daily audio |
| Text to speech | Piper | Reads the news aloud on the Pi, runs locally |
| Docker API | Caddy in front of the Docker socket | Password-protected, only on Tailscale and the home network; used by the Server screen |
| Runtime | Raspberry Pi 4/5 | Runs Nextcloud, the daily news job and your containers |

---

## Features

### Android app (`app/`)
- ☀️ **Today**: the weather where you are (approximate location) or in a city you choose, from Open-Meteo, with when it will rain and the next 12 hours; quick notes, medicines still to take, tasks due today or overdue, today's events and a news player that jumps between stories. A reminder at 6:15 (configurable) tells you the news is ready before you leave home
- 🚗 **Car**: fuel, workshop and parts, with a chart that updates as you log, consumption and average price per litre
- 💊 **Medicines**: schedules, local reminders that work offline and with the app closed, and an adherence calendar (2 weeks or month)
- 🛒 **Lists**: shopping list you can share on WhatsApp, wishlist and gift ideas with pictures and who each gift is for
- 🔖 **Saved**: reels, apps, portfolios and websites to check later, with tags. Add them from any app with **Share → Ludok Home**
- 🖥️ **Server**: your Docker containers grouped by Compose project; start, stop, restart, remove, logs, run a command, generated `docker-compose`, check and apply updates (with automatic rollback if the new one doesn't stay up), change tag, ports in use and image cleanup. A speed test in one tap: the Pi measures the line over its cable (does your ISP deliver what you pay for?) and then the phone measures what reaches it, so you know whether the Wi-Fi is the bottleneck. Also the Pi's temperature, RAM, disk and load, and the devices on your home network with their vendor and your own names

→ [App documentation (Spanish)](app/README.md)

### Raspberry Pi
- 📰 **Daily news audio**: every morning at 5:45 the Pi reads your Nextcloud News feeds (2 stories per feed, near-duplicates removed), turns them into speech with Piper and leaves the audio with its story index in Nextcloud
- 🔐 **Docker API for the app**: a Caddy container with a password in front of the Docker socket, published only on Tailscale (`tailscale serve`) and on the Pi's home IP

→ [News audio details](docs/features.md)

---

## Requirements

### Hardware
- Raspberry Pi 4 or 5 (8 GB RAM recommended), running Nextcloud
- An Android phone

### Nextcloud apps
- **News**: the feeds for the daily audio
- **Calendar** / **Deck**: tasks and events shown in Today
- **Files**: backups and the daily audio go to a `Ludok Home` folder

### Other
- `ffmpeg` on the Pi (installed by `setup.sh`)
- ~65 MB for the Spanish Piper voice, downloaded by `setup.sh` into `voices/`
- [Tailscale](https://tailscale.com/) on the Pi and the phone, to use the app away from home (optional, but needed for the Server screen outside your home Wi-Fi)
- For the Server screen: Docker on the Pi, and `nmap` only for its list of MAC vendors (optional)

---

## Installation

### 1. On the Raspberry Pi

```bash
git clone https://github.com/iamLudok/Ludok-home.git ~/Ludok-home
cd ~/Ludok-home
bash deploy/setup.sh
nano .env
```

`setup.sh` installs `ffmpeg`, creates a Python virtual environment, downloads the Piper voice and sets up the daily cron job at 5:45.

| Variable | Description |
|---|---|
| `NEXTCLOUD_URL` | Your Nextcloud URL, e.g. `http://192.168.1.50:8080` |
| `NEXTCLOUD_USER` | Your Nextcloud username |
| `NEXTCLOUD_PASSWORD` | A Nextcloud [app password](https://docs.nextcloud.com/server/latest/user_manual/en/session_management.html#managing-devices), not your account password |
| `NEXTCLOUD_FOLDER` | Optional: folder for the daily audio (default `Ludok Home`) |
| `PIPER_VOICE` | Optional: path to another Piper voice `.onnx` |

Test it once by hand:

```bash
~/ludok-home-env/bin/python3 ~/Ludok-home/noticias.py
```

### 2. Docker API for the Server screen (optional)

Whoever has this password controls Docker, which in practice means root on the Pi. Read [SECURITY.md](SECURITY.md#hardening-your-installation) first.

```bash
cd ~/Ludok-home/deploy/docker-api
cp Caddyfile.example Caddyfile                     # git ignores the real one
docker run --rm caddy:2-alpine caddy hash-password --plaintext 'a-long-password'
nano Caddyfile                                     # paste the hash; set your Pi's fixed home IP in `bind`
sudo apt install nmap                              # optional: only for MAC vendor names
docker compose up -d
sudo tailscale serve --bg --tcp 2375 tcp://127.0.0.1:2375
```

It listens on `127.0.0.1` (published to your tailnet by `tailscale serve`) and on the Pi's home IP, never on `0.0.0.0`.

### 3. The Android app

Build and install the signed APK as explained in [app/README.md](app/README.md). Then, in the app's **Settings**:
- **Nextcloud**: the same server, user and app password.
- **Docker de la Pi** (optional): `http://<pi-tailscale-ip>:2375`, `http://<pi-home-ip>:2375`, user `ludok` and the password from step 2.

---

## Project Structure

```
Ludok-home/
├── app/                    ← Android app (Expo), see app/README.md
├── core/
│   ├── audio.py            ← News audio with Piper, uploaded to Nextcloud (old versions removed)
│   ├── config.py           ← Reads .env and exposes CONFIG
│   ├── sources.py          ← Nextcloud News: 2 per feed, no near-duplicates
│   └── tts_worker.py       ← Synthesizes each story separately (runs with nice)
├── deploy/
│   ├── docker-api/         ← Caddy in front of Docker for the Server screen
│   └── setup.sh            ← Pi installation script
├── docs/
│   └── features.md         ← News audio details
├── logo/                   ← App icon sources
├── noticias.py             ← Daily news job (runs via cron)
├── requirements.txt        ← Python dependencies
├── .env.example            ← Template for .env
└── LICENSE                 ← MIT license
```

---

## Cron, Services & Logs

```bash
crontab -l                      # daily news schedule
cat ~/ludok-home.log            # daily news logs
docker logs ludok-docker-api    # Docker API (Caddy)
tailscale serve status          # what is published to your tailnet
```

---

## Contributing

Pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the development setup and conventions. To report a security vulnerability, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

---

## License

Distributed under the **MIT License**. You are free to use, modify and share Ludok Home, including for commercial use, as long as you keep the copyright notice. See [LICENSE](LICENSE) for the full text.

---

<div align="center">

Made by [Luken Iriondo](https://github.com/iamLudok) · If Ludok Home is useful to you, consider giving it a ⭐

</div>

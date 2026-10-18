<div align="center">

# Ludok Home

**Your private home organizer: an Android app plus a Raspberry Pi.**

Today's tasks, medicines, car expenses, lists, things to check later, and the day's news as audio.<br>
Your data lives on your own hardware. No accounts. No subscriptions. No AI cloud services.

[![License: MIT](https://img.shields.io/github/license/iamLudok/Ludok-home?style=flat-square&color=blue)](LICENSE)
[![Android](https://img.shields.io/badge/Android-app-3DDC84?style=flat-square&logo=android&logoColor=white)](app/README.md)
[![Expo SDK 57](https://img.shields.io/badge/Expo-SDK%2057-000020?style=flat-square&logo=expo&logoColor=white)](https://docs.expo.dev/)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![Raspberry Pi](https://img.shields.io/badge/Raspberry%20Pi-4%20%7C%205-A22846?style=flat-square&logo=raspberrypi&logoColor=white)](https://www.raspberrypi.com/)
[![Nextcloud](https://img.shields.io/badge/Nextcloud-self--hosted-0082C9?style=flat-square&logo=nextcloud&logoColor=white)](https://nextcloud.com/)

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
- [Cron & Logs](#cron--logs)
- [History](#history)
- [Contributing](#contributing)
- [License](#license)

---

## Why Ludok Home?

Most assistants send your personal data to external servers. Ludok Home is built around a different principle: **your data stays yours**.

- 📱 **Local-first app**: medicines, car expenses, lists and notes live in SQLite on your phone, with a daily JSON backup to your own Nextcloud. Android's Google Drive backup is turned off on purpose.
- 🏠 **Self-hosted everything else**: tasks and events come from your Nextcloud (CalDAV, Deck boards included); the news comes from your Nextcloud News feeds.
- 🔒 **Local processing**: the news audio is synthesized on the Pi with Piper. No data is sent to AI or analytics providers.
- 🌍 **Away from home over Tailscale**: the app talks to the same address; nothing is exposed to the internet.

> **What does leave your network:** link previews. When you save a link, the phone fetches that page to get its picture and title, as any browser would.

---

## How it fits together

```
 Nextcloud News ──► Raspberry Pi (7:30, cron) ──► noticias.ogg + noticias.json
                     Piper TTS, runs locally          in your Nextcloud
                                                            │
 Nextcloud Deck / Calendar (CalDAV) ───────────────────────┤
                                                            ▼
                                        Ludok Home app (Android, SQLite)
                                                            │
                                     daily backup JSON ─────┘ back to Nextcloud
```

| Layer | Technology | Role |
|---|---|---|
| App | Expo SDK 57, expo-router, SQLite | Everything you touch: Today, Car, Medicines, Lists, Saved |
| Self-hosted data | Nextcloud | Tasks, events, news feeds, backups and the daily audio |
| Text to speech | Piper | Reads the news aloud on the Pi, runs locally |
| Runtime | Raspberry Pi 4/5 | Runs Nextcloud and the daily news job |

---

## Features

### Android app (`app/`)
- ☀️ **Today**: quick notes, medicines still to take, tasks due today or overdue, today's events and a news player that jumps between stories
- 🚗 **Car**: fuel, workshop and parts, with a chart that updates as you log, consumption and average price per litre
- 💊 **Medicines**: schedules, local reminders that work offline and with the app closed, and an adherence calendar (2 weeks or month)
- 🛒 **Lists**: shopping list you can share on WhatsApp, wishlist and gift ideas with pictures and who each gift is for
- 🔖 **Saved**: reels, apps, portfolios and websites to check later, with tags. Add them from any app with **Share → Ludok Home**

→ [App documentation (Spanish)](app/README.md)

### Raspberry Pi
- 📰 **Daily news audio**: every morning at 7:30 the Pi reads your Nextcloud News feeds (2 stories per feed, near-duplicates removed), turns them into speech with Piper and leaves the audio with its story index in Nextcloud

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
- [Tailscale](https://tailscale.com/) on the Pi and the phone, to use the app away from home (optional)

---

## Installation

### 1. On the Raspberry Pi

```bash
git clone https://github.com/iamLudok/Ludok-home.git ~/Ludok-home
cd ~/Ludok-home
bash deploy/setup.sh
nano .env
```

`setup.sh` installs `ffmpeg`, creates a Python virtual environment, downloads the Piper voice and sets up the daily cron job at 7:30.

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

### 2. The Android app

Build and install the signed APK as explained in [app/README.md](app/README.md), then in the app go to **Settings → Nextcloud** and enter the same server, user and app password.

---

## Project Structure

```
Ludok-home/
├── app/                    ← Android app (Expo), see app/README.md
├── core/
│   ├── audio.py            ← News audio with Piper, uploaded to Nextcloud
│   ├── config.py           ← Reads .env and exposes CONFIG
│   ├── sources.py          ← Nextcloud News: 2 per feed, no near-duplicates
│   └── tts_worker.py       ← Synthesizes each story separately (runs with nice)
├── deploy/
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

## Cron & Logs

```bash
crontab -l                 # daily news schedule
cat ~/ludok-home.log       # daily news logs
```

---

## History

Ludok Home started as **Ludext**, a Telegram bot with a morning briefing. In October 2026 everything moved to the Android app: Telegram was a third party in the middle of every message, and typing `/gasolina 40 1.65` was worse than a form. The bot, the Gmail reader and the CLIP photo search were removed; their code is still in the git history.

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

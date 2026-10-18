# Contributing to Ludok Home

Thanks for your interest in Ludok Home! It's a personal project, but contributions are welcome.

## Ways to Contribute

- **Code changes**: send a pull request directly. Fixes, improvements and new features are all welcome as PRs.
- **Bugs and ideas**: if you found something that doesn't work, or have an idea but don't want to code it, open a public [issue](https://github.com/iamLudok/Ludok-home/issues).
- **Security vulnerabilities**: never in a public issue. Report them privately as explained in [SECURITY.md](SECURITY.md).

Before posting logs or screenshots, **remove any personal data**: emails, tokens, IP addresses, Nextcloud URLs, medicines or expenses.

## Development Setup

The project has two parts. The **Android app** in `app/` has its own setup and data-layer checks: see [app/README.md](app/README.md) (`npm run verify`, `npm run typecheck`). Changes to the Docker client can also be checked against a real Docker with `npm run verify:docker-real`, which creates and removes its own throwaway container and never touches the others. The speed test can be run for real with `npm run verify:speed-real` (it uses a few hundred MB on your machine and over 1 GB on the Pi's line).

For the **Pi side** you don't need a Raspberry Pi. Any Linux machine with Python 3.11+, `ffmpeg` and access to a Nextcloud instance with the News app works.

```bash
git clone https://github.com/iamLudok/Ludok-home.git
cd Ludok-home
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in your own credentials
```

Generate the news audio and upload it to your Nextcloud:

```bash
python3 noticias.py
```

## Project Conventions

- **Code comments and app texts are in Spanish**; the README and docs are in English (the app README is in Spanish).
- Each file starts with a header comment describing what it does:
  ```python
  # ─────────────────────────────────────────────────────────
  # file.py: Short description
  # ─────────────────────────────────────────────────────────
  ```
- Credentials only come from `.env` through `core/config.py`. Never hardcode tokens, passwords, IPs or personal names.
- Personal data (car, medicines, lists, notes) lives in the Android app, never on the Pi.
- Keep dependencies minimal: Ludok Home has to run comfortably on a Raspberry Pi.

## Pull Requests

- Keep each PR focused on one change.
- Describe what changed and how you tested it.
- Update the docs if you change how something works.
- Make sure no `.env`, keystore, backups or other personal files are included.

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

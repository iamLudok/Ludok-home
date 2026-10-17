# Contributing to Ludok Home

Thanks for your interest in Ludok Home! It's a personal project, but contributions are welcome.

## Ways to Contribute

- **Code changes**: send a pull request directly. Fixes, improvements and new features are all welcome as PRs.
- **Bugs and ideas**: if you found something that doesn't work, or have an idea but don't want to code it, open a public [issue](https://github.com/iamLudok/Ludok-home/issues).
- **Security vulnerabilities**: never in a public issue. Report them privately as explained in [SECURITY.md](SECURITY.md).

Before posting logs or screenshots, **remove any personal data**: emails, tokens, chat IDs, IP and MAC addresses, Nextcloud URLs.

## Development Setup

You don't need a Raspberry Pi to develop. Any Linux machine with Python 3.11+ and access to a Nextcloud instance works.

```bash
git clone https://github.com/iamLudok/Ludok-home.git
cd Ludok-home
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in your own credentials
```

Use a **separate Telegram bot** for testing, so you don't mix it up with your real one.

Run the pieces you're working on:

```bash
python3 briefing.py --debug   # generate the briefing into briefing.txt
python3 -m bot              # start the Telegram bot in the foreground
```

## Project Conventions

- **Code comments and bot messages are in Spanish**; the README and docs are in English.
- Each file starts with a header comment describing what it does:
  ```python
  # ─────────────────────────────────────────────────────────
  # file.py: Short description
  # ─────────────────────────────────────────────────────────
  ```
- Credentials only come from `.env` through `core/config.py`. Never hardcode tokens, passwords, IPs or personal names.
- Personal data (car, medicines, lists) lives in the Android app in `app/`, not in the bot. See [app/README.md](app/README.md).
- Keep dependencies minimal: Ludok Home has to run comfortably on a Raspberry Pi.

## Adding a Bot Command

1. Put the logic in the right module (`scheduling/`, `system/`, `core/`, ...).
2. Add a `cmd_<name>` function in `bot/handlers.py`.
3. Register it in the `routes` dict inside `handle()`.
4. Add it to the `AYUDA` help text.
5. Document it in [docs/commands.md](docs/commands.md) and, if it needs explanation, in [docs/features.md](docs/features.md).

## Pull Requests

- Keep each PR focused on one change.
- Describe what changed and how you tested it.
- Update the docs if you add or change a command.
- Make sure no `.env`, `devices.json` or other personal files are included.

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

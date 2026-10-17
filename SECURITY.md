# Security Policy

## Supported Versions

Ludok Home is a personal project. Only the latest version on the `main` branch receives security fixes.

| Version | Supported |
|---|---|
| `main` (latest) | ✅ |
| Older commits and releases | ❌ |

## Reporting a Vulnerability

**Please do not report security problems in a public issue.** Issues are visible to everyone, so describing a vulnerability there would show anyone how to attack existing Ludok Home installations before a fix is available.

Report it privately through GitHub instead:

1. Go to the [Security tab](https://github.com/iamLudok/Ludok-home/security) of this repository
2. Click **Report a vulnerability**
3. Describe the issue, how to reproduce it, and its possible impact

Only the maintainer can see the report. You can expect a first response within a week. Once the issue is confirmed and fixed, the details are made public and you will be credited, unless you prefer to stay anonymous.

## Scope

In scope:

- Leaks of credentials or personal data handled by Ludok Home (Nextcloud credentials, backups, medicines, lists)
- Unsafe handling of data the app receives: shared links, link previews, backup files, CalDAV or news content
- Issues in `deploy/setup.sh` that weaken the security of the host

Out of scope:

- Vulnerabilities in Nextcloud, Expo, Piper or other third-party software (report those upstream)
- Problems that require prior access to the Pi or to the `.env` file

## Hardening Your Installation

Ludok Home handles your medicines, expenses, calendar and Nextcloud credentials, so treat the Pi and the phone as sensitive devices:

- **Protect `.env`**: it holds all your credentials. Restrict it to your user with `chmod 600 .env` and never commit it (it is already in `.gitignore`).
- **Use app passwords**: use a Nextcloud [app password](https://docs.nextcloud.com/server/latest/user_manual/en/session_management.html#managing-devices) instead of your main password, so you can revoke them at any time.
- **Don't expose Nextcloud over plain HTTP**: an `http://` URL is fine inside your home network; from outside use a VPN such as Tailscale (traffic is encrypted) or HTTPS, never an open port.
- **Keep the keystore safe**: `app/release.jks` and `app/keystore.properties` sign the APK. Never commit them; if they leak, someone could ship an update that installs over yours.
- **Backups contain personal data**: the JSON backups hold your medicines and expenses (never the Nextcloud password). Keep them in your Nextcloud, not in public places.
- **Keep the system updated**: run `sudo apt update && sudo apt upgrade` regularly and update the Python packages in `~/ludok-home-env`.

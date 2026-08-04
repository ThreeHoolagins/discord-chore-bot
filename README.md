# 🧹 Discord Chore Bot

A self-hosted Discord bot that DMs you scheduled chore reminders with **Done** / **Not yet** buttons (1-hour and 3-hour snooze options). It keeps nagging (every hour) until you click a button — done gets you a "Great job!" message, and "Not yet" snoozes it. Quiet hours keep it from pinging you overnight.

## How it works

- Each chore in `chores.js` repeats weekly on a given day + time.
- When it's due, the bot DMs you: `🗑️ Don't forget: take out the trash and recycling!` with three buttons.
- **No interaction** → re-reminded every `retryIntervalHours` (default 1 hour).
- **Done** → the message turns into `🎉 Great job for doing put out the trash and recycling!` and reminders stop for the week.
- **Not yet (remind in 1 hour)** → snoozes reminders for 1 hour.
- **Not yet (remind me in 3 hours)** → snoozes reminders for 3 hours.
- **Quiet hours** (`00:00`–`08:00` by default) → no reminder DMs are sent.
- Every week starts fresh for every chore.

## Prerequisites / constraints

- **Node.js v18+** (npm included). Built against Node v25 / discord.js v14 / node-cron v4.
- A **Discord account** for you, and a **bot application** on the Discord Developer Portal.
- The bot must be **running continuously** to send reminders. Run it on an always-on machine: a desktop you leave on, a Raspberry Pi, a VPS, or a cloud box. If it's off, no reminders go out (it resumes the pending schedule on restart).
- The machine's clock should be correct; the bot resolves all times in the `timezone` set in `chores.js` regardless of the machine's local timezone.
- The bot DMs **only** the user ID in `.env`. Anyone else who clicks the buttons is told off.
- DMs from bots: Discord will place bot DMs in your DM list; you must have allowed the bot to DM you (open the DM once).

## Setup

```bash
git clone https://github.com/ThreeHoolagins/discord-chore-bot.git
cd discord-chore-bot
npm install
cp .env.example .env   # then fill it in (see "Getting secrets")
npm start              # or npm run dev for auto-restart on file changes
```

Then edit `chores.js` to match **your** schedule and wording (see "Configuring chores").

## Running as a systemd service (auto-start on boot)

The bot must run continuously to send reminders. The easiest way to keep it always on (and auto-restart if it crashes or your machine reboots) is a **systemd user service**. This runs the bot under your own account — no root needed.

**Prerequisites**
- The bot set up and working via `npm start` first (previous section).
- A systemd-based Linux (Ubuntu, Debian, Fedora, Arch, etc.). On Windows, use Task Scheduler or WSL instead.

**1. Find your Node.js binary**

`npm start` relies on your shell's `node` (e.g. from nvm). systemd doesn't read your shell config, so use the absolute path:

```bash
which node
# e.g. /home/you/.nvm/versions/node/v25.5.0/bin/node
```

**2. Create the service unit**

```bash
mkdir -p ~/.config/systemd/user
```

Then create `~/.config/systemd/user/discord-chore-bot.service`:

```ini
[Unit]
Description=Discord chore reminder bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/path/to/discord-chore-bot
ExecStart=/absolute/path/to/node index.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
```

Replace `/path/to/discord-chore-bot` with your repo path and `/absolute/path/to/node` with the result of `which node`.

**3. Enable + start, and allow boot-time startup**

```bash
systemctl --user daemon-reload
systemctl --user enable --now discord-chore-bot

# Run even when you're not logged in (needed for "on boot" to actually work):
loginctl enable-linger $USER
```

**4. Day-to-day commands**

| Task | Command |
|---|---|
| Check status / see logs | `systemctl --user status discord-chore-bot` |
| Restart (after editing `chores.js`) | `systemctl --user restart discord-chore-bot` |
| Stop | `systemctl --user stop discord-chore-bot` |
| Start | `systemctl --user start discord-chore-bot` |
| Follow logs live | `journalctl --user -u discord-chore-bot -f` |

> **Note:** `systemctl --user` commands only affect your own user session. If you use SSH or another account, they won't see this service.

## Getting secrets

### 1. Discord bot token (`DISCORD_TOKEN`)

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application** → give it a name → **Create**.
2. Left sidebar → **Bot** → **Reset Token** → copy it. (Treat it like a password.)
3. On the same page, make sure **Message Content Intent** is toggled **ON** (the `!check` / `!status` commands need it).
4. Paste it into `.env`: `DISCORD_TOKEN=...`

### 2. Your Discord user ID (`USER_ID`)

1. In Discord: **Settings → Advanced → Developer Mode** (toggle on).
2. Right-click your own avatar → **Copy User ID**.
3. Paste it into `.env`: `USER_ID=...`

### 3. Invite the bot and open a DM

1. Developer Portal → your app → **OAuth2 → URL Generator**.
2. Scopes: check **bot**. Bot permissions: **Send Messages** (add **Embed Links** too if you extend it later).
3. Generate the URL, open it, pick a server, and authorize.
4. Once it's in a server, **send it a DM** (e.g. `hello`) so Discord allows DM delivery.

## Configuring chores

Open `chores.js`. Top-level settings:

| Key | Default | Meaning |
|---|---|---|
| `timezone` | `America/Denver` | IANA timezone for all times |
| `quietHours` | `00:00`–`08:00` | No reminder DMs in this local window (`end` is exclusive) |
| `retryIntervalHours` | `1` | Re-reminder interval when you don't click anything |
| `snoozeHours` | `3` | Default snooze fallback; the buttons offer 1-hour and 3-hour snoozes |

Each chore entry:

```js
{
  id: 'milk',                                  // unique, letters/dashes
  name: 'bring in the milk',                   // used in the congrats message
  message: '🥛 Make sure you brought the milk in!', // the DM text
  day: 'tuesday',                              // sunday..saturday
  time: '15:00',                               // 24h HH:MM, in `timezone`
}
```

## Manual commands (DM the bot)

| Command | What it does |
|---|---|
| `!check` | Run the scheduler once immediately (handy for testing) |
| `!status` | Show each chore's next/overdue time and current state |
| `!test` | Send a reminder for a random chore (prefixed with 🧪). Its buttons are **dummy** — clicking them just says "Action successfully clicked" and changes nothing |
| `!clear` | Delete every message the bot has sent in this DM (asks for confirmation first) |

## Troubleshooting

| Problem | Fix |
|---|---|
| Bot not sending reminders | Is it running? Check the console. Confirm `DISCORD_TOKEN` / `USER_ID` in `.env`. Confirm you opened a DM with the bot. |
| "This isn't for you 😄" when clicking | Wrong `USER_ID` in `.env`. |
| `!check` / `!status` don't reply | Enable **Message Content Intent** in the Developer Portal and restart the bot. |
| Times look wrong | Check `timezone` in `chores.js`. |
| Reminders arrive at odd hours | Quiet hours are in `chores.js` (`quietHours`). |
| `Cannot find module` errors | Run `npm install`. |

## Security note

`.env` (your token + user ID) and `state.json` are in `.gitignore` and are **never** committed. `.env.example` is committed with placeholders. Never paste your token into issues, DMs, or anywhere public — if it ever leaks, **Reset Token** in the Developer Portal immediately.

# 🧹 Discord Chore Bot

A self-hosted Discord bot that DMs you scheduled chore reminders with **✅ Done** / **❌ Not yet** buttons. It keeps nagging (every hour) until you click a button — done gets you a "Great job!" message, and "Not yet" snoozes it for 3 hours. Quiet hours keep it from pinging you overnight.

## How it works

- Each chore in `chores.js` repeats weekly on a given day + time.
- When it's due, the bot DMs you: `🗑️ Don't forget: take out the trash and recycling!` with two buttons.
- **No interaction** → re-reminded every `retryIntervalHours` (default 1 hour).
- **✅ Done** → the message turns into `🎉 Great job for doing put out the trash and recycling!` and reminders stop for the week.
- **❌ Not yet** → snoozes reminders for `snoozeHours` (default 3 hours), then resumes hourly.
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
| `snoozeHours` | `3` | How long **❌ Not yet** pauses reminders |

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

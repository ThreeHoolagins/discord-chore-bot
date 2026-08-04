require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  Partials,
} = require('discord.js');
const cron = require('node-cron');
const CONFIG = require('./chores.js');

const STATE_FILE = path.join(__dirname, 'state.json');

const client = new Client({
  intents: [
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

// ─── Time helpers (all in CONFIG.timezone) ─────────────────────────────────

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const DAY_INDEX = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

function tzPartsOfEpoch(date, tz = CONFIG.timezone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
    weekdayIndex: WEEKDAY_INDEX[p.weekday],
  };
}

function tzOffsetMinutes(date, tz = CONFIG.timezone) {
  const p = tzPartsOfEpoch(date, tz);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return (asUTC - date.getTime()) / 60000;
}

// Convert a wall-clock time in `tz` to an absolute Date.
function zonedToEpoch(y, mo, d, h, mi, sec = 0, tz = CONFIG.timezone) {
  const asUTC = Date.UTC(y, mo - 1, d, h, mi, sec);
  return asUTC - tzOffsetMinutes(new Date(asUTC), tz) * 60000;
}

function nowInTz() {
  return tzPartsOfEpoch(new Date());
}

// Monday 00:00 (local) of the current week.
function currentWeekStart() {
  const p = nowInTz();
  const daysSinceMonday = (p.weekdayIndex + 6) % 7;
  return zonedToEpoch(p.year, p.month, p.day, 0, 0) - daysSinceMonday * 86400000;
}

function weekKey() {
  return new Date(currentWeekStart()).toISOString().slice(0, 10);
}

// This week's scheduled date for a chore (absolute Date).
function choreTimeThisWeek(chore) {
  const start = new Date(currentWeekStart());
  const sp = tzPartsOfEpoch(start);
  const dayIdx = DAY_INDEX[chore.day.toLowerCase()];
  const [hh, mi] = chore.time.split(':').map(Number);
  return new Date(zonedToEpoch(sp.year, sp.month, sp.day + (dayIdx - 1), hh, mi));
}

// 12-hour timestamp like "Tue 8/4/2026, 10:00 AM" (in the bot's configured timezone)
function formatTimestamp(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: CONFIG.timezone,
    weekday: 'short',
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

// Convert "22:00" (config) to "10:00 PM"
function formatTimeHHMM(hhmm) {
  const [hh, mi] = hhmm.split(':').map(Number);
  const suffix = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 || 12;
  return `${h12}:${String(mi).padStart(2, '0')} ${suffix}`;
}

function isQuietHours(date) {
  const p = tzPartsOfEpoch(date);
  const mins = p.hour * 60 + p.minute;
  const [sh, sm] = CONFIG.quietHours.start.split(':').map(Number);
  const [eh, em] = CONFIG.quietHours.end.split(':').map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  return start <= end ? mins >= start && mins < end : mins >= start || mins < end;
}

// ─── State persistence ──────────────────────────────────────────────────────

let state = { occurrences: {} };

function loadState() {
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    state = { occurrences: {} };
  }
}

function saveState() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ─── Reminders ──────────────────────────────────────────────────────────────

function buildChoreButtons(chore, prefix) {
  return [
    new ButtonBuilder()
      .setCustomId(`${prefix}_${chore.id}_done`)
      .setLabel('Done')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${prefix}_${chore.id}_snooze_1`)
      .setLabel('Not yet (remind in 1 hour)')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${prefix}_${chore.id}_snooze_3`)
      .setLabel('Not yet (remind me in 3 hours)')
      .setStyle(ButtonStyle.Danger),
  ];
}

function buildReminderRow(chore) {
  return new ActionRowBuilder().addComponents(buildChoreButtons(chore, 'chore'));
}

async function sendReminder(chore, key) {
  const user = await client.users.fetch(process.env.USER_ID);
  const row = buildReminderRow(chore);

  const msg = await user.send({ content: chore.message, components: [row] });

  const occ = state.occurrences[key] || { messageIds: [] };
  occ.lastRemindedAt = new Date().toISOString();
  occ.done = false;
  occ.snoozedUntil = null;
  occ.messageIds = occ.messageIds || [];
  occ.messageIds.push(msg.id);
  state.occurrences[key] = occ;
  saveState();
}

async function sendTestReminder(chore) {
  const user = await client.users.fetch(process.env.USER_ID);
  const row = new ActionRowBuilder().addComponents(buildChoreButtons(chore, 'test'));
  await user.send({ content: `🧪 Test reminder — ${chore.message}`, components: [row] });
}

function tick() {
  const now = new Date();
  const wk = weekKey();
  const retryMs = CONFIG.retryIntervalHours * 3600000;

  for (const chore of CONFIG.chores) {
    const key = `${chore.id}:${wk}`;
    const occ = state.occurrences[key];
    if (occ && occ.done) continue;
    if (now < choreTimeThisWeek(chore)) continue; // not due yet this week
    if (isQuietHours(now)) continue; // quiet hours
    if (occ && occ.snoozedUntil && new Date(occ.snoozedUntil) > now) continue; // snoozed
    const last = occ && occ.lastRemindedAt ? new Date(occ.lastRemindedAt) : null;
    if (last && now - last < retryMs) continue; // not time to re-remind yet
    sendReminder(chore, key).catch((err) => {
      console.error(`Failed to send reminder for ${chore.id}:`, err);
    });
  }
}

// ─── Interactions ───────────────────────────────────────────────────────────

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.user.id !== process.env.USER_ID) {
    await interaction.reply({ content: 'This isn\'t for you 😄', ephemeral: true });
    return;
  }

  if (interaction.customId === 'clear_confirm') {
    await interaction.deferUpdate();
    const dm = interaction.channel;
    let deleted = 0;
    let beforeId;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const fetched = await dm.messages.fetch({ limit: 100, before: beforeId });
      if (fetched.size === 0) break;
      for (const m of fetched.filter((msg) => msg.author.id === client.user.id).values()) {
        await m.delete().catch(() => {});
        deleted += 1;
      }
      beforeId = fetched.last().id;
      if (fetched.size < 100) break;
    }
    await interaction.followUp({ content: `🧹 Deleted ${deleted} message${deleted === 1 ? '' : 's'}.`, ephemeral: true });
    return;
  }

  if (interaction.customId === 'clear_cancel') {
    await interaction.update({ content: 'Cancelled — nothing was deleted.', components: [] });
    return;
  }

  const test = /^test_.+_(done|snooze(?:_\d+)?)$/.exec(interaction.customId);
  if (test) {
    await interaction.update({
      content: `✨ Action successfully clicked — this was just a test, nothing was actually changed!`,
      components: [],
    });
    return;
  }

  const m = /^chore_(.+)_(done|snooze)(?:_(\d+))?$/.exec(interaction.customId);
  if (!m) return;
  const [, id, action, hoursStr] = m;
  const chore = CONFIG.chores.find((c) => c.id === id);
  if (!chore) return;

  const key = `${chore.id}:${weekKey()}`;
  const occ = state.occurrences[key] || { messageIds: [] };

  if (action === 'done') {
    occ.done = true;
    occ.snoozedUntil = null;
    await interaction.update({
      content: `🎉 Great job for doing ${chore.name}!`,
      components: [],
    });
    for (const mid of occ.messageIds || []) {
      if (mid === interaction.message.id) continue;
      await interaction.channel.messages.delete(mid).catch(() => {});
    }
    occ.messageIds = [interaction.message.id];
  } else {
    const hours = parseInt(hoursStr || CONFIG.snoozeHours, 10);
    occ.snoozedUntil = new Date(Date.now() + hours * 3600000).toISOString();
    await interaction.reply({
      content: `Got it — I'll remind you about "${chore.name}" again in ${hours} hour${hours === 1 ? '' : 's'}.`,
      ephemeral: true,
    });
  }

  state.occurrences[key] = occ;
  saveState();
});

// ─── Manual triggers (DM the bot) ───────────────────────────────────────────

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.author.id !== process.env.USER_ID) return;
  const content = message.content.trim();

  if (content === '!check') {
    tick();
    await message.reply('Checked the chore schedule.');
  } else if (content === '!status') {
    const wk = weekKey();
    const lines = CONFIG.chores.map((chore) => {
      const key = `${chore.id}:${wk}`;
      const occ = state.occurrences[key];
      let status = occ && occ.done ? 'done ✅' : 'pending';
      if (!occ) status = 'not started';
      else if (occ.snoozedUntil && new Date(occ.snoozedUntil) > new Date()) status = `snoozed until ${formatTimestamp(new Date(occ.snoozedUntil))}`;
      const due = choreTimeThisWeek(chore);
      const dueStr = due < new Date() ? 'past due' : formatTimestamp(due);
      return `• ${chore.name} (${chore.day} ${formatTimeHHMM(chore.time)}) — ${dueStr} — ${status}`;
    });
    await message.reply(lines.join('\n'));
  } else if (content === '!test') {
    const chore = CONFIG.chores[Math.floor(Math.random() * CONFIG.chores.length)];
    await sendTestReminder(chore).catch((err) => {
      console.error('Failed to send test reminder:', err);
      return message.reply('Failed to send the test reminder.');
    });
    await message.reply(`Sent a test reminder for "${chore.name}".`);
  } else if (content === '!clear') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('clear_confirm')
        .setLabel('🗑️ Yes, delete all')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('clear_cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary),
    );
    await message.reply({
      content: 'Are you sure? This will delete every message I\'ve sent in this DM.',
      components: [row],
    });
  }
});

client.once('ready', () => {
  console.log(`Bot online as ${client.user.tag}`);

  cron.schedule('* * * * *', () => {
    tick();
  }, { timezone: CONFIG.timezone });

  console.log(`Chore ticker scheduled every minute (${CONFIG.timezone})`);
  console.log(`Quiet hours: ${CONFIG.quietHours.start}–${CONFIG.quietHours.end} · retry: ${CONFIG.retryIntervalHours}h · snooze: ${CONFIG.snoozeHours}h`);
  for (const chore of CONFIG.chores) {
    console.log(`  ${chore.day} ${chore.time} — ${chore.name}`);
  }

  tick();
});

loadState();
client.login(process.env.DISCORD_TOKEN);

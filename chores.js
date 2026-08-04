module.exports = {
  // IANA timezone used for all schedule times and quiet hours.
  timezone: 'America/Denver',

  // No reminder DMs between these local times (HH:MM, 24h). end is exclusive.
  quietHours: { start: '00:00', end: '08:00' },

  // If you don't click anything, how often to re-remind (hours).
  retryIntervalHours: 1,

  // How long the ❌ "Not yet" button pauses reminders (hours).
  snoozeHours: 3,

  // ─── Your chores ─────────────────────────────────────────────────────────
  // Each chore repeats weekly on `day` at `time` (HH:MM, 24h, in `timezone`).
  // - `id`      must be unique, letters/dashes only (used in button ids).
  // - `name`    short phrase used in the congrats message ("Great job for doing X").
  // - `message` what the bot DMs you.
  chores: [
    {
      id: 'trash-out',
      name: 'put out the trash and recycling',
      message: "🗑️ Don't forget: take out the trash and recycling!",
      day: 'monday',
      time: '22:00',
    },
    {
      id: 'trash-in',
      name: 'bring the trash and recycling back in',
      message: '♻️ Time to bring the trash and recycling back in.',
      day: 'tuesday',
      time: '10:00',
    },
    {
      id: 'milk',
      name: 'bring in the milk',
      message: '🥛 Make sure you brought the milk in!',
      day: 'tuesday',
      time: '15:00',
    },
  ],
};

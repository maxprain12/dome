const CHANNELS = ['latest', 'beta'];
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const THIRTY_MIN_MS = 30 * 60 * 1000;

function isUpdateChannel(value) {
  return CHANNELS.includes(value);
}

function initialCheckDelayMs(random = Math.random) {
  return 5000 + Math.floor(random() * 55000);
}

function intervalCheckDelayMs(random = Math.random) {
  const jitter = (random() * 2 - 1) * THIRTY_MIN_MS;
  return Math.max(60_000, Math.round(SIX_HOURS_MS + jitter));
}

function releaseNotesText(releaseNotes) {
  if (!releaseNotes) return '';
  if (typeof releaseNotes === 'string') return releaseNotes;
  if (Array.isArray(releaseNotes)) {
    return releaseNotes
      .map((note) => (typeof note === 'string' ? note : note?.note || ''))
      .filter(Boolean)
      .join('\n\n');
  }
  return '';
}

module.exports = {
  CHANNELS,
  isUpdateChannel,
  initialCheckDelayMs,
  intervalCheckDelayMs,
  releaseNotesText,
};

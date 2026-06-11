/**
 * Denylist for shell:exec — blocks obviously destructive commands before HITL.
 */

const DANGEROUS_PATTERNS = [
  /\brm\s+-rf\s+\/(?:\s|$)/i,
  /\brm\s+-rf\s+~(?:\s|$|\/)/i,
  /\bsudo\b/i,
  /\bmkfs\b/i,
  /\bdd\s+.*\bof=\/dev\//i,
  /\bchmod\s+[0-7]*777\b/i,
  /\bcurl\s+[^\n|]*\|\s*(?:ba)?sh\b/i,
  /\bwget\s+[^\n|]*\|\s*(?:ba)?sh\b/i,
  />\s*~\/\.ssh\//i,
  /\|\s*tee\s+~\/\.ssh\//i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bpoweroff\b/i,
  /\bkillall\b/i,
  /\bformat\s+[a-z]:/i,
];

/**
 * @param {string} command
 * @returns {{ blocked: boolean; reason?: string }}
 */
function assessShellCommand(command) {
  const trimmed = typeof command === 'string' ? command.trim() : '';
  if (!trimmed) {
    return { blocked: true, reason: 'Empty command' };
  }

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { blocked: true, reason: 'Command matches security denylist' };
    }
  }

  return { blocked: false };
}

module.exports = {
  assessShellCommand,
  DANGEROUS_PATTERNS,
};

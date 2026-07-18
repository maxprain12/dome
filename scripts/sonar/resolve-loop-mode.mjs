#!/usr/bin/env node
/**
 * Resolve SONAR_LOOP_MODE for Jenkins quality-loop.
 *
 * Prints one of: issues | coverage | hotspots
 *
 * Env:
 *   SONAR_LOOP_MODE=auto|issues|coverage|hotspots  (default auto)
 *   auto (UTC hour % 3): 0,2 → issues; 1 → coverage
 *   Hotspots are always reviewed in a dedicated soft stage (not a full-run mode
 *   unless SONAR_LOOP_MODE=hotspots).
 */

const raw = String(process.env.SONAR_LOOP_MODE || 'auto').trim().toLowerCase();

let mode;
if (raw === 'issues' || raw === 'coverage' || raw === 'hotspots') {
  mode = raw;
} else {
  const hour = new Date().getUTCHours();
  mode = hour % 3 === 1 ? 'coverage' : 'issues';
}

process.stdout.write(`${mode}\n`);

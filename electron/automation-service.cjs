/* eslint-disable no-console */

const runEngine = require('./run-engine.cjs');
const database = require('./database.cjs');

const TICK_INTERVAL_MS = 60 * 1000;

let _intervalId = null;

function startOfDay(ts) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function startOfWeek(ts) {
  const d = new Date(ts);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff).getTime();
}

function isDue(automation, timestamp) {
  if (!automation?.enabled || automation.triggerType !== 'schedule') {
    return false;
  }
  const schedule = automation.schedule || {};
  const date = new Date(timestamp);
  const hour = Number(schedule.hour ?? 0);
  const cadence = schedule.cadence || schedule.mode || 'daily';
  // `hour` is a daily/weekly "earliest hour" gate; cron-lite is minute-based and ignores it.
  if (cadence !== 'cron-lite' && date.getHours() < hour) {
    return false;
  }
  if (cadence === 'weekly') {
    const weekday = Number(schedule.weekday ?? 1);
    if (((date.getDay() + 6) % 7) + 1 !== weekday) {
      return false;
    }
    return !automation.lastRunAt || startOfWeek(automation.lastRunAt) < startOfWeek(timestamp);
  }
  if (cadence === 'cron-lite' && Number.isFinite(Number(schedule.intervalMinutes))) {
    const everyMinutes = Math.max(1, Number(schedule.intervalMinutes));
    return !automation.lastRunAt || (timestamp - automation.lastRunAt) >= everyMinutes * 60 * 1000;
  }
  return !automation.lastRunAt || startOfDay(automation.lastRunAt) < startOfDay(timestamp);
}

function isAutomationBusy(automation) {
  const automationId = typeof automation === 'string' ? automation : automation?.id;
  if (!automationId) return false;
  const runs = runEngine.listRuns({ automationId, limit: 5 });
  if (runs.some((run) => ['queued', 'running', 'waiting_approval'].includes(run.status))) {
    return true;
  }
  // Feeders write to feeder_runs (not automation_runs); check that table when target is a feeder.
  if (typeof automation === 'object' && automation?.targetType === 'feeder') {
    try {
      const row = database.getQueries().countRunningFeederRunsByAutomation.get(automationId);
      if (row && Number(row.c) > 0) return true;
    } catch (error) {
      console.error('[Automation] Feeder busy check failed:', error?.message || error);
    }
  }
  return false;
}

async function tick() {
  const timestamp = Date.now();
  const automations = runEngine.listAutomations();
  for (const automation of automations) {
    if (!isDue(automation, timestamp)) {
      continue;
    }
    if (isAutomationBusy(automation)) {
      continue;
    }
    try {
      await runEngine.startAutomationNow(automation.id);
    } catch (error) {
      console.error(`[Automation] Failed to run ${automation.id}:`, error?.message || error);
    }
  }
}

function init() {
  if (_intervalId) {
    clearInterval(_intervalId);
  }
  _intervalId = setInterval(() => {
    void tick();
  }, TICK_INTERVAL_MS);
  void tick();
}

function stop() {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}

module.exports = {
  init,
  stop,
};

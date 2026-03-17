/* eslint-disable no-console */

const runEngine = require('./run-engine.cjs');

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
  if (date.getHours() < hour) {
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

function isAutomationBusy(automationId) {
  const runs = runEngine.listRuns({ automationId, limit: 5 });
  return runs.some((run) => ['queued', 'running', 'waiting_approval'].includes(run.status));
}

async function tick() {
  const timestamp = Date.now();
  const automations = runEngine.listAutomations();
  for (const automation of automations) {
    if (!isDue(automation, timestamp)) {
      continue;
    }
    if (isAutomationBusy(automation.id)) {
      continue;
    }
    try {
      runEngine.startAutomationNow(automation.id);
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

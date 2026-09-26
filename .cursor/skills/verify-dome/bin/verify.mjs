#!/usr/bin/env node
/**
 * Isolated Dome desktop harness.
 * Deletes only a userData directory whose basename contains `-wt-verify-`.
 * Never kills a process whose command line lacks the CDP port from run.json.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const evidenceRoot = path.join(repoRoot, '.verify-evidence');
const runPath = path.join(evidenceRoot, 'run.json');
const logPath = path.join(evidenceRoot, 'scratch', 'launch.log');

function die(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function parseArgs(argv) {
  const cmd = argv[2];
  const opts = {};
  for (let i = 3; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) die(`Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      opts[key] = 'true';
    } else {
      opts[key] = next;
      i += 1;
    }
  }
  return { cmd, opts };
}

function parseName(raw) {
  if (!raw) return undefined;
  const match = /^\/(.+)\/([a-z]*)$/.exec(raw);
  if (match) return new RegExp(match[1], match[2]);
  return raw;
}

function readRun() {
  if (!existsSync(runPath)) die('No verification instance. Run launch first.');
  return JSON.parse(readFileSync(runPath, 'utf8'));
}

function commandOf(pid) {
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
  if (result.status !== 0) return '';
  return result.stdout.trim();
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function assertSafeUserData(userData) {
  const resolved = path.resolve(userData);
  const base = path.basename(resolved);
  if (!base.includes('-wt-verify-')) {
    die(`Refusing to delete userData that is not a verify profile: ${resolved}`);
  }
  const allowedRoots = [
    path.join(os.homedir(), 'Library', 'Application Support'),
    path.join(os.homedir(), '.config'),
  ];
  const ok = allowedRoots.some((root) => resolved.startsWith(root + path.sep));
  if (!ok) die(`Refusing to delete userData outside app support dirs: ${resolved}`);
  return resolved;
}

function userDataFromLog() {
  if (!existsSync(logPath)) return null;
  const text = readFileSync(logPath, 'utf8');
  const match = text.match(/DOME_PROFILE active — userData: (.+)/);
  return match ? match[1].trim() : null;
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') die('Could not allocate a CDP port');
  const { port } = address;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForCdp(port, timeoutMs) {
  const url = `http://127.0.0.1:${port}/json/version`;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      /* electron still booting */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}

function killRecorded(run) {
  const command = commandOf(run.pid);
  if (!command) return;
  if (!command.includes(`--remote-debugging-port=${run.cdpPort}`)) {
    die(`PID ${run.pid} is not the verification Electron (${command}). Refusing to kill it.`);
  }
  try {
    process.kill(-run.pid, 'SIGTERM');
  } catch {
    try {
      process.kill(run.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  }
}

async function launch() {
  if (!existsSync(path.join(repoRoot, 'dist', 'index.html'))) {
    die('dist/index.html is missing. From the repo root run: pnpm run build');
  }
  if (existsSync(runPath)) {
    const existing = JSON.parse(readFileSync(runPath, 'utf8'));
    if (pidAlive(existing.pid)) {
      die(`A verification instance is already running (pid ${existing.pid}). Run cleanup before launch.`);
    }
  }
  mkdirSync(path.dirname(logPath), { recursive: true });
  writeFileSync(logPath, '');
  const require = createRequire(path.join(repoRoot, 'package.json'));
  const electronPath = require('electron');
  const cdpPort = await freePort();
  const profile = `verify-${Date.now()}`;
  const env = { ...process.env, NODE_ENV: 'test', DOME_PROFILE: profile, DOME_DISABLE_ANALYTICS: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const logFd = openSync(logPath, 'a');
  const child = spawn(electronPath, [`--remote-debugging-port=${cdpPort}`, repoRoot], {
    cwd: repoRoot,
    env,
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });
  child.unref();
  const run = {
    pid: child.pid,
    cdpPort,
    profile,
    userData: null,
    startedAt: new Date().toISOString(),
  };
  writeFileSync(runPath, JSON.stringify(run, null, 2));
  const version = await waitForCdp(cdpPort, 90_000);
  run.userData = userDataFromLog();
  writeFileSync(runPath, JSON.stringify(run, null, 2));
  if (!version) {
    killRecorded(run);
    const tail = existsSync(logPath) ? readFileSync(logPath, 'utf8').slice(-2000) : '';
    const leaked = run.userData || userDataFromLog();
    if (leaked) {
      const safe = assertSafeUserData(leaked);
      rmSync(safe, { recursive: true, force: true });
    }
    rmSync(runPath, { force: true });
    die(`Electron did not open CDP on ${cdpPort}.\n${tail}`);
  }
  if (run.userData) assertSafeUserData(run.userData);
  console.log(`verify-dome ready pid=${run.pid} cdp=${cdpPort} profile=${profile}`);
  if (run.userData) console.log(`userData=${run.userData}`);
}

async function doctor() {
  const run = readRun();
  if (!pidAlive(run.pid)) die(`Electron pid ${run.pid} is not running.`);
  const command = commandOf(run.pid);
  if (!command.includes(`--remote-debugging-port=${run.cdpPort}`)) {
    die(`PID ${run.pid} is not the verification Electron.`);
  }
  const response = await fetch(`http://127.0.0.1:${run.cdpPort}/json/version`);
  if (!response.ok) die(`CDP port ${run.cdpPort} returned ${response.status}.`);
  const version = await response.json();
  const userData = run.userData || userDataFromLog();
  if (!userData || !path.basename(userData).includes('-wt-verify-')) {
    die('userData is not an isolated verify profile. Refusing to drive.');
  }
  console.log(`ok pid=${run.pid} cdp=${run.cdpPort} browser=${version.Browser || 'electron'} userData=${userData}`);
}

async function withPage(fn) {
  const run = readRun();
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${run.cdpPort}`);
  try {
    const deadline = Date.now() + 30_000;
    let page = null;
    while (Date.now() < deadline) {
      const pages = browser.contexts().flatMap((context) => context.pages());
      page = pages.find((candidate) => /app:\/\/dome|index\.html|localhost/.test(candidate.url())) ?? pages[0] ?? null;
      if (page) break;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    if (!page) die('CDP is up but no Dome window is listed.');
    await fn(page);
  } finally {
    // Dropping the CDP socket must not call browser.close(): that quits Electron.
    void browser;
  }
}

function locatorFor(page, opts) {
  if (opts.selector) return page.locator(opts.selector);
  if (!opts.role) die('Pass --selector or --role');
  return page.getByRole(opts.role, { name: parseName(opts.name) });
}

async function see(opts) {
  await withPage(async (page) => {
    const locator = locatorFor(page, opts);
    await locator.first().waitFor({ state: 'visible', timeout: 30_000 });
    if (opts.count) {
      const count = await locator.count();
      const expected = Number(opts.count);
      if (count !== expected) die(`count ${count} != ${expected}`);
    }
    const label = await locator.first().evaluate((element) => {
      const named = element.getAttribute('aria-label');
      if (named) return named;
      if (element.id === 'root') return '#root';
      const text = (element.innerText || '').replace(/\s+/g, ' ').trim();
      return (text || element.tagName).slice(0, 180);
    });
    const line = `visible role=${opts.role || ''} selector=${opts.selector || ''} label=${label}`;
    console.log(line);
    if (opts.out) {
      const out = path.resolve(repoRoot, opts.out);
      mkdirSync(path.dirname(out), { recursive: true });
      appendFileSync(out, `${line}\n`);
    }
  });
}

async function click(opts) {
  await withPage(async (page) => {
    const locator = locatorFor(page, opts).first();
    await locator.waitFor({ state: 'visible', timeout: 30_000 });
    await locator.click();
    console.log(`clicked role=${opts.role || ''} selector=${opts.selector || ''} name=${opts.name || ''}`);
  });
}

async function fill(opts) {
  if (!opts.value) die('fill requires --value');
  await withPage(async (page) => {
    const locator = locatorFor(page, opts).first();
    await locator.waitFor({ state: 'visible', timeout: 30_000 });
    await locator.fill(opts.value);
    console.log(`filled role=${opts.role || ''} name=${opts.name || ''}`);
  });
}

async function shot(opts) {
  if (!opts.out) die('shot requires --out');
  await withPage(async (page) => {
    const out = path.resolve(repoRoot, opts.out);
    mkdirSync(path.dirname(out), { recursive: true });
    if (opts.selector) await page.locator(opts.selector).screenshot({ path: out });
    else await page.screenshot({ path: out });
    console.log(`screenshot ${out}`);
  });
}

async function cleanup() {
  if (!existsSync(runPath)) {
    console.log('no run.json');
    return;
  }
  const run = JSON.parse(readFileSync(runPath, 'utf8'));
  if (pidAlive(run.pid)) killRecorded(run);
  const started = Date.now();
  while (pidAlive(run.pid) && Date.now() - started < 8000) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (pidAlive(run.pid)) {
    try {
      process.kill(run.pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }
  const userData = run.userData || userDataFromLog();
  if (userData) {
    const safe = assertSafeUserData(userData);
    rmSync(safe, { recursive: true, force: true });
    console.log(`removed userData ${safe}`);
  }
  rmSync(runPath, { force: true });
  rmSync(path.join(evidenceRoot, 'scratch'), { recursive: true, force: true });
  console.log('cleanup done');
}

const { cmd, opts } = parseArgs(process.argv);
mkdirSync(evidenceRoot, { recursive: true });

if (cmd === 'launch') await launch();
else if (cmd === 'doctor') await doctor();
else if (cmd === 'see') await see(opts);
else if (cmd === 'click') await click(opts);
else if (cmd === 'fill') await fill(opts);
else if (cmd === 'shot') await shot(opts);
else if (cmd === 'cleanup') await cleanup();
else die('Usage: verify.mjs launch|doctor|see|click|fill|shot|cleanup');

// Drop the CDP socket. browser.close() would quit Electron, and leaving the
// socket open keeps this process alive after the command has finished.
process.exit(0);

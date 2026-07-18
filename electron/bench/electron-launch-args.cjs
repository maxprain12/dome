'use strict';

function buildElectronLaunchArgs({ benchMain, flags = [], env = process.env, platform = process.platform }) {
  const disableSandbox = platform === 'linux' && env.DOME_BENCH_NO_SANDBOX === '1';
  const sandboxFlags = disableSandbox ? ['--no-sandbox', '--disable-setuid-sandbox'] : [];
  return [...sandboxFlags, benchMain, ...flags];
}

module.exports = { buildElectronLaunchArgs };

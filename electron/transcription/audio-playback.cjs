/* eslint-disable no-console */
/**
 * Reproduce MP3 (p. ej. TTS) vía reproductor del sistema: evita BrowserWindow + HTMLAudioElement.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ timeoutMs?: number }} opts
 * @returns {Promise<void>}
 */
function runPlayer(cmd, args, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stderr = '';
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
      reject(new Error(`Timeout (${timeoutMs}ms) waiting for ${cmd}`));
    }, timeoutMs);

    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });
    child.stdout?.on('data', () => {
      /* discard */
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      const msg = err && typeof err.message === 'string' ? err.message : String(err);
      reject(new Error(`No se pudo ejecutar "${cmd}": ${msg}`));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      const tail = stderr.trim() ? ` — ${stderr.trim().slice(0, 500)}` : '';
      reject(new Error(`"${cmd}" terminó con código ${code}${tail}`));
    });
  });
}

/**
 * @param {string} absPath
 * @returns {Promise<void>}
 */
async function playDarwin(absPath) {
  await runPlayer('afplay', [absPath]);
}

/**
 * @param {string} absPath
 * @returns {Promise<void>}
 */
async function playWin32(absPath) {
  const full = path.resolve(absPath);
  if (!fs.existsSync(full)) {
    throw new Error(`Archivo no encontrado: ${full}`);
  }

  const psPath = full.replace(/'/g, "''");
  const command = [
    '$ErrorActionPreference = "Stop"',
    `$path = [System.IO.Path]::GetFullPath('${psPath}')`,
    'if (-not (Test-Path -LiteralPath $path)) { throw "No existe el archivo" }',
    'Add-Type -AssemblyName PresentationCore',
    '$p = New-Object System.Windows.Media.MediaPlayer',
    '$u = New-Object System.Uri($path)',
    '$p.Open($u)',
    '$deadline = (Get-Date).AddMinutes(15)',
    '$p.Play()',
    'Start-Sleep -Milliseconds 400',
    'while ((Get-Date) -lt $deadline) {',
    '  if ($p.NaturalDuration.HasTimeSpan -and $p.NaturalDuration.TimeSpan.TotalSeconds -gt 0) {',
    '    if ($p.Position -ge $p.NaturalDuration.TimeSpan) { break }',
    '  }',
    '  Start-Sleep -Milliseconds 200',
    '}',
    '$p.Close()',
  ].join('; ');

  await runPlayer('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    command,
  ]);
}

/**
 * @param {string} absPath
 * @returns {Promise<void>}
 */
async function playLinux(absPath) {
  const candidates = [
    ['mpg123', ['-q', absPath]],
    ['mpv', ['--no-video', '--really-quiet', absPath]],
    ['ffplay', ['-nodisp', '-autoexit', '-loglevel', 'quiet', absPath]],
  ];

  let lastErr;
  for (const [cmd, args] of candidates) {
    try {
      await runPlayer(cmd, args);
      return;
    } catch (e) {
      lastErr = e;
    }
  }

  const hint =
    lastErr && lastErr instanceof Error
      ? lastErr.message
      : 'ningún reproductor disponible';
  throw new Error(
    `Linux: instala mpg123, mpv o ffplay para reproducir MP3. Último intento: ${hint}`
  );
}

/**
 * @param {string} absPath Absolute path to audio file
 * @returns {Promise<void>}
 */
async function playAudioFile(absPath) {
  if (!absPath || typeof absPath !== 'string') {
    throw new Error('Ruta de audio inválida');
  }
  const resolved = path.resolve(absPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Archivo de audio no encontrado: ${resolved}`);
  }

  const platform = process.platform;
  if (platform === 'darwin') {
    await playDarwin(resolved);
    return;
  }
  if (platform === 'win32') {
    await playWin32(resolved);
    return;
  }
  await playLinux(resolved);
}

module.exports = { playAudioFile };

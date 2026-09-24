import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractSection } from '../lib/changelog.mjs';
import {
  assetArch,
  assetKind,
  compareSemver,
  rewriteForFeed,
  upsertIndex,
  validateBuildManifests,
} from '../lib/manifests.mjs';

const CHANGELOG = `# Changelog

## [Unreleased]

### Added

- Pendiente

## [2.8.5](https://github.com/maxprain12/dome/releases/tag/v2.8.5) - 2026-07-02

### Changed

- Tool surface.

## [2.8.4](https://github.com/maxprain12/dome/releases/tag/v2.8.4) - 2026-07-01

### Added

- Mover carpeta.
`;

describe('extractSection', () => {
  it('devuelve el cuerpo de la versión sin el encabezado', () => {
    const body = extractSection(CHANGELOG, '2.8.5');
    assert.match(body, /Tool surface/);
    assert.equal(body.includes('## [2.8.4]'), false);
    assert.equal(body.includes('Mover carpeta'), false);
  });

  it('devuelve null si la versión no existe', () => {
    assert.equal(extractSection(CHANGELOG, '9.9.9'), null);
  });
});

describe('rewriteForFeed', () => {
  it('reescribe urls, omite staging al 100 y guarda las notas', () => {
    const next = rewriteForFeed(
      { version: '2.9.0', path: 'Dome Setup.exe', files: [{ url: 'Dome Setup.exe', sha512: 'abc' }] },
      { baseUrl: 'https://dl.dowi.es/', version: '2.9.0', stagingPercentage: 100, releaseNotes: '### Added' },
    );
    assert.equal(next.files[0].url, 'https://dl.dowi.es/releases/v2.9.0/Dome%20Setup.exe');
    assert.equal(next.path, 'https://dl.dowi.es/releases/v2.9.0/Dome%20Setup.exe');
    assert.equal(next.stagingPercentage, undefined);
    assert.equal(next.releaseNotes, '### Added');
  });

  it('conserva stagingPercentage por debajo de 100', () => {
    const next = rewriteForFeed(
      { files: [{ url: 'a.dmg' }] },
      { baseUrl: 'https://dl.dowi.es', version: '2.9.0', stagingPercentage: 10, releaseNotes: '' },
    );
    assert.equal(next.stagingPercentage, 10);
  });
});

describe('validateBuildManifests', () => {
  const base = { version: '2.9.0', commit: 'abc', signed: true, notarized: true, platform: 'mac' };

  it('rechaza commits distintos, plataformas ausentes y mac sin notarizar', () => {
    assert.throws(() => validateBuildManifests([
      { ...base },
      { ...base, platform: 'win' },
      { ...base, platform: 'linux', commit: 'otro' },
    ], '2.9.0'), /mismo commit/);
    assert.throws(() => validateBuildManifests([
      { ...base },
      { ...base, platform: 'win' },
    ], '2.9.0'), /Faltan builds/);
    assert.throws(() => validateBuildManifests([
      { ...base, notarized: false },
      { ...base, platform: 'win' },
      { ...base, platform: 'linux', signed: false },
    ], '2.9.0'), /notarizado/);
  });
});

describe('upsertIndex', () => {
  it('reemplaza la versión y ordena por semver descendente', () => {
    const first = upsertIndex({}, {
      version: '2.9.1-beta.1',
      channels: ['beta'],
      assets: [],
    });
    const second = upsertIndex(first, {
      version: '2.10.0',
      channels: ['latest'],
      assets: [],
    });
    const third = upsertIndex(second, {
      version: '2.9.1',
      channels: ['latest'],
      assets: [],
    });
    assert.deepEqual(third.releases.map((item) => item.version), ['2.10.0', '2.9.1', '2.9.1-beta.1']);
    assert.ok(compareSemver('2.10.0', '2.9.1') > 0);
  });
});

describe('asset names', () => {
  it('clasifica instaladores y arquitecturas', () => {
    assert.equal(assetKind('Dome-2.9.0-arm64.dmg'), 'dmg');
    assert.equal(assetKind('Dome-Setup-2.9.0.exe'), 'nsis');
    assert.equal(assetKind('Dome-2.9.0.exe'), 'portable');
    assert.equal(assetKind('Dome-2.9.0.AppImage'), 'appimage');
    assert.equal(assetKind('Dome-2.9.0.flatpak'), 'flatpak');
    assert.equal(assetArch('Dome-2.9.0-arm64.dmg'), 'arm64');
    assert.equal(assetArch('Dome-2.9.0-x64.exe'), 'x64');
    assert.equal(assetArch('Dome-2.9.0.dmg'), 'universal');
  });
});

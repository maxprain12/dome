import { existsSync } from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '../../..');
export const PLATFORM = { darwin: 'mac', win32: 'win', linux: 'linux' }[process.platform];
export const CHANNELS = ['beta', 'latest'];

const COMMON_KEYS = [
  'DOME_GOOGLE_DRIVE_CLIENT_ID',
  'DOME_GOOGLE_DRIVE_CLIENT_SECRET',
  'DOME_GOOGLE_CALENDAR_CLIENT_ID',
  'DOME_GOOGLE_CALENDAR_CLIENT_SECRET',
  'DOME_PROVIDER_URL',
  'DOME_GITHUB_CLIENT_ID',
  'VITE_POSTHOG_KEY',
  'VITE_POSTHOG_HOST',
  'VITE_SENTRY_DSN',
  'SENTRY_AUTH_TOKEN',
];

const SIGNING_KEYS = {
  mac: ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'],
  win: ['CSC_LINK', 'CSC_KEY_PASSWORD'],
  linux: [],
};

export const UPLOAD_KEYS = [
  'RELEASE_S3_ENDPOINT',
  'RELEASE_S3_REGION',
  'RELEASE_S3_ACCESS_KEY',
  'RELEASE_S3_SECRET_KEY',
  'RELEASE_S3_BUCKET_STAGING',
];

export const PUBLISH_KEYS = [
  'RELEASE_PUBLIC_S3_ENDPOINT',
  'RELEASE_PUBLIC_S3_REGION',
  'RELEASE_PUBLIC_S3_ACCESS_KEY',
  'RELEASE_PUBLIC_S3_SECRET_KEY',
  'RELEASE_S3_BUCKET_PUBLIC',
  'RELEASE_PUBLIC_BASE_URL',
];

export function loadReleaseEnv() {
  const file = path.join(ROOT, '.env.release.local');
  if (existsSync(file)) process.loadEnvFile(file);
  if (!process.env.SENTRY_DSN && process.env.VITE_SENTRY_DSN) {
    process.env.SENTRY_DSN = process.env.VITE_SENTRY_DSN;
  }
  if (!process.env.SENTRY_ORG) process.env.SENTRY_ORG = 'alder-dario-velasquez-obando';
  if (!process.env.SENTRY_PROJECT) process.env.SENTRY_PROJECT = 'electron';
}

export function requireKeys(keys) {
  const missing = keys.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`Faltan variables en .env.release.local: ${missing.join(', ')}`);
  }
}

export function buildKeysFor(platform, { unsigned, upload }) {
  const signing = unsigned ? [] : (SIGNING_KEYS[platform] ?? []);
  return [...COMMON_KEYS, ...signing, ...(upload ? UPLOAD_KEYS : [])];
}

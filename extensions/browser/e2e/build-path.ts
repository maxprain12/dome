import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const extensionBuildPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  process.env.DOME_EXTENSION_BUILD === 'dev'
    ? '../.output/chrome-mv3-dev'
    : '../.output/chrome-mv3',
);

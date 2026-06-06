'use strict';

const fs = require('fs');
const { app } = require('electron');
const { getDistIndexHtml } = require('../paths.cjs');

const indexPath = getDistIndexHtml();

/**
 * Usar el servidor Vite (localhost:5173) solo sin empaquetar y con señal de dev o sin dist.
 * Nunca empaquetado: evita tratar la app compilada como desarrollo por rutas inexistentes en asar.
 */
function useViteDevServer() {
  if (app.isPackaged) return false;
  return (
    process.env.NODE_ENV === 'development' || !fs.existsSync(indexPath)
  );
}

module.exports = {
  distIndexPath: indexPath,
  useViteDevServer,
};

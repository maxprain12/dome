import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../.output/chrome-mv3/', import.meta.url));
const manifest = JSON.parse(await readFile(`${directory}/manifest.json`, 'utf8'));
if (manifest.manifest_version !== 3 || manifest.side_panel?.default_path !== 'sidebar.html') {
  throw new Error('La compilación no contiene el panel MV3 de Chrome.');
}
if (manifest.content_security_policy?.extension_pages?.includes('http://localhost:')) {
  throw new Error('Esta carpeta depende de WXT. Ejecuta extension:prepare:dev de nuevo.');
}

console.info(`Dome · extensión ${manifest.version} lista para probar con Desktop local.`);
console.info(`Cargar descomprimida en chrome://extensions (o edge://extensions):\n${directory}`);
console.info('Esta compilación funciona sin WXT. Pulsa Recargar después de volver a compilar.');
try {
  const response = await fetch('http://127.0.0.1:37215/v1/health', {
    signal: AbortSignal.timeout(1500),
  });
  const payload = await response.json();
  if (!response.ok || payload.data?.ok !== true) throw new Error('bridge_unavailable');
  console.info(`Desktop accesible: puente local, protocolo ${payload.data.version}.`);
} catch {
  console.info('Desktop no responde: inicia pnpm run electron:dev antes de conectar.');
}
console.info('Genera un código en Dome → Ajustes → Extensión de navegador y conéctalo desde el panel.');
console.info('Si ya está instalada la versión de tienda, desactívala durante la prueba para distinguir los iconos.');

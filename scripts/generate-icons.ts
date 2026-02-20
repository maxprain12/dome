/**
 * Script para generar iconos de la aplicación para todas las plataformas
 * Usa sharp para redimensionar many.png a los tamaños necesarios
 * 
 * Uso: bun run scripts/generate-icons.ts
 */

import sharp from 'sharp';
import { mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';

const ASSETS_DIR = join(import.meta.dir, '..', 'assets');
const ICON_SOURCE = join(ASSETS_DIR, 'many.png');
const ICONSET_DIR = join(ASSETS_DIR, 'icon.iconset');

// Tamaños necesarios para macOS iconset
const MAC_SIZES = [16, 32, 64, 128, 256, 512, 1024];

// Tamaño para Windows (electron-builder puede usar PNG)
const WIN_SIZE = 256;

// Tamaño para Linux
const LINUX_SIZE = 512;

async function generateIcons() {
  console.log('🎨 Generando iconos desde many.png...\n');

  // Verificar que existe el icono fuente
  if (!existsSync(ICON_SOURCE)) {
    console.error('❌ No se encontró assets/many.png');
    process.exit(1);
  }

  // Limpiar y crear directorio iconset para macOS
  if (existsSync(ICONSET_DIR)) {
    rmSync(ICONSET_DIR, { recursive: true });
  }
  mkdirSync(ICONSET_DIR, { recursive: true });

  const iconBuffer = await Bun.file(ICON_SOURCE).arrayBuffer();

  // Generar iconos para macOS iconset
  console.log('🍎 Generando iconos para macOS...');
  for (const size of MAC_SIZES) {
    // Icono normal (@1x)
    await sharp(Buffer.from(iconBuffer))
      .resize(size, size)
      .png()
      .toFile(join(ICONSET_DIR, `icon_${size}x${size}.png`));

    // Icono retina (@2x) - excepto para 1024
    if (size <= 512) {
      await sharp(Buffer.from(iconBuffer))
        .resize(size * 2, size * 2)
        .png()
        .toFile(join(ICONSET_DIR, `icon_${size}x${size}@2x.png`));
    }
  }
  console.log(`   ✅ Creado: ${ICONSET_DIR}/`);

  // Generar PNG principal para Linux y como fallback
  console.log('\n🐧 Generando icono para Linux...');
  await sharp(Buffer.from(iconBuffer))
    .resize(LINUX_SIZE, LINUX_SIZE)
    .png()
    .toFile(join(ASSETS_DIR, 'icon.png'));
  console.log('   ✅ Creado: assets/icon.png');

  // Generar icono para Windows (256x256 PNG - electron-builder lo convierte a ICO)
  console.log('\n🪟 Generando icono para Windows...');
  await sharp(Buffer.from(iconBuffer))
    .resize(WIN_SIZE, WIN_SIZE)
    .png()
    .toFile(join(ASSETS_DIR, 'icon-256.png'));
  console.log('   ✅ Creado: assets/icon-256.png');

  // Crear .icns usando png2icons (funciona en macOS, Windows y Linux)
  console.log('\n🍎 Generando icono .icns para macOS...');
  try {
    const png2icons = require('png2icons');
    const icon512Path = join(ICONSET_DIR, 'icon_512x512.png');
    const icon512Buffer = await Bun.file(icon512Path).arrayBuffer();
    const icnsBuffer = png2icons.createICNS(Buffer.from(icon512Buffer), png2icons.BICUBIC, 0);
    if (icnsBuffer) {
      await Bun.write(join(ASSETS_DIR, 'icon.icns'), icnsBuffer);
      console.log('   ✅ Creado: assets/icon.icns');
    }
  } catch (e) {
    console.log('   ⚠️  png2icons falló:', (e as Error).message);
  }

  // Limpiar iconset
  if (existsSync(ICONSET_DIR)) {
    rmSync(ICONSET_DIR, { recursive: true });
    console.log('   🧹 Limpiado: icon.iconset/');
  }

  console.log('\n✨ ¡Iconos generados exitosamente!');
  console.log('\nNota: Para Windows .ico, electron-builder usará icon-256.png');
  console.log('      Puedes convertirlo manualmente a .ico si lo prefieres.\n');
}

generateIcons().catch(console.error);

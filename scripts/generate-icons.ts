/**
 * Script para generar iconos de la aplicación para todas las plataformas
 * Usa sharp para convertir el SVG a PNG en varios tamaños
 * 
 * Uso: bun run scripts/generate-icons.ts
 */

import sharp from 'sharp';
import { mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';

const ASSETS_DIR = join(import.meta.dir, '..', 'assets');
const SVG_PATH = join(ASSETS_DIR, 'martin.svg');
const ICONSET_DIR = join(ASSETS_DIR, 'icon.iconset');

// Tamaños necesarios para macOS iconset
const MAC_SIZES = [16, 32, 64, 128, 256, 512, 1024];

// Tamaño para Windows (electron-builder puede usar PNG)
const WIN_SIZE = 256;

// Tamaño para Linux
const LINUX_SIZE = 512;

async function generateIcons() {
  console.log('🎨 Generando iconos desde martin.svg...\n');

  // Verificar que existe el SVG
  if (!existsSync(SVG_PATH)) {
    console.error('❌ No se encontró assets/martin.svg');
    process.exit(1);
  }

  // Limpiar y crear directorio iconset para macOS
  if (existsSync(ICONSET_DIR)) {
    rmSync(ICONSET_DIR, { recursive: true });
  }
  mkdirSync(ICONSET_DIR, { recursive: true });

  const svgBuffer = await Bun.file(SVG_PATH).arrayBuffer();

  // Generar iconos para macOS iconset
  console.log('🍎 Generando iconos para macOS...');
  for (const size of MAC_SIZES) {
    // Icono normal (@1x)
    await sharp(Buffer.from(svgBuffer))
      .resize(size, size)
      .png()
      .toFile(join(ICONSET_DIR, `icon_${size}x${size}.png`));

    // Icono retina (@2x) - excepto para 1024
    if (size <= 512) {
      await sharp(Buffer.from(svgBuffer))
        .resize(size * 2, size * 2)
        .png()
        .toFile(join(ICONSET_DIR, `icon_${size}x${size}@2x.png`));
    }
  }
  console.log(`   ✅ Creado: ${ICONSET_DIR}/`);

  // Generar PNG principal para Linux y como fallback
  console.log('\n🐧 Generando icono para Linux...');
  await sharp(Buffer.from(svgBuffer))
    .resize(LINUX_SIZE, LINUX_SIZE)
    .png()
    .toFile(join(ASSETS_DIR, 'icon.png'));
  console.log('   ✅ Creado: assets/icon.png');

  // Generar icono para Windows (256x256 PNG - electron-builder lo convierte a ICO)
  console.log('\n🪟 Generando icono para Windows...');
  await sharp(Buffer.from(svgBuffer))
    .resize(WIN_SIZE, WIN_SIZE)
    .png()
    .toFile(join(ASSETS_DIR, 'icon-256.png'));
  console.log('   ✅ Creado: assets/icon-256.png');

  // Instrucciones para crear .icns en macOS
  console.log('\n📋 Para crear el archivo .icns (solo en macOS), ejecuta:');
  console.log('   iconutil -c icns assets/icon.iconset -o assets/icon.icns\n');

  // Intentar crear .icns automáticamente si estamos en macOS
  if (process.platform === 'darwin') {
    console.log('🔧 Detectado macOS, creando .icns automáticamente...');
    const proc = Bun.spawn(['iconutil', '-c', 'icns', ICONSET_DIR, '-o', join(ASSETS_DIR, 'icon.icns')]);
    await proc.exited;
    
    if (proc.exitCode === 0) {
      console.log('   ✅ Creado: assets/icon.icns');
      // Limpiar iconset
      rmSync(ICONSET_DIR, { recursive: true });
      console.log('   🧹 Limpiado: icon.iconset/');
    } else {
      console.log('   ⚠️  No se pudo crear .icns, mantén el iconset para uso manual');
    }
  }

  console.log('\n✨ ¡Iconos generados exitosamente!');
  console.log('\nNota: Para Windows .ico, electron-builder usará icon-256.png');
  console.log('      Puedes convertirlo manualmente a .ico si lo prefieres.\n');
}

generateIcons().catch(console.error);

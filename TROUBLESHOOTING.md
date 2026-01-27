# Troubleshooting - Dome Production Build

Este documento contiene soluciones a problemas comunes en la versión de producción de Dome.

## Problemas de Rendimiento

### Síntoma: App muy lenta y con lag

**Causas posibles:**
1. Módulos nativos no compilados correctamente
2. Protocol handler haciendo demasiadas llamadas a filesystem
3. Inicialización bloqueando el main process
4. Cache de Next.js corrupto

**Soluciones:**

1. **Recompilar módulos nativos:**
```bash
# Eliminar node_modules y reinstalar
rm -rf node_modules
bun install

# Recompilar módulos nativos para Electron
bun run rebuild:natives

# Verificar que están correctamente compilados
bun run verify:natives
```

2. **Limpiar cache de Next.js:**
```bash
# Limpiar todo y rebuild
bun run clean
rm -rf out .next
bun run build
```

3. **Verificar módulos nativos en la build:**
```bash
# Después de electron:build, verificar que app.asar.unpacked existe
ls -la dist/mac/Dome.app/Contents/Resources/

# Debe mostrar:
# - app.asar
# - app.asar.unpacked/node_modules/better-sqlite3
# - app.asar.unpacked/node_modules/sharp
# - app.asar.unpacked/node_modules/vectordb
```

## Funciones No Funcionan

### Síntoma: Abrir recursos, onboarding, ajustes no funcionan

**Causas posibles:**
1. Rutas de archivos incorrectas en producción
2. Base de datos SQLite no se encuentra
3. IPC channels bloqueados
4. Errores en el preload script

**Soluciones:**

1. **Verificar paths en producción:**
Abrir DevTools en producción (Cmd+Shift+I en Mac, Ctrl+Shift+I en Windows) y verificar en la consola:

```javascript
// En DevTools Console
console.log('User data:', await window.electron.invoke('get-user-data-path'));
```

2. **Verificar base de datos:**
```bash
# Ubicación de la base de datos en macOS:
~/Library/Application Support/Dome/dome.db

# Verificar que existe:
ls -la ~/Library/Application\ Support/Dome/
```

3. **Verificar logs:**
```bash
# Logs de la app (macOS):
~/Library/Logs/Dome/

# O ejecutar desde terminal para ver logs:
open -a Dome.app --args --enable-logging
```

## Build No Funciona

### Síntoma: electron-builder falla

**Soluciones:**

1. **Verificar certificados de firma (macOS):**
```bash
# Listar certificados disponibles
security find-identity -v -p codesigning
```

2. **Build sin firma (para testing):**
```bash
# Modificar temporalmente package.json:
# "mac": {
#   "identity": null
# }

# O usar variable de entorno:
CSC_IDENTITY_AUTO_DISCOVERY=false bun run electron:build
```

3. **Build verbose para debugging:**
```bash
bun run electron:build:verbose
```

## Problemas con Módulos Nativos

### Síntoma: Error "Module not found" o "Cannot find module"

**Causas:**
- Módulos nativos compilados para la versión incorrecta de Node/Electron
- Módulos nativos no desempaquetados del asar

**Soluciones:**

1. **Verificar versión de Electron:**
```bash
# En package.json, verificar que electron-rebuild use la misma versión
cat node_modules/electron/package.json | grep version
```

2. **Recompilar con flags específicos:**
```bash
# Para macOS ARM64 (M1/M2):
npm_config_arch=arm64 bun run rebuild:natives

# Para macOS x64 (Intel):
npm_config_arch=x64 bun run rebuild:natives
```

3. **Verificar asarUnpack en package.json:**
```json
{
  "build": {
    "asarUnpack": [
      "node_modules/better-sqlite3/**/*",
      "node_modules/sharp/**/*",
      "node_modules/@img/**/*",
      "node_modules/vectordb/**/*",
      "node_modules/@lancedb/**/*",
      "node_modules/apache-arrow/**/*"
    ]
  }
}
```

## Problemas con VectorDB (LanceDB)

### Síntoma: "vectordb is not available" en producción

**Causa:**
Los módulos nativos de LanceDB no están correctamente desempaquetados o compilados.

**Solución:**

1. **Verificar que vectordb está en asarUnpack** (ya debería estar)

2. **Deshabilitar vectordb temporalmente:**
Si vectordb sigue fallando, la app continuará funcionando sin búsqueda semántica. Los logs dirán:
```
⚠️ La búsqueda semántica estará deshabilitada
```

3. **Reinstalar vectordb:**
```bash
npm uninstall vectordb
npm install vectordb@0.4.0
bun run rebuild:natives
```

## Problemas con Autenticación de Claude Code

### Síntoma: No detecta Claude Code en ajustes de Anthropic

**Causa:**
La función de detección puede estar bloqueada por permisos o rutas incorrectas.

**Solución:**

1. **Verificar que la API key está correctamente configurada:**
Abrir DevTools y ejecutar:
```javascript
const apiKey = await window.electron.invoke('db:settings:get', 'ai_anthropic_api_key');
console.log('API Key configured:', apiKey ? 'Yes' : 'No');
```

2. **Verificar logs de inicialización:**
Los logs deben mostrar:
```
✅ Base de datos SQLite inicializada
✅ Configuración inicializada
✅ Sistema de archivos inicializado
```

## Checklist Pre-Build

Antes de hacer build de producción, verificar:

- [ ] `bun install` ejecutado
- [ ] `bun run rebuild:natives` ejecutado
- [ ] `bun run verify:natives` pasa
- [ ] `bun run build` crea el directorio `out/`
- [ ] `out/index.html` existe
- [ ] No hay errores en la consola durante development
- [ ] Database schema está actualizado

## Logs Útiles

### Ubicación de logs por plataforma:

**macOS:**
```bash
~/Library/Logs/Dome/main.log
~/Library/Logs/Dome/renderer.log
```

**Windows:**
```bash
%USERPROFILE%\AppData\Roaming\Dome\logs\main.log
%USERPROFILE%\AppData\Roaming\Dome\logs\renderer.log
```

**Linux:**
```bash
~/.config/Dome/logs/main.log
~/.config/Dome/logs/renderer.log
```

### Ver logs en tiempo real:

**macOS/Linux:**
```bash
tail -f ~/Library/Logs/Dome/main.log
```

**Ejecutar con debugging:**
```bash
# macOS
ELECTRON_ENABLE_LOGGING=1 /Applications/Dome.app/Contents/MacOS/Dome

# Linux
ELECTRON_ENABLE_LOGGING=1 ./dist/Dome

# Windows
set ELECTRON_ENABLE_LOGGING=1 && Dome.exe
```

## Últimos Recursos

Si nada funciona:

1. **Limpiar completamente:**
```bash
bun run clean
rm -rf node_modules
rm -rf out
rm -rf dist
rm -rf .next
bun install
```

2. **Reportar el issue:**
Incluir en el reporte:
- Versión de Electron
- Sistema operativo y versión
- Logs completos de la consola
- Pasos para reproducir
- Output de `bun run verify:natives`

## Optimizaciones Aplicadas

Las siguientes optimizaciones se han implementado para mejorar el rendimiento en producción:

1. **Cache de archivos en protocol handler** - Reduce llamadas a filesystem
2. **Logging condicional** - Solo en modo debug
3. **Módulos nativos verificados** - Script automático de verificación
4. **After-pack hook** - Verifica que todo está correctamente empaquetado
5. **Inicialización no bloqueante** - UI se muestra inmediatamente
6. **VectorDB opcional** - App funciona sin él si falla
7. **Timeouts en inicialización** - Previene bloqueos infinitos

## Soporte

Para más ayuda, consultar:
- [Electron Documentation](https://www.electronjs.org/docs/latest/)
- [electron-builder Documentation](https://www.electron.build/)
- [Issues del proyecto](link-to-your-issues)

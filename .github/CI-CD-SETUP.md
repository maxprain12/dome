# CI/CD Setup - GitHub Actions

Este documento explica la configuración de CI/CD para Dome usando GitHub Actions.

## Workflows Disponibles

### 1. `build.yml` - Build Completo
**Trigger**: Push a `main` o tags `v*`, o manual
**Propósito**: Build completo de la aplicación para todas las plataformas
**Duración**: ~30-45 minutos (incluye notarización)

**Jobs**:
1. **verify** - Verificación rápida antes de builds
   - Type checking
   - Build de Next.js
   - Verificación de módulos nativos
   - Tests de base de datos

2. **build-macos** - Build para macOS (ARM64 + x64)
   - DMG + ZIP
   - Code signing (si hay credenciales)
   - Notarización (si hay credenciales)

3. **build-windows** - Build para Windows
   - NSIS installer + Portable

4. **release** - Crear GitHub Release
   - Solo para tags `v*`
   - Sube todos los artefactos

### 2. `pr-checks.yml` - Verificación Rápida de PRs
**Trigger**: Pull requests a `main` o `develop`
**Propósito**: Verificación rápida sin build completo
**Duración**: ~5-10 minutos

**Checks**:
- ✅ Type checking
- ✅ Next.js build
- ✅ Native modules verification
- ✅ Database tests
- ✅ Architecture rules (no Node.js en renderer)

## Configuración de Secrets

Para que los workflows funcionen completamente, necesitas configurar los siguientes secrets en GitHub:

### Secrets Requeridos

#### Para macOS Code Signing y Notarization:

1. **CSC_LINK**
   - Certificado de code signing en formato base64
   - Cómo obtenerlo:
   ```bash
   # Exportar certificado desde Keychain Access como .p12
   # Luego convertir a base64:
   base64 -i certificate.p12 | pbcopy
   ```

2. **CSC_KEY_PASSWORD**
   - Contraseña del certificado .p12
   - La misma que usaste al exportar desde Keychain

3. **APPLE_ID**
   - Tu Apple ID (email)
   - Ejemplo: `developer@example.com`

4. **APPLE_APP_SPECIFIC_PASSWORD**
   - App-specific password para notarización
   - Cómo obtenerlo:
     1. Ve a https://appleid.apple.com
     2. Security → App-Specific Passwords
     3. Generate a new password
     4. Guárdalo (no se puede ver de nuevo)

5. **APPLE_TEAM_ID**
   - Tu Team ID de Apple Developer
   - Encuéntralo en: https://developer.apple.com/account
   - Formato: 10 caracteres alfanuméricos (ej: `ABCD123456`)

### Secrets Opcionales

6. **GITHUB_TOKEN** (automático)
   - GitHub lo proporciona automáticamente
   - No necesitas configurarlo manualmente

### Cómo Agregar Secrets

1. Ve a tu repositorio en GitHub
2. Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Agrega cada secret con su valor

## Sin Code Signing

Si **NO** tienes certificados de code signing, la app se compilará sin firmar:

- ⚠️ macOS mostrará advertencia de "desarrollador no verificado"
- ⚠️ Windows puede mostrar SmartScreen
- ✅ La app funcionará normalmente después de aceptar la advertencia

El workflow detecta automáticamente si faltan credenciales y desactiva el signing.

## Optimizaciones Implementadas

### 1. Cache de Dependencias
```yaml
- name: Cache Bun dependencies
  uses: actions/cache@v4
  with:
    path: |
      ~/.bun/install/cache
      node_modules
    key: ${{ runner.os }}-bun-${{ hashFiles('**/bun.lockb') }}
```

**Beneficio**: Reduce tiempo de `bun install` de 3-5 minutos a 30 segundos

### 2. Rebuild de Módulos Nativos
```yaml
- name: Rebuild native modules
  run: bun run rebuild:natives

- name: Verify native modules
  run: bun run verify:natives
```

**Beneficio**: Asegura que los módulos nativos están correctamente compilados para cada plataforma

### 3. Verificación Pre-Build
```yaml
- name: Verify build output
  run: |
    if [ ! -f "out/index.html" ]; then
      echo "❌ out/index.html not found!"
      exit 1
    fi
```

**Beneficio**: Detecta problemas antes del empaquetado, ahorra tiempo

### 4. After-Pack Hook Automático
Configurado en `package.json`:
```json
{
  "build": {
    "afterPack": "./scripts/after-pack.cjs"
  }
}
```

**Beneficio**: Verifica que los módulos nativos están desempaquetados del asar

## Flujo de Trabajo

### Para Pull Requests:
```
1. Developer crea PR
   ↓
2. pr-checks.yml se ejecuta automáticamente
   ↓
3. Verificaciones rápidas (~5-10 min)
   ↓
4. Si falla: Developer corrige y pushea
   ↓
5. Si pasa: PR ready to merge
```

### Para Main Branch:
```
1. PR se mergea a main
   ↓
2. build.yml se ejecuta automáticamente
   ↓
3. verify job (~5 min)
   ↓
4. build-macos + build-windows en paralelo (~30-45 min)
   ↓
5. Artefactos se suben a GitHub Actions
```

### Para Releases:
```
1. Developer crea tag: git tag v1.0.0 && git push --tags
   ↓
2. build.yml se ejecuta con release job
   ↓
3. verify + builds (~30-45 min)
   ↓
4. release job crea GitHub Release
   ↓
5. Artefactos se adjuntan al release
   ↓
6. Release notes se generan automáticamente
```

## Troubleshooting CI/CD

### Build Falla en "Verify native modules"

**Problema**: Los módulos nativos no están compilados correctamente

**Solución**:
1. Verifica que Python está instalado en el runner
2. Verifica que `electron-rebuild` está en devDependencies
3. Verifica que el script `rebuild:natives` existe en package.json

**Debug**:
```yaml
- name: Debug native modules
  run: |
    ls -la node_modules/better-sqlite3/build/Release/
    file node_modules/better-sqlite3/build/Release/*.node
```

### macOS Notarization Timeout

**Problema**: La notarización tarda más de 45 minutos

**Solución**:
1. Aumentar el timeout en el workflow:
```yaml
build-macos:
  timeout-minutes: 60  # Aumentar de 45 a 60
```

2. O deshabilitar notarización temporalmente:
```yaml
bun run electron:build -- --mac --config.mac.notarize=false
```

### Windows Build Falla

**Problema**: Error al compilar módulos nativos en Windows

**Solución**:
1. Verificar que Python 3.11 está instalado
2. Verificar que Visual Studio Build Tools están disponibles (GitHub Actions los incluye)
3. Revisar logs de `electron-rebuild`

### Cache No Funciona

**Problema**: El cache no se restaura entre builds

**Solución**:
1. Verificar que el hash del lockfile es correcto:
```yaml
key: ${{ runner.os }}-bun-${{ hashFiles('**/bun.lockb') }}
```

2. Limpiar cache manualmente:
   - Settings → Actions → Caches
   - Delete cache y volver a ejecutar workflow

## Verificación Local Antes de Push

Antes de hacer push, ejecuta localmente:

```bash
# 1. Limpiar todo
bun run clean
rm -rf node_modules out dist

# 2. Instalar
bun install

# 3. Verificar nativos
bun run verify:natives

# 4. Type check
bunx tsc --noEmit

# 5. Build Next.js
bun run build

# 6. Test database
bun run test:db

# 7. Build Electron (opcional, solo si quieres probar)
bun run electron:build
```

Si todos estos pasos pasan localmente, el CI/CD debería pasar sin problemas.

## Métricas

### Tiempos de Ejecución Típicos:

| Workflow | Job | Duración |
|----------|-----|----------|
| pr-checks | checks | 5-10 min |
| build | verify | 5-8 min |
| build | build-macos (sin notarización) | 10-15 min |
| build | build-macos (con notarización) | 30-45 min |
| build | build-windows | 10-15 min |
| build | release | 2-3 min |

### Costos:

GitHub Actions es gratis para repos públicos. Para repos privados:
- 2000 minutos/mes gratis
- macOS: 10x multiplier (10 min reales = 100 min consumidos)
- Linux: 1x multiplier
- Windows: 2x multiplier

**Estimación para este proyecto (repo privado)**:
- PR check: 10 min × 1x = 10 min
- Full build: 60 min total
  - verify (Linux): 5 min × 1x = 5 min
  - build-macos: 35 min × 10x = 350 min
  - build-windows: 15 min × 2x = 30 min
  - release (Linux): 3 min × 1x = 3 min
- **Total por full build**: ~388 minutos consumidos

**Recomendación**: Para repos privados, considera usar self-hosted runners para macOS para ahorrar minutos.

## Mejoras Futuras

### 1. Self-Hosted Runners (Opcional)
Para proyectos privados con muchos builds:
- macOS runner: Mac Mini M1/M2
- Beneficio: Builds más rápidos + sin costo de minutos

### 2. Build Matrix (Opcional)
Actualmente: ARM64 + x64 en un solo job
Futuro: Separar en jobs paralelos
- Beneficio: Builds más rápidos

### 3. E2E Tests (Futuro)
Agregar Playwright/Cypress para tests E2E:
```yaml
- name: E2E Tests
  run: bunx playwright test
```

### 4. Semantic Release (Futuro)
Automatizar versionado y changelog:
- Usa conventional commits
- Genera changelog automático
- Crea releases automáticamente

## Referencias

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [electron-builder CI Configuration](https://www.electron.build/configuration/configuration.html#ci)
- [Code Signing Guide](https://www.electron.build/code-signing)
- [Apple Notarization](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)

## Soporte

Para problemas con CI/CD:
1. Revisar logs del workflow en GitHub Actions
2. Ejecutar los comandos localmente para reproducir
3. Consultar este documento
4. Crear un issue en el repositorio

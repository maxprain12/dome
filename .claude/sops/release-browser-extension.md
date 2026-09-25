# SOP: publicar la extensión de navegador

La extensión (`extensions/browser/`, WXT, Manifest V3) se publica en tres tiendas: Chrome Web Store, Microsoft Edge Add-ons y Safari (App Store de Mac). Solo habla con Dome Desktop por `http://127.0.0.1:37215` con un token emparejado; no hay backend propio.

## Prerrequisitos

| Tienda | Necesitas |
|---|---|
| Chrome Web Store | Cuenta de desarrollador (pago único), verificación del editor, 2FA |
| Edge Add-ons | Cuenta de Microsoft Partner Center (programa Edge, gratis) |
| Safari | Xcode, Apple Developer Program del team `8AFY6A6T37`, app nueva en App Store Connect (macOS) |
| Todas | URL de política de privacidad: `https://dome.dowi.es/privacy` · página de producto: `https://dome.dowi.es/extension` |

## 1. Versión

1. Sube `version` en `extensions/browser/wxt.config.ts` (`manifest.version`) y, para que no diverjan, también en `extensions/browser/package.json`. Las tiendas rechazan una versión igual o menor que la publicada.
2. Añade la entrada en `CHANGELOG.md` de Dome (sección `## [Unreleased]`, línea "Extensión de navegador").
3. Valida:

```bash
pnpm --filter @dome/browser-extension run typecheck
pnpm run extension:test
pnpm run extension:build
pnpm run extension:smoke
```

## 2. Paquetes

```bash
pnpm --filter @dome/browser-extension run zip            # Chrome + Firefox
pnpm --filter @dome/browser-extension exec wxt zip -b edge
pnpm --filter @dome/browser-extension run build:safari   # carpeta .output/safari-mv3
```

Los zip quedan en `extensions/browser/.output/`. Comprueba en `manifest.json` de cada uno:

- `host_permissions` es solo `http://127.0.0.1:37215/*`.
- Los hosts de páginas (`http(s)://*/*`) están en permisos **opcionales**, no requeridos.
- No hay `content_scripts` permanentes.

## 3. Chrome Web Store

1. Dashboard → **Nuevo elemento** → sube el zip de Chrome (la primera vez) o **Paquete → Subir nueva versión**.
2. **Ficha de la tienda** (ES + EN, usa los textos de `public/_locales`):
   - Descripción corta: qué hace en una frase ("Guarda enlaces, notas y contactos en Dome, en tu Mac").
   - Capturas 1280×800 del panel real: Capturar, Notas, Contactos y Many respondiendo.
   - Icono 128×128 (`extensions/browser/public/icon/128.png`) y promo 440×280.
3. **Prácticas de privacidad**:
   - Propósito único: "enviar a la app de escritorio Dome el contenido que el usuario elige capturar".
   - Justificación por permiso:

| Permiso | Justificación |
|---|---|
| `activeTab`, `scripting` | Leer la página actual solo cuando el usuario pulsa el icono o el menú contextual |
| `storage` | Guardar el token de emparejamiento y el borrador del panel |
| `contextMenus` | Acciones "Guardar en Dome" sobre selección y enlaces |
| `tabs` | Título y URL de la pestaña que se captura |
| `sidePanel` | Mostrar el panel de Dome junto a la página |
| Host `127.0.0.1:37215` | Comunicarse con Dome Desktop en el mismo ordenador |
| Hosts opcionales | Captura en sitios concretos, pedidos en el momento y revocables |

   - Código remoto: **no**. Datos recogidos: contenido del sitio web **solo** a petición del usuario y enviado a su propio ordenador; no se vende ni se transfiere a terceros.
4. Distribución: pública, todos los países. Envía a revisión. Si piden aclaraciones sobre el loopback, explica que Dome Desktop es una app local y enlaza la página `/extension`.

## 4. Edge Add-ons

1. Partner Center → Extensiones de Edge → **Crear extensión** / **Actualizar**.
2. Sube el zip de Edge (mismo código, `side_panel` incluido).
3. Reutiliza textos, capturas y justificaciones de Chrome. Política de privacidad y soporte: las mismas URLs.
4. Publica. La revisión suele tardar varios días hábiles.

## 5. Safari (App Store de Mac)

Safari exige una app contenedora firmada.

1. Genera el proyecto Xcode desde el build:

```bash
xcrun safari-web-extension-packager extensions/browser/.output/safari-mv3 \
  --project-location extensions/browser/.output/safari-xcode \
  --app-name "Dome para Safari" \
  --bundle-identifier com.dome.safari \
  --macos-only --swift --copy-resources --no-open
```

2. Abre el `.xcodeproj` generado:
   - Team `8AFY6A6T37`, firma automática, en la app y en la extensión.
   - `MARKETING_VERSION` igual a la versión del manifest; `CURRENT_PROJECT_VERSION` +1 en cada subida.
   - Categoría: Productividad. Icono de la app a partir de `public/icon/128.png` (versión 1024×1024).
3. En App Store Connect, crea la app macOS con el bundle id `com.dome.safari`.
4. Xcode → **Product → Archive** → **Distribute App → App Store Connect → Upload**.
5. Ficha: capturas de Safari con el panel abierto, privacidad ("Datos no recopilados": todo va al ordenador del usuario) y notas para el revisor: "Requiere Dome Desktop (https://dome.dowi.es/download). Genera un código en Ajustes → Extensión de navegador y pégalo en el panel."
6. Envía a revisión. Guarda el proyecto generado fuera de git (`.output/` ya está ignorado) y regenéralo en cada versión.

## 6. Después de publicar

- Actualiza los enlaces de tienda en la landing (`src/data/extension.ts` de `landing-page-dome`).
- Anuncia la versión en el changelog público con la release de Desktop correspondiente.
- Si una versión rompe el emparejamiento, despublica en Chrome/Edge (Dashboard → Despublicar) y sube un parche; Safari: retira la versión en App Store Connect.

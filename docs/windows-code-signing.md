# Firma de código en Windows (Dome)

Los instaladores **sin firma** suelen ser bloqueados o interrumpidos por **Microsoft SmartScreen** y antivirus, lo que parece un “crash” del instalador. Para distribución seria hace falta un certificado de firma de código.

## Fix inmediato en la app

En `package.json`, en `build.win`, la opcion `verifyUpdateCodeSignature: false` permite que **electron-updater** aplique actualizaciones aunque algunos artefactos anteriores no estuvieran firmados (transicion gradual). Cuando todo el canal de releases este firmado de forma coherente, puedes volver a `true`.

## Certificado recomendado

1. Comprar un certificado **Code Signing** (Standard u **EV**). Los EV dan reputación en SmartScreen más rápido.
2. El proveedor entrega un archivo `.pfx` / `.p12` y contraseña.

## GitHub Actions

Añade estos **secrets** al repositorio:

| Secret              | Contenido |
|---------------------|-----------|
| `CSC_LINK`          | Base64 del `.pfx` o URL al archivo (según cómo configures el export) |
| `CSC_KEY_PASSWORD` | Contraseña del certificado |

`electron-builder` detecta `CSC_LINK` y `CSC_KEY_PASSWORD` y firma el `.exe` automáticamente.

Ejemplo de preparación del secret (local, luego pegar en GitHub):

```bash
base64 -i certificate.pfx | pbcopy
```

En el workflow, antes del paso `electron:pack` para Windows, exporta las variables (si aún no están en `env:` del job):

```yaml
env:
  CSC_LINK: ${{ secrets.CSC_LINK }}
  CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
```

## Prueba local

Con el `.pfx` en disco:

```bash
export CSC_LINK=/ruta/al/cert.pfx
export CSC_KEY_PASSWORD='...'
npm run electron:pack -- --win --publish never
```

## Referencias

- [electron-builder: Code Signing](https://www.electron.build/code-signing)
- [Microsoft: SmartScreen](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/windows-defender-application-control/design/application-reputation-based-smartscreen)

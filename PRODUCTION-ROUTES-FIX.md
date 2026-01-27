# Production Routes Fix - Resumen

## 🔍 Problemas Identificados

### 1. "Not Found" al Abrir Recursos en Producción
**Síntoma**: Al hacer clic en un recurso recién creado, se abre una ventana con el mensaje "Not Found"

**Causa Raíz**:
- Next.js con `output: 'export'` (static export) **NO soporta rutas dinámicas** como `/workspace/note/[id]`
- En desarrollo funciona porque Next.js server renderiza dinámicamente
- En producción, solo genera archivos estáticos
- Cuando se intenta acceder a `/workspace/note/abc123`, el protocol handler busca `out/workspace/note/abc123/index.html` que no existe

**Solución Implementada**:
- ✅ Cambiar de rutas dinámicas (`/workspace/note/[id]`) a query parameters (`/workspace/note?id=abc123`)
- ✅ Los query parameters funcionan en static export porque cargan el archivo base y el parámetro se lee en el cliente

### 2. DevTools No Se Abren con Cmd+Shift+I
**Síntoma**: El keyboard shortcut no funciona en ventanas de recursos

**Causa Raíz**:
- El listener de `before-input-event` solo estaba configurado en `main.cjs` para la ventana principal
- Las ventanas secundarias creadas por `window-manager.cjs` NO tenían este listener

**Solución Implementada**:
- ✅ Agregar el listener de keyboard shortcut en `window-manager.cjs`
- ✅ Ahora TODAS las ventanas (principal y secundarias) soportan Cmd+Shift+I / Ctrl+Shift+I

---

## 📝 Archivos Modificados

### 1. `electron/main.cjs`
**Cambio**: Usar query parameters en lugar de rutas dinámicas

```javascript
// ANTES (no funciona en producción):
if (resourceType === 'note') {
  route = `/workspace/note/${resourceId}`;
}

// DESPUÉS (funciona en producción):
if (resourceType === 'note') {
  route = `/workspace/note?id=${resourceId}`;
}
```

**Impacto**: Los recursos ahora cargan correctamente en producción

### 2. `electron/window-manager.cjs`
**Cambio**: Agregar keyboard shortcut para DevTools

```javascript
// Agregado después de ready-to-show:
window.webContents.on('before-input-event', (event, input) => {
  const isMac = process.platform === 'darwin';
  const modifierKey = isMac ? input.meta : input.control;
  if (modifierKey && input.shift && input.key.toLowerCase() === 'i') {
    window.webContents.toggleDevTools();
  }
});
```

**Impacto**: DevTools ahora se abre en todas las ventanas

### 3. `app/workspace/note/[[...params]]/wrapper.tsx`
**Cambio**: Leer ID de query params en lugar de route params

```typescript
// ANTES:
import { useParams } from 'next/navigation';
const params = useParams();
const resourceId = paramArray?.[0] || '';

// DESPUÉS:
import { useSearchParams } from 'next/navigation';
const searchParams = useSearchParams();
const resourceId = searchParams.get('id') || '';
```

**Impacto**: El componente ahora lee correctamente el ID del query parameter

### 4. `app/workspace/url/[resourceId]/page.tsx`
**Cambio**: Convertir a client component y usar query params

```typescript
// ANTES:
export default function URLWorkspacePage({ params }: { params: { resourceId: string } }) {
  return <URLWorkspaceClient resourceId={params.resourceId} />;
}

// DESPUÉS:
'use client';
import { useSearchParams } from 'next/navigation';

export default function URLWorkspacePage() {
  const searchParams = useSearchParams();
  const resourceId = searchParams.get('id') || '';
  // ...
}
```

**Impacto**: Los URLs ahora cargan correctamente en producción

### 5. `app/workspace/[[...params]]/wrapper.tsx`
**Cambio**: Similar a note workspace

```typescript
// Cambiado de useParams() a useSearchParams()
const resourceId = searchParams.get('id') || '';
```

**Impacto**: Workspace general funciona con query params

---

## 🎯 Diferencias: Desarrollo vs Producción

### Desarrollo (`bun run electron:dev`):
```
URL solicitada: /workspace/note/abc123
↓
Next.js dev server recibe la petición
↓
Next.js renderiza dinámicamente la página
↓
Retorna HTML con el componente correcto
✅ Funciona
```

### Producción - ANTES (❌ No funcionaba):
```
URL solicitada: /workspace/note/abc123
↓
Protocol handler busca: out/workspace/note/abc123/index.html
↓
Archivo NO existe (Next.js no lo generó)
↓
Return new Response('Not Found', { status: 404 })
❌ Error
```

### Producción - DESPUÉS (✅ Funciona):
```
URL solicitada: /workspace/note?id=abc123
↓
Protocol handler busca: out/workspace/note/index.html
↓
Archivo EXISTE (generado por Next.js)
↓
Carga el HTML base
↓
React en el cliente lee searchParams.get('id')
↓
Carga el recurso correcto
✅ Funciona
```

---

## 🚀 Cómo Probar

### 1. Hacer Rebuild
```bash
# Limpiar build anterior
rm -rf out/

# Build de Next.js con las nuevas rutas
bun run build

# Build de Electron
bun run electron:build
```

### 2. Probar en Producción
```bash
# Abrir la app de producción
open dist/mac/Dome.app  # macOS

# O en el build local sin empaquetar:
bun run electron
```

### 3. Verificar Funcionalidad
1. ✅ Crear un nuevo recurso (nota)
2. ✅ Hacer clic para abrir el recurso
3. ✅ Verificar que se abre en una nueva ventana SIN "Not Found"
4. ✅ Presionar **Cmd+Shift+I** (Mac) o **Ctrl+Shift+I** (Windows/Linux)
5. ✅ Verificar que DevTools se abre
6. ✅ En DevTools, verificar que no hay errores 404 en Network tab

---

## 📊 Beneficios

### Compatibilidad con Static Export
- ✅ Ya no dependemos de rutas dinámicas
- ✅ Compatible con `output: 'export'` de Next.js
- ✅ Todos los archivos se generan correctamente en `out/`

### Debugging Mejorado
- ✅ DevTools disponible en TODAS las ventanas
- ✅ Más fácil diagnosticar problemas en producción
- ✅ Mismo comportamiento en dev y prod

### Mantenibilidad
- ✅ Patrón consistente para todas las rutas de recursos
- ✅ Más fácil de entender y mantener
- ✅ Documentado para futuros desarrollos

---

## 🔧 Notas Técnicas

### ¿Por qué query params en lugar de hash?

**Query Params (`?id=123`)**:
- ✅ Más estándar y semántico
- ✅ Fácil de leer con `useSearchParams()`
- ✅ Compatible con SSG y SSR
- ✅ Mejor para SEO (aunque no aplica en Electron)

**Hash (`#123`)**:
- ⚠️ Menos semántico
- ⚠️ No se envía al servidor
- ⚠️ Puede confundirse con anclas

### Next.js Static Export Limitations

Según la [documentación de Next.js](https://nextjs.org/docs/app/building-your-application/deploying/static-exports):

> Dynamic Routes with generateStaticParams are supported, but you need to generate all possible pages at build time.

En nuestro caso, **NO podemos generar todas las páginas** porque:
1. Los recursos se crean dinámicamente por el usuario
2. Los IDs son UUIDs aleatorios
3. Sería imposible predecir todos los IDs posibles

Por lo tanto, **query parameters es la solución correcta**.

---

## 🐛 Troubleshooting

### Si sigue mostrando "Not Found":

1. **Verificar que hiciste rebuild**:
```bash
rm -rf out/
bun run build
```

2. **Verificar que los archivos existen**:
```bash
ls -la out/workspace/note/
# Debe mostrar: index.html
```

3. **Verificar la URL en DevTools**:
- Abrir DevTools (ahora funciona!)
- Ver la URL en la barra de direcciones
- Debe ser: `app://dome/workspace/note?id=abc123`
- NO: `app://dome/workspace/note/abc123`

4. **Verificar logs en consola**:
```bash
# En DevTools Console, verificar:
window.location.href
// Debe mostrar: "app://dome/workspace/note?id=abc123"

new URLSearchParams(window.location.search).get('id')
// Debe mostrar el ID del recurso
```

### Si DevTools no se abre:

1. **Verificar keyboard shortcut**:
- macOS: **Cmd + Shift + I** (no Option, no Control)
- Windows/Linux: **Ctrl + Shift + I**

2. **Verificar en main window primero**:
- Si funciona en main window pero no en resource window, el problema está en window-manager.cjs

3. **Fallback - abrir manualmente**:
```javascript
// En el código de electron/main.cjs, agregar temporalmente:
window.webContents.openDevTools({ mode: 'detach' });
```

---

## ✅ Checklist de Verificación

Antes de considerar el problema resuelto:

- [ ] Build de Next.js completo sin errores
- [ ] Archivos en `out/workspace/note/index.html` existen
- [ ] Build de Electron completo
- [ ] Crear recurso en la app
- [ ] Abrir recurso desde la lista
- [ ] Ventana se abre SIN "Not Found"
- [ ] Contenido del recurso se muestra correctamente
- [ ] Cmd+Shift+I abre DevTools en ventana de recurso
- [ ] No hay errores en DevTools Console
- [ ] No hay errores 404 en DevTools Network tab

---

## 📚 Referencias

- [Next.js Static Exports](https://nextjs.org/docs/app/building-your-application/deploying/static-exports)
- [Next.js useSearchParams](https://nextjs.org/docs/app/api-reference/functions/use-search-params)
- [Electron Custom Protocols](https://www.electronjs.org/docs/latest/api/protocol)
- [Electron DevTools](https://www.electronjs.org/docs/latest/tutorial/devtools-extension)

---

**Fecha de implementación**: 2026-01-27
**Versión**: 0.1.0
**Estado**: ✅ Implementado, pendiente de testing

# Plugins de Dome

Dome ejecuta plugins visuales en una pestaña aislada. El plugin aporta HTML, CSS y JavaScript estáticos; Dome conserva el control de los datos, los permisos y cualquier efecto externo.

## Modelo del sistema

Un plugin instalado pasa por cuatro estados:

1. **Instalado**: el paquete y su `manifest.json` han sido validados. Permanece desactivado.
2. **Configurado**: el usuario elige una bóveda y revisa todos los permisos declarados.
3. **Activo**: la vista puede solicitar operaciones mediante `DomePlugin.request`.
4. **Revocado**: Dome elimina la concesión y desactiva el plugin.

Las vistas se cargan en un `iframe` con `sandbox="allow-scripts"` y una política de contenido que impide red, navegación y acceso al proceso de Electron. El renderer no entrega acceso directo a la base de datos. Cada petición cruza un único canal y vuelve a validarse en el proceso principal.

## Instalar y configurar

### Desde Marketplace

1. Abre **Marketplace → Plugins**.
2. Instala el plugin.
3. Abre **Settings → Plugins** y pulsa **Configurar**.
4. Selecciona una bóveda y revisa los permisos.
5. Si el plugin publica contenido, indica `owner/repository`, rama y carpeta de destino.

### Desde una carpeta local

En **Settings → Plugins**, usa **Instalar desde carpeta** y selecciona el directorio que contiene `manifest.json`. Dome copia el paquete; modificar la carpeta original no cambia el plugin instalado.

### Desde GitHub

Los plugins de catálogo pueden apuntar a `owner/repository`. Dome descarga el release más reciente y busca un asset llamado `dome-plugin.zip`. El ZIP debe contener el paquete en la raíz o dentro de una única carpeta.

## Permisos

| Permiso | Capacidad |
| --- | --- |
| `notes.read` | Leer solo las notas creadas para ese plugin en la bóveda elegida. |
| `notes.write` | Crear y actualizar esas notas. Requiere `notes.read`. |
| `content.publish` | Preparar y, tras confirmación nativa, publicar contenido en GitHub. |
| `resources.read` | Reservado para una futura API acotada de recursos. |
| `projects.read` | Reservado para una futura API acotada de proyectos. |
| `calendar.read` | Reservado para una futura API de calendario. |

Declarar un permiso no lo concede. Dome guarda la concesión junto al resumen criptográfico del manifiesto. Si una actualización cambia el manifiesto, el plugin debe configurarse de nuevo.

## Datos y portabilidad

Las notas siguen siendo recursos normales de Dome. Los campos aportados por un plugin se guardan bajo `metadata.plugins.<plugin-id>` y se reflejan en el Markdown como `domePlugins`. Esta separación evita colisiones entre plugins y permite importar de nuevo una bóveda sin perder el contenido estructurado.

```yaml
---
id: 8ac7…
title: Getting started with Astro
domePlugins:
  dome-cms:
    templateId: astro-post
    schemaVersion: 1
    fields:
      date: 2026-09-22
      description: A quick guide
      tags: [astro, tutorial]
      slug: getting-started-with-astro
---
```

## Dome CMS

Dome CMS es el primer plugin incluido con la aplicación. Crea entradas con campos de Astro, abre la nota en el editor nativo y publica un Markdown mediante un único commit Git. La confirmación de publicación pertenece a Dome y muestra repositorio, rama y ruta antes de escribir.

Consulta [Configurar Astro para Dome CMS](./dome-cms-astro.md) para la guía de usuario y [API de plugins](./plugins-api.md) para el contrato técnico.

## Límites deliberados de v1

- Un plugin se vincula a una única bóveda.
- La instalación remota usa releases de GitHub; no ejecuta scripts de instalación.
- No existe código Node dentro del plugin.
- La publicación Git no fuerza la rama. Si cambia entre la preparación y el commit, Dome informa de conflicto y obliga a preparar de nuevo.
- Los permisos reservados no exponen métodos hasta que exista un caso de uso y un contrato específico.

Estos límites mantienen pequeño el núcleo de confianza y evitan una API genérica de lectura o escritura que sería difícil de auditar.

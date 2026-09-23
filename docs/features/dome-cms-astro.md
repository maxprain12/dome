# Usar Dome CMS con Astro

Dome CMS convierte una nota estructurada en un archivo Markdown y lo publica directamente en el repositorio de tu sitio Astro. No necesitas una base de datos ni un servicio CMS en producción: Astro lee los archivos del repositorio durante el build.

## 1. Prepara la colección de Astro

Instala una versión reciente de Astro con Content Collections. En `src/content.config.ts`, define una colección que lea la carpeta donde publicará Dome:

```ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string(),
    cover: z.string().optional(),
    tags: z.array(z.string()).default([]),
    slug: z.string(),
  }),
});

export const collections = { posts };
```

Una página de detalle puede obtener y renderizar las entradas así:

```astro
---
import { getCollection, render } from 'astro:content';

export async function getStaticPaths() {
  const posts = await getCollection('posts');
  return posts.map((post) => ({ params: { slug: post.data.slug }, props: { post } }));
}

const { post } = Astro.props;
const { Content } = await render(post);
---

<article>
  <h1>{post.data.title}</h1>
  <p>{post.data.description}</p>
  <Content />
</article>
```

## 2. Instala Dome CMS

1. En Dome, abre **Marketplace → Plugins**.
2. Instala **Dome CMS**.
3. Abre **Settings → Plugins** y configura el plugin.
4. Elige la bóveda que guardará tus borradores.
5. Indica el repositorio como `owner/repository`, normalmente la rama `main`, y configura las carpetas por colección e idioma.
6. Añade la URL pública del sitio y, si hace falta, el patrón del enlace (`/{collection}/{slug}` o `/{language}/{collection}/{slug}`).

Para el plugin **Dome CMS**, cada regla usa `colección/idioma` como clave. La configuración inicial propone:

| Colección | Idioma | Carpeta |
| --- | --- | --- |
| `blog` | `es` | `src/content/blog/es` |
| `blog` | `en` | `src/content/blog/en` |
| `manual` | `es` | `src/content/manual/es` |
| `manual` | `en` | `src/content/manual/en` |

Al publicar, Dome elige la carpeta según esos dos campos y siempre escribe `<slug>.md`. Por ejemplo, `blog` + `es` + `primer-articulo` produce `src/content/blog/es/primer-articulo.md`.

Dome usa la conexión de GitHub que ya tengas activa. La cuenta necesita permiso de escritura en ese repositorio.

## 3. Crea y publica

Desde la pestaña **Dome CMS**:

1. Crea una entrada con título, colección, idioma, descripción, fecha y slug.
2. La ficha se queda en el CMS. El cuerpo es Markdown de la entrada; Dome lo guarda como nota en la bóveda.
3. Inserta las imágenes desde la ficha. Quedan en la bóveda como `dome-media:` y, al publicar, viajan a `public/media/<slug>/`. La portada se elige viendo las fotos de `public/` ya bajadas al vault.
4. **Actualizar traducciones** reescribe la entrada abierta y sus hermanas en un solo lote. La primera vez, **Adaptar idiomas** crea esos borradores con la misma operación. No publica sola.
5. La ruta de destino (`colección/idioma` + slug) aparece en la ficha. Si hay URL del sitio y la entrada está publicada, **Ver publicación** abre ese enlace.
6. **Sincronizar posts** trae los Markdown que ya están en esas carpetas del repositorio y las imágenes de `public/` que aún no están en Dome. Las entradas locales no se sustituyen. En la biblioteca visual puedes borrar una imagen del vault y del repositorio.
7. Pulsa **Publicar** y confirma el commit. Si marcas varias entradas en la lista, **Publicar N** las manda juntas en ese mismo commit: las dos traducciones, por ejemplo. El archivo no incluye campos vacíos ni saltos HTML del editor de notas.

Si abres la nota desde la bóveda, ves el archivo guardado y un enlace para volver al CMS. La colección, el idioma y la publicación se editan en el CMS, no en la nota.

El archivo resultante tiene el formato esperado por Astro:

```md
---
title: Getting started with Astro
date: 2026-09-22
description: A quick guide to using Astro with Dome CMS
cover: /posts/astro-cover.jpg
tags:
  - astro
  - tutorial
slug: getting-started-with-astro
---

# Getting started with Astro
```

Si tu plataforma despliega al recibir cambios en `main`, el commit de Dome inicia el build igual que cualquier cambio de contenido.

## Adaptar un proyecto existente

- Cambia las reglas de **Content folders by collection and language** si tus colecciones o idiomas viven en otras rutas. Las carpetas deben estar dentro de `src/content/`.
- Ajusta el esquema de Astro para que acepte exactamente los campos anteriores. `cover` es opcional y `date` debe admitir el texto ISO que escribe Dome.
- Mantén el `slug` como fuente de la URL y como nombre exacto del archivo; Dome no añade prefijos ni genera otro nombre.
- Guarda las imágenes desde la ficha del CMS; el commit de publicación las deja en `public/media/<slug>/` y reescribe el Markdown a `/media/<slug>/foto.png`.
- Si tu colección ya exige campos adicionales, hazlos opcionales, añade valores por defecto en Astro o crea un plugin derivado con otra `vaultTemplate`.

Si una combinación colección/idioma no tiene una regla, Dome detiene la publicación antes de crear el commit y muestra la combinación que falta. Añade la regla y prepara la publicación de nuevo.

## Conflictos y recuperación

Dome prepara la publicación contra una revisión concreta de la rama. Si otra persona actualiza la rama antes de confirmar, Dome no fuerza el cambio: marca la propuesta como conflicto. Actualiza la vista y publica de nuevo para preparar otro commit sobre la cabecera reciente. La nota local nunca se elimina cuando falla la publicación.

Para detalles de Astro, consulta la documentación oficial de [Content Collections](https://docs.astro.build/en/guides/content-collections/) y del [glob loader](https://docs.astro.build/en/reference/content-loader-reference/#glob-loader).

## Editor compartido y conservación del contenido

Las notas, los planes y el CMS comparten el editor Tiptap con almacenamiento Markdown. La barra de formato reúne bloques, listas de tareas, tablas, enlaces, imágenes y deshacer/rehacer. El botón Markdown permite editar el texto fuente. Documentos con HTML, MDX, fórmulas, notas al pie o bloques heredados se abren en modo fuente para conservar esa sintaxis; no se convierten de forma destructiva al abrirlos. La importación y la publicación respetan los saltos de línea y el HTML del cuerpo.

El CMS muestra las propiedades de publicación en un panel plegable. La búsqueda filtra por título y campos. Antes de cambiar de entrada guarda el borrador actual; si falla o hay cambios durante el guardado, mantiene la entrada abierta. Guardar usa la revisión aceptada por el servidor y no sustituye texto escrito mientras la petición está pendiente. Las imágenes se insertan desde el editor y los fallos de almacenamiento se muestran sin generar referencias temporales. Eliminar del sitio remoto requiere seleccionar expresamente esa opción.

Las notas mantienen su guardado automático y el modo de lectura. Sus herramientas secundarias están en el menú de acciones; la referencia se abre en una vista dividida dentro del workspace.

## Control desde Many

Al instalar y configurar Dome CMS, Many recibe herramientas para listar entradas y sus estados, leer una entrada, crear borradores, editar contenido y propiedades, sincronizar, preparar una publicación, consultar su estado y publicarla. La entrada se crea dentro de la colección y el idioma configurados; Many debe aportar esos campos al crearla. Las ediciones usan la revisión de la entrada para evitar sobrescribir cambios posteriores. Many solo accede a la bóveda autorizada en la configuración del plugin.

Publicar requiere primero preparar la entrada y después aprobar expresamente la acción de publicación en Dome. Las herramientas desaparecen si se desactiva o revoca el plugin. En modo Plan, Many puede consultar entradas y estados, pero no ejecutar acciones que cambien contenido.

Si Dome CMS ya estaba instalado con una versión anterior, pulsa **Actualizar plugin** en el Marketplace y vuelve a configurarlo en **Settings → Plugins**. La actualización cambia el manifiesto y Dome pide revisar sus permisos antes de volver a habilitarlo.

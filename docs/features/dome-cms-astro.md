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
2. Dome abre la nota nativa. Completa el cuerpo y, si quieres, portada y etiquetas.
3. Guarda los campos estructurados.
4. Vuelve al CMS y pulsa **Publish**.
5. Revisa repositorio, rama y ruta en la confirmación nativa.

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
- Guarda imágenes en `public/` y escribe una ruta pública como `/posts/cover.jpg`; Dome CMS v1 no sube binarios.
- Si tu colección ya exige campos adicionales, hazlos opcionales, añade valores por defecto en Astro o crea un plugin derivado con otra `vaultTemplate`.

Si una combinación colección/idioma no tiene una regla, Dome detiene la publicación antes de crear el commit y muestra la combinación que falta. Añade la regla y prepara la publicación de nuevo.

## Conflictos y recuperación

Dome prepara la publicación contra una revisión concreta de la rama. Si otra persona actualiza la rama antes de confirmar, Dome no fuerza el cambio: marca la propuesta como conflicto. Actualiza la vista y publica de nuevo para preparar otro commit sobre la cabecera reciente. La nota local nunca se elimina cuando falla la publicación.

Para detalles de Astro, consulta la documentación oficial de [Content Collections](https://docs.astro.build/en/guides/content-collections/) y del [glob loader](https://docs.astro.build/en/reference/content-loader-reference/#glob-loader).

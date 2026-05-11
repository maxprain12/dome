/**
 * DOCX (Word) tools — create, read, update, delete .docx resources in the library.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult, readStringParam, readBooleanParam, readNumberParam } from './common';
import { isElectronAI } from '@/lib/utils/formatting';

const DocxGetSchema = Type.Object({
  resource_id: Type.String({ description: 'ID del recurso Word (.docx) en la biblioteca.' }),
  format: Type.Optional(
    Type.Union([Type.Literal('text'), Type.Literal('html')], {
      description: "Salida: 'text' (plain) o 'html' (mammoth). Por defecto: text.",
    }),
  ),
  max_chars: Type.Optional(
    Type.Number({ description: 'Máximo de caracteres para format=text (por defecto 100000).' }),
  ),
});

const DocxGetFilePathSchema = Type.Object({
  resource_id: Type.String({ description: 'ID del recurso .docx.' }),
});

const DocxBlockSchema = Type.Object({
  type: Type.Union([Type.Literal('paragraph'), Type.Literal('heading')], {
    description: "'paragraph' | 'heading'",
  }),
  text: Type.String({ description: 'Contenido del bloque. En paragraph, \\n crea párrafos sucesivos.' }),
  level: Type.Optional(
    Type.Number({ description: 'Para heading: 1–6 (por defecto 1).', minimum: 1, maximum: 6 }),
  ),
});

const DocxCreateSchema = Type.Object({
  title: Type.String({ description: 'Título del nuevo documento (sin .docx obligatorio).' }),
  project_id: Type.Optional(Type.String({ description: 'ID de proyecto; por defecto el proyecto actual.' })),
  folder_id: Type.Optional(Type.String({ description: 'Carpeta destino (opcional).' })),
  body: Type.Optional(
    Type.String({
      description:
        'Texto plano: párrafos separados por línea en blanco (\\n\\n). Ignorado si hay markdown, html o blocks.',
    }),
  ),
  blocks: Type.Optional(
    Type.Array(DocxBlockSchema, {
      description:
        'Contenido estructurado (párrafos y títulos). Preferible para informes con secciones claras.',
    }),
  ),
  markdown: Type.Optional(
    Type.String({
      description: 'Markdown completo; se convierte a DOCX vía HTML (html-to-docx).',
    }),
  ),
  html: Type.Optional(
    Type.String({
      description: 'HTML completo; se convierte a DOCX con html-to-docx.',
    }),
  ),
});

const DocxUpdateSchema = Type.Object({
  resource_id: Type.String({ description: 'ID del .docx a sustituir o renombrar.' }),
  title: Type.Optional(Type.String({ description: 'Nuevo título visible en la biblioteca.' })),
  body: Type.Optional(Type.String({ description: 'Reemplaza el documento por texto plano (párrafos con \\n\\n).' })),
  blocks: Type.Optional(Type.Array(DocxBlockSchema)),
  markdown: Type.Optional(Type.String({ description: 'Reemplaza el documento desde Markdown.' })),
  html: Type.Optional(Type.String({ description: 'Reemplaza el documento desde HTML.' })),
});

const DocxDeleteSchema = Type.Object({
  resource_id: Type.String({ description: 'ID del recurso .docx a eliminar.' }),
  confirm: Type.Boolean({
    description: 'Debe ser true tras confirmar con el usuario (igual que resource_delete).',
  }),
});

export function createDocxGetTool(): AnyAgentTool {
  return {
    label: 'Leer Word (DOCX)',
    name: 'docx_get',
    description:
      'Lee el contenido de un Word .docx de la biblioteca (texto o HTML). Úsalo antes de editar o para resumir un informe.',
    parameters: DocxGetSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({ status: 'error', error: 'Las herramientas DOCX requieren Electron.' });
        }
        const resourceId = readStringParam(args as Record<string, unknown>, 'resource_id', { required: true });
        const format = readStringParam(args as Record<string, unknown>, 'format') as 'text' | 'html' | undefined;
        const maxChars = readNumberParam(args as Record<string, unknown>, 'max_chars');
        const result = await window.electron!.ai.tools.docxGet(resourceId, {
          format: format || 'text',
          max_chars: maxChars,
        });
        return jsonResult(result);
      } catch (err) {
        return jsonResult({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}

export function createDocxGetFilePathTool(): AnyAgentTool {
  return {
    label: 'Ruta del DOCX',
    name: 'docx_get_file_path',
    description:
      'Obtiene la ruta absoluta del .docx en disco para scripts externos o comprobaciones.',
    parameters: DocxGetFilePathSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({ status: 'error', error: 'Las herramientas DOCX requieren Electron.' });
        }
        const resourceId = readStringParam(args as Record<string, unknown>, 'resource_id', { required: true });
        const result = await window.electron!.ai.tools.docxGetFilePath(resourceId);
        return jsonResult(result);
      } catch (err) {
        return jsonResult({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}

export function createDocxCreateTool(): AnyAgentTool {
  return {
    label: 'Crear Word (DOCX)',
    name: 'docx_create',
    description:
      'Crea un recurso Word .docx en la biblioteca. Puedes pasar markdown/html o body/blocks (docx-js, US Letter, Arial). Para un .txt usa resource_create tipo nota o import_file_to_library.',
    parameters: DocxCreateSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({ status: 'error', error: 'Las herramientas DOCX requieren Electron.' });
        }
        const params = args as Record<string, unknown>;
        const title = readStringParam(params, 'title', { required: true });
        let projectId = readStringParam(params, 'project_id');
        if (!projectId) {
          const cur = await window.electron!.ai.tools.getCurrentProject();
          projectId = cur?.project?.id || 'default';
        }
        const result = await window.electron!.ai.tools.docxCreate(projectId, title, {
          folder_id: readStringParam(params, 'folder_id'),
          body: readStringParam(params, 'body'),
          markdown: readStringParam(params, 'markdown'),
          html: readStringParam(params, 'html'),
          blocks: params.blocks as Array<{ type: string; text: string; level?: number }> | undefined,
        });
        return jsonResult(result);
      } catch (err) {
        return jsonResult({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}

export function createDocxUpdateTool(): AnyAgentTool {
  return {
    label: 'Actualizar Word (DOCX)',
    name: 'docx_update',
    description:
      'Sustituye el archivo .docx o renombra el recurso. Contenido: markdown, html, body o blocks (misma semántica que docx_create).',
    parameters: DocxUpdateSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({ status: 'error', error: 'Las herramientas DOCX requieren Electron.' });
        }
        const params = args as Record<string, unknown>;
        const resourceId = readStringParam(params, 'resource_id', { required: true });
        const result = await window.electron!.ai.tools.docxUpdate(resourceId, {
          title: readStringParam(params, 'title'),
          body: readStringParam(params, 'body'),
          markdown: readStringParam(params, 'markdown'),
          html: readStringParam(params, 'html'),
          blocks: params.blocks as Array<{ type: string; text: string; level?: number }> | undefined,
        });
        return jsonResult(result);
      } catch (err) {
        return jsonResult({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}

export function createDocxDeleteTool(): AnyAgentTool {
  return {
    label: 'Eliminar Word (DOCX)',
    name: 'docx_delete',
    description:
      'Elimina un .docx de la biblioteca. Requiere confirm=true tras acuerdo explícito del usuario.',
    parameters: DocxDeleteSchema,
    execute: async (_toolCallId, args) => {
      try {
        if (!isElectronAI()) {
          return jsonResult({ status: 'error', error: 'Las herramientas DOCX requieren Electron.' });
        }
        const params = args as Record<string, unknown>;
        const resourceId = readStringParam(params, 'resource_id', { required: true });
        const confirm = readBooleanParam(params, 'confirm');
        const result = await window.electron!.ai.tools.docxDelete(resourceId, { confirm });
        return jsonResult(result);
      } catch (err) {
        return jsonResult({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}

export function createDocxTools(): AnyAgentTool[] {
  return [
    createDocxGetTool(),
    createDocxGetFilePathTool(),
    createDocxCreateTool(),
    createDocxUpdateTool(),
    createDocxDeleteTool(),
  ];
}

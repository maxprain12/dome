#!/usr/bin/env node
/**
 * Generates a multi-page demo PDF for product videos (AI in academic research).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, 'assets');
const outPath = path.join(outDir, 'informe-ia-investigacion.pdf');

fs.mkdirSync(outDir, { recursive: true });

const pages = [
  {
    title: 'Inteligencia Artificial en la Investigacion Academica',
    body: [
      'Informe de referencia — Demo Dome',
      '',
      'La IA generativa esta transformando como investigadores',
      'acceden, sintetizan y comunican conocimiento cientifico.',
      '',
      'Este documento resume tendencias, riesgos y oportunidades',
      'para equipos de investigacion en 2025-2026.',
    ],
  },
  {
    title: '1. Hallazgos clave',
    body: [
      '- 68% de equipos usan asistentes para revision bibliografica',
      '- La extraccion automatica de tablas reduce 40% el tiempo',
      '- Los resumenes interactivos mejoran la retencion en un 25%',
      '- La trazabilidad de fuentes sigue siendo el mayor desafio',
    ],
  },
  {
    title: '2. Casos de uso prioritarios',
    body: [
      'Revision sistematica de literatura',
      'Sintesis de papers en mapas conceptuales',
      'Extraccion de datos de PDFs escaneados',
      'Generacion de flashcards para estudio',
      'Preparacion de presentaciones desde fuentes',
    ],
  },
  {
    title: '3. Recomendaciones',
    body: [
      'Centralizar PDFs, notas y URLs en un workspace unico.',
      'Indexar contenido para busqueda semantica hibrida.',
      'Usar asistentes con contexto del recurso activo.',
      'Convertir lectura en artefactos accionables.',
      'Mantener enlaces trazables a paginas del PDF original.',
    ],
  },
];

function escapePdfText(s) {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildPageStream(page) {
  const lines = [page.title, '', ...page.body];
  let y = 740;
  const parts = ['BT', '/F1 16 Tf', `72 ${y} Td`, `(${escapePdfText(lines[0])}) Tj`];
  y -= 28;
  parts.push('/F2 11 Tf');
  for (let i = 1; i < lines.length; i++) {
    parts.push(`0 -16 Td (${escapePdfText(lines[i] || ' ')}) Tj`);
  }
  parts.push('ET');
  const stream = parts.join('\n');
  return stream;
}

const objects = [];
let objNum = 1;
const offsets = [];

function addObject(content) {
  const id = objNum++;
  objects.push({ id, content });
  return id;
}

const catalogId = addObject('<< /Type /Catalog /Pages 2 0 R >>');
const pagesId = 2;
const pageKids = [];
const contentIds = [];

for (let i = 0; i < pages.length; i++) {
  const stream = buildPageStream(pages[i]);
  const contentId = addObject(`<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`);
  contentIds.push(contentId);
  const pageId = addObject(
    `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>`,
  );
  pageKids.push(pageId);
}

// Insert pages object at position 2
objects.splice(1, 0, {
  id: pagesId,
  content: `<< /Type /Pages /Kids [${pageKids.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`,
});

addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

let pdf = '%PDF-1.4\n';
const xrefPositions = [0];

for (const obj of objects) {
  xrefPositions.push(Buffer.byteLength(pdf, 'utf8'));
  pdf += `${obj.id} 0 obj\n${obj.content}\nendobj\n`;
}

const xrefStart = Buffer.byteLength(pdf, 'utf8');
pdf += `xref\n0 ${objects.length + 1}\n`;
pdf += '0000000000 65535 f \n';
for (let i = 1; i < xrefPositions.length; i++) {
  pdf += `${String(xrefPositions[i]).padStart(10, '0')} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\n`;
pdf += `startxref\n${xrefStart}\n%%EOF\n`;

fs.writeFileSync(outPath, pdf, 'utf8');
console.log(`[demo-pdf] Wrote ${outPath} (${pages.length} pages)`);

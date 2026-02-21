import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Combinar clases de Tailwind
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Generar ID único
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Formatear fecha relativa
export function formatDistanceToNow(timestamp: number): string {
  if (!timestamp || !isFinite(timestamp)) return '—';
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return `hace ${years} ${years === 1 ? 'año' : 'años'}`;
  if (months > 0) return `hace ${months} ${months === 1 ? 'mes' : 'meses'}`;
  if (weeks > 0) return `hace ${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`;
  if (days > 0) return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
  if (hours > 0) return `hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  if (minutes > 0) return `hace ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
  return 'hace un momento';
}

// Compact time distance format (e.g., "now", "3m", "2h", "5d")
export function formatShortDistance(timestamp: number): string {
  if (!timestamp || !isFinite(timestamp)) return '—';
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 30)}mo`;
}

// Formatear fecha completa
export function formatDate(timestamp: number): string {
  if (!timestamp || !isFinite(timestamp)) return '—';
  return new Date(timestamp).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// Formatear fecha con hora
export function formatDateFull(timestamp: number): string {
  if (!timestamp || !isFinite(timestamp)) return '—';
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Smart relative date: today → time, yesterday, this week → weekday, older → short date
export function formatRelativeDate(timestamp: number): string {
  if (!timestamp || !isFinite(timestamp)) return '—';
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (days === 1) {
    return 'Yesterday';
  } else if (days < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Formatear tamaño de archivo
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// Truncar texto
export function truncate(text: string, length: number = 100): string {
  if (text.length <= length) return text;
  return text.substring(0, length) + '...';
}

// ProseMirror/Tiptap node structure
interface PMNode {
  type?: string;
  text?: string;
  content?: PMNode[];
  attrs?: Record<string, unknown>;
}

/** Decodifica entidades HTML en texto plano */
function decodeHtmlEntities(text: string): string {
  if (typeof document === 'undefined') {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'");
  }
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

/** Extrae texto plano desde HTML (elimina tags y decodifica entidades) */
function stripHtml(html: string): string {
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  return decodeHtmlEntities(text);
}

/** Extrae texto plano desde el JSON de Tiptap/ProseMirror para previsualizaciones */
export function extractPlainTextFromTiptap(content: string | undefined): string {
  if (!content?.trim()) return '';
  const first = content.trim();
  if (first[0] !== '{' && first[0] !== '[') {
    // Texto plano o HTML: si parece HTML (<...>), extraer solo texto
    let result = /<[^>]+>/.test(content) ? stripHtml(content) : content;
    // Decodificar entidades HTML (&amp;, &gt;, &nbsp;, &#39;, etc.)
    if (/&[a-z#\d]+;/i.test(result)) {
      result = decodeHtmlEntities(result);
    }
    return result;
  }
  try {
    const doc = JSON.parse(content) as PMNode;
    const parts: string[] = [];
    function walk(node: PMNode) {
      if (node.text) {
        parts.push(node.text);
      }
      if (node.content) {
        for (const child of node.content) {
          walk(child);
        }
      }
    }
    walk(doc);
    let text = parts.join(' ').replace(/\s+/g, ' ').trim();
    if (text && /&[a-z#\d]+;/i.test(text)) {
      text = decodeHtmlEntities(text);
    }
    return text || '';
  } catch {
    return '';
  }
}

// Validar URL
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// Extraer dominio de URL
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return '';
  }
}

// Resaltar texto de búsqueda
export function highlightSearchText(text: string, query: string): string {
  if (!query) return text;

  const regex = new RegExp(`(${query})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}

// Debounce function
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

// Copiar al portapapeles
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// Descargar archivo
export function downloadFile(data: Blob | string, filename: string, mimeType?: string) {
  const blob = typeof data === 'string' ? new Blob([data], { type: mimeType }) : data;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** User-friendly label for resource type (e.g. ppt -> Slides) */
export function getResourceTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    note: 'Note',
    pdf: 'PDF',
    video: 'Video',
    audio: 'Audio',
    image: 'Image',
    url: 'URL',
    document: 'Document',
    folder: 'Folder',
    notebook: 'Notebook',
    excel: 'Excel',
    ppt: 'Slides',
  };
  return labels[type] ?? type;
}

// Generar color aleatorio
export function generateRandomColor(): string {
  const colors = [
    '#ef4444', // red
    '#f97316', // orange
    '#f59e0b', // amber
    '#eab308', // yellow
    '#84cc16', // lime
    '#22c55e', // green
    '#10b981', // emerald
    '#14b8a6', // teal
    '#06b6d4', // cyan
    '#0ea5e9', // sky
    '#3b82f6', // blue
    '#6366f1', // indigo
    '#8b5cf6', // violet
    '#a855f7', // purple
    '#d946ef', // fuchsia
    '#ec4899', // pink
  ];

  return colors[Math.floor(Math.random() * colors.length)] ?? '#3b82f6';
}

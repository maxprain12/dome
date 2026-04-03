import type { Resource, ResourceMetadata, StructuredTranscriptPayload, TranscriptionSegment } from '@/types';

export function parseResourceMetadata(resource: Resource | null | undefined): ResourceMetadata {
  if (!resource?.metadata) return {};
  if (typeof resource.metadata === 'string') {
    try {
      return JSON.parse(resource.metadata || '{}') as ResourceMetadata;
    } catch {
      return {};
    }
  }
  return { ...resource.metadata } as ResourceMetadata;
}

/** Normaliza estados legacy de transcripción / procesamiento */
export function isTranscriptionCompleted(meta: ResourceMetadata): boolean {
  const s = meta.processing_status;
  return s === 'completed' || s === 'done';
}

/** Transcripción en curso en metadatos del recurso */
export function isTranscriptionProcessing(meta: ResourceMetadata): boolean {
  const s = meta.processing_status;
  return s === 'processing' || s === 'pending';
}

/** Transcripción fallida en metadatos */
export function isTranscriptionFailed(meta: ResourceMetadata): boolean {
  return meta.processing_status === 'failed';
}

/** Texto plano del guión para copiar o exportar */
export function getTranscriptPlainTextForCopy(meta: ResourceMetadata): string {
  const segments = getTranscriptionSegmentsForDisplay(meta);
  if (segments.length) {
    return segments
      .map((s) => String(s.text || '').trim())
      .filter(Boolean)
      .join('\n\n');
  }
  return meta.transcription?.trim() || '';
}

/** Obtiene transcripción estructurada o null */
export function getStructuredTranscript(
  meta: ResourceMetadata | null | undefined,
): StructuredTranscriptPayload | null {
  if (!meta?.transcription_structured || meta.transcription_structured.version !== 1) return null;
  return meta.transcription_structured;
}

/** Un segmento sintético cuando solo hay texto plano legacy */
export function legacyPlainTextToSingleSegment(text: string, speakerId = 'unknown'): TranscriptionSegment {
  const t = String(text || '').trim();
  return {
    id: 'legacy-0',
    startTime: 0,
    endTime: 0,
    text: t,
    speakerId,
    speakerLabel: undefined,
  };
}

/** Segmentos para UI: estructurados o fallback desde transcription */
export function getTranscriptionSegmentsForDisplay(meta: ResourceMetadata): TranscriptionSegment[] {
  const structured = getStructuredTranscript(meta);
  if (structured?.segments?.length) {
    return structured.segments.map((s) => ({ ...s }));
  }
  const plain = meta.transcription?.trim();
  if (plain) {
    return [legacyPlainTextToSingleSegment(plain)];
  }
  return [];
}

/** Resuelve etiqueta de hablante para un segmento */
export function resolveSpeakerLabel(
  segment: TranscriptionSegment,
  speakers: StructuredTranscriptPayload['speakers'] | undefined,
): string {
  if (segment.speakerLabel?.trim()) return segment.speakerLabel.trim();
  const fromMap = speakers?.[segment.speakerId]?.label;
  if (fromMap?.trim()) return fromMap.trim();
  return segment.speakerId;
}

/** Combina payloads heterogéneos de `resource:updated` (updates completos vs solo metadata). */
export function mergeResourceOnBroadcast(prev: Resource, payload: unknown): Resource {
  if (!payload || typeof payload !== 'object') return prev;
  const p = payload as {
    id?: string;
    updates?: Partial<Resource>;
    metadata?: Record<string, unknown>;
    folder_id?: string;
  };
  if (p.id !== prev.id) return prev;

  if (p.updates && typeof p.updates === 'object') {
    return { ...prev, ...(p.updates as Resource) };
  }

  if (p.metadata && typeof p.metadata === 'object') {
    const base = parseResourceMetadata(prev);
    const mergedMeta = { ...base, ...p.metadata } as Resource['metadata'];
    return { ...prev, metadata: mergedMeta };
  }

  if (p.folder_id !== undefined) {
    return { ...prev, folder_id: p.folder_id };
  }

  return prev;
}

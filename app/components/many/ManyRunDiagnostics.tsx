'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PersistentRun, RunUiPhase } from '@/lib/automations/api';

interface ManyRunDiagnosticsProps {
  run: PersistentRun | null;
  sessionId: string | null;
}

function readMetaString(metadata: Record<string, unknown> | undefined, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

export default function ManyRunDiagnostics({ run, sessionId }: ManyRunDiagnosticsProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (!run) return null;

  const metadata = (run.metadata ?? {}) as Record<string, unknown>;
  const uiPhase = readMetaString(metadata, 'uiPhase') as RunUiPhase | null;
  const uiLabelKey = readMetaString(metadata, 'uiLabelKey');
  const uiPhaseDetail = readMetaString(metadata, 'uiPhaseDetail');

  return (
    <div
      className="mx-3 mb-2 rounded-lg border text-[11px]"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-left font-medium"
        style={{ color: 'var(--secondary-text)' }}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span>{t('many.run_diagnostics_title')}</span>
        <span style={{ color: 'var(--tertiary-text)' }}>{open ? '−' : '+'}</span>
      </button>
      {open ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-3 pb-3 font-mono" style={{ color: 'var(--primary-text)' }}>
          <dt style={{ color: 'var(--tertiary-text)' }}>runId</dt>
          <dd className="break-all">{run.id}</dd>
          <dt style={{ color: 'var(--tertiary-text)' }}>sessionId</dt>
          <dd className="break-all">{run.sessionId ?? sessionId ?? '—'}</dd>
          <dt style={{ color: 'var(--tertiary-text)' }}>threadId</dt>
          <dd className="break-all">{run.threadId ?? '—'}</dd>
          <dt style={{ color: 'var(--tertiary-text)' }}>status</dt>
          <dd>{run.status}</dd>
          <dt style={{ color: 'var(--tertiary-text)' }}>uiPhase</dt>
          <dd>{uiPhase ?? '—'}</dd>
          <dt style={{ color: 'var(--tertiary-text)' }}>uiLabelKey</dt>
          <dd className="break-all">{uiLabelKey ?? '—'}</dd>
          {uiPhaseDetail ? (
            <>
              <dt style={{ color: 'var(--tertiary-text)' }}>uiPhaseDetail</dt>
              <dd className="break-all">{uiPhaseDetail}</dd>
            </>
          ) : null}
          <dt style={{ color: 'var(--tertiary-text)' }}>owner</dt>
          <dd>
            {run.ownerType}/{run.ownerId}
          </dd>
        </dl>
      ) : null}
    </div>
  );
}

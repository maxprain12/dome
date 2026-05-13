import { useEffect, useRef, useState } from 'react';
import { Terminal, AlertTriangle, X } from 'lucide-react';
import type { ApprovalRequest } from '@/lib/store/useApprovalStore';

interface Props {
  request: ApprovalRequest;
  onRespond: (approvalId: string, approved: boolean) => void;
}

export default function ApprovalModal({ request, onRespond }: Props) {
  const { approvalId, kind, payload, timeoutMs } = request;
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(timeoutMs / 1000));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // ESC to cancel
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onRespond(approvalId, false);
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [approvalId, onRespond]);

  const isShellExec = kind === 'shell_exec';
  const command = isShellExec ? String((payload as Record<string, unknown>).command ?? '') : '';
  const cwd = isShellExec ? String((payload as Record<string, unknown>).cwd ?? '') : '';
  const summary = !isShellExec ? String((payload as Record<string, unknown>).summary ?? kind) : '';
  const details = !isShellExec ? String((payload as Record<string, unknown>).details ?? '') : '';

  return (
    <div className="modal-overlay" style={{ zIndex: 'var(--z-modal)' as never }}>
      <div
        className="modal-content"
        style={{ maxWidth: 480, width: '100%' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="approval-title"
      >
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isShellExec ? (
              <Terminal size={16} style={{ color: 'var(--accent)' }} />
            ) : (
              <AlertTriangle size={16} style={{ color: 'var(--accent)' }} />
            )}
            <span
              id="approval-title"
              style={{ fontWeight: 600, fontSize: 14, color: 'var(--primary-text)' }}
            >
              {isShellExec ? 'Confirmar comando' : 'Confirmar acción'}
            </span>
          </div>
          <button
            type="button"
            aria-label="Cancelar"
            onClick={() => onRespond(approvalId, false)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--tertiary-text)',
              padding: 4,
              borderRadius: 4,
              display: 'flex',
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {isShellExec ? (
            <>
              <p style={{ fontSize: 13, color: 'var(--secondary-text)', margin: 0 }}>
                El agente quiere ejecutar el siguiente comando:
              </p>
              <pre
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '10px 14px',
                  fontSize: 13,
                  fontFamily: 'var(--font-mono, monospace)',
                  color: 'var(--primary-text)',
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  overflowX: 'auto',
                }}
              >
                {command}
              </pre>
              {cwd && (
                <p style={{ fontSize: 12, color: 'var(--tertiary-text)', margin: 0 }}>
                  Directorio: <code style={{ fontFamily: 'var(--font-mono, monospace)' }}>{cwd}</code>
                </p>
              )}
            </>
          ) : (
            <>
              <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--primary-text)', margin: 0 }}>
                {summary}
              </p>
              {details && (
                <p style={{ fontSize: 13, color: 'var(--secondary-text)', margin: 0 }}>
                  {details}
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--tertiary-text)' }}>
            Caduca en {secondsLeft}s
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onRespond(approvalId, false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onRespond(approvalId, true)}
            >
              {isShellExec ? 'Ejecutar' : 'Aprobar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

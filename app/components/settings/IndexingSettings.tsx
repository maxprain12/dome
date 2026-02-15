'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Database, Wrench, Search, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface VectorStatus {
  available: boolean;
  path: string | null;
}

interface VectorStats {
  success: boolean;
  chunks: number;
  resourcesIndexed: number;
  tableNames: string[];
  lastError: string | null;
}

export default function IndexingSettings() {
  const [status, setStatus] = useState<VectorStatus | null>(null);
  const [stats, setStats] = useState<VectorStats | null>(null);
  const [reindexing, setReindexing] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; message: string } | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const s = await window.electron?.vector?.status?.();
      setStatus(s ?? null);
    } catch (e) {
      setStatus({ available: false, path: null });
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const s = await window.electron?.vector?.resources?.stats?.();
      setStats(s ?? null);
    } catch (e) {
      setStats(null);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    loadStats();
    const interval = setInterval(() => {
      loadStats();
    }, 5000);
    return () => clearInterval(interval);
  }, [loadStatus, loadStats]);

  const handleReindexAll = async () => {
    setReindexing(true);
    setLastError(null);
    setVerifyResult(null);
    try {
      const result = await window.electron?.vector?.resources?.reindexAll?.();
      if (result?.success) {
        await loadStats();
      } else {
        setLastError(result?.error || 'Reindex failed');
      }
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setReindexing(false);
    }
  };

  const handleRepair = async () => {
    setRepairing(true);
    setLastError(null);
    setVerifyResult(null);
    try {
      const result = await window.electron?.vector?.resources?.repair?.();
      if (result?.success) {
        await loadStatus();
        await loadStats();
      } else {
        setLastError(result?.error || 'Repair failed');
      }
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setRepairing(false);
    }
  };

  const handleVerify = async () => {
    setVerifyResult(null);
    try {
      const result = await window.electron?.vector?.search?.('test query', { limit: 3 });
      if (result?.success !== false) {
        setVerifyResult({ ok: true, message: 'Búsqueda de prueba exitosa' });
      } else {
        setVerifyResult({ ok: false, message: result?.error || 'Error en la búsqueda' });
      }
    } catch (e) {
      setVerifyResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    }
  };

  const isAvailable = status?.available ?? false;
  const dbPath = status?.path ?? '';

  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      <div>
        <h2 className="text-xl font-display font-semibold mb-1" style={{ color: 'var(--primary-text)' }}>
          Indexación vectorial
        </h2>
        <p className="text-sm opacity-80" style={{ color: 'var(--secondary-text)' }}>
          Estado de la base de datos vectorial (LanceDB) y herramientas de indexación
        </p>
      </div>

      {/* Estado de conexión */}
      <section>
        <h3 className="text-xs uppercase tracking-wider font-semibold mb-6" style={{ color: 'var(--secondary-text)' }}>
          Estado
        </h3>
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)', borderWidth: 1 }}>
            {isAvailable ? (
              <CheckCircle2 size={24} style={{ color: 'var(--success)' }} />
            ) : (
              <AlertCircle size={24} style={{ color: 'var(--error)' }} />
            )}
            <div>
              <p className="font-medium text-sm" style={{ color: 'var(--primary-text)' }}>
                {isAvailable ? 'LanceDB conectado' : 'LanceDB no disponible'}
              </p>
              {dbPath && (
                <p className="text-xs mt-1 font-mono opacity-70" style={{ color: 'var(--secondary-text)' }}>
                  {dbPath}
                </p>
              )}
            </div>
          </div>

          {stats?.success && (
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)', borderWidth: 1 }}>
                <p className="text-2xl font-semibold" style={{ color: 'var(--accent)' }}>{stats.chunks}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--secondary-text)' }}>Chunks indexados</p>
              </div>
              <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)', borderWidth: 1 }}>
                <p className="text-2xl font-semibold" style={{ color: 'var(--accent)' }}>{stats.resourcesIndexed}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--secondary-text)' }}>Recursos (aprox.)</p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Acciones */}
      <section>
        <h3 className="text-xs uppercase tracking-wider font-semibold mb-6" style={{ color: 'var(--secondary-text)' }}>
          Acciones
        </h3>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleReindexAll}
              disabled={reindexing || !isAvailable}
              className="btn btn-secondary flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {reindexing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Re-indexar todo
            </button>
            <button
              type="button"
              onClick={handleRepair}
              disabled={repairing || !isAvailable}
              className="btn btn-secondary flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {repairing ? <Loader2 size={16} className="animate-spin" /> : <Wrench size={16} />}
              Reparar tabla
            </button>
            <button
              type="button"
              onClick={handleVerify}
              disabled={!isAvailable}
              className="btn btn-secondary flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <Search size={16} />
              Verificar índices
            </button>
          </div>

          {verifyResult && (
            <div
              className={`p-4 rounded-lg flex items-center gap-2 ${verifyResult.ok ? '' : ''}`}
              style={{
                backgroundColor: verifyResult.ok ? 'var(--success)' + '15' : 'var(--error)' + '15',
                borderColor: verifyResult.ok ? 'var(--success)' : 'var(--error)',
                borderWidth: 1,
              }}
            >
              {verifyResult.ok ? <CheckCircle2 size={20} style={{ color: 'var(--success)' }} /> : <AlertCircle size={20} style={{ color: 'var(--error)' }} />}
              <span style={{ color: 'var(--primary-text)' }}>{verifyResult.message}</span>
            </div>
          )}

          {lastError && (
            <div className="p-4 rounded-lg flex items-center gap-2" style={{ backgroundColor: 'var(--error)' + '15', borderColor: 'var(--error)', borderWidth: 1 }}>
              <AlertCircle size={20} style={{ color: 'var(--error)' }} />
              <span style={{ color: 'var(--error)' }}>{lastError}</span>
            </div>
          )}
        </div>
      </section>

      {/* Cómo conectar */}
      <section>
        <h3 className="text-xs uppercase tracking-wider font-semibold mb-6" style={{ color: 'var(--secondary-text)' }}>
          Conectar a la base de datos
        </h3>
        <p className="text-sm mb-4" style={{ color: 'var(--secondary-text)' }}>
          Para inspeccionar la base de datos vectorial, cierra Dome y usa uno de estos métodos:
        </p>
        <div className="space-y-3 text-sm font-mono p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)', borderWidth: 1 }}>
          <p style={{ color: 'var(--secondary-text)' }}>// Node.js</p>
          <pre className="overflow-x-auto text-xs whitespace-pre-wrap" style={{ color: 'var(--primary-text)' }}>
            {`const lancedb = require('vectordb');
const db = await lancedb.connect('${dbPath || '~/Library/Application Support/Dome/dome-vector'}');
const tables = await db.tableNames();
const table = await db.openTable('resource_embeddings');
const count = await table.countRows();`}
          </pre>
          <p className="pt-2" style={{ color: 'var(--secondary-text)' }}>// Python</p>
          <pre className="overflow-x-auto text-xs whitespace-pre-wrap" style={{ color: 'var(--primary-text)' }}>
            {`import lancedb
db = lancedb.connect("${dbPath || '~/Library/Application Support/Dome/dome-vector'}")
table = db.open_table("resource_embeddings")
df = table.to_pandas()`}
          </pre>
        </div>
      </section>
    </div>
  );
}

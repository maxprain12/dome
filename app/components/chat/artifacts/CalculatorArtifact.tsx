import { useMemo, useState } from 'react';
import type { CalculatorArtifactV } from '@/lib/chat/artifactSchemas';
import { isSafeCalculatorFormula } from '@/lib/chat/artifactSchemas';

const DOME_RANGE_STYLE_ID = 'dome-calculator-range-style';
const DOME_RANGE_CSS = `
.dome-calc-range{-webkit-appearance:none;appearance:none;width:100%;height:24px;background:transparent;cursor:pointer;accent-color:var(--accent)}
.dome-calc-range:focus{outline:none}
.dome-calc-range:focus-visible{box-shadow:0 0 0 3px var(--translucent);border-radius:var(--radius-full)}
.dome-calc-range::-webkit-slider-runnable-track{height:4px;background:var(--bg-tertiary);border:1px solid var(--border);border-radius:var(--radius-full)}
.dome-calc-range::-moz-range-track{height:4px;background:var(--bg-tertiary);border:1px solid var(--border);border-radius:var(--radius-full)}
.dome-calc-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:14px;height:14px;border-radius:var(--radius-full);background:var(--accent);border:2px solid var(--bg-secondary);margin-top:-6px;box-shadow:var(--shadow-sm);transition:transform var(--transition-fast)}
.dome-calc-range::-moz-range-thumb{width:14px;height:14px;border-radius:var(--radius-full);background:var(--accent);border:2px solid var(--bg-secondary);box-shadow:var(--shadow-sm);transition:transform var(--transition-fast)}
.dome-calc-range:hover::-webkit-slider-thumb{transform:scale(1.08)}
.dome-calc-range:hover::-moz-range-thumb{transform:scale(1.08)}
`.trim();

function ensureRangeStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(DOME_RANGE_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = DOME_RANGE_STYLE_ID;
  style.textContent = DOME_RANGE_CSS;
  document.head.appendChild(style);
}

function formatValue(n: number, format: CalculatorArtifactV['outputs'][0]['format'], unit?: string): string {
  let s: string;
  switch (format) {
    case 'currency':
      s = n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
      s = `${s} ${unit ?? '€'}`.trim();
      break;
    case 'percent':
      s = `${(n * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
      break;
    case 'number':
      s = n.toLocaleString(undefined, { maximumFractionDigits: 4 });
      break;
    default:
      s = Number.isFinite(n) ? String(n) : '—';
  }
  if (format !== 'currency' && unit) s = `${s} ${unit}`;
  return s;
}

function evalFormula(formula: string, env: Record<string, number>): number {
  if (!isSafeCalculatorFormula(formula)) return NaN;
  const keys = Object.keys(env);
  try {
    const fn = new Function(...keys, `return (${formula})`);
    return fn(...keys.map((k) => env[k]!)) as number;
  } catch {
    return NaN;
  }
}

export default function CalculatorArtifact({ artifact }: { artifact: CalculatorArtifactV }) {
  ensureRangeStyle();
  const initial = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of artifact.inputs) {
      m[i.id] = i.value;
    }
    return m;
  }, [artifact.inputs]);

  const [values, setValues] = useState<Record<string, number>>(initial);

  const outputs = useMemo(() => {
    return artifact.outputs.map((o) => {
      const v = evalFormula(o.formula, values);
      return { ...o, computed: v };
    });
  }, [artifact.outputs, values]);

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {artifact.inputs.map((inp) => (
        <label key={inp.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
          <span style={{ color: 'var(--secondary-text)', fontWeight: 600 }}>
            {inp.label}
            {inp.unit ? ` (${inp.unit})` : ''}
          </span>
          {inp.kind === 'slider' && (
            <>
              <input
                type="range"
                className="dome-calc-range"
                min={inp.min ?? 0}
                max={inp.max ?? 100}
                step={inp.step ?? 1}
                value={values[inp.id] ?? 0}
                aria-label={inp.label}
                aria-valuetext={
                  inp.unit
                    ? `${values[inp.id] ?? 0} ${inp.unit}`
                    : undefined
                }
                onChange={(e) =>
                  setValues((s) => ({ ...s, [inp.id]: Number.parseFloat(e.target.value) }))
                }
              />
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--tertiary-text)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {values[inp.id]}
                {inp.unit ? ` ${inp.unit}` : ''}
              </span>
            </>
          )}
          {inp.kind === 'number' && (
            <input
              type="number"
              value={values[inp.id] ?? 0}
              min={inp.min}
              max={inp.max}
              step={inp.step}
              onChange={(e) =>
                setValues((s) => ({ ...s, [inp.id]: Number.parseFloat(e.target.value) || 0 }))
              }
              style={{
                padding: '6px 8px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--primary-text)',
              }}
            />
          )}
          {inp.kind === 'select' && inp.options && (
            <select
              value={String(values[inp.id] ?? inp.options[0]?.value ?? 0)}
              onChange={(e) => {
                const n = Number.parseFloat(e.target.value);
                setValues((s) => ({ ...s, [inp.id]: Number.isFinite(n) ? n : 0 }));
              }}
              style={{
                padding: '6px 8px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                color: 'var(--primary-text)',
              }}
            >
              {inp.options.map((o) => (
                <option key={o.label + o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </label>
      ))}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 'var(--space-3)',
          marginTop: 4,
        }}
      >
        {outputs.map((o) => (
          <div
            key={o.id}
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--secondary-text)', marginBottom: 4 }}>
              {o.label}
            </div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: 'var(--primary-text)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {Number.isFinite(o.computed)
                ? formatValue(o.computed, o.format ?? 'plain', o.unit)
                : '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

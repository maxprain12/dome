import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  JSON_PRETTY_MAX_DEPTH,
  JSON_PRETTY_MAX_NODES,
  JsonPrettyBudgetProvider,
  JsonPrettyPrinter,
  JsonPrettyPrinterRoot,
} from './jsonPrettyPrinter';

describe('JsonPrettyPrinterRoot', () => {
  it('renders null, booleans, numbers, and strings', () => {
    const { rerender } = render(<JsonPrettyPrinterRoot value={null} />);
    expect(screen.getByText('null')).toBeTruthy();

    rerender(<JsonPrettyPrinterRoot value={true} />);
    expect(screen.getByText('true')).toBeTruthy();

    rerender(<JsonPrettyPrinterRoot value={42} />);
    expect(screen.getByText('42')).toBeTruthy();

    rerender(<JsonPrettyPrinterRoot value="hola" />);
    expect(screen.getByText('"hola"')).toBeTruthy();
  });

  it('truncates long strings at 240 chars', () => {
    const long = 'a'.repeat(300);
    render(<JsonPrettyPrinterRoot value={long} />);
    const text = screen.getByText(/^"a+…"$/).textContent ?? '';
    expect(text.length).toBe(1 + 237 + 1 + 1); // " + 237 + … + "
    expect(text.endsWith('…"')).toBe(true);
  });

  it('renders empty and nested arrays/objects', () => {
    const { rerender } = render(<JsonPrettyPrinterRoot value={[]} />);
    expect(screen.getByText('[]')).toBeTruthy();

    rerender(<JsonPrettyPrinterRoot value={{}} />);
    expect(screen.getByText('{}')).toBeTruthy();

    rerender(<JsonPrettyPrinterRoot value={{ a: 1, b: [2, 3] }} />);
    expect(screen.getByText('a:')).toBeTruthy();
    expect(screen.getByText('b:')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('ellipses when max depth is exceeded', () => {
    let nested: unknown = 'leaf';
    for (let i = 0; i < JSON_PRETTY_MAX_DEPTH + 1; i += 1) {
      nested = [nested];
    }
    render(<JsonPrettyPrinterRoot value={nested} />);
    expect(screen.getAllByText('…').length).toBeGreaterThan(0);
  });

  it('shows omitted notice when node budget is exhausted at root', () => {
    const budget = { nodes: JSON_PRETTY_MAX_NODES, omitted: 0 };
    render(
      <JsonPrettyBudgetProvider budget={budget}>
        <JsonPrettyPrinter value={{ keep: true }} depth={0} showOmittedNotice />
      </JsonPrettyBudgetProvider>,
    );
    expect(screen.getByText(/nodos omitidos/)).toBeTruthy();
    expect(budget.omitted).toBe(1);
  });

  it('falls back to String(value) for unsupported types', () => {
    render(<JsonPrettyPrinterRoot value={Symbol('x')} />);
    expect(screen.getByText('Symbol(x)')).toBeTruthy();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ManyModelPicker from './ManyModelPicker';
import type { CloudModelCatalog } from '@/lib/manys/api';

const catalog: CloudModelCatalog = {
  dome: [
    { id: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5', input: ['text', 'image'], reasoning: true, contextWindow: 200000, multiplier: 2, minPlan: 'dome_pro', available: true },
    { id: 'openai/gpt-5.5', name: 'GPT-5.5', input: ['text', 'image'], reasoning: true, contextWindow: 400000, multiplier: 4, minPlan: 'dome_max', available: false },
  ],
  saved: [
    { id: 'deepseek', name: 'DeepSeek', defaultModel: 'deepseek-chat', models: [{ id: 'deepseek-chat', name: 'DeepSeek Chat', input: ['text'], reasoning: false, contextWindow: 128000 }] },
  ],
};

describe('ManyModelPicker', () => {
  it('says what the chosen model can do', () => {
    render(<ManyModelPicker catalog={catalog} value={{ source: 'dome', model: 'anthropic/claude-sonnet-5' }} onChange={vi.fn()} />);
    expect(screen.getByText(/Ve imágenes|Sees images|Voit les images|Vê imagens/)).toBeInTheDocument();
    expect(screen.getByText(/Razona|Reasons|Raisonne|Raciocina/)).toBeInTheDocument();
    expect(screen.getByText('200k', { exact: false })).toBeInTheDocument();
  });

  it('warns when a model has no vision, because the Many works through screenshots', () => {
    render(<ManyModelPicker catalog={catalog} value={{ source: 'external', provider: 'deepseek', model: 'deepseek-chat' }} onChange={vi.fn()} />);
    expect(screen.getByText(/Sin visión|No vision|Sans vision|Sem visão/)).toBeInTheDocument();
    // A model that does not reason has no thinking control.
    expect(screen.queryByLabelText(/Nivel de razonamiento|Thinking level|Niveau de raisonnement|Nível de raciocínio/)).toBeNull();
  });

  it('offers a thinking level only for a model that thinks, and keeps the model when it changes', async () => {
    const onChange = vi.fn();
    render(<ManyModelPicker catalog={catalog} value={{ source: 'dome', model: 'anthropic/claude-sonnet-5', thinking: 'low' }} onChange={onChange} />);
    const control = screen.getByLabelText(/Nivel de razonamiento|Thinking level|Niveau de raisonnement|Nível de raciocínio/);
    await userEvent.click(control);
    await userEvent.click(await screen.findByRole('option', { name: /^(Alto|High|Élevé)$/ }));
    expect(onChange).toHaveBeenCalledWith({ source: 'dome', model: 'anthropic/claude-sonnet-5', thinking: 'high' });
  });

  it('shows only the models of one source when asked', async () => {
    render(<ManyModelPicker catalog={catalog} value={null} only={{ source: 'external', provider: 'deepseek' }} onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('combobox'));
    expect(await screen.findByRole('option', { name: 'DeepSeek Chat' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Claude Sonnet 5/ })).toBeNull();
  });
});

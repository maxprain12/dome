import { memo } from 'react';
import type { ComponentProps } from 'react';
import ManyChatInput from '@/components/many/ManyChatInput';
import AgentChatInput from '@/components/agents/AgentChatInput';

export type UnifiedChatInputProps =
  | ({ mode: 'many' } & ComponentProps<typeof ManyChatInput>)
  | ({ mode: 'agent' } & ComponentProps<typeof AgentChatInput>);

/**
 * Entrada de chat unificada: `mode="many"` reutiliza Many (capacidades, @, adjuntos);
 * `mode="agent"` reutiliza el input de agente (MCPs/tools, adjuntos). Los stores siguen en los padres.
 * Incluye / skills, @ en agente, selector de modelo y menú + anidado.
 */
function UnifiedChatInput(props: UnifiedChatInputProps) {
  if (props.mode === 'agent') {
    const { mode: _m, ...rest } = props;
    return <AgentChatInput {...rest} />;
  }
  const { mode: _m, ...rest } = props;
  return <ManyChatInput {...rest} />;
}

export default memo(UnifiedChatInput);

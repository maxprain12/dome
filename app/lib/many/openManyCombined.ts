import { askStudioMany, type StudioManyPin } from '@/components/studio-hub/askStudioMany';
import type { PinnedResource } from '@/lib/store/useManyStore';
import { useManyStore } from '@/lib/store/useManyStore';

export type CombinedManyOutcome = 'email' | 'brief' | 'outreach' | 'post';

const OUTCOME_PROMPTS: Record<CombinedManyOutcome, string> = {
  email:
    'Redacta un email concreto usando la persona y el recurso pineados. Incluye asunto, apertura y un CTA.',
  brief:
    'Prepara un brief de una página: contexto de la persona, hallazgos del recurso y 3 siguientes pasos.',
  outreach:
    'Escribe un mensaje de outreach personalizado (LinkedIn o email) anclado en el recurso pineado.',
  post:
    'Borra un post social personalizado para esta persona, citando un hallazgo del recurso. Propón red y gancho.',
};

export function openManyWithCombinedContext(opts: {
  person?: StudioManyPin | null;
  resource?: StudioManyPin | null;
  outcome?: CombinedManyOutcome;
  prompt?: string;
}): void {
  const many = useManyStore.getState();
  const pins: PinnedResource[] = [];
  if (opts.person) {
    pins.push({
      id: opts.person.id,
      title: opts.person.title,
      type: opts.person.type,
      kind: opts.person.kind ?? 'person',
      meta: opts.person.meta ?? null,
    });
  }
  if (opts.resource) {
    pins.push({
      id: opts.resource.id,
      title: opts.resource.title,
      type: opts.resource.type,
      kind: opts.resource.kind ?? 'resource',
      meta: opts.resource.meta ?? null,
    });
  }
  for (const pin of pins) {
    many.addPinnedResource(pin);
  }
  const prompt =
    opts.prompt ??
    (opts.person && opts.resource
      ? OUTCOME_PROMPTS[opts.outcome ?? 'brief']
      : OUTCOME_PROMPTS[opts.outcome ?? 'brief']);
  askStudioMany(prompt);
}

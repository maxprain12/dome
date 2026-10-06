import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { CloudModel, CloudModelCatalog, ModelSelection, ThinkingLevel } from '@/lib/manys/api';

const THINKING: ThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const DOME = 'dome';

/** `dome|<model>` or `external|<provider>|<model>`: one string a Select can hold. */
const encode = (selection: ModelSelection | null): string => {
  if (!selection) return '';
  return selection.source === 'dome' ? `${DOME}|${selection.model}` : `external|${selection.provider ?? ''}|${selection.model}`;
};
const decode = (value: string, thinking?: ThinkingLevel): ModelSelection | null => {
  const [source, ...rest] = value.split('|');
  if (source === DOME && rest.length > 0) return { source: 'dome', model: rest.join('|'), thinking };
  if (source === 'external' && rest.length > 1) return { source: 'external', provider: rest[0], model: rest.slice(1).join('|'), thinking };
  return null;
};

interface Props {
  catalog: CloudModelCatalog;
  value: ModelSelection | null;
  onChange: (selection: ModelSelection) => void;
  disabled?: boolean;
  /** Offer only one source: the models of the plan, or those of one saved provider. Absent: everything. */
  only?: { source: 'dome' } | { source: 'external'; provider: string };
  id?: string;
}

/**
 * Which model a Many runs on, with what it can do: sees pictures, thinks, how much it holds. The models of the
 * Dome plan cost credits; the ones of a saved provider are paid to that provider. No key is ever shown.
 */
export default function ManyModelPicker({ catalog, value, onChange, disabled, only, id }: Props) {
  const { t } = useTranslation();
  const showDome = !only || only.source === 'dome';
  const providers = catalog.saved.filter((provider) => !only || (only.source === 'external' && only.provider === provider.id));
  const known = useMemo(() => {
    const map = new Map<string, CloudModel>();
    for (const model of catalog.dome) map.set(`${DOME}|${model.id}`, model);
    for (const provider of catalog.saved) for (const model of provider.models) map.set(`external|${provider.id}|${model.id}`, model);
    return map;
  }, [catalog]);
  const current = known.get(encode(value));
  const thinking = value?.thinking;

  return (
    <div className="flex flex-col gap-2">
      <Select value={encode(value)} disabled={disabled} onValueChange={(next) => { const selection = next ? decode(next, thinking) : null; if (selection) onChange(selection); }}>
        <SelectTrigger id={id} className="w-full" aria-label={t('manys.model')}>
          <SelectValue placeholder={t('manys.modelPicker.choose')}>{current?.name ?? value?.model}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {showDome && catalog.dome.length > 0 && (
            <SelectGroup>
              <SelectLabel>{t('manys.runtime.dome_credits')}</SelectLabel>
              {catalog.dome.map((model) => (
                <SelectItem key={`${DOME}|${model.id}`} value={`${DOME}|${model.id}`} disabled={!model.available}>
                  {model.name}{model.available ? '' : ` · ${t('manys.modelPicker.plan', { plan: model.minPlan.replace('dome_', '') })}`}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          {providers.map((provider) => (
            <SelectGroup key={provider.id}>
              <SelectLabel>{provider.name}</SelectLabel>
              {provider.models.map((model) => (
                <SelectItem key={`${provider.id}|${model.id}`} value={`external|${provider.id}|${model.id}`}>{model.name}</SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {current && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={current.input.includes('image') ? 'mint' : 'outline'}>{current.input.includes('image') ? t('manys.modelPicker.sees') : t('manys.modelPicker.textOnly')}</Badge>
          {current.reasoning && <Badge variant="lavender">{t('manys.modelPicker.thinks')}</Badge>}
          {current.contextWindow ? <Badge variant="outline">{t('manys.modelPicker.context', { size: Math.round(current.contextWindow / 1000) })}</Badge> : null}
        </div>
      )}
      {current && !current.input.includes('image') && <p className="text-xs text-muted-foreground">{t('manys.modelPicker.noVision')}</p>}
      {current?.reasoning && value && (
        <Select value={thinking ?? 'low'} disabled={disabled} onValueChange={(level) => onChange({ ...value, thinking: level as ThinkingLevel })}>
          <SelectTrigger className="w-full" aria-label={t('manys.modelPicker.thinking')}><SelectValue>{t(`manys.modelPicker.levels.${thinking ?? 'low'}`)}</SelectValue></SelectTrigger>
          <SelectContent>
            {THINKING.map((level) => <SelectItem key={level} value={level}>{t(`manys.modelPicker.levels.${level}`)}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

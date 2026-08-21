import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Brain02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getAIConfig } from '@/lib/ai';
import type { ThinkingLevel } from '@/lib/ai/types';
import { useManyStore } from '@/lib/store/useManyStore';
import { cn } from '@/lib/utils';

interface ThinkingLevelSwitcherProps {
  /** Dropdown opens above (composer) or below (header) the trigger. */
  dropDirection?: 'above' | 'below';
  disabled?: boolean;
}

/**
 * Reasoning-effort control for the active Many session.
 *
 * Which levels exist is decided by the model registry in the main process
 * (`ai:model:thinkingLevels`), never by a table kept here — so a new reasoning
 * model works without touching this component. Models that cannot reason
 * report a single level ('off') and the control hides itself.
 */
export function ThinkingLevelSwitcher({
  dropDirection = 'above',
  disabled = false,
}: ThinkingLevelSwitcherProps) {
  const { t } = useTranslation();
  const currentSessionId = useManyStore((s) => s.currentSessionId);
  const thinkingLevelBySession = useManyStore((s) => s.thinkingLevelBySession);
  const setThinkingLevelForSession = useManyStore((s) => s.setThinkingLevelForSession);

  const [levels, setLevels] = useState<ThinkingLevel[]>(['off']);

  const level: ThinkingLevel =
    (currentSessionId ? thinkingLevelBySession[currentSessionId] : undefined) ?? 'off';

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const config = await getAIConfig();
      if (cancelled || !config?.provider || !config?.model) {
        setLevels(['off']);
        return;
      }
      const res = await window.electron?.ai?.getThinkingLevels?.({
        provider: config.provider,
        model: config.model,
        baseUrl: config.baseURL,
      });
      if (cancelled) return;
      const supported: ThinkingLevel[] =
        res?.success && Array.isArray(res.data?.levels) && res.data.levels.length > 0
          ? res.data.levels
          : ['off'];
      setLevels(supported);
    })();
    return () => {
      cancelled = true;
    };
    // Re-read when the session changes: the user may have switched model in between.
  }, [currentSessionId]);

  const onSelect = useCallback(
    (next: string) => {
      if (!currentSessionId) return;
      setThinkingLevelForSession(currentSessionId, next as ThinkingLevel);
    },
    [currentSessionId, setThinkingLevelForSession],
  );

  // Nothing to choose from — this model cannot reason.
  if (levels.length <= 1) return null;

  const isOn = level !== 'off';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={disabled}
            aria-label={t('chat.thinking_level')}
            className={cn('gap-1 rounded-full px-2', isOn && 'text-primary')}
          />
        }
      >
        <HugeiconsIcon icon={Brain02Icon} size={13} />
        <span className="truncate text-[11.5px]">{t(`chat.thinking_level_${level}`)}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side={dropDirection === 'above' ? 'top' : 'bottom'}
        className="min-w-44"
      >
        <DropdownMenuRadioGroup value={level} onValueChange={onSelect}>
          {levels.map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              {t(`chat.thinking_level_${option}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ThinkingLevelSwitcher;

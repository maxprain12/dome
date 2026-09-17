import { useState } from 'react';
import type { IconSvgElement } from '@hugeicons/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ChatSuggestionItem = {
  id: string;
  label: string;
  onClick: () => void;
  icon?: IconSvgElement;
  skillId?: string;
  skillInstalled?: boolean;
  skillRecommend?: string;
  installLabel?: string;
  continueLabel?: string;
  onInstallSkill?: () => void;
  onContinueWithoutSkill?: () => void;
};

export function ChatSuggestionPills({
  items,
  className,
}: {
  items: ChatSuggestionItem[];
  className?: string;
}) {
  const [awaitingSkill, setAwaitingSkill] = useState<string | null>(null);
  if (items.length === 0) return null;
  return (
    <div className={cn('flex w-full flex-wrap justify-center gap-2', className)}>
      {items.map((item) => {
        const needsSkill = Boolean(item.skillId) && item.skillInstalled === false;
        const expanded = awaitingSkill === item.id && needsSkill;
        return (
          <div key={item.id} className="flex max-w-full flex-col items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (needsSkill) {
                  setAwaitingSkill((current) => (current === item.id ? null : item.id));
                  return;
                }
                item.onClick();
              }}
              className="rounded-full font-normal shadow-none"
            >
              {item.icon ? <HugeiconsIcon icon={item.icon} data-icon="inline-start" /> : null}
              {item.label}
            </Button>
            {expanded ? (
              <div className="flex max-w-xs flex-col items-center gap-1.5 rounded-xl border bg-card px-3 py-2 text-center">
                {item.skillRecommend ? (
                  <p className="text-xs text-muted-foreground">{item.skillRecommend}</p>
                ) : null}
                <div className="flex flex-wrap justify-center gap-1.5">
                  {item.onInstallSkill ? (
                    <Button
                      type="button"
                      size="xs"
                      onClick={() => {
                        item.onInstallSkill?.();
                        setAwaitingSkill(null);
                      }}
                    >
                      {item.installLabel}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      item.onContinueWithoutSkill?.();
                      setAwaitingSkill(null);
                    }}
                  >
                    {item.continueLabel}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

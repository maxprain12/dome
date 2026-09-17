import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChartIcon,
  BotIcon,
  Calendar03Icon,
  ClipboardListIcon,
  FolderOpenIcon,
  Mail01Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons';
import ManyAvatar from '@/components/many/ManyAvatar';
import { ChatSuggestionPills } from '@/components/chat/ChatSuggestionPills';
import { useStudioPromptItems } from '@/lib/chat/studioPrompts';
import { cn } from '@/lib/utils';

const HERO_SUGGESTIONS = [
  { icon: Search01Icon, labelKey: 'chat.quick_search_library' },
  { icon: FolderOpenIcon, labelKey: 'chat.quick_organize' },
  { icon: ClipboardListIcon, labelKey: 'chat.quick_prepare_meeting' },
  { icon: BotIcon, labelKey: 'chat.quick_ai_strategy' },
  { icon: BarChartIcon, labelKey: 'chat.quick_create_table' },
  { icon: Calendar03Icon, labelKey: 'chat.quick_weekly_report' },
  { icon: Mail01Icon, labelKey: 'chat.quick_draft_email' },
] as const;

interface ManyWelcomeProps {
  variant: 'hero' | 'panel';
  supportsTools: boolean;
  onPrompt: (text: string) => void;
  /** Hero only: the composer island rendered under the greeting. */
  composer?: ReactNode;
  className?: string;
}

/**
 * First contact with Many. `hero` fills the fullscreen tab / popout;
 * `panel` is the compact empty state inside the sidebar transcript.
 */
export default function ManyWelcome({
  variant,
  supportsTools,
  onPrompt,
  composer,
  className,
}: ManyWelcomeProps) {
  const { t } = useTranslation();
  const studioPrompts = useStudioPromptItems({ surface: 'many', onFill: onPrompt });

  if (variant === 'hero') {
    return (
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-10',
          className,
        )}
      >
        <ManyAvatar size="xl" state="idle" className="mb-5" />
        <h1 className="text-center text-2xl font-semibold tracking-tight">
          {t('chat.welcome_heading')}
        </h1>
        <p className="mx-auto mb-8 mt-1.5 max-w-xl px-4 text-center text-sm text-muted-foreground">
          {t('many.welcome_hints')}
        </p>
        {composer ? <div className="mb-6 w-full max-w-2xl">{composer}</div> : null}
        <ChatSuggestionPills
          className="max-w-2xl"
          items={[
            ...HERO_SUGGESTIONS.map(({ icon, labelKey }) => ({
              id: labelKey,
              icon,
              label: t(labelKey),
              onClick: () => onPrompt(t(labelKey)),
            })),
            ...studioPrompts.slice(0, 3),
          ]}
        />
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col items-center px-4 py-12 text-center', className)}>
      <ManyAvatar size="lg" state="idle" className="mb-4" />
      <p className="text-[15px] font-semibold tracking-tight">{t('chat.many_welcome_title')}</p>
      <p className="mx-auto mt-1 max-w-xs text-[13px] text-muted-foreground">
        {t('chat.many_welcome_subtitle')}
      </p>
      <p className="mx-auto mt-3 max-w-md text-[13px] text-muted-foreground/80">
        {t('many.welcome_hints')}
      </p>
      <ChatSuggestionPills
        className="mx-auto mt-6 max-w-md"
        items={[
          ...[
            'chat.quick_empty_summarize',
            'chat.quick_empty_focus',
            'chat.quick_empty_organize',
            ...(supportsTools
              ? (['chat.quick_empty_search_resources', 'chat.quick_empty_query_db'] as const)
              : []),
          ].map((key) => ({
            id: key,
            label: t(key),
            onClick: () => onPrompt(t(key)),
          })),
          ...studioPrompts.slice(0, 2),
        ]}
      />
    </div>
  );
}

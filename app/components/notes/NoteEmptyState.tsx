import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { BookOpen01Icon, Calendar03Icon, CheckListIcon, Flag02Icon, Idea01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';

interface NoteEmptyStateProps {
  onPickTemplate?: (id: string) => void;
}

export default function NoteEmptyState({ onPickTemplate }: NoteEmptyStateProps) {
  const { t } = useTranslation();

  const templates = useMemo(
    () =>
      [
        { id: 'daily', label: t('notes.template_daily'), icon: Calendar03Icon },
        { id: 'meeting', label: t('notes.template_meeting'), icon: Flag02Icon },
        { id: 'brief', label: t('notes.template_brief'), icon: Idea01Icon },
        { id: 'pdf_summary', label: t('notes.template_pdf_summary'), icon: BookOpen01Icon },
        { id: 'weekly', label: t('notes.template_weekly'), icon: CheckListIcon },
      ] as const,
    [t],
  );

  return (
    <div className="note-empty-hint-area">
      <p className="note-empty-intro">{t('notes.empty_intro')}</p>

      <div className="note-empty-templates-divider">
        <div className="note-empty-templates-heading">{t('notes.templates_heading')}</div>
        <div className="note-empty-templates-row">
          {templates.map(({ id, label, icon }) => (
            <Button
              key={id}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onPickTemplate?.(id)}
            >
              <HugeiconsIcon icon={icon as IconSvgElement} data-icon="inline-start" aria-hidden />
              <span>{label}</span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

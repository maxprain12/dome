import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Calendar, Flag, Lightbulb, ListChecks } from 'lucide-react';

interface NoteEmptyStateProps {
  onPickTemplate?: (id: string) => void;
}

export default function NoteEmptyState({ onPickTemplate }: NoteEmptyStateProps) {
  const { t } = useTranslation();

  const templates = useMemo(
    () =>
      [
        { id: 'daily', label: t('notes.template_daily'), Icon: Calendar },
        { id: 'meeting', label: t('notes.template_meeting'), Icon: Flag },
        { id: 'brief', label: t('notes.template_brief'), Icon: Lightbulb },
        { id: 'pdf_summary', label: t('notes.template_pdf_summary'), Icon: BookOpen },
        { id: 'weekly', label: t('notes.template_weekly'), Icon: ListChecks },
      ] as const,
    [t],
  );

  return (
    <div className="note-empty-hint-area">
      <p className="note-empty-intro">{t('notes.empty_intro')}</p>

      <div className="note-empty-templates-divider">
        <div className="note-empty-templates-heading">{t('notes.templates_heading')}</div>
        <div className="note-empty-templates-row">
          {templates.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className="note-template-pill"
              onClick={() => onPickTemplate?.(id)}
            >
              <Icon size={14} strokeWidth={2} className="note-template-pill-icon shrink-0" aria-hidden />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

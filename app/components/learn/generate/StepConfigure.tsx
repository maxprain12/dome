import { useTranslation } from 'react-i18next';
import type { GenerateConfig, GenerateDifficulty, GenerateLanguage } from '@/lib/learn/types';

interface StepConfigureProps {
  config: GenerateConfig;
  onChange: (patch: Partial<GenerateConfig>) => void;
}

const DIFFICULTIES: { id: GenerateDifficulty; labelKey: string; fallback: string }[] = [
  { id: 'easy', labelKey: 'learn.diff_easy', fallback: 'Easy' },
  { id: 'mixed', labelKey: 'learn.diff_mixed', fallback: 'Mixed' },
  { id: 'hard', labelKey: 'learn.diff_hard', fallback: 'Hard' },
  { id: 'exam', labelKey: 'learn.diff_exam', fallback: 'Exam' },
];

const LANGUAGES: { id: GenerateLanguage; labelKey: string; fallback: string }[] = [
  { id: 'auto', labelKey: 'learn.lang_auto', fallback: 'Auto' },
  { id: 'en', labelKey: 'learn.lang_en', fallback: 'English' },
  { id: 'es', labelKey: 'learn.lang_es', fallback: 'Spanish' },
  { id: 'fr', labelKey: 'learn.lang_fr', fallback: 'French' },
];

export default function StepConfigure({ config, onChange }: StepConfigureProps) {
  const { t } = useTranslation();
  const pct = ((config.count - 5) / (50 - 5)) * 100;

  return (
    <div>
      <div className="lr-field">
        <label className="lr-field-label" htmlFor="learn-gen-title">
          {t('learn.config_title', 'Title')}
        </label>
        <input
          id="learn-gen-title"
          className="lr-input"
          value={config.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder={t('learn.config_title_ph', 'Optional custom title')}
        />
      </div>

      <div className="lr-field">
        <label className="lr-field-label" htmlFor="learn-gen-count">
          {t('learn.config_count', 'Item count')}
        </label>
        <div className="lr-slider-wrap" style={{ position: 'relative' }}>
          <div className="lr-slider" aria-hidden>
            <div className="fill" style={{ width: `${pct}%` }} />
            <div className="thumb" style={{ left: `${pct}%` }} />
          </div>
          <input
            id="learn-gen-count"
            type="range"
            min={5}
            max={50}
            step={1}
            value={config.count}
            onChange={(e) => onChange({ count: Number(e.target.value) })}
            style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', cursor: 'pointer' }}
          />
          <span className="lr-slider-val">{config.count}</span>
        </div>
      </div>

      <div className="lr-field">
        <span className="lr-field-label">{t('learn.config_difficulty', 'Difficulty')}</span>
        <div className="lr-radio-row">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.id}
              type="button"
              className={`lr-radio${config.difficulty === d.id ? ' on' : ''}`}
              onClick={() => onChange({ difficulty: d.id })}
            >
              {t(d.labelKey, d.fallback)}
            </button>
          ))}
        </div>
      </div>

      <div className="lr-field">
        <span className="lr-field-label">{t('learn.config_language', 'Language')}</span>
        <div className="lr-radio-row">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.id}
              type="button"
              className={`lr-radio${config.language === lang.id ? ' on' : ''}`}
              onClick={() => onChange({ language: lang.id })}
            >
              {t(lang.labelKey, lang.fallback)}
            </button>
          ))}
        </div>
      </div>

      <div className="lr-field">
        <label className="lr-field-label" htmlFor="learn-gen-instructions">
          {t('learn.config_instructions', 'Instructions')}
        </label>
        <textarea
          id="learn-gen-instructions"
          className="lr-textarea"
          value={config.instructions}
          onChange={(e) => onChange({ instructions: e.target.value })}
          placeholder={t('learn.config_instructions_ph', 'Focus areas, tone, or constraints…')}
        />
      </div>
    </div>
  );
}

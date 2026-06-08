import { ArrowLeft } from 'lucide-react';
import LearnViewerEmpty from '../LearnViewerEmpty';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import StudyGuide from '@/components/studio/StudyGuide';
import type { StudyGuideData, StudioOutput } from '@/types';

interface GuideReaderProps {
  output: StudioOutput;
  onBack: () => void;
}

export default function GuideReader({ output, onBack }: GuideReaderProps) {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState(0);

  const { data, corrupt } = useMemo(() => {
    if (!output.content) return { data: { sections: [] } as StudyGuideData, corrupt: false };
    try {
      return { data: JSON.parse(output.content) as StudyGuideData, corrupt: false };
    } catch {
      return { data: { sections: [] } as StudyGuideData, corrupt: true };
    }
  }, [output.content]);

  if (!data.sections || data.sections.length === 0) {
    return <LearnViewerEmpty onBack={onBack} corrupt={corrupt} />;
  }

  return (
    <div className="lr-guide">
      <nav className="lr-guide-toc">
        <button type="button" className="lr-deck-back" onClick={onBack} style={{ marginBottom: 12 }}>
          <ArrowLeft size={14} aria-hidden />
          {t('learn.back_to_library', 'Back to library')}
        </button>
        <div className="lr-guide-toc-eyebrow">{t('learn.guide_toc', 'Contents')}</div>
        {data.sections.map((section, index) => (
          <button
            key={`${section.title}-${index}`}
            type="button"
            className={`lr-guide-toc-row${activeSection === index ? ' on' : ''}`}
            onClick={() => setActiveSection(index)}
          >
            {section.title}
          </button>
        ))}
      </nav>
      <div className="lr-guide-content">
        <div className="crumb">{output.title}</div>
        {data.sections[activeSection] ? (
          <>
            <h1>{data.sections[activeSection].title}</h1>
            <StudyGuide
              data={{ sections: [data.sections[activeSection]] }}
              title={output.title}
            />
          </>
        ) : (
          <StudyGuide data={data} title={output.title} />
        )}
      </div>
    </div>
  );
}

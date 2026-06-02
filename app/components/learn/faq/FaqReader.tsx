import { ArrowLeft, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FAQData, StudioOutput } from '@/types';

interface FaqReaderProps {
  output: StudioOutput;
  onBack: () => void;
}

export default function FaqReader({ output, onBack }: FaqReaderProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const data = useMemo(() => {
    if (!output.content) return { pairs: [] } as FAQData;
    try {
      return JSON.parse(output.content) as FAQData;
    } catch {
      return { pairs: [] } as FAQData;
    }
  }, [output.content]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data.pairs;
    return data.pairs.filter(
      (p) => p.question.toLowerCase().includes(q) || p.answer.toLowerCase().includes(q),
    );
  }, [data.pairs, query]);

  return (
    <div className="lr-faq">
      <div className="lr-faq-hd">
        <button type="button" className="lr-deck-back" onClick={onBack}>
          <ArrowLeft size={14} aria-hidden />
          {t('learn.back_to_library', 'Back to library')}
        </button>
        <h1>{output.title}</h1>
        <label className="lr-search lr-faq-search">
          <Search size={14} aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('learn.faq_search', 'Search FAQ…')}
          />
        </label>
      </div>
      <div className="lr-faq-list">
        {filtered.length === 0 ? (
          <p className="lr-faq-empty">{t('learn.faq_empty', 'No matching questions.')}</p>
        ) : (
          filtered.map((pair, index) => {
            const open = openIndex === index;
            return (
              <div key={`${pair.question}-${index}`} className={`lr-faq-item${open ? ' open' : ''}`}>
                <button
                  type="button"
                  className="lr-faq-q"
                  onClick={() => setOpenIndex(open ? null : index)}
                >
                  {pair.question}
                </button>
                {open ? <div className="lr-faq-a">{pair.answer}</div> : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

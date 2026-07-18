import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface LearnSectionProps { title: string; count: number | string; seeAll?: () => void; children: ReactNode; }

export default function LearnSection({ title, count, seeAll, children }: LearnSectionProps) {
  const { t } = useTranslation();
  return <section className="flex flex-col gap-3">
    <div className="flex items-center gap-2"><h2 className="font-heading text-base font-semibold">{title}</h2><Badge variant="secondary">{count}</Badge>{seeAll ? <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={seeAll}>{t('learn.see_all', 'See all')}</Button> : null}</div>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div>
  </section>;
}

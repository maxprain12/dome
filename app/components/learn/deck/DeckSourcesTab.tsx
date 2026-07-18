import { File02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useTranslation } from 'react-i18next';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
interface DeckSourcesTabProps { sourceIds: string[]; sourceTitles: Record<string, string>; }
export default function DeckSourcesTab({ sourceIds, sourceTitles }: DeckSourcesTabProps) { const { t } = useTranslation(); if (sourceIds.length === 0) return <Empty><EmptyHeader><EmptyTitle>{t('learn.deck_no_sources', 'No linked sources.')}</EmptyTitle><EmptyDescription>{t('learn.deck_no_sources_sub', 'Sources used to generate this content will appear here.')}</EmptyDescription></EmptyHeader></Empty>; return <ItemGroup>{sourceIds.map((id) => <Item key={id} variant="outline"><ItemMedia variant="icon"><HugeiconsIcon icon={File02Icon} /></ItemMedia><ItemContent><ItemTitle>{sourceTitles[id] ?? id.slice(0, 8)}</ItemTitle><ItemDescription>{id}</ItemDescription></ItemContent></Item>)}</ItemGroup>; }

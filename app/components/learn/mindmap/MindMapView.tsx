import { ArrowLeft02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import MindMap from '@/components/studio/MindMap';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { MindMapData, StudioOutput } from '@/types';
import LearnViewerEmpty from '../LearnViewerEmpty';
interface MindMapViewProps { output: StudioOutput; onBack: () => void; }
export default function MindMapView({ output, onBack }: MindMapViewProps) { const { t } = useTranslation(); const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null); const { data, corrupt } = useMemo(() => { if (!output.content) return { data: { nodes: [], edges: [] } as MindMapData, corrupt: false }; try { return { data: JSON.parse(output.content) as MindMapData, corrupt: false }; } catch { return { data: { nodes: [], edges: [] } as MindMapData, corrupt: true }; } }, [output.content]); const selectedNode = (selectedNodeId ? data.nodes.find((node) => node.id === selectedNodeId) : null) ?? data.nodes[0]; if (!data.nodes?.length) return <LearnViewerEmpty onBack={onBack} corrupt={corrupt} />; return <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_280px] lg:grid-rows-[auto_minmax(0,1fr)]"><Button type="button" variant="ghost" size="sm" className="w-fit lg:col-span-2" onClick={onBack}><HugeiconsIcon icon={ArrowLeft02Icon} data-icon="inline-start" />{t('learn.back_to_library', 'Back to library')}</Button><div className="min-h-0 overflow-hidden rounded-2xl border"><MindMap data={data} title={output.title} externalSelection onSelectedNodeChange={setSelectedNodeId} /></div><Card size="sm"><CardHeader><CardTitle>{t('learn.mindmap_details', 'Details')}</CardTitle><CardDescription>{selectedNode?.label ?? output.title}</CardDescription></CardHeader>{selectedNode?.description ? <CardContent><p className="text-sm text-muted-foreground">{selectedNode.description}</p></CardContent> : null}</Card></div>; }

/**
 * Studio shared constants: tile definitions and type icons
 */

import { HugeiconsIcon } from '@hugeicons/react';
import {
  BrainIcon,
  BookOpen01Icon,
  HelpCircleIcon,
  BubbleChatQuestionIcon,
  CalendarRangeIcon,
  TableIcon,
  HeadphonesIcon,
  WalletCardsIcon,
} from '@hugeicons/core-free-icons';
import type { StudioOutputType } from '@/types';

const ICON_SIZE = 20;

export interface StudioTileConfig {
  type: StudioOutputType;
  icon: React.ReactNode;
  title: string;
  description: string;
  criteria?: string;
  comingSoon?: boolean;
}

export const STUDIO_TILES: StudioTileConfig[] = [
  {
    type: 'mindmap',
    icon: <HugeiconsIcon icon={BrainIcon} size={ICON_SIZE} />,
    title: 'Mind Map',
    description: 'Mapa de conceptos',
    criteria:
      'Usa los recursos seleccionados en el panel Fuentes, o los 10 más recientes del proyecto. La IA extrae conceptos clave y los conecta en nodos y aristas.',
  },
  {
    type: 'flashcards',
    icon: <HugeiconsIcon icon={WalletCardsIcon} size={ICON_SIZE} />,
    title: 'Flashcards',
    description: 'Spaced repetition',
    criteria:
      'Crea un mazo con preguntas y respuestas del contenido. Aparece en Studio junto con el resto de materiales.',
  },
  {
    type: 'quiz',
    icon: <HugeiconsIcon icon={HelpCircleIcon} size={ICON_SIZE} />,
    title: 'Quiz',
    description: 'Preguntas tipo test',
    criteria: 'Genera preguntas de opción múltiple o verdadero/falso a partir de los recursos seleccionados.',
  },
  {
    type: 'guide',
    icon: <HugeiconsIcon icon={BookOpen01Icon} size={ICON_SIZE} />,
    title: 'Study Guide',
    description: 'Guía estructurada',
    criteria: 'Resume el contenido en secciones organizadas con markdown.',
  },
  {
    type: 'faq',
    icon: <HugeiconsIcon icon={BubbleChatQuestionIcon} size={ICON_SIZE} />,
    title: 'FAQ',
    description: 'Preguntas y respuestas',
    criteria: 'Crea pares pregunta-respuesta basados en el contenido.',
  },
  {
    type: 'timeline',
    icon: <HugeiconsIcon icon={CalendarRangeIcon} size={ICON_SIZE} />,
    title: 'Timeline',
    description: 'Eventos cronológicos',
    criteria: 'Extrae fechas y eventos del contenido y los ordena cronológicamente.',
  },
  {
    type: 'table',
    icon: <HugeiconsIcon icon={TableIcon} size={ICON_SIZE} />,
    title: 'Data Table',
    description: 'Datos estructurados',
    criteria: 'Interpreta el contenido y genera columnas y filas con datos extraídos.',
  },
  {
    type: 'audio',
    icon: <HugeiconsIcon icon={HeadphonesIcon} size={ICON_SIZE} />,
    title: 'Audio Overview',
    description: 'Resumen en audio',
    comingSoon: true,
  },
];

export const STUDIO_TYPE_ICONS: Record<string, React.ReactNode> = {
  mindmap: <HugeiconsIcon icon={BrainIcon} size={16} />,
  quiz: <HugeiconsIcon icon={HelpCircleIcon} size={16} />,
  guide: <HugeiconsIcon icon={BookOpen01Icon} size={16} />,
  faq: <HugeiconsIcon icon={BubbleChatQuestionIcon} size={16} />,
  timeline: <HugeiconsIcon icon={CalendarRangeIcon} size={16} />,
  table: <HugeiconsIcon icon={TableIcon} size={16} />,
  flashcards: <HugeiconsIcon icon={WalletCardsIcon} size={16} />,
  audio: <HugeiconsIcon icon={HeadphonesIcon} size={16} />,
};

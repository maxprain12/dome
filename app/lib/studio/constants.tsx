/**
 * Studio shared constants: tile definitions and type icons
 */

import {
  Brain,
  BookOpen,
  HelpCircle,
  MessageCircleQuestion,
  CalendarRange,
  Table2,
  Headphones,
  WalletCards,
} from 'lucide-react';
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
    icon: <Brain size={ICON_SIZE} />,
    title: 'Mind Map',
    description: 'Mapa de conceptos',
    criteria:
      'Usa los recursos seleccionados en el panel Fuentes, o los 10 más recientes del proyecto. La IA extrae conceptos clave y los conecta en nodos y aristas.',
  },
  {
    type: 'flashcards',
    icon: <WalletCards size={ICON_SIZE} />,
    title: 'Flashcards',
    description: 'Spaced repetition',
    criteria:
      'Crea un mazo con preguntas y respuestas del contenido. Aparece en Studio junto con el resto de materiales.',
  },
  {
    type: 'quiz',
    icon: <HelpCircle size={ICON_SIZE} />,
    title: 'Quiz',
    description: 'Preguntas tipo test',
    criteria: 'Genera preguntas de opción múltiple o verdadero/falso a partir de los recursos seleccionados.',
  },
  {
    type: 'guide',
    icon: <BookOpen size={ICON_SIZE} />,
    title: 'Study Guide',
    description: 'Guía estructurada',
    criteria: 'Resume el contenido en secciones organizadas con markdown.',
  },
  {
    type: 'faq',
    icon: <MessageCircleQuestion size={ICON_SIZE} />,
    title: 'FAQ',
    description: 'Preguntas y respuestas',
    criteria: 'Crea pares pregunta-respuesta basados en el contenido.',
  },
  {
    type: 'timeline',
    icon: <CalendarRange size={ICON_SIZE} />,
    title: 'Timeline',
    description: 'Eventos cronológicos',
    criteria: 'Extrae fechas y eventos del contenido y los ordena cronológicamente.',
  },
  {
    type: 'table',
    icon: <Table2 size={ICON_SIZE} />,
    title: 'Data Table',
    description: 'Datos estructurados',
    criteria: 'Interpreta el contenido y genera columnas y filas con datos extraídos.',
  },
  {
    type: 'audio',
    icon: <Headphones size={ICON_SIZE} />,
    title: 'Audio Overview',
    description: 'Resumen en audio',
    comingSoon: true,
  },
];

export const STUDIO_TYPE_ICONS: Record<string, React.ReactNode> = {
  mindmap: <Brain size={16} />,
  quiz: <HelpCircle size={16} />,
  guide: <BookOpen size={16} />,
  faq: <MessageCircleQuestion size={16} />,
  timeline: <CalendarRange size={16} />,
  table: <Table2 size={16} />,
  flashcards: <WalletCards size={16} />,
  audio: <Headphones size={16} />,
};

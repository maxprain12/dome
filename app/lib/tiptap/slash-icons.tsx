import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  AtSign,
  ChevronRight,
  ClipboardList,
  Code,
  Columns2,
  Heading1,
  Heading2,
  Heading3,
  Image,
  Info,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Pilcrow,
  Play,
  Sparkles,
  Table2,
  TextQuote,
} from 'lucide-react';

export type SlashIconId =
  | 'text'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'quote'
  | 'bullet-list'
  | 'ordered-list'
  | 'task-list'
  | 'callout'
  | 'toggle'
  | 'code'
  | 'divider'
  | 'columns'
  | 'table'
  | 'ai-spark'
  | 'ai-continue'
  | 'ai-summary'
  | 'image'
  | 'mention'
  | 'embed';

const SLASH_ICON_MAP: Record<SlashIconId, LucideIcon> = {
  text: Pilcrow,
  h1: Heading1,
  h2: Heading2,
  h3: Heading3,
  quote: TextQuote,
  'bullet-list': List,
  'ordered-list': ListOrdered,
  'task-list': ListChecks,
  callout: Info,
  toggle: ChevronRight,
  code: Code,
  divider: Minus,
  columns: Columns2,
  table: Table2,
  'ai-spark': Sparkles,
  'ai-continue': ArrowRight,
  'ai-summary': ClipboardList,
  image: Image,
  mention: AtSign,
  embed: Play,
};

interface SlashCommandIconProps {
  id: SlashIconId;
  size?: number;
}

export function SlashCommandIcon({ id, size = 15 }: SlashCommandIconProps) {
  const Icon = SLASH_ICON_MAP[id];
  return <Icon size={size} strokeWidth={2} aria-hidden />;
}

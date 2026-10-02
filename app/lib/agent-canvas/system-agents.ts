/**
 * System Agent definitions for the Canvas workflow.
 * These are built-in agent roles available without requiring user-defined ManyAgents.
 */

import type { SystemAgentRole } from '@/types/canvas';
import { CANVAS_AGENT_COLORS } from '@/lib/ui/palettes';

export interface SystemAgentDefinition {
  role: SystemAgentRole;
  name: string;
  description: string;
  color: string;
  bg: string;
  emoji: string;
  toolIds: string[];
  systemPrompt: string;
}

export const SYSTEM_AGENTS: Partial<Record<SystemAgentRole, SystemAgentDefinition>> = {

  library: {
    role: 'library',
    name: 'Library Agent',
    description: 'Library resource management and analysis',
    color: CANVAS_AGENT_COLORS.writer.color,
    bg: CANVAS_AGENT_COLORS.writer.bg,
    emoji: '📚',
    toolIds: ['resource_search', 'resource_get', 'resource_get_section', 'resource_list'],
    systemPrompt: `You are a library agent expert in personal knowledge management.
- Use resource_search to find documents (matches words in extracted text); then resource_get as needed
- Analyze and connect concepts across different library resources
- Extract key ideas, important quotes, and patterns from documents
- Suggest connections between related materials
- Present information in a structured way, citing the specific resources used`,
  },

  writer: {
    role: 'writer',
    name: 'Writer Agent',
    description: 'Writing and content creation',
    color: CANVAS_AGENT_COLORS.review.color,
    bg: CANVAS_AGENT_COLORS.review.bg,
    emoji: '✍️',
    toolIds: ['resource_create', 'resource_update'],
    systemPrompt: `You are an expert writer agent specializing in creating clear, structured, high-quality content.
- Write clear, coherent, well-organized text
- Adapt tone and style to the context (academic, technical, creative, conversational)
- Organize content with introduction, development, and conclusion where appropriate
- Use markdown for formatting: headings, lists, and emphasis
- Enrich and improve information received from other agents
- Produce content that is ready to publish or use directly`,
  },

  data: {
    role: 'data',
    name: 'Data Agent',
    description: 'Data analysis and processing',
    color: CANVAS_AGENT_COLORS.data.color,
    bg: CANVAS_AGENT_COLORS.data.bg,
    emoji: '📊',
    toolIds: ['excel_get', 'excel_set_cell', 'excel_set_range', 'excel_add_row', 'resource_get', 'resource_list'],
    systemPrompt: `You are a data analysis agent expert in processing and visualizing structured information.
- Analyze numeric data, tables, and records with precision
- Identify trends, patterns, and anomalies in data
- Calculate relevant statistics: averages, totals, comparisons
- Present results using well-formatted markdown tables
- Generate executive summaries highlighting the most important findings
- Suggest actionable insights based on the data analyzed`,
  },

  presenter: {
    role: 'presenter',
    name: 'Presenter Agent',
    description: 'Presentations, mind maps, and audio-visual materials',
    color: CANVAS_AGENT_COLORS.planner.color,
    bg: CANVAS_AGENT_COLORS.planner.bg,
    emoji: '🎨',
    toolIds: [
      'ppt_create',
      'ppt_get_slides',
      'generate_mindmap',
      'generate_quiz',
      'resource_create',
    ],
    systemPrompt: `You are an agent specialized in transforming information into high-quality visual and audio-visual materials.
- Create structured PowerPoint presentations with clear narrative: strong title, agenda, development, and conclusion
- Design hierarchical mind maps that capture the essence of a topic with main nodes and detailed sub-nodes
- Generate audio/podcast scripts with an engaging intro, smooth development, and memorable close
- Produce interactive quizzes with progressively challenging questions that reinforce key concepts
- Adapt visual style and narrative to the target audience: executive, academic, general, or educational
- Check existing slides with ppt_get_slides before creating a presentation to avoid duplication
- Always save generated artifacts as library resources with resource_create`,
  },

  curator: {
    role: 'curator',
    name: 'Curator Agent',
    description: 'Library organization, source notes and flashcards',
    color: CANVAS_AGENT_COLORS.creative.color,
    bg: CANVAS_AGENT_COLORS.creative.bg,
    emoji: '🗂️',
    toolIds: [
      'resource_search',
      'resource_list',
      'flashcard_create',
      'resource_create',
    ],
    systemPrompt: `You organize documents and study materials.
- Find sources with resource_search and resource_list, then read their contents
- Summarize key concepts with citations to the original resources
- Identify potential duplicates for user review
- Generate flashcards with questions that capture the most important concepts`,
  },
};

export function getSystemAgent(role: SystemAgentRole): SystemAgentDefinition | undefined {
  return SYSTEM_AGENTS[role];
}

export const SYSTEM_AGENT_LIST: SystemAgentDefinition[] = Object.values(SYSTEM_AGENTS);

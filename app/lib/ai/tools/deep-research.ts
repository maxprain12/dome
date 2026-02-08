/**
 * Deep Research Tool
 *
 * Tool for orchestrating deep research on a topic using web search
 * and content analysis. This tool instructs the AI agent to create
 * a research plan, gather information via web_search and web_fetch,
 * and synthesize findings into a structured report.
 */

import { Type } from '@sinclair/typebox';
import type { AnyAgentTool } from './types';
import { jsonResult, readStringParam } from './common';

// =============================================================================
// Constants
// =============================================================================

const VALID_DEPTHS = ['quick', 'standard', 'comprehensive'] as const;

// =============================================================================
// Schemas
// =============================================================================

const DeepResearchSchema = Type.Object({
  topic: Type.String({
    description: 'The research topic or question to investigate.',
  }),
  depth: Type.Optional(
    Type.String({
      description:
        "Research depth: 'quick' (3-5 sources), 'standard' (8-12 sources), 'comprehensive' (15+ sources). Default: 'standard'.",
    }),
  ),
});

// =============================================================================
// Helpers
// =============================================================================

function validateDepth(value: string | undefined): 'quick' | 'standard' | 'comprehensive' {
  if (!value) return 'standard';
  const normalized = value.toLowerCase().trim();
  if (VALID_DEPTHS.includes(normalized as typeof VALID_DEPTHS[number])) {
    return normalized as 'quick' | 'standard' | 'comprehensive';
  }
  return 'standard';
}

function getSubtopicCount(depth: string): string {
  switch (depth) {
    case 'quick':
      return '3-4';
    case 'comprehensive':
      return '6-8';
    default:
      return '4-6';
  }
}

function getSourceCount(depth: string): string {
  switch (depth) {
    case 'quick':
      return '3-5';
    case 'comprehensive':
      return '15+';
    default:
      return '8-12';
  }
}

// =============================================================================
// Tool Factory
// =============================================================================

/**
 * Create a tool for conducting deep research on a topic.
 */
export function createDeepResearchTool(): AnyAgentTool {
  return {
    label: 'Deep Research',
    name: 'deep_research',
    description:
      'Conduct deep research on a topic using web search and content analysis. ' +
      'This tool initiates a multi-step research process: first it creates a research plan with subtopics, ' +
      'then uses web_search and web_fetch tools to gather information from multiple sources, ' +
      'and finally synthesizes findings into a structured report with sections and citations. ' +
      'Use this when the user asks for in-depth analysis, a research report, or comprehensive information on a topic.',
    parameters: DeepResearchSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const topic = readStringParam(params, 'topic') || 'General topic';
      const depth = validateDepth(readStringParam(params, 'depth'));

      const subtopicCount = getSubtopicCount(depth);
      const sourceCount = getSourceCount(depth);

      return jsonResult({
        status: 'success',
        message:
          `Research initiated on: "${topic}" at ${depth} depth. ` +
          'Create a research plan with subtopics, then use web_search and web_fetch tools to gather information. ' +
          'After gathering data, synthesize findings into a structured report with type: "deep_research".',
        topic,
        depth,
        instructions: {
          plan: `List ${subtopicCount} subtopics to investigate based on the topic`,
          search: 'Use web_search for each subtopic to find relevant sources',
          fetch: 'Use web_fetch to read key pages and extract detailed information',
          report:
            `Synthesize into a structured report with sections and ${sourceCount} source citations. ` +
            'Include an Executive Summary, Key Findings, Detailed Analysis per subtopic, and a Sources section.',
        },
        output_format: {
          type: 'deep_research',
          schema: {
            title: 'string',
            sections: '[{ id: string, heading: string, content: string (markdown) }]',
            sources: '[{ id: string, title: string, url?: string, snippet: string }]',
          },
        },
      });
    },
  };
}

// =============================================================================
// Bundle Export
// =============================================================================

/**
 * Create all deep research tools.
 */
export function createDeepResearchTools(): AnyAgentTool[] {
  return [createDeepResearchTool()];
}

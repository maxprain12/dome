/**
 * PostHog event names and property keys for Dome analytics
 */

export const ANALYTICS_EVENTS = {
  PAGEVIEW: '$pageview',
  RESOURCE_IMPORTED: 'resource_imported',
  RESOURCE_CREATED: 'resource_created',
  SEARCH_PERFORMED: 'search_performed',
  PROJECT_CREATED: 'project_created',
  PROJECT_SWITCHED: 'project_switched',
  AI_CHAT_STARTED: 'ai_chat_started',
  AI_CHAT_COMPLETED: 'ai_chat_completed',
  AI_TOOL_INVOKED: 'ai_tool_invoked',
  STUDIO_GENERATED: 'studio_generated',
  EXCEPTION: '$exception',
} as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

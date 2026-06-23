/**
 * Per-section "How to use" guides.
 *
 * Each entry drives the section guide modal (opened via `SectionGuideHelp` next
 * to the section title). `titleKey` and
 * each `stepKeys` entry are i18n keys (namespace `sectionGuide`).
 */

export interface SectionGuide {
  /** Stable section key; also the persistence key in `section_tours_dismissed`. */
  key: string;
  titleKey: string;
  stepKeys: string[];
}

export const SECTION_GUIDES: Record<string, SectionGuide> = {
  learn: {
    key: 'learn',
    titleKey: 'sectionGuide.learn.title',
    stepKeys: ['sectionGuide.learn.step1', 'sectionGuide.learn.step2', 'sectionGuide.learn.step3'],
  },
  agents: {
    key: 'agents',
    titleKey: 'sectionGuide.agents.title',
    stepKeys: ['sectionGuide.agents.step1', 'sectionGuide.agents.step2', 'sectionGuide.agents.step3'],
  },
  automations: {
    key: 'automations',
    titleKey: 'sectionGuide.automations.title',
    stepKeys: ['sectionGuide.automations.step1', 'sectionGuide.automations.step2', 'sectionGuide.automations.step3'],
  },
  github: {
    key: 'github',
    titleKey: 'sectionGuide.github.title',
    stepKeys: ['sectionGuide.github.step1', 'sectionGuide.github.step2', 'sectionGuide.github.step3'],
  },
  calendar: {
    key: 'calendar',
    titleKey: 'sectionGuide.calendar.title',
    stepKeys: ['sectionGuide.calendar.step1', 'sectionGuide.calendar.step2', 'sectionGuide.calendar.step3'],
  },
  pipelines: {
    key: 'pipelines',
    titleKey: 'sectionGuide.pipelines.title',
    stepKeys: ['sectionGuide.pipelines.step1', 'sectionGuide.pipelines.step2', 'sectionGuide.pipelines.step3'],
  },
};

export function getSectionGuide(key: string): SectionGuide | undefined {
  return SECTION_GUIDES[key];
}

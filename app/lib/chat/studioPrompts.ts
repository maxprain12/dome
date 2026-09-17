import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { IconSvgElement } from '@hugeicons/react';
import {
  BarChartIcon,
  Bookmark01Icon,
  File02Icon,
  Megaphone02Icon,
  Search01Icon,
  UserMultiple02Icon,
} from '@hugeicons/core-free-icons';
import type { SocialSection } from '@/components/social/workspace/socialWorkspaceTypes';
import type { ChatSuggestionItem } from '@/components/chat/ChatSuggestionPills';
import { askStudioMany } from '@/components/studio-hub/askStudioMany';
import { looksLikeOpaqueId } from '@/lib/social/socialQueues';
import { installBundledSkill, listSkills } from '@/lib/skills/client';
import { useManyStore } from '@/lib/store/useManyStore';

export type StudioPromptSurface = 'many' | 'agent-chat' | 'social';
export type SocialSkillId = 'dome-social-insights' | 'dome-social-operations';

export type StudioPromptContext = {
  surface: StudioPromptSurface;
  socialSection?: SocialSection;
  accountHandle?: string | null;
  selectedTitle?: string | null;
  hasAccounts?: boolean;
  t: TFunction;
  onFill?: (text: string, skillId?: string) => void;
  installedSkillIds?: Set<string>;
  onInstallSkill?: (skillId: SocialSkillId, text: string) => void;
};

type PromptDef = {
  id: string;
  labelKey: string;
  promptKey: string;
  icon: IconSvgElement;
  skillId?: SocialSkillId;
  surfaces: StudioPromptSurface[];
  sections?: SocialSection[];
};

const SKILL_NAME_KEYS: Record<SocialSkillId, string> = {
  'dome-social-insights': 'social.prompts.skill_insights',
  'dome-social-operations': 'social.prompts.skill_operations',
};

const PROMPTS: PromptDef[] = [
  {
    id: 'add_competitor',
    labelKey: 'social.prompts.add_competitor',
    promptKey: 'social.prompts.add_competitor_text',
    icon: UserMultiple02Icon,
    skillId: 'dome-social-insights',
    surfaces: ['many', 'social', 'agent-chat'],
    sections: ['references', 'overview'],
  },
  {
    id: 'analyze_profile',
    labelKey: 'social.prompts.analyze_profile',
    promptKey: 'social.prompts.analyze_profile_text',
    icon: Search01Icon,
    skillId: 'dome-social-insights',
    surfaces: ['many', 'social', 'agent-chat'],
  },
  {
    id: 'save_reference',
    labelKey: 'social.prompts.save_reference',
    promptKey: 'social.prompts.save_reference_text',
    icon: Bookmark01Icon,
    skillId: 'dome-social-insights',
    surfaces: ['many', 'social'],
    sections: ['references', 'content'],
  },
  {
    id: 'breakdown_post',
    labelKey: 'social.prompts.breakdown_post',
    promptKey: 'social.prompts.breakdown_post_text',
    icon: File02Icon,
    skillId: 'dome-social-insights',
    surfaces: ['many', 'social', 'agent-chat'],
    sections: ['content', 'references'],
  },
  {
    id: 'compare_watchlist',
    labelKey: 'social.prompts.compare_watchlist',
    promptKey: 'social.prompts.compare_watchlist_text',
    icon: BarChartIcon,
    skillId: 'dome-social-insights',
    surfaces: ['many', 'social'],
    sections: ['references', 'trends', 'insights'],
  },
  {
    id: 'find_patterns',
    labelKey: 'social.prompts.find_patterns',
    promptKey: 'social.prompts.find_patterns_text',
    icon: BarChartIcon,
    skillId: 'dome-social-insights',
    surfaces: ['many', 'social'],
    sections: ['references', 'trends', 'insights'],
  },
  {
    id: 'explore_trends',
    labelKey: 'social.prompts.explore_trends',
    promptKey: 'social.prompts.explore_trends_text',
    icon: BarChartIcon,
    skillId: 'dome-social-insights',
    surfaces: ['many', 'social'],
    sections: ['trends', 'overview'],
  },
  {
    id: 'campaign_from_refs',
    labelKey: 'social.prompts.campaign_from_refs',
    promptKey: 'social.prompts.campaign_from_refs_text',
    icon: Megaphone02Icon,
    skillId: 'dome-social-operations',
    surfaces: ['many', 'social'],
    sections: ['campaigns', 'references'],
  },
  {
    id: 'improve_hook',
    labelKey: 'social.prompts.improve_hook',
    promptKey: 'social.prompts.improve_hook_text',
    icon: Megaphone02Icon,
    skillId: 'dome-social-operations',
    surfaces: ['many', 'social', 'agent-chat'],
    sections: ['content', 'campaigns'],
  },
];

function fillLabel(raw: string, handle?: string | null, title?: string | null): string {
  const safeHandle = handle && !looksLikeOpaqueId(handle) ? handle : '';
  const safeTitle = title && !looksLikeOpaqueId(title) ? title : '';
  return raw.replaceAll('{{handle}}', safeHandle).replaceAll('{{title}}', safeTitle);
}

function applyPrompt(ctx: StudioPromptContext, text: string, skillId?: SocialSkillId, installed = false): void {
  const activeSkill = skillId && installed ? skillId : undefined;
  if (activeSkill && ctx.surface === 'many') {
    useManyStore.getState().setPendingOneShotSkill(activeSkill);
  }
  if (ctx.onFill) {
    ctx.onFill(text, activeSkill);
    return;
  }
  askStudioMany(text, null, activeSkill);
}

export function resolveStudioPrompts(ctx: StudioPromptContext): ChatSuggestionItem[] {
  const installed = ctx.installedSkillIds ?? new Set<string>();
  return PROMPTS
    .filter((prompt) => prompt.surfaces.includes(ctx.surface))
    .filter((prompt) => !prompt.sections || !ctx.socialSection || prompt.sections.includes(ctx.socialSection))
    .slice(0, 6)
    .map((prompt) => {
      const text = fillLabel(ctx.t(prompt.promptKey), ctx.accountHandle, ctx.selectedTitle);
      const skillInstalled = !prompt.skillId || installed.has(prompt.skillId);
      const skillName = prompt.skillId ? ctx.t(SKILL_NAME_KEYS[prompt.skillId]) : '';
      return {
        id: prompt.id,
        label: ctx.t(prompt.labelKey),
        icon: prompt.icon,
        skillId: prompt.skillId,
        skillInstalled,
        skillRecommend: prompt.skillId
          ? ctx.t('social.prompts.skill_recommend', { skill: skillName })
          : undefined,
        installLabel: ctx.t('social.prompts.install_skill'),
        continueLabel: ctx.t('social.prompts.continue_without'),
        onClick: () => {
          if (prompt.skillId && !skillInstalled) return;
          applyPrompt(ctx, text, prompt.skillId, skillInstalled);
        },
        onInstallSkill: prompt.skillId
          ? () => {
              ctx.onInstallSkill?.(prompt.skillId as SocialSkillId, text);
            }
          : undefined,
        onContinueWithoutSkill: () => applyPrompt(ctx, text),
      };
    });
}

export function useStudioPromptItems(
  ctx: Omit<StudioPromptContext, 't' | 'installedSkillIds' | 'onInstallSkill'>,
): ChatSuggestionItem[] {
  const { t } = useTranslation();
  const [installedSkillIds, setInstalledSkillIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    listSkills()
      .then((res) => {
        if (cancelled || !res.success || !res.data) return;
        setInstalledSkillIds(new Set(res.data.map((skill) => skill.id)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return resolveStudioPrompts({
    ...ctx,
    t,
    installedSkillIds,
    onInstallSkill: (skillId, text) => {
      installBundledSkill(skillId)
        .then((result) => {
          if (!result.success) return;
          setInstalledSkillIds((prev) => new Set([...prev, skillId]));
          applyPrompt({ ...ctx, t, installedSkillIds }, text, skillId, true);
        })
        .catch(() => {});
    },
  });
}

import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  AppModal,
  AppModalBody,
  AppModalContent,
  AppModalFooter,
  AppModalHeader,
} from '@/components/shared/AppModal';
import { getToolDisplayLabelForCall } from '@/lib/chat/toolDisplayLabels';
import { focusEmail, focusGithubIssue, focusSocialPost } from '@/lib/store/useOpenIntentStore';
import { useInspectStore, type InspectPinKind, type InspectTarget } from '@/lib/store/useInspectStore';
import { useTabStore } from '@/lib/store/useTabStore';
import { PersonPeekBody } from './PersonPeekBody';
import { ToolPeekBody } from './ToolPeekBody';

function entityActionLabel(pinKind: InspectPinKind | undefined, t: (key: string) => string): string {
  if (pinKind === 'email') return t('inspect.open_email');
  if (pinKind === 'issue') return t('inspect.open_issue');
  if (pinKind === 'social_post') return t('inspect.open_social');
  return t('inspect.open_entity');
}

function openEntity(target: Extract<InspectTarget, { kind: 'entity' }>): void {
  if (target.pinKind === 'email') {
    useTabStore.getState().openEmailTab();
    focusEmail({ sourceId: target.id });
    return;
  }
  if (target.pinKind === 'issue') {
    useTabStore.getState().openGitHubTab();
    focusGithubIssue({ issueId: target.id });
    return;
  }
  if (target.pinKind === 'social_post') {
    useTabStore.getState().openSocialTab();
    focusSocialPost({ postId: target.id });
    return;
  }
  useTabStore.getState().openResourceTab(target.id, target.entityType, target.title);
}

function dialogTitle(target: InspectTarget | null, t: (key: string) => string): string {
  if (!target) return '';
  if (target.kind === 'person') return target.title?.trim() || t('inspect.person_title');
  if (target.kind === 'entity') return target.title || t('inspect.entity_title');
  return getToolDisplayLabelForCall(target.toolCall, t) || t('inspect.tool_title');
}

export function EntityPeekDialog() {
  const { t } = useTranslation();
  const target = useInspectStore((s) => s.target);
  const close = useInspectStore((s) => s.close);

  return (
    <AppModal open={target != null} onOpenChange={(open) => { if (!open) close(); }}>
      <AppModalContent size={target?.kind === 'tool' ? 'lg' : 'md'}>
        <AppModalHeader title={dialogTitle(target, t)} />
        <AppModalBody>
          {target?.kind === 'person' ? <PersonPeekBody personId={target.personId} /> : null}
          {target?.kind === 'tool' ? <ToolPeekBody toolCall={target.toolCall} /> : null}
          {target?.kind === 'entity' ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">{target.title}</p>
              <p className="text-xs text-muted-foreground">{target.entityType}</p>
            </div>
          ) : null}
        </AppModalBody>
        {target?.kind === 'entity' ? (
          <AppModalFooter>
            <Button type="button" variant="outline" onClick={close}>
              {t('people.cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => {
                openEntity(target);
                close();
              }}
            >
              {entityActionLabel(target.pinKind, t)}
            </Button>
          </AppModalFooter>
        ) : null}
      </AppModalContent>
    </AppModal>
  );
}

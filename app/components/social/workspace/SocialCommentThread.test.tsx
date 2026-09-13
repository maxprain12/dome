import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import type { SocialComment, SocialPost } from '@/components/social/socialTypes';
import { useManyStore } from '@/lib/store/useManyStore';
import { useOpenIntentStore } from '@/lib/store/useOpenIntentStore';
import { useTabStore } from '@/lib/store/useTabStore';
import {
  commentAuthorLabel,
  patchCommentTree,
  SocialCommentThread,
} from './SocialCommentThread';

const post: SocialPost = {
  id: 'sp-1',
  accountId: 'acc-1',
  provider: 'instagram',
  status: 'published',
  body: 'Hola mundo Dome',
  media: [],
  linkUrl: null,
  topics: [],
  campaign: null,
  scheduledAt: null,
  publishedAt: 1,
  externalPostId: 'ig-1',
  externalUrl: null,
  error: null,
  createdBy: 'user',
  groupId: null,
  createdAt: 1,
  updatedAt: 1,
};

function comment(partial: Partial<SocialComment> = {}): SocialComment {
  return {
    id: 'c1',
    text: 'mira el Alder que cositas hace',
    authorName: 'samuel__2001',
    authorExternalId: '17841400000000',
    createdAt: Date.now(),
    permalink: null,
    replies: [],
    ...partial,
  };
}

describe('SocialCommentThread', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('es');
    useManyStore.setState({ isOpen: false, pendingManyHandoff: null, pinnedResources: [] });
    Object.assign(window.electron, {
      people: {
        upsertIdentity: vi.fn().mockResolvedValue({
          success: true,
          data: { person: { id: 'person-1', displayName: 'Samuel' } },
        }),
        linkIdentity: vi.fn().mockResolvedValue({ success: true }),
        get: vi.fn().mockImplementation(async ({ id }: { id: string }) => ({
          success: true,
          data: {
            person: {
              id,
              displayName: 'Samuel',
              primaryEmail: 'samuel@example.com',
              identities: [
                { source: 'social_instagram', externalId: 'samuel__2001', displayLabel: 'samuel__2001' },
              ],
              profile: {},
            },
          },
        })),
      },
    });
    vi.mocked(window.electron.invoke).mockResolvedValue({ success: true, data: { id: 'reply-1' } });
    useOpenIntentStore.setState({ intent: null });
  });

  it('nests replies and badges an existing contact without painting ids', () => {
    render(
      <ul>
        <SocialCommentThread
          post={post}
          comment={comment({
            personId: 'person-9',
            personDisplayName: 'Samuel',
            authorExternalId: '17841499999999',
            replies: [
              comment({
                id: 'c2',
                text: 'Revisa tu DM',
                authorName: 'dome_ia',
                authorExternalId: null,
                personId: null,
              }),
            ],
          })}
          projectId="default"
          language="es"
          onCommentPatched={vi.fn()}
        />
      </ul>,
    );

    expect(screen.getByText('Samuel')).toBeVisible();
    expect(screen.getByText('Contacto')).toBeVisible();
    expect(screen.getByText('Revisa tu DM')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ver contacto' })).toBeVisible();
    expect(screen.queryByText('person-9')).not.toBeInTheDocument();
    expect(screen.queryByText('17841499999999')).not.toBeInTheDocument();
  });

  it('shows the contact card on the comment without leaving the post', async () => {
    const user = userEvent.setup();
    render(
      <ul>
        <SocialCommentThread
          post={post}
          comment={comment({
            personId: 'person-9',
            personDisplayName: 'Samuel',
          })}
          projectId="default"
          language="es"
          onCommentPatched={vi.fn()}
        />
      </ul>,
    );

    await user.click(screen.getByRole('button', { name: 'Ver contacto' }));
    expect(await screen.findByText('samuel@example.com')).toBeVisible();
    expect(screen.getByText('samuel__2001')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ver más' })).toBeVisible();
    expect(window.electron.people.get).toHaveBeenCalledWith({
      id: 'person-9',
      includeInteractions: true,
    });

    const openPeopleTab = vi.spyOn(useTabStore.getState(), 'openPeopleTab');
    await user.click(screen.getByRole('button', { name: 'Ver más' }));
    await waitFor(() => {
      expect(openPeopleTab).toHaveBeenCalled();
    });
    expect(useOpenIntentStore.getState().intent).toMatchObject({
      kind: 'person',
      personId: 'person-9',
    });
    openPeopleTab.mockRestore();
  });

  it('creates a contact from the comment author handle', async () => {
    const user = userEvent.setup();
    const onCommentPatched = vi.fn();
    render(
      <ul>
        <SocialCommentThread
          post={post}
          comment={comment()}
          projectId="vault-1"
          language="es"
          onCommentPatched={onCommentPatched}
        />
      </ul>,
    );

    await user.click(screen.getByRole('button', { name: 'Añadir contacto' }));
    await waitFor(() => {
      expect(window.electron.people.upsertIdentity).toHaveBeenCalledWith({
        projectId: 'vault-1',
        source: 'instagram',
        externalId: 'samuel__2001',
        displayName: 'samuel__2001',
        displayLabel: 'samuel__2001',
      });
    });
    expect(onCommentPatched).toHaveBeenCalledWith('c1', {
      personId: 'person-1',
      personDisplayName: 'Samuel',
    });
  });

  it('posts a public reply onto the thread', async () => {
    const user = userEvent.setup();
    const onCommentPatched = vi.fn();
    render(
      <ul>
        <SocialCommentThread
          post={post}
          comment={comment()}
          projectId="default"
          language="es"
          onCommentPatched={onCommentPatched}
        />
      </ul>,
    );

    await user.click(screen.getByRole('button', { name: 'Responder' }));
    await user.type(screen.getByLabelText('Responder'), 'Gracias por el comentario');
    await user.click(screen.getByRole('button', { name: 'Publicar respuesta' }));

    await waitFor(() => {
      expect(window.electron.invoke).toHaveBeenCalledWith('social:comments:reply', {
        postId: 'sp-1',
        commentId: 'c1',
        text: 'Gracias por el comentario',
      });
    });
    expect(onCommentPatched).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({
        replies: [expect.objectContaining({ text: 'Gracias por el comentario', authorName: 'Tú' })],
      }),
    );
  });

  it('hands the profile to Many', async () => {
    const user = userEvent.setup();
    render(
      <ul>
        <SocialCommentThread
          post={post}
          comment={comment({ personId: 'person-1', personDisplayName: 'Samuel' })}
          projectId="default"
          language="es"
          onCommentPatched={vi.fn()}
        />
      </ul>,
    );

    await user.click(screen.getByRole('button', { name: 'Preguntar a Many' }));
    expect(useManyStore.getState().isOpen).toBe(true);
    expect(useManyStore.getState().pendingManyHandoff).toMatch(/Samuel|samuel__2001/);
  });

  it('labels the connected account as you and offers Ver más instead of contact actions', () => {
    render(
      <ul>
        <SocialCommentThread
          post={post}
          comment={comment({
            authorName: 'dome_ia',
            authorExternalId: '178414000',
            isOwnAccount: true,
            text: 'Revisa tu DM',
          })}
          projectId="default"
          language="es"
          onCommentPatched={vi.fn()}
        />
      </ul>,
    );

    expect(screen.getByText('dome_ia')).toBeVisible();
    expect(screen.getByText('Tú')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ver más' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Añadir contacto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver contacto' })).not.toBeInTheDocument();
    expect(screen.queryByText('Autor desconocido')).not.toBeInTheDocument();
  });

  it('opens Contacts with the person modal from Ver más on an own reply', async () => {
    const user = userEvent.setup();
    const openPeopleTab = vi.spyOn(useTabStore.getState(), 'openPeopleTab');
    render(
      <ul>
        <SocialCommentThread
          post={post}
          comment={comment({
            id: 'own-1',
            authorName: 'dome_ia',
            authorExternalId: '178414000',
            isOwnAccount: true,
            personId: 'person-own',
            personDisplayName: 'Dome',
            text: 'Revisa tu DM',
          })}
          projectId="default"
          language="es"
          onCommentPatched={vi.fn()}
        />
      </ul>,
    );

    await user.click(screen.getByRole('button', { name: 'Ver más' }));
    await waitFor(() => {
      expect(openPeopleTab).toHaveBeenCalled();
    });
    expect(useOpenIntentStore.getState().intent).toMatchObject({
      kind: 'person',
      personId: 'person-own',
    });
    expect(window.electron.people.upsertIdentity).not.toHaveBeenCalled();
    openPeopleTab.mockRestore();
  });

  it('creates the own-account contact then opens its People modal from Ver más', async () => {
    const user = userEvent.setup();
    const openPeopleTab = vi.spyOn(useTabStore.getState(), 'openPeopleTab');
    const onCommentPatched = vi.fn();
    render(
      <ul>
        <SocialCommentThread
          post={post}
          comment={comment({
            authorName: 'dome_ia',
            authorExternalId: '178414000',
            isOwnAccount: true,
            text: 'Revisa tu DM',
          })}
          projectId="vault-1"
          language="es"
          onCommentPatched={onCommentPatched}
        />
      </ul>,
    );

    await user.click(screen.getByRole('button', { name: 'Ver más' }));
    await waitFor(() => {
      expect(window.electron.people.upsertIdentity).toHaveBeenCalledWith({
        projectId: 'vault-1',
        source: 'instagram',
        externalId: 'dome_ia',
        displayName: 'dome_ia',
        displayLabel: 'dome_ia',
      });
    });
    expect(onCommentPatched).toHaveBeenCalledWith('c1', {
      personId: 'person-1',
      personDisplayName: 'Samuel',
    });
    await waitFor(() => {
      expect(openPeopleTab).toHaveBeenCalled();
    });
    expect(useOpenIntentStore.getState().intent).toMatchObject({
      kind: 'person',
      personId: 'person-1',
    });
    openPeopleTab.mockRestore();
  });
});

describe('comment helpers', () => {
  it('never uses URNs or numeric ids as the visible author', () => {
    expect(
      commentAuthorLabel(
        {
          id: 'c1',
          text: 'hola',
          authorName: null,
          authorExternalId: 'urn:li:person:abc',
          createdAt: null,
          permalink: null,
        },
        'Autor desconocido',
      ),
    ).toBe('Autor desconocido');
  });

  it('patches nested replies in place', () => {
    const tree = [
      comment({
        replies: [comment({ id: 'c2', text: 'hijo', personId: null })],
      }),
    ];
    const next = patchCommentTree(tree, 'c2', { personId: 'p-2', personDisplayName: 'Ana' });
    expect(next[0].replies?.[0].personId).toBe('p-2');
    expect(next[0].replies?.[0].personDisplayName).toBe('Ana');
  });
});

import { useCallback, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, KeyRound, ShieldOff, Trash2, ShieldCheck } from 'lucide-react';
import type { FeederSecretMeta } from '@/lib/feeders/api';
import {
  deleteFeederSecret,
  getFeederVaultStatus,
  listFeederSecrets,
  setFeederSecret,
} from '@/lib/feeders/api';
import DomeModal from '@/components/ui/DomeModal';
import DomeButton from '@/components/ui/DomeButton';
import { DomeInput } from '@/components/ui/DomeInput';
import DomeCallout from '@/components/ui/DomeCallout';
import DomeListState from '@/components/ui/DomeListState';
import { notifications } from '@mantine/notifications';
import { cn } from '@/lib/utils';

type Props = {
  opened: boolean;
  onClose: () => void;
  /** Pre-fill secret name when opened from agent request. */
  initialName?: string;
};

function formatRelative(ts: number | null | undefined): string | null {
  if (!ts) return null;
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h ago`;
  const days = Math.floor(diff / 86_400_000);
  if (days < 30) return `${days} d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function SecretsManager({ opened, onClose, initialName }: Props) {
  const { t } = useTranslation();
  const passwordInputId = useId();
  const [secrets, setSecrets] = useState<FeederSecretMeta[]>([]);
  const [vaultAvailable, setVaultAvailable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(initialName || '');
  const [value, setValue] = useState('');
  const [showValue, setShowValue] = useState(false);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const status = await getFeederVaultStatus();
      setVaultAvailable(!!status.data?.available);
      if (!status.data?.available) {
        setSecrets([]);
        return;
      }
      const res = await listFeederSecrets();
      if (res.success && res.data) setSecrets(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  const [prevOpened, setPrevOpened] = useState(opened);
  const [prevInitialName, setPrevInitialName] = useState(initialName);
  if (opened !== prevOpened || initialName !== prevInitialName) {
    setPrevOpened(opened);
    setPrevInitialName(initialName);
    if (opened) {
      setName(initialName || '');
      setValue('');
      setShowValue(false);
    }
  }

  useEffect(() => {
    if (!opened) return;
    void reload();
  }, [opened, initialName, reload]);

  const handleSave = async () => {
    if (!name.trim() || !value) return;
    setSaving(true);
    try {
      const res = await setFeederSecret(name.trim(), value);
      if (res.success) {
        notifications.show({ message: t('feeders.secret_saved'), color: 'green' });
        setValue('');
        setShowValue(false);
        await reload();
      } else {
        notifications.show({ message: res.error ?? t('feeders.secret_save_error'), color: 'red' });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (secretId: string) => {
    const res = await deleteFeederSecret(secretId);
    if (res.success) {
      notifications.show({ message: t('feeders.secret_deleted'), color: 'green' });
      await reload();
    } else {
      notifications.show({ message: res.error ?? 'Error', color: 'red' });
    }
  };

  const canSave = name.trim().length > 0 && value.length > 0 && !saving;

  return (
    <DomeModal
      open={opened}
      onClose={onClose}
      title={t('feeders.secrets_title')}
      size="md"
      footer={
        <DomeButton variant="ghost" onClick={onClose}>
          {t('common.close')}
        </DomeButton>
      }
    >
      {!vaultAvailable ? (
        <DomeCallout tone="error" title={t('feeders.vault_unavailable_title', { defaultValue: 'Encrypted vault unavailable' })}>
          {t('feeders.vault_unavailable')}
        </DomeCallout>
      ) : (
        <div className="flex flex-col gap-4">
          <DomeCallout tone="info" icon={ShieldCheck} title="Auto-injected into feeders">
            {t('feeders.secrets_hint')}
            <br />
            <span className="text-[var(--secondary-text)]">
              Every secret here is exposed to feeder scripts as{' '}
              <code className="font-mono text-[var(--accent)]">process.env.&lt;name&gt;</code>{' '}
              automatically. Names are case-sensitive.
            </span>
          </DomeCallout>

          <div className="flex flex-col gap-3">
            <DomeInput
              label={t('feeders.secret_name')}
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder="IDRAC_PASSWORD"
              hint={t('feeders.secret_name_hint', {
                defaultValue: 'Referenced from scripts as process.env.NAME (case-sensitive).',
              })}
            />

            <div className="flex flex-col gap-1.5 min-w-0">
              <label
                htmlFor={passwordInputId}
                className="text-xs font-medium text-[var(--primary-text)]"
              >
                {t('feeders.secret_value')}
              </label>
              <div className="relative">
                <input
                  id={passwordInputId}
                  type={showValue ? 'text' : 'password'}
                  value={value}
                  onChange={(e) => setValue(e.currentTarget.value)}
                  className="input pr-10"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={() => setShowValue((v) => !v)}
                  className={cn(
                    'absolute right-2 top-1/2 -translate-y-1/2',
                    'inline-flex items-center justify-center p-1 rounded',
                    'text-[var(--secondary-text)] hover:text-[var(--primary-text)]',
                    'hover:bg-[var(--bg-hover)] transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
                  )}
                  aria-label={showValue ? 'Hide value' : 'Show value'}
                  tabIndex={-1}
                >
                  {showValue ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              </div>
            </div>

            <DomeButton
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={!canSave}
              loading={saving}
              leftIcon={<KeyRound className="size-3.5" />}
            >
              {t('feeders.secret_save')}
            </DomeButton>
          </div>

          <div className="border-t border-[var(--border-soft)] pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--secondary-text)]">
                {t('feeders.secrets_list')}
              </p>
              {secrets.length > 0 ? (
                <span className="text-xs text-[var(--secondary-text)]">{secrets.length}</span>
              ) : null}
            </div>

            {loading ? (
              <DomeListState variant="loading" compact />
            ) : secrets.length === 0 ? (
              <DomeListState
                variant="empty"
                compact
                icon={<ShieldOff className="size-5 text-[var(--secondary-text)]" />}
                description={t('feeders.secrets_empty')}
              />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {secrets.map((s) => {
                  const lastUsed = formatRelative(s.lastUsedAt);
                  return (
                    <li
                      key={s.id}
                      className={cn(
                        'flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5',
                        'border-[var(--border)] bg-[var(--bg)]',
                        'hover:bg-[var(--bg-hover)] transition-colors',
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <KeyRound
                          className="size-3.5 shrink-0 text-[var(--accent)]"
                          aria-hidden
                        />
                        <code className="text-xs font-mono text-[var(--primary-text)] truncate">
                          {s.name}
                        </code>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {lastUsed ? (
                          <span className="text-[10px] text-[var(--secondary-text)]">
                            {lastUsed}
                          </span>
                        ) : null}
                        <DomeButton
                          variant="ghost"
                          size="xs"
                          iconOnly
                          onClick={() => void handleDelete(s.id)}
                          aria-label={t('common.delete')}
                          className="text-[var(--secondary-text)] hover:text-[var(--error)]"
                        >
                          <Trash2 className="size-3.5" />
                        </DomeButton>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </DomeModal>
  );
}

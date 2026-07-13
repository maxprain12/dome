import { HugeiconsIcon } from '@hugeicons/react';
import {
  EyeIcon,
  EyeOffIcon,
  Key01Icon,
  SecurityBlockIcon,
  Delete02Icon,
  SecurityCheckIcon,
  AlertCircleIcon,
} from '@hugeicons/core-free-icons';
import { useCallback, useEffect, useId, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import type { FeederSecretMeta } from '@/lib/feeders/api';
import {
  deleteFeederSecret,
  getFeederVaultStatus,
  listFeederSecrets,
  setFeederSecret,
} from '@/lib/feeders/api';
import ListState from '@/components/shared/ListState';
import { notifications } from '@/lib/notifications';
import { cn } from '@/lib/utils';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
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

  const prevOpenedRef = useRef(opened);
  const prevInitialNameRef = useRef(initialName);
  if (opened !== prevOpenedRef.current || initialName !== prevInitialNameRef.current) {
    prevOpenedRef.current = opened;
    prevInitialNameRef.current = initialName;
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
    <Dialog open={opened} onOpenChange={(next) => { if (!next) (onClose)(); }}><DialogContent className="flex max-h-[min(90vh,640px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md"><DialogHeader className="flex shrink-0 flex-row items-center justify-between gap-3 border-b px-4 py-3"><div className="flex min-w-0 items-center gap-3"><div className="min-w-0"><DialogTitle className="truncate">{t('feeders.secrets_title')}</DialogTitle></div></div></DialogHeader><div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      {!vaultAvailable ? (
        <Alert variant="destructive" role="note"><HugeiconsIcon icon={AlertCircleIcon} aria-hidden /><AlertTitle className="text-xs">{t('feeders.vault_unavailable_title', { defaultValue: 'Encrypted vault unavailable' })}</AlertTitle><AlertDescription className="text-xs">
          {t('feeders.vault_unavailable')}
        </AlertDescription></Alert>
      ) : (
        <div className="flex flex-col gap-4">
          <Alert role="note"><HugeiconsIcon icon={SecurityCheckIcon} aria-hidden /><AlertTitle className="text-xs">Auto-injected into feeders</AlertTitle><AlertDescription className="text-xs">
            {t('feeders.secrets_hint')}
            <br />
            <span className="text-muted-foreground">
              Every secret here is exposed to feeder scripts as{' '}
              <code className="font-mono text-primary">process.env.&lt;name&gt;</code>{' '}
              automatically. Names are case-sensitive.
            </span>
          </AlertDescription></Alert>

          <div className="flex flex-col gap-3">
            <Field className="gap-1.5"><FieldLabel htmlFor="fld-input-11" className="text-xs">{t('feeders.secret_name')}</FieldLabel><Input id="fld-input-11" value={name} onChange={(e) => setName(e.currentTarget.value)} placeholder="IDRAC_PASSWORD" /><FieldDescription className="text-xs">{t('feeders.secret_name_hint', {
                defaultValue: 'Referenced from scripts as process.env.NAME (case-sensitive).',
              })}</FieldDescription></Field>

            <div className="flex flex-col gap-1.5 min-w-0">
              <label
                htmlFor={passwordInputId}
                className="text-xs font-medium text-foreground"
              >
                {t('feeders.secret_value')}
              </label>
              <div className="relative">
                <Input
                  id={passwordInputId}
                  type={showValue ? 'text' : 'password'}
                  value={value}
                  onChange={(e) => setValue(e.currentTarget.value)}
                  className="pr-10"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={() => setShowValue((v) => !v)}
                  className={cn(
                    'absolute right-2 top-1/2 -translate-y-1/2',
                    'inline-flex items-center justify-center p-1 rounded',
                    'text-muted-foreground hover:text-foreground',
                    'hover:bg-accent transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  )}
                  aria-label={showValue ? 'Hide value' : 'Show value'}
                  tabIndex={-1}
                >
                  {showValue ? <HugeiconsIcon icon={EyeOffIcon} className="size-3.5" /> : <HugeiconsIcon icon={EyeIcon} className="size-3.5" />}
                </button>
              </div>
            </div>

            <Button onClick={handleSave} disabled={!canSave} loading={saving} size="sm">{<HugeiconsIcon icon={Key01Icon} className="size-3.5" />}
              {t('feeders.secret_save')}
            </Button>
          </div>

          <div className="border-t border-border pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('feeders.secrets_list')}
              </p>
              {secrets.length > 0 ? (
                <span className="text-xs text-muted-foreground">{secrets.length}</span>
              ) : null}
            </div>

            {loading ? (
              <ListState variant="loading" compact />
            ) : secrets.length === 0 ? (
              <ListState
                variant="empty"
                compact
                icon={<HugeiconsIcon icon={SecurityBlockIcon} className="size-5 text-muted-foreground" />}
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
                        'border-border bg-background',
                        'hover:bg-accent transition-colors',
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <HugeiconsIcon icon={Key01Icon}
                          className="size-3.5 shrink-0 text-primary"
                          aria-hidden
                        />
                        <code className="text-xs font-mono text-foreground truncate">
                          {s.name}
                        </code>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {lastUsed ? (
                          <span className="text-[10px] text-muted-foreground">
                            {lastUsed}
                          </span>
                        ) : null}
                        <Button variant="ghost" onClick={() => void handleDelete(s.id)} aria-label={t('common.delete')} className="text-muted-foreground hover:text-destructive" size="icon-xs">
                          <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div><DialogFooter className="border-t px-4 py-3">{<Button variant="ghost" onClick={onClose}>
          {t('common.close')}
        </Button>}</DialogFooter></DialogContent></Dialog>
  );
}

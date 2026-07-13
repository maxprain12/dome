import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { HardDriveIcon, Login01Icon, UserAdd01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type AccountChoice = 'login' | 'register' | 'local';

interface AccountChoiceViewProps {
  choice: AccountChoice | null;
  onChoiceChange: (choice: AccountChoice) => void;
}

function ChoiceCard({
  selected,
  onClick,
  icon,
  title,
  subtitle,
}: {
  selected: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <Button
      type="button"
      variant={selected ? 'secondary' : 'outline'}
      onClick={onClick}
      className="h-auto w-full items-start justify-start gap-3 rounded-xl p-3.5 text-left"
    >
      <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="font-semibold text-sm text-foreground">
          {title}
        </p>
        <p className="text-xs leading-snug mt-0.5 text-muted-foreground">
          {subtitle}
        </p>
      </div>
    </Button>
  );
}

export default function AccountChoiceView({ choice, onChoiceChange }: AccountChoiceViewProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-2.5">
      <ChoiceCard
        selected={choice === 'login'}
        onClick={() => onChoiceChange('login')}
        icon={<HugeiconsIcon icon={Login01Icon} className="size-4" />}
        title={t('onboarding.account_choice_login_title')}
        subtitle={t('onboarding.account_choice_login_subtitle')}
      />
      <ChoiceCard
        selected={choice === 'register'}
        onClick={() => onChoiceChange('register')}
        icon={<HugeiconsIcon icon={UserAdd01Icon} className="size-4" />}
        title={t('onboarding.account_choice_register_title')}
        subtitle={t('onboarding.account_choice_register_subtitle')}
      />
      <ChoiceCard
        selected={choice === 'local'}
        onClick={() => onChoiceChange('local')}
        icon={<HugeiconsIcon icon={HardDriveIcon} className="size-4" />}
        title={t('onboarding.account_local_title')}
        subtitle={t('onboarding.account_local_subtitle')}
      />
    </div>
  );
}

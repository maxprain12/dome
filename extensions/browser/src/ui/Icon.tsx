import type { ComponentProps } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  Download04Icon,
  Link01Icon,
  MoonIcon,
  Note01Icon,
  PlusSignIcon,
  Sun03Icon,
  Tick02Icon,
  UserAdd01Icon,
} from '@hugeicons/core-free-icons';

export type IconName =
  | 'capture'
  | 'note'
  | 'contact'
  | 'close'
  | 'back'
  | 'arrow'
  | 'check'
  | 'sun'
  | 'moon'
  | 'plus'
  | 'link';

const ICONS = {
  capture: Download04Icon,
  note: Note01Icon,
  contact: UserAdd01Icon,
  close: Cancel01Icon,
  back: ArrowLeft01Icon,
  arrow: ArrowRight01Icon,
  check: Tick02Icon,
  sun: Sun03Icon,
  moon: MoonIcon,
  plus: PlusSignIcon,
  link: Link01Icon,
} as const;

export function Icon({
  name,
  ...props
}: { name: IconName } & Omit<ComponentProps<typeof HugeiconsIcon>, 'icon'>) {
  return <HugeiconsIcon icon={ICONS[name]} {...props} />;
}

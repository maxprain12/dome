import { toast } from 'sonner';
import type { CSSProperties } from 'react';

export interface NotificationShowOptions {
  id?: string;
  title?: string;
  message?: string;
  color?: string;
  autoClose?: number | false;
  withCloseButton?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
}

/**
 * Drop-in replacement for `@mantine/notifications` used during the shadcn migration.
 */
export const notifications = {
  show({
    id,
    title,
    message,
    color,
    autoClose = 4000,
    onClick,
  }: NotificationShowOptions) {
    const heading = title ?? message ?? '';
    const description = title && message ? message : undefined;
    const duration = autoClose === false ? Infinity : autoClose;
    const options = {
      id,
      duration,
      description,
      action: onClick
        ? {
            label: '…',
            onClick: () => onClick(),
          }
        : undefined,
    };

    if (color === 'red') {
      toast.error(heading, options);
      return;
    }
    if (color === 'yellow') {
      toast.warning(heading, options);
      return;
    }
    if (color === 'green' || color === 'teal') {
      toast.success(heading, options);
      return;
    }
    toast(heading, options);
  },

  hide(id: string) {
    toast.dismiss(id);
  },

  clean() {
    toast.dismiss();
  },

  update(id: string, options: NotificationShowOptions) {
    notifications.hide(id);
    notifications.show({ ...options, id });
  },
};

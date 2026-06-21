export type EmailProviderId = 'gmail' | 'outlook' | 'icloud' | 'yahoo' | 'fastmail' | 'custom';

export interface EmailServerPreset {
  imap_host: string;
  imap_port: number;
  imap_encryption: string;
  smtp_host: string;
  smtp_port: number;
  smtp_encryption: string;
}

export interface EmailProviderGuide {
  /** i18n key under email.settings.guides */
  labelKey: string;
  /** Optional external help URL */
  helpUrl?: string;
}

export interface EmailProviderPreset {
  id: EmailProviderId;
  labelKey: string;
  servers: EmailServerPreset;
  guides: EmailProviderGuide[];
}

const GMAIL_APP_PASSWORD_URL = 'https://support.google.com/accounts/answer/185833';
const OUTLOOK_APP_PASSWORD_URL = 'https://support.microsoft.com/account-billing/using-app-passwords-with-apps-that-don-t-support-two-step-verification-5896ed9b-4263-e681-128a-a6f1549ebd94';
const ICLOUD_APP_PASSWORD_URL = 'https://support.apple.com/en-us/HT204397';
const GMAIL_IMAP_URL = 'https://support.google.com/mail/answer/7126229';

export const EMAIL_PROVIDER_PRESETS: EmailProviderPreset[] = [
  {
    id: 'gmail',
    labelKey: 'email.settings.providers.gmail',
    servers: {
      imap_host: 'imap.gmail.com',
      imap_port: 993,
      imap_encryption: 'tls',
      smtp_host: 'smtp.gmail.com',
      smtp_port: 465,
      smtp_encryption: 'tls',
    },
    guides: [
      { labelKey: 'email.settings.guides.enable_imap_gmail', helpUrl: GMAIL_IMAP_URL },
      { labelKey: 'email.settings.guides.app_password', helpUrl: GMAIL_APP_PASSWORD_URL },
    ],
  },
  {
    id: 'outlook',
    labelKey: 'email.settings.providers.outlook',
    servers: {
      imap_host: 'outlook.office365.com',
      imap_port: 993,
      imap_encryption: 'tls',
      smtp_host: 'smtp.office365.com',
      smtp_port: 587,
      smtp_encryption: 'tls',
    },
    guides: [
      { labelKey: 'email.settings.guides.app_password', helpUrl: OUTLOOK_APP_PASSWORD_URL },
      { labelKey: 'email.settings.guides.outlook_imap_enabled' },
    ],
  },
  {
    id: 'icloud',
    labelKey: 'email.settings.providers.icloud',
    servers: {
      imap_host: 'imap.mail.me.com',
      imap_port: 993,
      imap_encryption: 'tls',
      smtp_host: 'smtp.mail.me.com',
      smtp_port: 587,
      smtp_encryption: 'tls',
    },
    guides: [
      { labelKey: 'email.settings.guides.app_password', helpUrl: ICLOUD_APP_PASSWORD_URL },
      { labelKey: 'email.settings.guides.icloud_imap' },
    ],
  },
  {
    id: 'yahoo',
    labelKey: 'email.settings.providers.yahoo',
    servers: {
      imap_host: 'imap.mail.yahoo.com',
      imap_port: 993,
      imap_encryption: 'tls',
      smtp_host: 'smtp.mail.yahoo.com',
      smtp_port: 465,
      smtp_encryption: 'tls',
    },
    guides: [{ labelKey: 'email.settings.guides.app_password' }],
  },
  {
    id: 'fastmail',
    labelKey: 'email.settings.providers.fastmail',
    servers: {
      imap_host: 'imap.fastmail.com',
      imap_port: 993,
      imap_encryption: 'tls',
      smtp_host: 'smtp.fastmail.com',
      smtp_port: 465,
      smtp_encryption: 'tls',
    },
    guides: [{ labelKey: 'email.settings.guides.fastmail_app_password' }],
  },
  {
    id: 'custom',
    labelKey: 'email.settings.providers.custom',
    servers: {
      imap_host: '',
      imap_port: 993,
      imap_encryption: 'tls',
      smtp_host: '',
      smtp_port: 465,
      smtp_encryption: 'tls',
    },
    guides: [{ labelKey: 'email.settings.guides.custom_manual' }],
  },
];

export const EMAIL_PROVIDER_BY_ID = Object.fromEntries(
  EMAIL_PROVIDER_PRESETS.map((p) => [p.id, p]),
) as Record<EmailProviderId, EmailProviderPreset>;

export function applyProviderPreset(
  current: EmailServerPreset & { email: string; username: string },
  providerId: EmailProviderId,
): EmailServerPreset & { username: string } {
  const preset = EMAIL_PROVIDER_BY_ID[providerId];
  const username = current.username || current.email;
  return {
    ...preset.servers,
    username,
  };
}

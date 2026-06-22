export type EmailProviderId = 'gmail' | 'outlook' | 'zoho' | 'icloud' | 'yahoo' | 'fastmail' | 'custom';

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
  /** i18n key under email.settings.guides.tooltips */
  tooltipKey?: string;
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
const ZOHO_APP_PASSWORD_URL = 'https://accounts.zoho.com/home#security/app_password';
const ZOHO_APP_PASSWORD_URL_EU = 'https://accounts.zoho.eu/home#security/app_password';
const ZOHO_IMAP_HELP_URL = 'https://www.zoho.com/mail/help/imap-access.html#EnableIMAP';

export type ZohoRegionId = 'global' | 'eu';

export const DEFAULT_ZOHO_REGION: ZohoRegionId = 'eu';

export const ZOHO_REGION_SERVERS: Record<ZohoRegionId, EmailServerPreset> = {
  global: {
    imap_host: 'imap.zoho.com',
    imap_port: 993,
    imap_encryption: 'tls',
    smtp_host: 'smtp.zoho.com',
    smtp_port: 465,
    smtp_encryption: 'tls',
  },
  eu: {
    imap_host: 'imap.zoho.eu',
    imap_port: 993,
    imap_encryption: 'tls',
    smtp_host: 'smtp.zoho.eu',
    smtp_port: 465,
    smtp_encryption: 'tls',
  },
};

export function getZohoGuides(region: ZohoRegionId): EmailProviderGuide[] {
  const appPasswordUrl = region === 'eu' ? ZOHO_APP_PASSWORD_URL_EU : ZOHO_APP_PASSWORD_URL;
  return [
    {
      labelKey: 'email.settings.guides.enable_imap_zoho',
      helpUrl: ZOHO_IMAP_HELP_URL,
      tooltipKey: 'email.settings.guides.tooltips.enable_imap_zoho',
    },
    {
      labelKey: 'email.settings.guides.zoho_app_password',
      helpUrl: appPasswordUrl,
      tooltipKey: 'email.settings.guides.tooltips.zoho_app_password',
    },
    {
      labelKey:
        region === 'eu'
          ? 'email.settings.guides.zoho_org_servers_eu'
          : 'email.settings.guides.zoho_org_servers',
      tooltipKey:
        region === 'eu'
          ? 'email.settings.guides.tooltips.zoho_org_servers_eu'
          : 'email.settings.guides.tooltips.zoho_org_servers',
    },
    {
      labelKey: 'email.settings.guides.zoho_full_email_username',
      tooltipKey: 'email.settings.guides.tooltips.zoho_full_email_username',
    },
  ];
}

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
    id: 'zoho',
    labelKey: 'email.settings.providers.zoho',
    servers: ZOHO_REGION_SERVERS.eu,
    guides: getZohoGuides('eu'),
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
  zohoRegion: ZohoRegionId = DEFAULT_ZOHO_REGION,
): EmailServerPreset & { username: string } {
  const username = current.username || current.email;
  if (providerId === 'zoho') {
    return { ...ZOHO_REGION_SERVERS[zohoRegion], username };
  }
  const preset = EMAIL_PROVIDER_BY_ID[providerId];
  return {
    ...preset.servers,
    username,
  };
}

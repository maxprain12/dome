/**
 * 0010_calendar — calendar_accounts, calendar_calendars, calendar_events,
 * calendar_event_links, calendar_notifications, email_accounts
 */
module.exports = {
  id: '0010_calendar',
  up: async (db) => {
    await db.exec(`
      CREATE TABLE calendar_accounts (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL CHECK(provider IN ('google', 'local')),
        account_email TEXT NOT NULL,
        credentials TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disconnected', 'error')),
        last_sync_at BIGINT,
        sync_token TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );

      CREATE INDEX idx_calendar_accounts_provider ON calendar_accounts(provider);

      CREATE TABLE calendar_calendars (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        remote_id TEXT NOT NULL,
        title TEXT NOT NULL,
        color TEXT,
        is_selected BIGINT DEFAULT 1,
        is_default BIGINT DEFAULT 0,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        UNIQUE(account_id, remote_id)
      );

      CREATE INDEX idx_calendar_calendars_account ON calendar_calendars(account_id);

      CREATE TABLE calendar_events (
        id TEXT PRIMARY KEY,
        calendar_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        location TEXT,
        start_at BIGINT NOT NULL,
        end_at BIGINT NOT NULL,
        timezone TEXT,
        all_day BIGINT DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed', 'tentative', 'cancelled')),
        reminders TEXT,
        metadata TEXT,
        source TEXT DEFAULT 'local' CHECK(source IN ('local', 'google', 'manual')),
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );

      CREATE INDEX idx_calendar_events_calendar ON calendar_events(calendar_id);
      CREATE INDEX idx_calendar_events_range ON calendar_events(start_at, end_at);
      CREATE INDEX idx_calendar_events_start ON calendar_events(start_at);

      CREATE TABLE calendar_event_links (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        remote_event_id TEXT NOT NULL,
        remote_calendar_id TEXT,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        UNIQUE(provider, remote_event_id)
      );

      CREATE INDEX idx_calendar_event_links_event ON calendar_event_links(event_id);
      CREATE INDEX idx_calendar_event_links_remote ON calendar_event_links(provider, remote_event_id);

      CREATE TABLE calendar_notifications (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        notify_at BIGINT NOT NULL,
        notified_at BIGINT,
        created_at BIGINT NOT NULL,
        UNIQUE(event_id, notify_at)
      );

      CREATE INDEX idx_calendar_notifications_event ON calendar_notifications(event_id);
      CREATE INDEX idx_calendar_notifications_pending ON calendar_notifications(notify_at, notified_at);

      CREATE TABLE email_accounts (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        display_name TEXT,
        imap_host TEXT NOT NULL,
        imap_port BIGINT NOT NULL DEFAULT 993,
        imap_encryption TEXT NOT NULL DEFAULT 'tls',
        smtp_host TEXT NOT NULL,
        smtp_port BIGINT NOT NULL DEFAULT 465,
        smtp_encryption TEXT NOT NULL DEFAULT 'tls',
        username TEXT NOT NULL,
        secret TEXT NOT NULL,
        is_default BIGINT NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );

      CREATE INDEX idx_email_accounts_email ON email_accounts(email);
    `);
  },
};

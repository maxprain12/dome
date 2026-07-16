# Email

Dome syncs IMAP/SMTP accounts (Himalaya) into a local SQLite cache (`email_accounts`, `email_folders`, `email_messages`). The **Correo** tab is an agentic surface — briefing metrics, triage queues, and inline read/compose — not a classic folder-first mail client.

## UI

- Entry: `app/components/email/EmailView.tsx`
- Queues / heuristics: `app/lib/email/mailQueues.ts`
- Detail/compose: `MailDetailPanel` / `MailComposePanel` via `InlineDetailCard`
- Folder picker is a secondary Popover in the header

## Agent

- Tools: `email_list`, `email_search`, `email_read`, `email_send`, `email_reply` (HITL for send/reply)
- Skill: `dome-email-triage`
- ⌘K / `@` mentions index messages via `electron/search/source-index.cjs`

## Settings

Account connect and permissions live under Settings → Email (IMAP credentials stay on-device).

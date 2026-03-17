# Cloud Storage Setup — Google Drive & OneDrive

This guide explains how to generate OAuth 2.0 credentials and configure Dome to import files from **Google Drive** and **OneDrive** natively.

---

## Overview

Dome uses **PKCE OAuth 2.0** (no backend required) to authenticate with cloud providers. The redirect URI is `dome://oauth/callback` — a custom deep-link scheme registered by the Electron app. No data is sent to Dome servers; tokens are stored locally in your SQLite database.

| Variable | Provider | Required |
|---|---|---|
| `DOME_GOOGLE_DRIVE_CLIENT_ID` | Google Drive | Yes |
| `DOME_GOOGLE_DRIVE_CLIENT_SECRET` | Google Drive | Yes (for token refresh) |
| `DOME_ONEDRIVE_CLIENT_ID` | OneDrive | Yes |

---

## Google Drive

### Step 1 — Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and sign in.
2. Click **Select a project → New Project**.
3. Name it (e.g. `dome-drive`) and click **Create**.

### Step 2 — Enable the Drive API

1. In your project, go to **APIs & Services → Library**.
2. Search for **Google Drive API** and click it.
3. Click **Enable**.

### Step 3 — Configure the OAuth consent screen

1. Go to **APIs & Services → OAuth consent screen**.
2. Choose **External** (works for any Google account) and click **Create**.
3. Fill in:
   - **App name**: `Dome`
   - **User support email**: your email
   - **Developer contact email**: your email
4. Click **Save and Continue**.
5. On **Scopes**: click **Add or Remove Scopes** and add:
   - `https://www.googleapis.com/auth/drive.readonly`
   - `openid`
   - `email`
6. Click **Save and Continue**.
7. On **Test users** (only needed while the app is in *Testing* status): add your Google account.
8. Click **Save and Continue → Back to Dashboard**.

> **Note:** While the app is in *Testing* status, only accounts listed in "Test users" can connect. To allow any Google account, submit for production verification (or publish the app). For personal/team use, staying in Testing mode is fine.

### Step 4 — Create OAuth 2.0 credentials

1. Go to **APIs & Services → Credentials → + Create Credentials → OAuth client ID**.
2. **Application type**: **Desktop app**.
3. **Name**: `Dome Desktop`.
4. Click **Create**.
5. Copy the **Client ID** and **Client Secret** from the dialog.

### Step 5 — Register the redirect URI

> Desktop apps created in Google Cloud do not require registering `dome://oauth/callback` explicitly — Google allows custom URI schemes for Desktop app credentials. You're done.

### Step 6 — Set environment variables

```bash
DOME_GOOGLE_DRIVE_CLIENT_ID=your-client-id.apps.googleusercontent.com
DOME_GOOGLE_DRIVE_CLIENT_SECRET=GOCSPX-your-client-secret
```

**Local development** — add to a `.env.local` file at the project root (already git-ignored):

```bash
DOME_GOOGLE_DRIVE_CLIENT_ID=your-client-id.apps.googleusercontent.com
DOME_GOOGLE_DRIVE_CLIENT_SECRET=GOCSPX-your-client-secret
```

**GitHub Actions / CI** — add as repository secrets (see [CI/CD section](#cicd--github-actions)).

**Packaged app** — set before launching Dome, or embed via the build process (the CI workflow injects them automatically as environment variables accessible to the Electron main process at runtime).

---

## OneDrive (Microsoft)

### Step 1 — Register an app in Azure Active Directory

1. Go to [portal.azure.com](https://portal.azure.com/) and sign in.
2. Navigate to **Azure Active Directory → App registrations → + New registration**.
3. Fill in:
   - **Name**: `Dome`
   - **Supported account types**: **Accounts in any organizational directory and personal Microsoft accounts** (recommended for both work and personal OneDrive)
   - **Redirect URI**: Select **Public client/native (mobile & desktop)** and enter `dome://oauth/callback`
4. Click **Register**.
5. Copy the **Application (client) ID** from the overview page.

### Step 2 — Configure API permissions

1. In your app, go to **API permissions → + Add a permission**.
2. Choose **Microsoft Graph → Delegated permissions**.
3. Add:
   - `Files.Read`
   - `offline_access`
   - `openid`
   - `email`
4. Click **Add permissions**.
5. Click **Grant admin consent for [your tenant]** (or let users consent individually if you don't have admin rights — personal accounts auto-consent).

### Step 3 — No client secret needed

Because Dome uses the **public client PKCE flow** (`token type = SPA/Desktop`), no client secret is required for OneDrive. PKCE handles security without a secret.

### Step 4 — Set environment variable

```bash
DOME_ONEDRIVE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

**Local development** — add to `.env.local`:

```bash
DOME_ONEDRIVE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

**GitHub Actions / CI** — add as a repository secret.

---

## In-App Configuration

Once the environment variables are set and the app is running:

1. Open **Settings → Cloud Storage**.
2. Click **Connect Google Drive** or **Connect OneDrive**.
3. Your default browser opens the OAuth consent screen.
4. Sign in and grant permissions.
5. The browser redirects to `dome://oauth/callback` — the app catches it automatically.
6. The account appears in **Connected accounts** with your email.

Accounts are stored locally in your SQLite database (`settings` table, key `cloud_accounts`). Tokens are refreshed automatically when they expire.

---

## Using the Cloud File Picker

From the Home or resource library:

1. Click **Import → From Cloud** (or trigger via the AI agent — see below).
2. The picker opens with your connected accounts in the sidebar.
3. Browse folders using the breadcrumb navigator.
4. Use the search bar to find files by name.
5. Click files to select them (multi-select supported; folders open on click).
6. Click **Import** — selected files are downloaded and added to your Dome library.

Imported files are automatically indexed by PageIndex after import.

---

## AI Agent Integration

Agents can also import files from MCP servers (filesystem, cloud proxies, etc.) using the `import_file_to_dome` tool:

```
Agent → reads file via MCP tool → calls import_file_to_dome → file saved to Dome library
```

The tool accepts either text content or base64-encoded binary content, so agents can import any file type — PDFs, DOCX, plain text — retrieved from any MCP source.

---

## CI/CD — GitHub Actions

Add these secrets in **GitHub → Settings → Secrets and variables → Actions → Repository secrets**:

| Secret name | Value |
|---|---|
| `DOME_GOOGLE_DRIVE_CLIENT_ID` | Google OAuth Client ID |
| `DOME_GOOGLE_DRIVE_CLIENT_SECRET` | Google OAuth Client Secret |
| `DOME_ONEDRIVE_CLIENT_ID` | Microsoft Azure App Client ID |

The CI workflow (`build.yml`) passes them to the Electron build step so they are available to the main process at runtime in the packaged app.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| "DOME_GOOGLE_DRIVE_CLIENT_ID env var not set" | Set the variable and restart the app |
| Browser opens but redirect fails | Make sure the Dome app is running (it must intercept `dome://` URLs) |
| "Token exchange failed" | Check that the Client Secret is correct and the app is not in Testing mode with an unlisted account |
| Files not showing after import | Check Settings → Indexing — the file may still be indexing |
| OneDrive: "AADSTS..." error | Verify the redirect URI `dome://oauth/callback` is registered in Azure as a **public client** URI |
| Google: "redirect_uri_mismatch" | You're using a Web app credential instead of Desktop app — recreate as Desktop type |

---

## Security Notes

- Tokens are stored **locally only** in `~/Library/Application Support/dome/dome.db` (macOS) or the equivalent `userData` path on each OS.
- Access tokens expire in ~1 hour and are refreshed automatically using the refresh token.
- Dome only requests **read-only** scopes (`drive.readonly`, `Files.Read`) — it cannot write to or delete files in your cloud.
- Disconnecting an account from Settings → Cloud Storage removes all stored tokens immediately.

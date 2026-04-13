# Gmail Connector — Setup Guide

## 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a Project** → **New Project**
3. Name it (e.g. `copilot-gmail`) and click **Create**

## 2. Enable the Gmail API

1. In your project, go to **APIs & Services** → **Library**
2. Search for **Gmail API**
3. Click **Enable**

## 3. Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose **External** (or Internal if using Google Workspace)
3. Fill in the required fields:
   - **App name**: `Copilot Gmail Connector`
   - **User support email**: your email
   - **Developer contact**: your email
4. Click **Save and Continue**
5. On the **Scopes** page, click **Add or Remove Scopes** and add:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`
6. Click **Save and Continue**
7. On **Test users**, add your own Google email address
8. Click **Save and Continue**

## 4. Create OAuth Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Application type: **Desktop app**
4. Name: `VS Code Gmail Connector`
5. Click **Create**
6. Copy the **Client ID** and **Client Secret**

## 5. Configure VS Code

Open VS Code Settings (`Ctrl+,`) and set:

```json
{
  "gmailConnector.clientId": "YOUR_CLIENT_ID.apps.googleusercontent.com",
  "gmailConnector.clientSecret": "YOUR_CLIENT_SECRET"
}
```

Or use the Settings UI and search for `Gmail Connector`.

## 6. Connect

1. Click the **Gmail icon** (✉️) in the Activity Bar (left sidebar)
2. Click **Connect Gmail**
3. A browser window opens — sign in with your Google account
4. Authorize the requested permissions
5. You'll see "Gmail Connected!" — close the tab
6. Your inbox appears in the sidebar!

## Using with Copilot Chat

Once connected, type in Copilot Chat:

- `@gmail /inbox` — View recent emails
- `@gmail /search from:boss subject:urgent` — Search emails
- `@gmail /read <messageId>` — Read full email
- `@gmail /compose to:user@example.com subject:Hello body:Hi there` — Send email
- `@gmail /reply <messageId> Thanks for the update!` — Reply to email
- `@gmail /labels` — List all labels
- `@gmail show me unread emails` — Natural language queries

## Troubleshooting

**"Not authenticated" error**: Click the Gmail sidebar icon and connect first.

**"Invalid client" error**: Double-check your Client ID and Client Secret in settings.

**"Access blocked" error**: Make sure you added yourself as a test user in the OAuth consent screen (step 3.7).

**Token expired**: The extension auto-refreshes tokens. If it fails, disconnect and reconnect.

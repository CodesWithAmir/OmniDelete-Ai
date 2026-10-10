# OmniDelete AI

OmniDelete AI is a Chrome extension for scanning and safely bulk-deleting AI chat
conversations from supported AI platforms.

## Supported platforms

- Google Gemini: `gemini.google.com`
- ChatGPT: `chatgpt.com` and `chat.openai.com`
- Claude: `claude.ai`
- Perplexity: `www.perplexity.ai`
- DeepSeek: `chat.deepseek.com`

## Features

- Opens an overlay directly on the current AI chat website.
- Scans the conversation sidebar and lists available chats.
- Selects individual chats, all visible chats, or unpinned chats.
- Shows pinned conversations separately and avoids selecting them with
  **Unpinned Only**.
- Deletes selected chats one at a time through the website's normal menu and
  confirmation dialog.
- Shows progress and reports successful and failed deletions.
- Supports rescanning after the sidebar changes.

> **Warning:** Chat deletion is permanent and cannot be undone. Review the
> selected conversations carefully before confirming.

## Installation in Chrome

1. Download or clone this project.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the project folder containing `manifest.json`.
6. Open one of the supported platforms and sign in if required.
7. Click the OmniDelete AI toolbar icon to open or close the overlay.

After changing extension files, return to `chrome://extensions` and click the
extension's **Reload** button.

## How to use

1. Open a supported platform's conversation page.
2. Click the OmniDelete AI extension icon.
3. Wait for the conversation list to load.
4. Select the conversations to remove, or use:
   - **Select All** to select the displayed conversations.
   - **Deselect All** to clear the current selection.
   - **Unpinned Only** to select conversations that are not pinned.
5. Click **Delete Selected**.
6. Review the confirmation dialog and choose **Yes, Delete All**.

The extension uses the platform's visible interface for each deletion. If a
platform changes its sidebar or menu structure, scanning or deletion may need a
future adapter update.

## Permissions

The extension requests the following permissions:

- `activeTab`: access the active supported tab after the toolbar icon is used.
- `scripting`: inject the content script when it is not already present.
- `storage`: reserved for extension state and settings.
- `tabs`: read the active tab information needed by the background service worker.

Host access is limited to the supported platform domains listed above.

## Troubleshooting

### The overlay does not open

- Confirm that the current tab is one of the supported domains.
- Refresh the page and click the extension icon again.
- Reload the extension from `chrome://extensions`.
- Check the service worker output by opening the extension details and selecting
  **Inspect views**.

### No chats are listed

- Make sure the conversation sidebar is visible.
- Click the refresh button inside the overlay.
- Scroll or expand the platform's sidebar, then scan again.

### A deletion fails

Do not retry repeatedly if the platform UI appears to have changed. Refresh the
page, rescan the conversations, and verify the selected chat before trying
again.

## Project structure

```text
manifest.json          Chrome extension manifest
scripts/background.js  Toolbar click handler and content-script injection
scripts/content.js     Platform adapters, overlay UI, scanning, and deletion
popup/                 Extension popup files
assets/                Extension icons
```

## Development notes

The platform-specific logic is implemented through adapters in
`scripts/content.js`. Each adapter provides matching, sidebar discovery,
conversation scanning, menu handling, and delete confirmation behavior.

# copilot-minimax

Patch VS Code's Copilot Chat extension to use **MiniMax API** instead of Anthropic.

<img width="1915" height="1010" alt="image" src="https://github.com/user-attachments/assets/0b187249-3e19-4277-9190-cc31aea2e747" />


## Why?

VS Code Copilot Chat has a built-in "Anthropic" provider (BYOK), but it **hardcodes** `https://api.anthropic.com` with no way to change the base URL. [MiniMax](https://minimax.io) exposes an Anthropic-compatible API at `https://api.minimax.io/anthropic`, but VS Code won't let you point to it.

Additionally, MiniMax does **not** implement the `/v1/models` endpoint that VS Code calls to list available models — causing a 404 error.

This tool patches both issues automatically.

## What it does

1. **Redirects** all Anthropic API calls from `api.anthropic.com` → `api.minimax.io/anthropic`
2. **Replaces** the model listing call with hardcoded MiniMax model metadata (M2.7, M2.7-highspeed, M2.5, M2.5-highspeed)
3. **Creates a backup** so you can restore the original at any time

## Install

```bash
# No dependencies needed — pure Python 3.9+
git clone https://github.com/akashmahlaz/copilot-minimax.git
cd copilot-minimax
```

## Usage

```bash
# Check current status
python copilot_minimax.py status

# Apply the patch
python copilot_minimax.py patch

# Apply and also configure Claude Code env vars with your API key
python copilot_minimax.py patch --key YOUR_MINIMAX_API_KEY

# Restore original (undo all patches)
python copilot_minimax.py restore
```

### After patching

1. **Restart VS Code** (close completely and reopen)
2. Go to **Language Models** (model picker → Manage Models)
3. Click **Add Models** → select **Anthropic**
4. Enter your **MiniMax API key**
5. MiniMax models (M2.7, M2.5, etc.) will appear — select and use!

## Supported Models

| Model | Context | Tools | Vision | Thinking |
|-------|---------|-------|--------|----------|
| MiniMax-M2.7 | 204K | ✅ | ✅ | ✅ |
| MiniMax-M2.7-highspeed | 204K | ✅ | ✅ | ✅ |
| MiniMax-M2.5 | 204K | ✅ | ✅ | ✅ |
| MiniMax-M2.5-highspeed | 204K | ✅ | ✅ | ✅ |

## Platform Support

- ✅ Windows
- ✅ macOS
- ✅ Linux

## Notes

- **No external dependencies** — uses only Python standard library
- The patch targets `github.copilot-chat-*` extension in `~/.vscode/extensions/`
- If VS Code auto-updates the Copilot Chat extension, **re-run the patch**
- Backup is stored as `extension.js.copilot-minimax.bak` next to the original

## License

MIT

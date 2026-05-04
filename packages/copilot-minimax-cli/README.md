# copilot-minimax

Patch VS Code Copilot Chat to use the MiniMax Anthropic-compatible API.

```bash
npx copilot-minimax status
npx copilot-minimax patch --key YOUR_MINIMAX_API_KEY
npx copilot-minimax restore
```

The CLI creates `extension.js.copilot-minimax.bak` next to VS Code's Copilot Chat bundle before modifying it.

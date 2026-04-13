# copilot-minimax

Patch VS Code's Copilot Chat extension to use **MiniMax API** instead of Anthropic.

<img width="1915" height="1010" alt="image" src="https://github.com/user-attachments/assets/0b187249-3e19-4277-9190-cc31aea2e747" />


## Why?

VS Code Copilot Chat has a built-in "Anthropic" provider (BYOK), but it **hardcodes** `https://api.anthropic.com` with no way to change the base URL. [MiniMax](https://minimax.io) exposes an Anthropic-compatible API at `https://api.minimax.io/anthropic`, but VS Code won't let you point to it.

Additionally, MiniMax does **not** implement the `/v1/models` endpoint that VS Code calls to list available models — causing a 404 error.

This tool patches both issues automatically.

It also supports applying additional custom replacements from a JSON patch file,
so you can layer more Copilot extension modifications on top of the MiniMax patch.

## What it does

1. **Redirects** all Anthropic API calls from `api.anthropic.com` → `api.minimax.io/anthropic`
2. **Replaces** the model listing call with hardcoded MiniMax model metadata (M2.7, M2.7-highspeed, M2.5, M2.5-highspeed)
3. **Creates a backup** so you can restore the original at any time

## Project Structure

The repository is now modular for easier maintenance and future connector work:

- `copilot_minimax_core/cli.py` - argument parsing and command routing
- `copilot_minimax_core/commands.py` - patch/status/restore command handlers
- `copilot_minimax_core/patching.py` - built-in MiniMax patch logic
- `copilot_minimax_core/custom_patches.py` - JSON-driven custom patch engine
- `copilot_minimax_core/paths.py` - OS-specific VS Code path resolution
- `copilot_minimax_core/settings_ops.py` - optional settings integration
- `copilot_minimax.py` - compatibility wrapper (`python copilot_minimax.py ...` still works)
- `patches/` - provider-specific patch pack templates (start with Gmail)

For UX direction of future Gmail/Vercel/WhatsApp connector surfaces, see
`docs/ui-ux-vision.md`.

Visual screen-level wireframes are in `docs/ui-wireframes.md`.

For phased delivery planning, see `docs/roadmap.md`.

Connector runtime setup is documented in `docs/connector-bridge.md`.

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

# Apply MiniMax patches + your custom patch pack
python copilot_minimax.py patch --patch-file examples/custom_patch.example.json

# Validate built-in + custom patch rules without writing changes
python copilot_minimax.py validate --patch-file patches/gmail.connector.template.json

# Validate concrete connector bridge rules (version-specific)
python copilot_minimax.py validate --patch-file patches/connector.bridge.v1.json

# Validate connector bridge v2 (env-backed endpoint fallback)
python copilot_minimax.py validate --patch-file patches/connector.bridge.v2.json

# Report current patch markers + custom patch match counts
python copilot_minimax.py report --patch-file patches/gmail.connector.template.json

# Apply connector bridge patch pack after validation
python copilot_minimax.py patch --patch-file patches/connector.bridge.v1.json

# Run local mock connector server for end-to-end testing
py -3 tools/mock_connector_server.py

# Or run from repo root with convenience wrapper
py -3 mock_connector_server.py

# Inspect extension.js for stable keyword anchors before writing patch rules
python copilot_minimax.py inspect --keyword gmail --keyword tool --keyword command --limit 8

# Restore original (undo all patches)
python copilot_minimax.py restore
```

## Custom Patch Packs

Use `--patch-file` to apply extra replacements to `extension.js` after the built-in
MiniMax patch logic.

Supported fields for each replacement item:

- `name` (optional): label shown in output
- `find` (required): literal string or regex pattern
- `replace` (required): replacement text
- `count` (optional): max replacements (default `0` = replace all)
- `regex` (optional): `true` to use regex mode
- `flags` (optional): regex flags string, any of `i`, `m`, `s`

See `examples/custom_patch.example.json` for the exact format.

For connector work, start from `patches/gmail.connector.template.json` and
replace placeholder `find` patterns with real `extension.js` anchors.

For a concrete, version-pinned hook pack built from real internals, see
`patches/connector.bridge.v1.json`.

Use `patches/connector.bridge.v2.json` for the env-backed bridge URL fallback.

Gmail tool contracts are defined in `connectors/contracts/gmail.tools.v1.json`.

## Local Quickstart (End-to-End)

1. Start mock connector server:

```powershell
py -3 mock_connector_server.py
```

2. In a second terminal, set bridge URL and open VS Code:

```powershell
$env:COPILOT_CONNECTOR_BRIDGE_URL = "http://127.0.0.1:8787/connector/tool"
code .
```

3. Validate + apply bridge patch:

```powershell
py -3 copilot_minimax.py validate --patch-file patches/connector.bridge.v2.json
py -3 copilot_minimax.py patch --patch-file patches/connector.bridge.v2.json
```

4. Confirm current hook status:

```powershell
py -3 copilot_minimax.py report --patch-file patches/connector.bridge.v2.json
```

If you previously ran `py -3 mock_connector_server.py` and saw an error, it was likely
because the wrapper file did not exist yet or the terminal cwd was not the repo root.

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

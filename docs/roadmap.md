# Product and Engineering Roadmap

## Phase 1: Stable Patch Platform (done/in progress)

- Modular Python package for patching operations
- Custom JSON patch packs for extension.js changes
- Version-safe status/restore commands

## Phase 2: Connector Patch Experiments

- Add provider-specific patch packs in `patches/`
- Add validation mode to assert pattern hits before write
- Add `report` command to show active connector hooks
- Harden each provider patch with required/min/max match constraints

## Phase 3: Connector Service Layer

- Build OAuth/token service (Gmail, Vercel, WhatsApp)
- Expose strict API actions for read/write operations
- Add action audit logs and revocation
- Ship local mock connector server for rapid loop testing
- Define versioned connector tool contracts (starting with Gmail)

## Phase 4: Copilot Integration Hardening

- Wire extension patch points to connector service endpoints
- Add approval requirements for write/deploy operations
- Add failure and fallback handling for API quota/errors

## Phase 5: Branded Editor Distribution

- Decide extension-first vs full fork release criteria
- Build installer/update channel and release pipeline
- Track compatibility with upstream VS Code changes

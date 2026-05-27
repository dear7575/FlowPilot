# Repository Guidelines

## Project Structure & Module Organization

FlowPilot is a Chrome extension organized around background orchestration, content scripts, and side panel UI. Core extension files live at the repository root, including `manifest.json`, `background.js`, and provider utilities such as `hotmail-utils.js`. Modular background logic is under `background/`, shared flow infrastructure under `core/flow-kernel/`, and per-flow implementations under `flows/openai/`, `flows/grok/`, and `flows/kiro/`. Content scripts are split between `content/` and `flows/*/content/`. Side panel assets live in `sidepanel/`; reusable data and imports live in `data/`, `shared/`, and `imports/`. Tests are in `tests/`, and documentation is in `docs/`, `md/`, and root-level Chinese guide files.

## Build, Test, and Development Commands

- `npm test`: runs all JavaScript tests with Node's built-in test runner via `node --test tests/*.test.js`.
- `node --test tests/background-message-router-module.test.js`: runs one focused test file during debugging.
- Load locally through `chrome://extensions/` by enabling Developer Mode and choosing this repository as an unpacked extension.

There is no bundler or transpilation step in `package.json`; keep browser-compatible JavaScript in source files.

## Coding Style & Naming Conventions

Use CommonJS in tests and the existing browser-global module wrapper pattern in extension modules. Prefer `const`/`let`, two-space indentation, semicolons, and single quotes. Name tests as `feature-scope.test.js`, modules as kebab-case, and exported factories with clear `create*` or domain-specific names. Keep changes small and localized; follow KISS and YAGNI before adding abstractions. New explanatory comments should be Simplified Chinese and match the surrounding file's style.

## Testing Guidelines

Tests use `node:test` and `node:assert/strict`. Add or update tests for behavior changes, especially flow routing, persisted settings, provider parsing, and side panel state. Prefer deterministic unit tests over live network calls or production API dependencies. Run `npm test` before submitting changes; for narrow fixes, also run the affected `node --test tests/<name>.test.js` file.

## Commit & Pull Request Guidelines

Recent history uses both Conventional Commits, such as `chore(release): bump version to FlowPilot2.5`, and concise Chinese imperative summaries. Keep commits focused and descriptive. Do not include generated runtime state such as `data/account-run-history.json`, `config.json`, `.runtime/`, or `node_modules/`. Pull requests should include the problem, solution summary, test commands, linked context, and screenshots for visible UI changes.

## Security & Configuration Tips

Never commit credentials, exported settings, account records, proxy details, or API tokens. Treat provider integrations and payment/account flows as sensitive: mock external services in tests and document any new required local configuration.

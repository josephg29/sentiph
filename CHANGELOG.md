# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Coverage gate: `@vitest/coverage-v8` with enforced per-package thresholds, wired
  into CI via `pnpm test:coverage`.
- Playwright end-to-end suite for the web shell (`apps/web/e2e`), API stubbed at the
  network layer for deterministic runs.
- Comprehensive unit tests for `@sentiph/core` domain logic (executable code at 100%).
- Security guard tests for loopback Host/Origin enforcement.
- Architectural boundary test ensuring `@sentiph/core` stays free of React, DOM,
  Node, and I/O imports.
- `SECURITY.md` describing the threat model and private disclosure process.
- `release.yml` workflow: tag-triggered build, smoke install, packaging, GitHub
  release, and guarded npm publish.
- Dependency-audit and E2E jobs in CI; concurrency cancellation of superseded runs.

### Changed

- Upgraded `vitest` and `@vitest/coverage-v8` to `^4.1.0` to resolve a critical
  advisory (GHSA-5xrq-8626-4rwp).
- Enabled stricter TypeScript: `noImplicitOverride` and `noFallthroughCasesInSwitch`.
- Scoped Biome correctly so generated state and marketing assets no longer produce
  false-positive diagnostics; resolved all remaining lint findings.

### Fixed

- Replaced non-null assertions in the git lifecycle path with a narrowed client.

## [0.1.0]

- Initial public release: web-first command surface for running multiple Claude Code
  agents in parallel, with a canvas UI, file-backed sessions, parent/worker
  orchestration, channel messaging, and usage/cost tracking.

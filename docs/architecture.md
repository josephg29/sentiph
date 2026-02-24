# Architecture Overview

Octogent is organized with a ports-and-adapters approach.

## Layers

- Domain and application logic live in `packages/core/src/domain` and `packages/core/src/application`.
- System boundaries are expressed as interfaces in `packages/core/src/ports`.
- Concrete implementations for tests/local execution live in `packages/core/src/adapters`.
- UI in `apps/web` consumes use-cases from `@octogent/core` without coupling to infrastructure internals.

## Current scratch scope

- One use-case: `buildTentacleColumns`
- One adapter: `InMemoryAgentSnapshotReader`
- One React shell rendering tentacle columns and agent states

# Repository layout

## Phase 0 baseline

Tuki is an npm workspace repository. The Expo application deliberately remains
at the repository root during the first Phase 0 milestones. This avoids moving
the Router entry point, Metro configuration, assets, and application paths
before the shared packages that need the workspace boundary exist.

The workspace glob is `packages/*`. A directory becomes a workspace only when
the milestone that owns it adds a `package.json` and source files.

```text
tuki/
  src/                         # Current Expo Router application
  assets/                      # Current mobile assets
  packages/                    # Reserved shared-workspace parent
    domain/                    # M0.4: domain events and shared types
    ui-tokens/                 # M0.3: accessibility design tokens
    content-schema/            # M0.4: content schemas and validation
    tone-guard/                # M0.5: learner-facing language checks
    test-fixtures/             # M0.4: valid and invalid content fixtures
  content/                     # Future reviewed packs and source assets
  docs/                        # Architecture, ADRs, spikes, research notes
  .github/workflows/           # M0.2: CI workflows
```

## Migration rule

The mobile app will move from the root into `apps/mobile` in one dedicated,
tested change after at least one shared package is consumed by the app. That
change must update Expo Router, TypeScript path aliases, asset paths, package
scripts, and CI together. Until then, root scripts remain the canonical way to
start, lint, and build the Expo project.

## Toolchain baseline

- Node.js: 22.13.0 or later
- npm: 11 or later
- Expo: SDK 57 (`expo` is pinned at `~57.0.24`)

Install Expo and React Native dependencies through `npx expo install` so their
versions remain aligned with Expo SDK 57.

# Tuki

Tuki is a gamified mobile learning application designed to help older adults become more confident with technology, practice everyday digital skills in a safe environment, and build healthier habits against scams and misinformation.

The application places learners inside a cozy virtual house where technology-related objects can be explored. Each object introduces a skill through simple explanations, guided practice, and friendly quizzes.

> Tuki is currently under active development.

## Development setup

Tuki currently keeps its Expo application at the repository root while Phase 0
establishes the workspace boundary. Shared packages will live in `packages/` as
they are introduced; the mobile app will move to `apps/mobile` only when that
move can be made and verified as a dedicated change.

### Prerequisites

- Node.js 22.13.0 or later
- npm 11 or later

The project uses Expo SDK 57. Install dependencies and start the development
server from the repository root:

```sh
npm install
npm run start
```

Use `npx expo install <package>` for Expo and React Native dependencies so the
installed version remains compatible with SDK 57.

Before opening a pull request, run the complete local quality gate:

```sh
npm run check
```

For faster iteration, run individual checks with `npm run format:check`,
`npm run typecheck`, `npm run lint`, `npm run test`, or `npm run build:smoke`.

### Repository layout

```text
tuki/
  src/                 # Transitional location of the Expo mobile app
  packages/            # Shared workspaces, introduced incrementally
  content/             # Reviewed content packs and source assets
  docs/                # Plans, ADRs, spikes, and research notes
  .github/workflows/   # Continuous-integration workflows
```

See [the repository-layout note](docs/repository-layout.md) for the planned
destination structure and the migration rule.

---

## Overview

Many older adults are comfortable with only a small part of modern technology and may hesitate to explore unfamiliar buttons or applications because they are afraid of making mistakes.

Tuki provides a safe place where users can learn by doing without affecting their real device.

The experience is built around three main ideas:

- **Learn** — understand common devices, apps, and digital concepts.
- **Practice** — interact with simulated interfaces where mistakes have no consequences.
- **Stay Safe** — develop habits for recognizing scams, misleading content, suspicious messages, and unsafe online behavior.

---

## Core Concept

The application opens inside a virtual house guided by **Tuki**, a friendly companion.

Different areas of the house represent different technology skills.

Examples include:

- **Bedroom** — phone basics, messages, calls, photos, and charging
- **Living Room** — television controls, streaming apps, and subtitles
- **Kitchen** — music, video apps, search, and media controls
- **Study** — internet browsing, Wi-Fi, searching, and safe websites
- **Door & Mailbox** — scams, suspicious messages, misinformation, and online safety
- **Brain Café** — quizzes, puzzles, and technology-related learning activities

Each lesson follows a simple learning flow:

```text
Tell Me
   ↓
Try It
   ↓
Quiz Me
   ↓
Real-Life Mission
   ↓
Recap
```

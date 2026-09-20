# Tuki (Tiko's House) - Technical Infrastructure Plan

**Status:** pre-development architecture decision. **Scope:** MVP first; no product code is prescribed or added by this document. **Primary requirements:** `Tuki.pdf`, 19 September 2026.

## 1. Executive architecture summary

Build Tuki as an **Expo SDK 57 / React Native TypeScript application** with a local-first learning runtime. Lessons, the house, the simulator, quizzes, and a learner's in-progress work remain usable with no network. A small managed backend is needed only for identity, voluntary Buddy collaboration, cross-device recovery/sync, content updates, and server-originated notifications. It does not sit in the path of every tap.

Use **Supabase** for PostgreSQL, Auth, Storage, row-level security (RLS), Edge Functions, scheduled jobs, and a small web-based content/admin console in the same TypeScript monorepo. This avoids operating a conventional API service for the MVP. The mobile app talks to Supabase's authenticated data and storage APIs directly for carefully constrained operations; privileged workflows run in Edge Functions. PostgreSQL is a better fit than a document database because Buddy consent, invitations, content versions, progress, audit records, and future organizations have real relationships and transactional rules.

The simulator is a versioned, data-driven state-machine interpreter. It renders generic simulated-device components from validated lesson definitions and records domain events locally. Content authors change structured draft content in the console; a publish process validates, signs/manifests, versions, and releases content packs. An app-store release is necessary only when a new lesson needs a simulator capability that is not already in the runtime.

The initial production shape is deliberately small:

```text
Expo mobile app
  |-- bundled starter pack + SQLite content/progress + secure credentials
  |-- simulator and lesson engines, all local
  |-- sync worker when network is available
  v
Supabase Auth / Postgres / Storage / Edge Functions / Scheduler
  |-- Expo Push Service -> APNs / FCM
  |-- optional Sentry (crashes) and privacy-preserving PostHog (product events)
  v
Content/admin web console (later in the same repository)
```

**Out of scope for MVP:** AI chat or truth-verdicts, social-app share extension, direct control of another app's feed, facilitator organizations, licensing/billing, rich Buddy chat, and an independently deployed API service.

## 2. Recommended technology stack

| Area | Recommendation | Why now | Viable alternative / decision |
|---|---|---|---|
| Mobile | Expo SDK 57, React Native 0.86, TypeScript, Expo Router | Already the project foundation; one language for mobile, web admin, edge functions and content tooling. Expo supports native modules when needed. | Flutter is excellent for pixel-controlled custom UI, but would create a Dart-only stack beside the existing RN project and separate web/admin skills. Do not rewrite. |
| UI and accessibility | Native RN primitives plus a small Tuki component system; `react-native-svg` for house hot-spots | Native accessibility semantics and font scaling are stronger starting points than canvas-only UI. | Full game engine is unnecessary; use SVG/absolute overlay only for the illustrated house. |
| Local database | `expo-sqlite` with migrations and transactions; file cache via Expo FileSystem | Relational local data and durable outbox are appropriate for content, attempts and sync. | AsyncStorage/MMKV only for small preferences, never canonical learning data. WatermelonDB is extra complexity at MVP scale. |
| Secure local secrets | `expo-secure-store` | Stores refresh/session material, not lesson data or large payloads. | Do not put bearer tokens in SQLite, AsyncStorage, logs, or analytics. |
| Backend | Supabase managed project: Postgres, Auth, Storage, RLS, Edge Functions, Cron | Small-team operations, relational data, policies close to data, and no custom server initially. | Firebase is viable but Firestore's document/conflict model is less natural for consent and reporting. Laravel/NestJS is deferred until custom integrations, complex workflows, or portability needs justify operations. |
| Authentication | Supabase Auth: email magic link + device passkey when supported; simple email/password fallback; optional phone OTP only after local delivery/cost validation | Least cognitively demanding onboarding without mandating social identity. | Do not require Google/Apple sign-in for learners. Buddies may use passkey/social later. |
| Storage | Supabase Storage private buckets with short-lived signed upload/download URLs | Holds content-pack assets and learner-volunteered images. | Never store real social credentials or automatically captured screenshots. |
| Notifications | `expo-notifications`, Expo Push Service; scheduled local recap notifications first | Local reminders work offline; server push only for Buddy/content events. | Direct FCM/APNs only if advanced delivery/control later warrants it. SDK 57 needs a development build for remote push. |
| Narration | `expo-speech` for on-device system TTS; recorded, locally packaged narration for curated flagship content later | Offline, language/device voice availability, low cost. | Cloud TTS is not required and would impair offline use; pre-recorded audio only for quality-sensitive material. |
| Analytics | PostHog self-hosted cloud / EU or selected region, opt-in, with anonymous aggregate event schema | Product-learning evidence without collecting message/post content. | Start with no third-party analytics for pilot if consent UX is not ready; use Supabase aggregate pilot reports. |
| Monitoring | Sentry React Native, scrubbed of PII | Errors need diagnosis across devices. | Expo dashboard alone is insufficient for runtime stack traces. |
| Delivery | EAS Build / Submit / Update channels, GitHub Actions, Supabase CLI migrations | Managed mobile builds and reproducible database evolution. | Avoid maintaining native CI runners at MVP. |

**Expo SDK 57 notes.** Install versions with `npx expo install`, use a development build for remote notifications, and configure foreground notification handling explicitly. SecureStore is for small encrypted key-value data, not source-of-truth records. See Expo's SDK 57-era [notifications](https://docs.expo.dev/versions/latest/sdk/notifications/), [storage guidance](https://docs.expo.dev/develop/user-interface/store-data/), and [authentication guidance](https://docs.expo.dev/develop/authentication/).

## 3. High-level architecture diagram

```text
                         Content author / future facilitator
                                      |
                         admin console (role-checked)
                                      |
                    publish -> validator -> immutable manifest
                                      v
Learner / Buddy app <-----> Supabase Storage (private packs/assets)
   |                              |
   | local SQLite                 +--> Postgres + RLS
   |  - bundled/cache packs       |     - identity, consent, links, sync data
   |  - progress/event outbox     |
   |  - simulator session         +--> Edge Functions
   |  - recap schedule                  - invitation / pairing / notification
   |                                      - signed upload / publish
   v
offline lesson, quiz, house, simulator
   |
Network available: authenticated pull + idempotent push
   |
Expo Push Service <--- Edge Function / scheduled job ---> APNs / FCM
```

## 4. Client/server responsibilities

| Locally, immediately | Server, eventually/when online |
|---|---|
| Onboarding preferences, accessibility mode, language, local device profile | Account identity, recovery, verified email, sessions and revoked sessions |
| House rendering/unlocks derived from locally stored progress | Backup and sync of learner-owned progress across devices |
| Tell Me, Try It, Quiz Me, generic simulator state, hints, scoring feedback | Publish content manifests/assets and record current pack eligibility |
| Quiz attempts, mission self-confirmation, recap due calculation, local reminders | Send Buddy/content pushes, server-side reminder fallback, delivery receipts |
| Pause Card, traffic-light learning, voluntary screenshot selection before upload | Store an explicitly shared image and its recipient/expiry; send Buddy notification |
| Content schema validation before activation and pack integrity verification | Authoring, review, publishing, revocation, audit, signed manifest generation |
| Anonymous/local diagnostic queue until consent | Aggregated, consented analytics and crash reports |

No simulator target, quiz answer, hint, house tap, or local recap requires a live request. A server must never decide whether a learner can continue an installed lesson merely because the device is offline.

## 5. Offline-first architecture

### Storage tiers

1. **Bundled read-only starter pack:** welcome, accessibility setup, traffic-light rule, and one complete Bedroom/Kitchen/Door/Brain Cafe starter path plus UI artwork, safety copy, schema and simulator templates. It makes a first launch useful without sign-in or download.
2. **SQLite canonical local store:** activated content packs, content manifest/version, learner profile and preferences, simulator snapshots, progress projections, attempts, completed real-life missions, recap schedule, locally scheduled notification IDs, and a durable append-only sync outbox.
3. **SecureStore:** session refresh credentials/device key references only.
4. **Filesystem cache:** downloaded versioned media and pack archives; checksum verified before activation, then garbage-collected only after a replacement is active.

### Synchronization protocol

Each mutable learner action creates an immutable `progress_event` locally with UUID, device ID, occurred-at (UTC), content version, entity type/id, and payload. The UI updates a local projection in the same SQLite transaction. When connectivity returns, the sync worker:

1. refreshes the session if possible; otherwise retains the outbox;
2. pushes events in batches with idempotency keys;
3. server inserts only unseen event IDs and updates server projections transactionally;
4. pulls changes since a per-user opaque cursor (new packs, Buddy changes, server events, deleted/revoked records);
5. applies in a SQLite transaction, recomputes derived local projections, then advances the cursor.

Retry with exponential backoff and jitter. Show a calm, non-blocking “saved on this device; will sync when online” state, never a technical error for ordinary offline learning. The user may manually tap “sync now.”

### Conflict rules

* **Learning progress:** event union, idempotent. Completion is monotonic within a content version; attempts are retained. “Restart” creates a new run, not a deletion. Derived house state is recomputed, so events from two devices converge.
* **Preferences:** last-write-wins using server-assigned revision plus client timestamp as tie-breaker; preserve an audit value only for sharing/consent changes.
* **Recaps:** server and device calculate the same deterministic schedule from completion event + quest version. Server may add a notification delivery record; device keeps the local reminder functional.
* **Buddy relationship / consent:** server revision wins; revocation wins over any concurrent share or notification. The client immediately blocks local new sharing on revoke.
* **Content:** immutable published versions. A running session pins its version. New version becomes active for new sessions; a security withdrawal disables a named version with an explanatory fallback.

### Offline authentication

First use can be a **local guest learner**. A signed-in user who has previously authenticated may use downloaded content and their local profile while offline for a limited grace period (e.g., 30 days); no server-only Buddy actions are available. Do not make users reauthenticate while offline. Sensitive operations (new Buddy pairing, changing recovery email, upload/share) require an online valid session. Lost/stolen device revocation takes effect when it next connects.

### Content packs

A pack is a zip/asset set plus JSON manifest: `pack_id`, semantic version, locale, minimum app/runtime schema version, dependency IDs, asset hashes/sizes, signature/key ID, publish/revoke dates, and compatibility flags. Download into a staging directory, validate schema and hashes, verify signature, migrate into SQLite, then atomically mark active. Retain the prior pack until successful activation. Use resumable download when assets become large; begin with small packs and normal HTTPS downloads for MVP.

## 6. Simulator architecture

Create one reusable **simulation runtime**, not bespoke lesson screens.

```text
Quest definition -> parser + schema validation -> simulator session reducer
   -> screen/component registry -> accessible simulated UI
   -> action interpreter -> transition/guard evaluator -> event recorder
   -> hint scheduler + pause/restart controls
```

### State machine model

A session state contains `screenId`, a typed context object (search term, selected item, player state, trap exposure), completed step IDs, hint level, retry count, and terminal status. A transition is defined as `event + optional guard -> context update + next screen/step + effects`. Effects are constrained: display narration, highlight target, schedule hint, record progress, present trap, or end session. Content is declarative and cannot execute JavaScript or arbitrary URLs.

### Reusable component registry

Initially provide: simulated phone frame, app grid, search box/keyboard, result list, generic media player, volume control, call/message list, message composer, dialog, system notification, fake ad/scam card, traffic-light selector, guided spotlight/highlight, choice quiz, and restart/help controls. Each component exposes semantic labels, focus order, minimum 48x48 dp target, large-text layout rules, screen-reader action names, and reduced-motion rendering.

The runtime accepts only whitelisted component names and action types such as `tap`, `type`, `select`, `play`, `pause`, `dismiss`, and `choose`. All fake apps use generic names and visuals; real screenshots are separate annotated, replaceable reference assets rather than interactive copies of third-party products.

### Hint ladder and safety

Hints are event-driven, not a punitive timer: learner can ask immediately; an optional quiet nudge occurs after an author-configured interval; then highlight; then narrated/plain-language instruction. There is no failure deadline. “Start over” resets the session locally and is available from every state. Trap outcomes explain the tactic without shame and may branch to the Pause Card; they never collect a real password, phone number, card number, or social-media credential.

### Simulator testing contract

The engine has pure reducer tests for every screen/action path, fixture tests for every published quest, generated transition coverage, and property tests that invalid actions cannot reach success, arbitrary content cannot render unregistered components, and every state has an accessible exit/restart route.

## 7. Content architecture

Use a **hybrid content model**:

* Versioned JSON is the portable instructional definition: rooms, objects, quests, simulator flows, hints, questions, traps, missions, localizable strings, and scheduling rules.
* Packaged/static assets are illustrations, audio, screenshots, and media alternatives referenced by immutable content IDs and hashes.
* PostgreSQL is the authoring/publishing catalog and access-control source, not the runtime's only source.

Example logical definition (illustrative, not implementation code):

```text
quest: kitchen.song.01@1.0.0
room/object: kitchen / radio
flows: tell -> simulator(video-search, generic-media-player) -> quiz -> mission -> recap
steps: search box -> result -> play -> volume
trap: fake-ad / traffic-light
locales: en, fil (later)
compatibility: simulator-runtime >= 1
```

### Authoring and publishing

For MVP, content lives as reviewed JSON/YAML source files in the repository and is transformed/validated by CI into signed pack artifacts. This is safer, cheaper, and more editorially accountable than immediately building a CMS.

After the content model is stable, add a constrained admin editor: guided forms, controlled vocabulary, preview using the real simulator renderer, draft/review/approved/published workflow, required accessibility fields, locale completeness checks, and a two-person approval for safety/scam content. Non-developers edit content through these forms; they cannot insert code, arbitrary components, or privileged links. Publishing writes immutable `quest_version` records and storage artifacts. Rollback selects a prior manifest; deleting published history is prohibited.

Validate with JSON Schema plus semantic rules: unique IDs, valid transitions/targets, referenced assets exist and hashes match, all accessibility labels/alt text/narration are present, no timed required step, all localizations resolve, and no unapproved outbound link/domain. Sign manifests in a trusted publish function; the app trusts an embedded public key and rejects altered packs.

## 8. Database/data model

Use UUID primary keys, UTC timestamps, `created_at`/`updated_at`, soft revocation where records are privacy/audit relevant, and `owner_user_id` on learner-owned rows. RLS is default deny. Content records are read-only to clients once published.

| Entity | Server? | Core relationships / purpose |
|---|---:|---|
| `auth.users` | Yes | Supabase identity; keep profile data separate. |
| `profiles` | Yes | User display name optional, role (`learner`, `buddy`, `content_editor`, `content_reviewer`, `admin`), locale. |
| `learner_profiles` | Yes + local cache | Comfort pace and low-sensitivity settings; no unnecessary DOB or health data. |
| `accessibility_preferences` | Yes + local | Text scale choice, high contrast, narration, reduced motion, simplified navigation, language. |
| `buddy_relationships` | Yes + local summary | Learner, buddy, status, created/revoked/paused dates, current consent policy revision. |
| `buddy_consents` | Yes | Granular scopes: progress summary, mission cheers, challenges, screenshot share; accepted/revoked time and policy text version. |
| `buddy_invitations` | Yes | Opaque token hash, inviter, intended email optional, expiry, single-use state. |
| `buddy_messages` / `buddy_replies` | Yes + local cache | Structured support cards and short replies; no unbounded chat MVP. |
| `buddy_challenges` | Yes + local cache | Collaborative song/trivia request, status, expiry, optional quest reference. |
| `notification_preferences` / `push_devices` | Yes + local setting | Consent, categories, Expo token, device install ID, last seen. |
| `rooms`, `room_objects` | Catalog server + packed local | Versioned content references; not mutable per learner. |
| `quests`, `quest_versions`, `quest_steps` | Catalog server + packed local | Stable quest id, immutable version data, publish status; steps may remain nested JSON for one pack fetch. |
| `simulator_screens`, `simulator_templates` | Catalog + packed local | Whitelisted definitions tied to runtime compatibility. |
| `hints`, `quiz_questions`, `trap_scenarios` | Catalog + packed local | Locale and content-version scoped; explanations including true and false examples. |
| `real_life_missions`, `recap_rules` | Catalog + packed local | Instruction/method and deterministic scheduling policy. |
| `content_packs`, `content_pack_versions`, `content_assets` | Yes + local manifest | Availability, signature/hash, locale, min runtime, asset metadata. |
| `learner_progress_events` | Yes + local authoritative until sync | Append-only idempotent event log keyed by client event UUID. |
| `learner_progress_projection`, `quiz_attempts`, `completed_missions`, `recap_schedules` | Yes + local | Query-efficient projections derived from events. |
| `media_shares` | Yes | Voluntary image metadata, owner, relationship, recipient, expiry/delete state; private storage path. |
| `audit_log` | Yes | Consent/pairing, sharing, publishing, admin operations; actor, action, target, metadata without content. |
| `organizations`, `facilitator_groups`, `pack_entitlements` | Later | Do not implement until facilitator/licensing work begins. |

Avoid storing raw quiz mistakes for Buddy reporting, real external post content by default, contacts, social accounts, device identifiers beyond a rotating installation ID, or precise behavioral telemetry. For pilot research, collect separately consented, de-identified measures with a retention date.

## 9. Authentication and Buddy architecture

### Learner onboarding

Let a learner start locally without account creation. First-run setup asks only language, accessibility/narration, comfort pace, and whether to use the app offline. Prompt for account recovery after the learner has experienced value or when they explicitly request backup/Buddy features. Use large-step magic-link/email passkey flow, with a clear caregiver-assisted setup path that never gives the caregiver control of the learner account. A memorable optional device PIN can protect app re-entry but is not a replacement for server authentication.

### Buddy lifecycle

1. Learner selects **Invite a Buddy**, sees a plain-language sharing summary and chooses scopes.
2. Server creates a short-lived, single-use opaque invitation link/QR; sending it uses the learner's deliberate share action.
3. Buddy signs in/creates their own account and accepts the invitation.
4. Learner must confirm the named Buddy and scopes in-app; only then is relationship active.
5. Buddy receives only explicitly allowed summaries/events. No quiz mistakes, real-device monitoring, feed access, location, contacts, or screenshots unless directly selected for that share.
6. Learner can pause (stops delivery) or revoke (invalidates access and pending shares) in one visible place. Buddy may leave. Both actions produce a minimal audit event and a polite notification.

The MVP Buddy surface is an opt-in progress cheer, voluntary Ask Buddy card with optional selected screenshot, one collaborative challenge, and weekly digest only if enabled. Screenshot share requests upload only after preview and confirmation, use a random object path and recipient-specific signed URL, default-expire (for example 30 days), and can be deleted/revoked by the learner.

## 10. Security and privacy architecture

* **Minimize:** profile aliases optional; do not need age, diagnosis, address, contacts, social credentials, payment data, raw external posts, or precise location to deliver the MVP.
* **Transport/at rest:** TLS everywhere; provider encryption at rest; device session secrets in OS Keychain/Keystore; private Storage buckets. Encrypt especially sensitive share metadata at application level only if threat model/legal review requires it; ordinary progress is protected by RLS and managed encryption.
* **Authorization:** Supabase Auth JWT -> RLS. Learner sees/writes their data. Buddy has no direct broad table access; server functions expose consent-checked views. Content editor drafts; reviewer approves; publisher/admin releases. Service-role key only in Edge Function server secrets, never app or admin browser.
* **Session safety:** short-lived access token + rotating refresh session; revoke all sessions from account settings. Online reauthentication required for recovery/contact/Buddy consent changes. Rate limit login, invitation, upload, and send operations.
* **Uploads:** MIME/size allow-list, signed upload URL, malware scan/quarantine before delivery if public/pilot threat model warrants it, strip metadata where feasible, private delivery, automatic expiry.
* **Content integrity:** CI/schema validation, review gates, immutable versions/manifests, asset checksums and signature verification. App falls back to bundled safe content if a remote pack fails verification.
* **Observability:** audit consent, pairing, sharing, content publish, role assignment, deletion/export; never log lesson free-text, tokens, message/screenshot content, passwords, or sensitive support details. Set retention limits and deletion/export workflows before public launch.
* **Governance:** publish a plain-language privacy notice, data-retention schedule, incident process, and age/region legal review before launch. Security and accessibility review are release gates for any new sharing or content capability.

## 11. Accessibility architecture

Accessibility belongs in the design system and content contract.

* A single `TukiButton`, card, text, dialog, choice, focus-order, narration and house-hotspot component set owns accessible role/label/hint/state, 48 dp minimum targets, scalable layout and contrast tokens. Avoid naked touchables and canvas-only interactive controls.
* Respect OS font scale; do not cap it. Test at at least 100%, 150%, and largest supported practical size. Reflow/reveal content rather than clip, overlap, or rely on side-by-side microcopy.
* Provide high-contrast tokens, non-color traffic-light labels/icons, clear focus states, no hidden gestures, an obvious Back/Help/Start over on every task, and no timed required interaction.
* System TTS reads content on demand, controls are keyboard/switch/screen-reader usable, and narration has visible text. Avoid auto-playing audio. Preserve user voice/rate preferences where platform APIs permit.
* `prefers-reduced-motion` / OS reduced-motion setting eliminates nonessential transitions; house progress has static alternatives. Support locale and RTL preparation even though languages beyond the initial locale are later.
* Content validation rejects missing alt text, accessible action labels, plain-language transcript, or equivalent non-drag/non-gesture action.
* Automated checks cover labels, roles, target sizes where measurable, contrast linting/token review, simulator focus traversal and font-scale visual regression. Manual VoiceOver/TalkBack, keyboard/switch, and real older-adult testing remain mandatory because automation cannot judge clarity, anxiety, or comprehension.

## 12. Repository and folder structure

Use a **single monorepo** after adding backend/admin work. Keep the current Expo app as `apps/mobile`; do not split until teams/release cycles are genuinely independent. pnpm workspaces plus Turborepo is optional; plain npm workspaces is sufficient for an MVP.

```text
tuki/
  apps/
    mobile/                 # current Expo Router app
      src/app/              # routes/presentation shells
      src/features/         # house, onboarding, quest, Buddy, Brain Cafe
      src/core/             # domain, application use cases, data adapters
      src/simulator/        # runtime, reducer, component registry, fixtures
      src/content/          # pack install/read, bundled seed pack
      src/storage/          # SQLite schema/migrations/repositories/outbox
      src/sync/             # pull/push/conflict/application
      src/accessibility/    # tokens, primitives, assistive helpers
      src/i18n/
    admin/                  # later: content/editor dashboard
  packages/
    content-schema/         # JSON Schema, validators, pack builder
    domain/                 # typed domain events/constants shared sparingly
    ui-tokens/              # colors/type/spacing/accessibility contracts
    test-fixtures/          # valid/invalid packs and simulator scenarios
  supabase/
    migrations/             # SQL schema/RLS/indexes
    functions/              # invitation, notification, publish functions
    seed/                   # non-production demo data
  content/
    packs/                  # reviewed source lesson definitions/assets manifest
  docs/
    architecture-plan.md
    adr/
  .github/workflows/
```

Within each feature, keep presentation components separate from application use cases and data adapters, but do not create a “clean architecture” layer for every button. The simulator and content package are explicitly separate because they are the reusable product core.

## 13. Infrastructure and deployment

| Environment | Purpose | Data / controls |
|---|---|---|
| Local | Expo development build, local Supabase CLI stack where helpful | Synthetic accounts/content only; `.env.local` ignored. |
| Development | Shared integration | Separate Supabase project, test push credentials, seeded fake data. |
| Staging | Release candidate / pilot rehearsal | Separate project and bucket; production-like policies; no production PII. |
| Production | Real learners | Separate Supabase, least-privilege secrets, backups, monitoring and restricted admin. |

### Delivery and operations

* Pull request CI: TypeScript/lint, unit/component tests, pack schema and simulator fixture validation, SQL migration dry run, RLS tests, secret scan, and build smoke test.
* Main branch deploys dev. Tagged release promotes immutable content/app candidate to staging, manual accessibility/security approval promotes production.
* Use EAS Build profiles for internal, preview, and production. Submit signed builds to Play/App Store. Use EAS Update only for compatible JavaScript/assets; never use it to silently weaken consent/security and always retain release rollback.
* Apply database changes only through numbered, reviewed Supabase migrations; never console-edit production schema. Nightly database backup/PITR availability, quarterly restore drill, storage lifecycle/backup policy, and documented data deletion workflow.
* Put Supabase service role, Expo access token, Sentry auth token, signing private key, and push credentials in CI/hosting secret stores. Mobile public keys/URLs are configuration, not secrets.
* Monitor availability, Edge Function errors/latency, sync failure rate, notification receipts, pack activation failures, crash-free users, database/storage spend, and backup jobs. Page a human only for availability/security; pilot support can receive daily summaries.

## 14. Testing strategy

| Test | Automate | Requires device / people |
|---|---:|---:|
| Domain/use-case and reducer unit tests | Yes | No |
| Components at normal/large fonts, tokens and visual snapshots | Yes | Validate selected real devices |
| Simulator transitions, hints, traps, restart/property tests | Yes | Explore confusing paths with users |
| Content schema, localization/accessibility completeness, pack integrity | Yes on every PR/publish | Editorial and safety review |
| SQLite migrations, outbox, retry, duplicate delivery, conflict/revocation | Yes (network simulation) | Airplane-mode/OS-kill tests on Android/iOS |
| RLS, Edge Function authorization, rate limits, signed upload access | Yes in isolated project | Periodic penetration/security review |
| Notification deep links/local recaps | Partially | Physical Android/iOS devices, permission states |
| End-to-end learner/Buddy pairing and revocation | Yes (staging accounts) | Usability test consent comprehension |
| Accessibility | Automated lint/snapshot partial | VoiceOver/TalkBack, font scale, contrast, switch/keyboard |
| Learning/safety effectiveness | Instrumented aggregate study | Pilot with 20-30 older adults and caregivers; real-device skill transfer |

Use Detox/Maestro for mobile E2E after core paths stabilize; do not delay the MVP for a vast E2E suite. The strongest acceptance measures from the specification are completion of a real-phone task days later, appropriate pause behavior, confidence without overconfidence, and clear comprehension of Buddy boundaries—not DAU or streaks.

## 15. MVP architecture

Implement only:

* Onboarding, offline guest mode, accessibility settings, one initial language, optional narration.
* Illustrated house with Bedroom, Kitchen, Door & Mailbox, and Brain Cafe; visible progress/garden but no public rankings.
* Bundled content plus downloadable pack framework; initial content authored/reviewed in repository, not a CMS.
* Generic simulator runtime covering phone/message/call/media/search, fake ad/scam, hints, restart and traffic-light choices.
* Learning progress event/outbox and recap calculation; local scheduled reminders, then opt-in remote fallback.
* Supabase Auth/back-up for those who elect it; basic invited/confirmed Buddy relationship, consent scopes, one challenge, progress cheer/digest, and voluntary screenshot share.
* Supabase RLS/Storage/Edge Functions, Expo Push, basic Sentry, privacy-preserving pilot analytics only if consent-ready.

The house/scenes should load from a static manifest but can be intentionally small. A native development build is required for production push testing; full offline gameplay remains testable without it.

## 16. Future architecture

Add only when user research proves value:

* Living Room, Study, Feed Fix and more simulator templates; social-app share-to-Tuki needs platform-specific share extensions and a fresh privacy/security review.
* Multiple languages, local/nostalgia packs, recorded narration pipeline, region-specific content editorial workflow.
* Facilitator/admin dashboard, organizations, groups, pack assignments and aggregate/group consent—not individual surveillance.
* Pack entitlement/licensing, family subscription/billing and organization reporting: introduce payment/tax tooling only with the business model.
* Rich Buddy interactions only after moderation, reporting, safety and retention requirements are funded.
* A dedicated Node/Nest API or queues/search service only if Edge Functions/Postgres are constrained by durable workflows, third-party integrations, high-volume jobs, or team boundaries.
* AI is not planned. If later explored, restrict it to reviewed explanatory drafts with human approval; never let it issue fact verdicts, assess a real post, or silently profile a learner.

## 17. Estimated infrastructure costs

Amounts are planning ranges in USD/month and require vendor quote verification immediately before purchase. Development labor, Apple/Google developer accounts, legal/privacy review, user research incentives, paid content production, and support are excluded.

| Scale | Likely setup | Indicative monthly infra | Main drivers / action |
|---|---|---:|---|
| Prototype / 20-30 users | Supabase/Expo/Sentry free or entry tiers, local packs, minimal storage | $0-50 | Store accounts and test devices dominate more than cloud. Keep analytics optional. |
| 1,000 users | Small paid Supabase, EAS plan/build credits, Sentry/PostHog entry plan, object storage | $50-300 | Builds, database/project tier, monitoring; push service is usually not the driver. |
| 10,000 users | Paid DB with backups/PITR, more storage/egress, monitoring, managed analytics | $500-2,500 | Media/audio pack downloads and analytics retention start to matter; measure egress, prune packs. |
| 100,000 users | Sized Postgres/read replicas or migration plan, CDN/object storage, queue/jobs, enterprise support/security review | $5,000-20,000+ | Content/media delivery, support/operations, observability and availability—not basic quiz rows. |

Keep base costs down by bundling the first pack, using on-device TTS, local reminders, generic UI instead of streamed video, image/audio size budgets, asset caching/expiry, aggregate analytics, and no always-on AI. Reassess every quarter using actual MAU, pack download GB, database CPU, storage, function invocations, notification volume, error retention and support load.

## 18. Architecture Decision Records

### ADR-001: React Native/Expo rather than Flutter

* **Decision:** Retain Expo SDK 57 / React Native / TypeScript.
* **Alternatives considered:** Flutter; native iOS + Android.
* **Why:** Existing project is Expo, application needs standard accessible controls plus a data-driven simulator, and TypeScript can be shared with content tooling, admin and Edge Functions.
* **Trade-offs:** Flutter can offer highly consistent custom rendering; RN requires careful cross-platform visual/device testing. A few native capabilities may require development builds/config plugins.
* **Reconsider when:** the house/simulator demonstrably needs a high-frame-rate game renderer or native accessibility/animation requirements cannot be satisfied.

### ADR-002: Supabase managed backend rather than a conventional API

* **Decision:** Supabase Auth/Postgres/Storage/RLS/Functions is the initial backend.
* **Alternatives considered:** Firebase; Laravel; Node/NestJS; fully local/no backend.
* **Why:** Server features are real but narrow: account recovery, sync, consented Buddy exchange, notifications and remote content. Supabase supplies them without a separately operated API and PostgreSQL handles relationships well.
* **Trade-offs:** Platform coupling and RLS/SQL expertise; complex background work may outgrow Functions. Fully local loses recovery/Buddy/content updates; Firebase shifts data model complexity to documents.
* **Reconsider when:** integrations/workflows or scale require a dedicated API/service boundary, or regulatory/data residency needs cannot be met.

### ADR-003: Relational PostgreSQL rather than document database

* **Decision:** PostgreSQL server-side; JSONB only inside versioned content payloads where it is naturally document-shaped.
* **Alternatives considered:** Firestore/DynamoDB/MongoDB; entirely JSON file storage.
* **Why:** Relationships, consent/revocation, invitations, roles, audit, querying and reporting require transactions and joins. Immutable content packs remain JSON.
* **Trade-offs:** Schema migrations and SQL/RLS testing required; JSON queries are simpler in document stores.
* **Reconsider when:** content authoring/search dominates every server workload and relational relations no longer matter (unlikely).

### ADR-004: SQLite local database rather than key-value-only storage

* **Decision:** Expo SQLite owns local progress/content/outbox.
* **Alternatives considered:** AsyncStorage/MMKV; WatermelonDB; Realm.
* **Why:** Atomic local projections and outbox operations make offline sync reliable, and content/progress are structured data.
* **Trade-offs:** Migration/repository discipline; larger implementation than a simple key-value store.
* **Reconsider when:** synchronization/query needs are trivial (not expected) or data volume/replication needs a proven higher-level sync library.

### ADR-005: Password-light Supabase Auth with offline guest mode

* **Decision:** Local guest first; magic-link/passkey-oriented account recovery for connected features.
* **Alternatives considered:** mandatory passwords; social login only; phone OTP only; anonymous permanent accounts.
* **Why:** Older learners should not be blocked by account friction, yet backups/Buddy identity need real accounts.
* **Trade-offs:** Email access/support must be designed carefully; passkey availability and OTP cost/delivery vary.
* **Reconsider when:** research shows users reliably prefer a different familiar authentication route.

### ADR-006: Signed hybrid content packs

* **Decision:** Bundled starter content plus signed downloadable immutable JSON/assets; repository authoring first, constrained CMS later.
* **Alternatives considered:** hard-coded screens; live database-only content; commercial headless CMS immediately.
* **Why:** Offline use, safe updates, editorial review, version pinning and low MVP cost.
* **Trade-offs:** Requires pack tooling/validation; a CMS comes later rather than day one.
* **Reconsider when:** non-developer publication cadence makes reviewed repository authoring too slow.

### ADR-007: Declarative state-machine simulator

* **Decision:** A whitelisted reusable simulator engine renders content-defined flows.
* **Alternatives considered:** one custom UI per lesson; embed real apps/web pages; full game engine.
* **Why:** Safe, offline, generic, testable, legally safer than copying brands, and supports future lessons without repeated code.
* **Trade-offs:** Initial runtime/schema design cost; new interaction types require app updates.
* **Reconsider when:** a lesson needs an interaction type outside the registry often enough to justify a new component or renderer.

### ADR-008: Monorepo rather than multiple repositories

* **Decision:** One repository for mobile, schema/content tooling, Supabase and later admin.
* **Alternatives considered:** mobile/backend/admin separate repositories.
* **Why:** One small team needs atomic changes across app/content/schema and shared type/test fixtures.
* **Trade-offs:** CI/setup grows; repository permissions are less granular.
* **Reconsider when:** independent teams, deployment cadence, or external partners require separate ownership.

## 19. Recommended implementation order

1. Validate the requirements with 15-20 older adults/caregivers: language, onboarding, Buddy consent comprehension, physical-device variations, one Kitchen quest and Pause Card paper prototype.
2. Establish the monorepo boundary without moving code unnecessarily; add UI accessibility tokens, domain event vocabulary, content JSON Schema, seed pack and simulator fixtures.
3. Build the offline shell: SQLite migrations, pack installer, local progress event/outbox, guest profile, accessibility setup, house navigation and local recap schedule.
4. Build and test the simulator runtime before expanding content: generic phone/media/search/message/trap components, reducer, hint ladder, restart and accessibility contract.
5. Deliver the four MVP areas using the same content/simulator engine: Bedroom, Kitchen, Door & Mailbox/Pause Card, Brain Cafe; validate actual phone transfer with participants.
6. Create Supabase dev/staging projects: Auth, schema/RLS, event sync, storage and content manifest delivery. Exercise airplane-mode, duplicate, multi-device and revoke conflicts.
7. Add opt-in remote account recovery, then the smallest Buddy flow: invitation, learner confirmation/scopes, cheer/challenge, voluntary expiring screenshot share, pause/revoke.
8. Add local reminders, then remote Expo push with a development build and conservative permission timing. Add scrubbed Sentry and consented aggregate pilot measurements.
9. Harden: automated pack/RLS/sync tests, device accessibility testing, backup/restore drill, deletion/export, threat review, content safety/review process and staged pilot release.
10. After the pilot demonstrates real learning transfer and manageable support, decide which later component earns investment: CMS/editor, more rooms, Feed Fix/share extension, languages, or facilitator work.

## Reference notes

* Product requirements: `Tuki.pdf`, supplied with this project (primary source).
* Expo SDK 57 reference set: [Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/), [notification behavior](https://docs.expo.dev/push-notifications/what-you-need-to-know/), [SecureStore/storage](https://docs.expo.dev/develop/user-interface/store-data/), [Expo authentication](https://docs.expo.dev/develop/authentication/), and [Expo Push Service](https://docs.expo.dev/push-notifications/overview/). Verify pricing, supported SDK package versions, legal/regional needs, and vendor limits during procurement rather than treating this plan's cost ranges as quotes.

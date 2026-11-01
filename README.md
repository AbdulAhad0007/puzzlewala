# PuzzleWala

*Khelo, Jodo, Seekho!* An Android jigsaw learning game for children aged 3–6, built with Expo, on a Supabase backend shared by multiple games.

## Run it

```bash
npm install
cp .env.example .env.local   # then fill in the values
npx expo start --android
```

The app also runs with no Supabase values at all. It then saves locally only, shows "Cloud backup isn't set up" in the Parent Zone, and syncs later if values are added.

**Only `EXPO_PUBLIC_` values reach the app.** Never give a service-role key, secret key, JWT secret or database password that prefix. The app refuses to use a privileged key if one is configured.

## Releasing

Set the same new version in `app.json` (`expo.version`) and `package.json` (`version`), commit, and push to `main`. GitHub Actions then tests the code, builds an APK, and publishes it as a GitHub Release. Any other push does nothing.

The workflow needs these repository secrets (Settings > Secrets and variables > Actions): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_GAME_UUID`.

Release APKs are currently signed with the Expo template's debug key. That's fine for installing directly, but Google Play needs your own signing key.

On Windows, local native builds fail in a long project path, because of the 260-character limit. Build from a very short folder such as `D:\p`, or rely on the workflow.

## Checks

```bash
npm test             # unit tests; sync logic runs on real SQLite with a fake server
npm run test:rls     # security rules on the real database, as real roles; always rolled back
npm run test:cloud   # the real sync code against the real project; removes its test data
npm run typecheck
npx expo lint
npx expo-doctor
```

`test:rls` and `test:cloud` read admin credentials from `.env.local`. They are development tools and are never bundled.

## Backend

Migrations are in `supabase/migrations`. Apply them with `npx supabase db push --db-url "<connection string>"`.

```
auth.users
  └─ app_installations (owner_user_id, one per login)
       └─ child_profiles (shared across games)
            ├─ game_child_profiles ─┐
            ├─ game_progress        │
            ├─ game_settings        ├─ each also has game_id → games (registry, read-only for apps)
            ├─ game_sessions        │
            └─ game_rewards ────────┘
```

- **Ownership:** every row is checked by walking back to `auth.uid()`. The client never supplies an installation ID, and knowing a UUID or Child ID grants nothing.
- **Deleting:** deleting a child or login cascades to its data. A game with data can't be deleted; retire it by setting `games.status`.

### Adding another game

1. Insert it into `games` with a migration, and let PostgreSQL generate the UUID.
2. Give that app its own `EXPO_PUBLIC_GAME_UUID`, plus a `slug` and `displayIdPrefix` in its `gameConfig.ts`.

**Known limit:** anonymous logins belong to one app install. Two different game apps on one phone are two different logins, so they can't share a child profile yet. The schema is ready for it, but sharing needs a way to link logins, such as a parent account.

**What game isolation is:** rows are separated by `game_id`, and every query filters by it. It keeps games' data from mixing. It is not a security wall between your own games, because all of them share one publishable key and one set of rules. The security boundary is between users.

## Offline sync

SQLite is the source of truth. Each change writes the data and a queue entry in one transaction, so play never waits on the network. `syncManager` sends the queue in order, then pulls cloud data once the queue is empty.

| Data | Conflict rule |
| --- | --- |
| Progress | Best of both: completed if either is, highest stars, highest attempts. Order doesn't matter |
| Profile, settings, session | Newest `updated_at` wins. Older writes are ignored |
| Rewards | Insert-only, keyed by an app-generated id, so a retry can't award twice |
| Reset, delete | Applied in queue order. Pending writes they replace are dropped |

- Client timestamps are capped at server time + 5 minutes, so a wrong clock can't win forever.
- Connection failures retry forever, with backoff from 2 seconds up to 5 minutes.
- A change the server refuses 8 times is set aside so it can't block the rest. The Parent Zone shows the count, and "Back Up Now" retries it.
- There is one resumable session per child per game: the last unfinished puzzle.
- Daily counters (streak, play time) stay on the device.

## Layout

| Folder | What's there |
| --- | --- |
| `src/screens`, `src/screens/onboarding` | App and first-run screens |
| `src/navigation` | Root stack, tab bar, route types |
| `src/components` | `JigsawBoard`, `DraggablePiece`, `ParentMathGate`, `ChildProfileForm`, shared UI |
| `src/context` | Zustand store, the UI's view of local data |
| `src/constants/gameConfig.ts` | Which game this app is, and backend settings |
| `src/services/gameRepository.ts` | All data writes: local data plus a queue entry |
| `src/services/storage` | SQLite, sync queue, sync manager |
| `src/services/supabase` | Client, auth, one module per table group |
| `src/types`, `src/data`, `src/utils`, `src/theme`, `src/i18n`, `src/hooks` | Types, puzzle content, helpers, tokens, strings, hooks |

## Before release

- Decide how long to keep data from abandoned anonymous logins, and add a cleanup job. Uninstalling loses the login, which leaves its cloud data orphaned.
- Turn on CAPTCHA or rate limits for anonymous sign-ins in the Supabase dashboard.
- Have a lawyer review the privacy text in `src/i18n/strings.ts`, parental consent, and applicable child privacy law (COPPA, GDPR-K, India's DPDP Act), and publish a privacy policy.
- Complete Google Play's Data Safety form and Families policy review. The app now sends data off the device.
- Have a native speaker review the Hindi strings.
- Replace the placeholder package name `com.puzzlewala.app`.

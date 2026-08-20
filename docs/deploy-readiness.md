# Deploy readiness

First checked 20 August 2026 against `9268fe7`. Re-checked the same day, after the fixes
below, against the working tree that became this commit. Every gate was run locally, in
full, on Node v22.23.2 and pnpm 11.18.0. Nothing interactive was run and no login was
attempted.

The claim under test: `vercel login` is the last step, and everything behind it is ready.

The first pass found five failures. Four of them were repo work and are now fixed — host
config, the redirect URI, the README placeholder, and `.gitignore`. The fifth needs a
Spotify account and cannot be done here. What is left for a person is at the end.

---

## Gates

| #   | Item                                           | Result                                  |
| --- | ---------------------------------------------- | --------------------------------------- |
| 1   | `pnpm typecheck`                               | **PASS**                                |
| 2   | `pnpm lint`                                    | **PASS**                                |
| 3   | `pnpm test`                                    | **PASS**                                |
| 4   | `pnpm build`                                   | **PASS**                                |
| 5   | `pnpm test:e2e`                                | **PASS**                                |
| 6   | Workspace packages resolve on a clean checkout | **PASS**                                |
| 7   | Host config (`vercel.json` or equivalent)      | **PASS**, unproven until a deploy runs  |
| 8   | Environment variables documented               | **PASS**                                |
| 9   | Redirect URI correct in production             | **PASS** in code, one manual step left  |
| 10  | Secrets exist before a deploy would work       | **PASS** for demo, **FAIL** for Spotify |
| 11  | README placeholder line removed                | **PASS**                                |
| 12  | `.vercel` ignored by git                       | **PASS**                                |

---

### 1. Typecheck — PASS

`pnpm typecheck` ran `tsc --noEmit` over all three projects. `packages/core`,
`packages/spotify` and `apps/web` each reported `Done`. Exit 0.

### 2. Lint — PASS

`eslint . && prettier --check .` exited 0. "All matched files use Prettier code style."
The `no-html-link-for-pages` note about a missing `pages` directory is eslint telling you
this is an App Router app; it is not a finding.

### 3. Unit tests — PASS

40 files, **1390 tests, 1390 passed**, 4.47s. Exit 0. Seven of those are new: the redirect
URI had no test at all before item 9, and now has its own file at `apps/web/test/env.test.ts`.

### 4. Build — PASS

`next build` with Next.js 16.3.1 and Turbopack. Compiled in 333ms, TypeScript clean,
5 static pages generated. Exit 0. Five routes:

```
┌ ƒ /
├ ○ /_not-found
├ ƒ /api/auth/callback
├ ƒ /api/auth/login
└ ƒ /api/auth/logout
```

Three of those are `ƒ` — server-rendered on demand. They need a real Next.js runtime on
the host, not a static upload. This matters for item 7.

### 5. End-to-end — PASS

Playwright against demo mode: **44 passed**, 10.8s. Exit 0. No credentials needed, which is what
the CI comment claims and this confirms.

One thing worth writing down, because it cost a run. `playwright.config.ts` sets
`reuseExistingServer: !process.env.CI` against a hardcoded `http://localhost:3000`. On
this machine an unrelated project's dev server held port 3000, so the suite ran against
_that_ app: 40 failed, 4 passed. The pass above came from the same
suite pointed at a free port. CI is unaffected — `CI` is set there, so nothing is reused —
but locally, a red run with everything missing means check what is on 3000 before
believing it.

### 6. Workspace resolution — PASS

Worth checking, because it is the usual way a monorepo builds locally and fails on a
host. It does not fail here. `@pm/core` and `@pm/spotify` both export source directly:

```json
"exports": { ".": "./src/index.ts" }
```

and `apps/web/next.config.ts` lists both under `transpilePackages`. No `dist/` is
involved — confirmed by `ls -d packages/*/dist`, which found none, while the build still
passed. So there is no prebuilt artifact quietly propping up the local build.

### 7. Host config — PASS, unproven until a deploy runs

**Was:** no `vercel.json`, and no host config of any kind. The Next.js app sits at
`apps/web`, not the repo root, and the root `package.json` has no `next` dependency — so a
host pointed at the repo root would not detect a Next.js app, would run the root `build`
script, and would then look for output at the root while the build wrote to
`apps/web/.next`. The three dynamic routes above would not become functions.

**Now:** `vercel.json` at the repo root says where everything is:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "installCommand": "pnpm install --frozen-lockfile",
  "buildCommand": "pnpm --filter @pm/web build",
  "outputDirectory": "apps/web/.next"
}
```

The build command is the one this repo already uses, and `apps/web/.next` is where it
demonstrably writes — item 4 above produced exactly that directory. The Root Directory
stays at the repo root, which is what makes the pnpm workspace install once and resolve
`workspace:*` links.

Honest limit: no deploy has run, so this is checked against what the build does, not
against what Vercel does with it. If the project is instead linked with Root Directory set
to `apps/web` in the dashboard, this file is ignored — Vercel reads `vercel.json` from the
root directory it was given. Pick one; do not set both.

### 8. Environment variables documented — PASS

`.env.example` describes all three values: `SPOTIFY_CLIENT_ID`, `SESSION_SECRET`, and
`SPOTIFY_REDIRECT_URI`. It is accurate about PKCE needing no client secret, and it gives
the command to generate a session secret.

The trap in the first pass was the third value, framed as "only needed if you are not on
localhost". Item 9 removed the trap rather than reworded it; the file now says what to
register on Spotify's dashboard and gives the exact line.

### 9. Redirect URI in production — PASS in code, one manual step left

**Was:** `apps/web/src/lib/env.ts` fell back to a hardcoded
`http://localhost:3000/api/auth/callback` whenever `SPOTIFY_REDIRECT_URI` was unset. A
deploy with a client id and a session secret but no redirect URI reported itself fully
configured, offered a Connect button, and sent people to Spotify asking to be sent back to
localhost. Silent, not loud.

**Now:** there is no hardcoded host anywhere in the auth path. `DEFAULT_REDIRECT_URI` is
gone. In its place:

- `CALLBACK_PATH` — `/api/auth/callback`, written down once.
- `SpotifyEnv.configuredRedirectUri` — `SPOTIFY_REDIRECT_URI` verbatim, empty when unset.
- `redirectUriFor(env, origin)` — the only place the value is decided. The configured
  value wins when there is one, because Spotify matches the string exactly and a
  registered URI can differ from the origin a request arrived on. With nothing set, the
  answer is the origin the request actually came in on.

Both `login/route.ts` and `callback/route.ts` already held that origin in
`request.nextUrl.origin` and used it for their other redirects; now they pass it here too.
So a deploy with no `SPOTIFY_REDIRECT_URI` set asks Spotify to return to the deployment,
not to localhost, and a mismatch fails visibly on Spotify's page instead of quietly.

`apps/web/test/env.test.ts` covers it: configured wins, whitespace is trimmed, unset means
empty rather than a guessed host, and the fallback resolves against the origin — including
localhost, so `pnpm dev` still needs nothing set.

What code cannot do is register the URI on Spotify's side. That is item 10 and it is
Matthew's.

### 10. Secrets — PASS for demo, FAIL for Spotify

Two different answers, and the difference is the point.

**Demo mode needs nothing.** `readSpotifyEnv` never throws; a missing value returns
`{ kind: 'demo', reasons }`. The e2e suite proves this — 44 tests, no credentials. A
deploy with an empty environment comes up and works against the synthetic catalog.

**Real Spotify needs three things, none of which exist yet**, and two live outside this
repo where no amount of local checking can confirm them:

- `SPOTIFY_CLIENT_ID` from a registered Spotify app.
- `SESSION_SECRET`, 32+ characters, enforced at `env.ts:41`.
- The production callback URL registered as a redirect URI on the Spotify dashboard.
  This is a manual step on Spotify's site. It cannot be done before the deploy URL is
  known, which means it cannot be done before the first deploy.

That last item still makes a working Spotify login a two-pass job — deploy, learn the URL,
register it — but item 9 shortened it. The app now derives the callback from its own
origin, so there is nothing to set afterwards unless a custom domain differs from the
deployment origin.

### 11. README placeholder — PASS

The line that promised a link is gone. What stands in its place says there is no hosted
copy and no link to one, names what is actually left (a Spotify app, a session secret, a
callback URL registered on Spotify's dashboard), and points here. It promises nothing.

### 12. `.vercel` ignored — PASS

`.gitignore` now carries `.vercel/`, beside `.next/`. Linking a project writes
`.vercel/project.json`, holding the project and org ids; the next commit would otherwise
sweep it in.

---

## Verdict

**The code was ready before, and now the repo around it is too.**

Six gates green as before: typecheck, lint, 1390 unit tests, a clean production build, 44
e2e tests, workspace resolution. Four of the five first-pass failures were repo work and
are fixed — the host config exists, the redirect URI comes from configuration or from the
request rather than from a hardcoded localhost, the README promises nothing, and `.vercel`
is ignored.

What is left is not code. It is a Spotify app, two values pasted into a host, and one URL
registered on a dashboard — and none of that can happen here, because all of it needs an
account.

**A demo-mode deploy should now work with no secrets at all.** A deploy where Connect
works needs the list below.

---

## What Matthew must do

In order. Steps 1 and 2 need no deploy; the rest do.

1. **Register a Spotify app** at https://developer.spotify.com/dashboard. Copy the client
   id. There is no client secret — the app uses PKCE, which does not need one.
2. **Generate a session secret**: `openssl rand -base64 32`. Any 32+ character string
   works; under 32 the app stays in demo mode on purpose.
3. **`vercel login`, then link the project** from the repo root. Leave Root Directory at
   the repo root so `vercel.json` is the thing that configures the build. If you set it to
   `apps/web` instead, delete `vercel.json` — two answers is worse than either one.
4. **Deploy.** With no environment variables set it comes up in demo mode and works. That
   is the cheap way to prove the host config before credentials enter the picture.
5. **Note the production URL** the deploy hands back — that is the only place the callback
   URL can come from.
6. **Add the redirect URI on Spotify's dashboard**, under the app's settings, exactly:

   ```
   https://<your-production-host>/api/auth/callback
   ```

   Character for character, no trailing slash. Spotify compares strings.

7. **Set two environment variables on the host**, for Production: `SPOTIFY_CLIENT_ID` and
   `SESSION_SECRET`. Leave `SPOTIFY_REDIRECT_URI` unset — the app derives the callback from
   the origin the request arrived on, which is the URL from step 5. Set it only if a custom
   domain in front of the deployment differs from the origin Spotify is told to return to,
   and if you do, it must match step 6 exactly.
8. **Redeploy** so the new variables are picked up, and press Connect. The crown says which
   mode it is in, so it will tell you whether step 7 landed.

If a link ever exists, the README is where it goes.

# Deploy readiness

Checked 20 August 2026 against `9268fe7`, on a clean tree. Every gate below was run
locally, in full, on Node v22.23.2 and pnpm 11.18.0. Nothing interactive was run and
no login was attempted.

The claim under test: `vercel login` is the last step, and everything behind it is ready.

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
| 7   | Host config (`vercel.json` or equivalent)      | **FAIL**                                |
| 8   | Environment variables documented               | **PASS**, with one trap                 |
| 9   | Redirect URI correct in production             | **FAIL**                                |
| 10  | Secrets exist before a deploy would work       | **PASS** for demo, **FAIL** for Spotify |
| 11  | README placeholder line removed                | **FAIL**                                |
| 12  | `.vercel` ignored by git                       | **FAIL**                                |

---

### 1. Typecheck — PASS

`pnpm typecheck` ran `tsc --noEmit` over all three projects. `packages/core`,
`packages/spotify` and `apps/web` each reported `Done`. Exit 0.

### 2. Lint — PASS

`eslint . && prettier --check .` exited 0. "All matched files use Prettier code style."
The `no-html-link-for-pages` note about a missing `pages` directory is eslint telling you
this is an App Router app; it is not a finding.

### 3. Unit tests — PASS

39 files, **1383 tests, 1383 passed**, 4.45s. Exit 0.

### 4. Build — PASS

`next build` with Next.js 16.3.1 and Turbopack. Compiled in 2.6s, TypeScript clean,
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

Playwright against demo mode: **44 passed**, 13.4s. Exit 0. No credentials needed, which
is what the CI comment claims and this confirms.

### 6. Workspace resolution — PASS

Worth checking, because it is the usual way a monorepo builds locally and fails on a
host. It does not fail here. `@pm/core` and `@pm/spotify` both export source directly:

```json
"exports": { ".": "./src/index.ts" }
```

and `apps/web/next.config.ts` lists both under `transpilePackages`. No `dist/` is
involved — confirmed by `ls -d packages/*/dist`, which found none, while the build still
passed. So there is no prebuilt artifact quietly propping up the local build.

### 7. Host config — FAIL

**There is no `vercel.json`, and no host config of any kind.** A search for "vercel"
across all 200 git-tracked files returns nothing. There is no `.vercel` directory.
The design spec mentions "deploy" zero times.

This is the blocker that hides behind the login, and it is not cosmetic. The Next.js app
is at `apps/web`, not the repo root. The root `package.json` has no `next` dependency, so
a host pointed at the repo root does not detect a Next.js app there. It would find the
root `build` script, run it, and then look for output at the root — while the build wrote
to `apps/web/.next`. The three dynamic routes above would not become functions.

Fixing this means setting the root directory to `apps/web` in project settings, or
committing a `vercel.json` that says so. Neither has happened, and the first cannot
happen before a project is linked — which is itself behind the login. So the login does
not unblock a working deploy; it unblocks the step where you discover this.

### 8. Environment variables documented — PASS, with one trap

`.env.example` exists and describes all three values: `SPOTIFY_CLIENT_ID`,
`SESSION_SECRET`, and a commented-out `SPOTIFY_REDIRECT_URI`. It is accurate about PKCE
needing no client secret, and it gives the command to generate a session secret.

The trap is how the third value is framed — see item 9.

### 9. Redirect URI in production — FAIL

`.env.example:14` has `SPOTIFY_REDIRECT_URI` commented out, under "Only needed if you are
not on `http://localhost:3000`". A deploy is, by definition, not on localhost. So the
line that is optional in the file is mandatory in production, and it is the one line a
reader is most likely to skip.

What happens if it is skipped is worse than a crash. `apps/web/src/lib/env.ts:51`:

```ts
redirectUri: redirectUri.length === 0 ? DEFAULT_REDIRECT_URI : redirectUri,
```

where `DEFAULT_REDIRECT_URI` is `http://localhost:3000/api/auth/callback`. The redirect
URI is read only from the environment — neither `login/route.ts` nor `callback/route.ts`
derives it from the request origin, though both already hold that origin in
`request.nextUrl.origin` and use it for other redirects. So a deploy with a client id and
a session secret but no redirect URI reports itself as fully configured, offers a Connect
button, and sends people to Spotify asking to be sent back to localhost. Spotify rejects
it. The app looks configured and cannot authenticate.

There is also no test covering this. `apps/web/test/` has no `env.test.ts`, and no test
anywhere references `DEFAULT_REDIRECT_URI`.

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

That last item makes a working Spotify login at least a two-pass job: deploy, learn the
URL, register it, set the variable, redeploy.

### 11. README placeholder — FAIL

Still there, `README.md:260-261`:

> **Not done:** a deployment. The app is credential-free and builds clean, so it is ready
> to go up; the link will land here when it does.

The first half is true and this document confirms it. The second half is the placeholder,
and it is still waiting.

### 12. `.vercel` not ignored — FAIL

`.gitignore` has no `.vercel` entry. Linking a project writes `.vercel/project.json`,
holding the project and org ids. The next commit would sweep it in. One line, worth
adding before the login rather than after.

---

## Verdict

**No. `vercel login` is not the only thing between this and a deploy.**

The half of the claim that holds is the code. Five gates, all green: typecheck, lint,
1383 unit tests, a clean production build, 44 e2e tests. Nothing is broken and nothing is
half-finished. The build is genuinely ready to go up.

What is missing is not code but everything around it, and it was never written down:

1. **No host config at all** (item 7). The app sits at `apps/web` in a pnpm workspace and
   nothing tells a host that. This is the real blocker, and it sits _behind_ the login,
   which is why the stall looks like one step instead of several.
2. **The redirect URI defaults to localhost in production** (item 9). Silent, not loud —
   the app claims to be configured and then cannot log anyone in.
3. **The Spotify dashboard registration cannot happen until a URL exists** (item 10), so
   a working login takes two passes, not one.
4. **Two one-line cleanups**: the README placeholder (item 11) and `.vercel` in
   `.gitignore` (item 12).

A demo-mode deploy is close — fix item 7 and it works, since demo mode needs no secrets
and the e2e suite proves it. A deploy where Connect actually works is further off, and
items 9 and 10 are why.

Item 12 is the only one worth doing _before_ the login. The rest can be done after, but
they should be done knowingly, not discovered one failed deploy at a time.

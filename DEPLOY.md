# Cadenza.fm Deployment

End-to-end deployment story for Cadenza.fm and its companion native app
**Cadenza Bridge**. Three deployable components live in this monorepo:

1. **Frontend** — Svelte 5 + SvelteKit (`adapter-static`) under `tamekoma-night/frontend`
2. **Backend** — F# ASP.NET Core 9 under `tamekoma-night/backend`
3. **Bridge** — Rust workspace under `cadenza-bridge`, distributed as
   `.dmg` (macOS) and `.msi` (Windows)

This document walks through how to build and ship each one.

---

## 0. Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 20.x | `npm` ships with it |
| .NET SDK | 9.0.x | `dotnet --version` |
| Rust | 1.78+ | `rustup show` |
| `pwsh` | 7+ (Windows release only) | Optional locally |
| `lipo`, `hdiutil`, `codesign`, `notarytool` | macOS only | ships with Xcode CLT |
| `signtool`, WiX `candle`/`light` | Windows only | Windows SDK + WiX 3.x |

---

## 1. Frontend deployment

### 1.1 Build

```
cd tamekoma-night/frontend
npm ci
npm run build
```

Output goes to `tamekoma-night/frontend/build/`. The static adapter writes a
SPA fallback to `index.html` plus per-route JS chunks under `_app/`.

### 1.2 Hosting

The build directory can be uploaded to any static host. We recommend one of:

- **Vercel** — `vercel deploy --prebuilt build`
- **Netlify** — drag-and-drop the `build/` directory or `netlify deploy --dir build`
- **Cloudflare Pages** — `wrangler pages deploy build`

API and auth routes are reverse-proxied to the backend (see 2.3). On Vercel
that means a `vercel.json` rewrite mapping `/api/*` and `/auth/*` to
`https://api.cadenza.fm/$1`.

---

## 2. Backend deployment

### 2.1 Build

```
cd tamekoma-night/backend/src/TamekomaNight.Api
dotnet publish -c Release -o ./out
```

The published artefact under `./out/` is a self-contained ASP.NET Core app.
Run it with `dotnet ./out/TamekomaNight.Api.dll`.

### 2.2 Required environment variables

| Var | Required | Purpose |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | yes | Google OAuth client id |
| `GOOGLE_CLIENT_SECRET` | yes | Google OAuth client secret |
| `JWT_SIGNING_KEY` | yes | HMAC key for Bridge tickets and session cookies (32+ chars) |
| `FIRESTORE_PROJECT_ID` | yes (prod) | GCP project hosting Firestore |
| `ANTHROPIC_API_KEY` | yes (prod) | Powers Mixer / Automation NL features |
| `FRONTEND_URL` | recommended | Used for CORS and redirect URLs (e.g. `https://cadenza.fm`) |
| `DEV_MODE` | no | Set to `true` to bypass Google OAuth and inject `dev-user` |
| `CADENZA_DEV_PREMIUM_UIDS` | no | Comma-separated uids forced to `premium` for QA |
| `ASPNETCORE_URLS` | no | Default `http://localhost:5000` — override in production |

### 2.3 Hosting

Any container platform that runs .NET 9 works. Suggested setup:

- Cloud Run / Fly.io / Render — point at the `Dockerfile` already in
  `tamekoma-night/backend/Dockerfile`
- Front the service with HTTPS at `api.cadenza.fm`
- Add a CORS-friendly reverse proxy entry from the static frontend

### 2.4 Smoke test after deploy

```
curl https://api.cadenza.fm/health         # → "ok"
curl https://api.cadenza.fm/auth/me        # → 401 (expected without cookie)
```

---

## 3. Bridge distribution

### 3.1 macOS .dmg

```
cd cadenza-bridge
source "$HOME/.cargo/env"
./packaging/mac/build.sh
```

Produces `target/release-mac/Cadenza-Bridge-0.1.0.dmg` containing a
universal `.app` bundle. The watchdog (`cadenza-watchdog`) is the
`CFBundleExecutable`; it spawns the bridge child and restarts it on crash.

Without a signing identity the binary still runs but Gatekeeper shows an
"unidentified developer" warning on first launch (right-click → Open).

To sign + notarize:

```
export MACOS_CODESIGN_IDENTITY="Developer ID Application: Cadenza.fm (TEAMID)"
./packaging/mac/build.sh

export APPLE_ID=you@example.com
export APPLE_TEAM_ID=ABCDE12345
export APPLE_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
./packaging/mac/notarize.sh target/release-mac/Cadenza-Bridge-0.1.0.dmg
```

### 3.2 Windows .msi

```
cd cadenza-bridge
pwsh ./packaging/win/build.ps1
```

Produces `target\release-win\Cadenza-Bridge-0.1.0.msi` if WiX is on PATH;
otherwise a `.zip` of the two exes. Honours the same `WINDOWS_CODESIGN_PFX`
+ `WINDOWS_CODESIGN_PASSWORD` env vars described in
`cadenza-bridge/packaging/README.md`.

### 3.3 Hosting the artefacts

Build artefacts are uploaded to a private GitHub repo (`kuma-private/cadenza-bridge`)
as a draft Release. The frontend `/bridge` page links to
`https://github.com/kuma-private/cadenza-bridge/releases/latest/download/`
URLs which 302 to whatever asset is currently published.

---

## 4. Local development

For end-to-end local QA across all three components:

```
./cadenza-bridge/scripts/run-full-stack.sh
```

This launches:

- `cadenza-bridge` (headless) on `127.0.0.1:7890`
- `dotnet run` of the F# backend with `DEV_MODE=true` on `http://localhost:52731`
- `npm run dev` of the frontend on `http://localhost:5173`

The dev `JWT_SIGNING_KEY` and `CADENZA_DEV_PREMIUM_UIDS=dev-user` are wired up
so Bridge tickets, Mixer, Automation, and the upgrade stub all work without
real Google OAuth or Stripe.

---

## 5. Release process

A coordinated release looks like:

1. Bump versions
   - Frontend: `tamekoma-night/frontend/package.json`
   - Backend: build sha is enough — no version is shipped
   - Bridge: `cadenza-bridge/Cargo.toml` (`workspace.package.version`)
2. Open a PR, merge to `main`
3. Deploy frontend and backend through their normal CD pipelines
4. Tag the bridge release: `git tag bridge-v0.1.0 && git push origin bridge-v0.1.0`
5. The `bridge-release` GitHub Actions workflow (see
   `.github/workflows/bridge-release.yml`) runs on the tag, builds macOS and
   Windows artefacts, uploads them as artifacts, and creates a **draft**
   GitHub Release in the private bridge repo
6. Manually upload codesigned + notarized binaries if you couldn't run
   notarization in CI (no Apple credentials in `secrets`)
7. Publish the draft release in the GitHub UI

The frontend `/bridge` page picks up the new artefacts automatically because
it links to `releases/latest/download/...`.

---

## 6. Current state

What is fully wired vs what is stubbed in Phase 9:

| Component | Wired | Stubbed |
| --- | --- | --- |
| Bridge build scripts (mac + win) | yes | code signing requires real cert envs |
| Bridge GitHub Actions release workflow | yes | secrets not configured; tags trigger but draft release stays empty unless uploaded manually |
| Frontend `/bridge` download page | yes | links point at `kuma-private/cadenza-bridge/releases/latest/download/...` (private repo, not yet populated) |
| Frontend `/upgrade` plan page | yes (UI) | calls `/api/stripe/checkout` which returns a stub URL |
| Backend `/api/stripe/checkout` | yes (route) | returns a hardcoded stub URL; no Stripe SDK |
| Backend `/api/stripe/webhook` | yes (route) | logs body and returns 200; no signature verification |
| Backend `/api/bridge/ticket` + verify | yes | production-ready |
| Bridge install detection in `BridgeOfflineCurtain` | yes | "Install" button now navigates to `/bridge` |
| Backend env vars / Dockerfile / Cloud Run config | yes | `FRONTEND_URL`, `JWT_SIGNING_KEY`, etc. must be set per environment |
| macOS notarization | script ready | needs `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_PASSWORD` |
| Windows codesign | script ready | needs `WINDOWS_CODESIGN_PFX` + password |
| Auto-update | infra in place | currently no-op without `CADENZA_BRIDGE_REPO` env |

Phase 10 should:

- Replace the Stripe stubs with the real `Stripe.NET` SDK
- Provision the Apple Developer ID + notarization secrets
- Provision a Windows codesign cert
- Make `kuma-private/cadenza-bridge` discoverable for the frontend (or move
  releases to a public repo and update the URLs in
  `tamekoma-night/frontend/src/routes/bridge/+page.svelte`)

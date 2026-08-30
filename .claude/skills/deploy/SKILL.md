---
name: deploy
description: Deploy LIVE WIRE to Firebase Hosting (livewire-lakemariner.web.app). Use whenever the user asks to deploy, ship, release, or push the game live.
---

# Deploy LIVE WIRE to Firebase Hosting

The live game is Firebase Hosting project `livewire-lakemariner`, served at
https://livewire-lakemariner.web.app. The repo root is the hosting public dir
(see firebase.json). firebase-tools may need installing: `npm i -g firebase-tools`.

## Before every deploy

1. Bump the release version everywhere it lives (keep them identical):
   - `index.html`: every `?v=NNN` query (style.css, game.js modulepreload + script, sw.js register)
   - `sw.js`: `CACHE_VERSION = 'livewire-vNNN'`
   - `game.js`: every internal `?v=NNN` (map.json fetch, portrait/face/texture URLs)
   One command: `sed -i 's/?v=OLD/?v=NEW/g' game.js index.html && sed -i 's/livewire-vOLD/livewire-vNEW/' sw.js`
2. Validate: `node --check game.js && node --check props.js && node --check sw.js`

## Auth

Always export the proxy CA first: `export NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`

- **If `$FIREBASE_SA_JSON` is set** (a service-account key JSON configured in the
  Claude Code environment settings — the preferred setup): write it verbatim to a file
  in the scratchpad directory, `export GOOGLE_APPLICATION_CREDENTIALS=<that file>`,
  and deploy — no login needed. Never write the key inside the repo (it would be
  committed or deployed) and never print its contents.
- **Else if `$FIREBASE_TOKEN` is set**: pass `--token "$FIREBASE_TOKEN"` to the
  deploy command.
- **Otherwise** run `firebase login --no-localhost < /dev/null`, give the user the
  printed URL and session ID (they open it on any device, sign in, and paste back an
  authorization code), then run `firebase login <code>`. After the deploy, remove the
  local credential WITHOUT revoking it: delete `tokens` from
  `~/.config/configstore/firebase-tools.json` rather than running `firebase logout`
  (logout revokes the refresh token server-side, which would break a saved
  FIREBASE_TOKEN).

NEVER commit a token to the repo, print it in a commit, or leave it in a file.

## Deploy and verify

```bash
cd <repo-root>
firebase deploy --only hosting            # add --token "$FIREBASE_TOKEN" if using the env var
```

Then verify the live site actually serves the new version:

```bash
curl -s https://livewire-lakemariner.web.app/index.html | grep -o "game.js?v=[0-9]*" | head -1
curl -s https://livewire-lakemariner.web.app/sw.js | grep CACHE_VERSION
```

Both must show the new version number. Tell the user players pick up the new
version on their next app open (the service worker is network-first for code).

# LIVE WIRE

A 3D browser game built with Three.js. Play it live at https://livewire-lakemariner.web.app

## Structure

- `index.html` — entry point
- `game.js` — main game code
- `props.js` — prop/object definitions
- `style.css` — UI styling
- `sw.js` / `manifest.json` — PWA service worker and manifest
- `vendor/` — Three.js library
- `assets/` — textures, portraits, blueprints, and voice lines

To run locally, serve the folder with any static file server (e.g. `python3 -m http.server`) and open `index.html` — opening the file directly won't work because the game uses ES modules.

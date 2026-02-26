# Flight Game

A pixel-style arcade shooter built with pure HTML5 Canvas and vanilla JavaScript.

## Live Concept
This project focuses on a replayable "easy-to-start, hard-to-master" loop:
- smooth 4-direction movement and responsive shooting
- enemy aircraft waves + stage bosses
- gear-based loadout progression (replace-style, not infinite stacking)
- dynamic difficulty balancing tied to player power

## Core Features
- Pixel visual style and retro HUD
- Enemy aircraft with movement patterns and projectile attacks
- Boss encounters with HP bar and multi-pattern attacks
- 4-slot gear system:
  - Shield
  - Missile
  - Laser
  - Wingman
- Same-type pickup replaces current gear
- Gear tier drives a unified power value (`SYNC`) used to scale:
  - player damage output
  - enemy durability
  - boss durability
- Boss guaranteed reward drop (high-tier gear)

## Controls
- Move: `W/A/S/D` or `Arrow Keys`
- Shoot: `Space`
- Restart: `R`

## Tech Stack
- HTML
- CSS
- JavaScript (no framework)
- Canvas 2D API

## Project Structure
- `index.html` - page layout and game mount point
- `style.css` - retro UI / canvas styling
- `game.js` - game loop, combat logic, balancing, progression

## Run Locally
Open `index.html` directly in your browser.

Or run a local static server (optional):

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Design Goals
- Keep early game approachable
- Keep mid/late game tense
- Avoid runaway power creep
- Preserve clear visual feedback for weapons, drops, and boss phases

## Roadmap
- Audio SFX and music layers
- Pause/settings panel
- Mobile touch controls
- Difficulty presets
- Leaderboard integration

## License
MIT

# GREEN SOUL

GREEN SOUL is a self-contained pixel-art browser game about protecting a living green soul. Read the attack patterns, turn the directional shield into the path of danger, and survive the fields of the wild.

This repository is intentionally dependency-free: the visuals are drawn on a Canvas, the music and feedback tones are generated with the Web Audio API, and progress is persisted with `localStorage`.

## Included

- Five campaign fields with escalating patterns and guardian encounters.
- Endless Survival with escalating cycles and a persistent high score.
- Original pixel-art direction: forest-terminal palette, chunky sprites, arena framing, particles, screen shake, shield glow, and reduced-motion option.
- Menu, field select, tutorial, settings, pause, game-over, victory, restart, and quit flows.
- Keyboard controls and touch-friendly pointer controls.
- Sound toggle, reduced motion, high contrast, score persistence, and campaign unlock persistence.
- No external assets, fonts, packages, trackers, or runtime services.

## Run locally

Because this is a static site, any local static server works. For example:

```bash
npx serve .
```

Then open the local URL printed by the server. Opening `index.html` directly also works in most modern browsers, but a local server gives the most predictable audio and input behavior.

## Controls

| Action | Keyboard | Pointer / touch |
| --- | --- | --- |
| Move | WASD or arrow keys | Drag the soul on a touch screen |
| Aim shield | Mouse cursor | Touch position |
| Brace shield | Hold Space | Hold pointer / touch |
| Focus shield | Q / E | — |
| Release bloom attack | Enter after filling the energy bar | — |
| Pause | Escape | — |

Perfectly blocking a projectile fills the bloom meter. When it reaches 100%, press Enter to release a bloom strike against the guardian.

## GitHub Pages deployment

1. Push the repository to GitHub.
2. Open **Settings → Pages** in the repository.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select the default branch and the `/ (root)` folder, then save.
5. Wait for the Pages workflow to finish. GitHub will show the public URL in the Pages panel.

There is no build step. Any future static hosting provider can serve the repository root as-is.

## Browser support

The game uses Canvas 2D, `localStorage`, pointer/touch events, and Web Audio. Current versions of Chrome, Edge, Firefox, and Safari are supported. Audio begins after the first user interaction, following browser autoplay rules.

## License and art direction

The implementation and original visual direction in this repository are provided for the project owner. GREEN SOUL is an original homage to directional shield arcade mechanics; it does not include characters, sprites, music, or other assets from any existing game.

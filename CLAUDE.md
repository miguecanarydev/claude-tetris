# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JS Tetris (HTML5 Canvas). No dependencies, no `package.json`, no build, no tests, no linter. UI text and README are in Spanish; keep new user-facing strings in Spanish for consistency.

## Running

Open `index.html` directly, or serve statically (e.g. `python3 -m http.server 8000`). Verify changes manually in the browser.

## Architecture

Three files, all loaded via plain `<script>`/`<link>` (no modules):

- `index.html` — DOM skeleton. `game.js` looks up elements by id at load time (`board`, `next-canvas`, `score`, `lines`, `level`, `overlay`, `overlay-title`, `overlay-score`, `restart-btn`); renaming an id requires updating `game.js`.
- `style.css` — dark/retro styling.
- `game.js` — all logic, using top-level mutable globals (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, ...) that are reset in `init()`.

Key flow: `init()` → `requestAnimationFrame(loop)`. `loop` accumulates `dt` and gravity-drops/locks the piece when `dropAccum >= dropInterval`, then `draw()`. Keyboard input (`keydown` handler) mutates `current` directly. `lockPiece()` = `merge()` → `clearLines()` → `spawn()`; `spawn()` calls `endGame()` if the new piece collides immediately.

Things to know:
- Board cells are `0` or a piece-type index 1–7; `COLORS` and `PIECES` are indexed by that same number (index 0 is `null`). Adding a piece means extending both arrays and `randomPiece()` (hardcoded `* 7`).
- Pause/game-over both cancel the rAF loop; resume calls `loop()` manually after resetting `lastTime`. Any new state transition must keep `animId` cancel/restart consistent to avoid double loops.
- Canvas pixel size is hardcoded in `index.html` (`300×600` board, `120×120` next preview) and must equal `COLS×BLOCK` × `ROWS×BLOCK` from `game.js`.
- Scoring: `LINE_SCORES[cleared] * level`; soft drop +1/cell, hard drop +2/cell; level = `floor(lines/10)+1`; `dropInterval = max(100, 1000 - (level-1)*90)`.
- Rotation is clockwise only, with horizontal wall kicks `[0, -1, 1, -2, 2]` (no SRS, no floor kicks).

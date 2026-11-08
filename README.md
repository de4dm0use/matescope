# MateScope

A static chess game analysis website for GitHub Pages. It imports PGN files and public Chess.com games, replays games on an interactive board, and runs Stockfish locally in the browser.

## Features

- PGN paste and .pgn / .txt upload
- Chess.com public username lookup
- Move list and board navigation
- Stockfish 19 Lite single-threaded WebAssembly engine
- Evaluation graph and move verdicts
- Accuracy estimates and summary insights
- Dark theme with light-theme toggle
- No server, API key, login, or build step

## Run locally

Because JavaScript modules and Web Workers need an HTTP origin, don't open index.html directly as a file.

With Python installed:

```bash
python -m http.server 8000
```

Then visit http://localhost:8000.

## Publish on GitHub Pages

1. Open Settings → Pages.
2. Under Build and deployment, choose Deploy from a branch.
3. Choose branch main and folder /(root), then click Save.
4. Wait for the Pages deployment to finish.

The site URL is https://de4dm0use.github.io/matescope/.

## Engine details

MateScope loads Stockfish 19 Lite single-threaded from jsDelivr. Single-threaded mode avoids cross-origin isolation headers that GitHub Pages does not let you configure. The Lite network is smaller than the full Stockfish build.

## Chess.com integration

Uses Chess.com's public, read-only PubAPI. Only public, finished games are available. Chess.com controls API availability, caching, and rate limits.

MateScope is an independent project and is not affiliated with Chess.com.

## Accuracy caveat

Displayed accuracy is a simple estimate derived from centipawn loss at the selected engine depth. It is not Chess.com's accuracy formula. Move labels are heuristic, not official game-review classifications.

## Licences and attribution

- Stockfish is free software under the GNU General Public License v3: https://www.gnu.org/licenses/gpl-3.0.html
- chess.js is distributed under the BSD 2-Clause licence.

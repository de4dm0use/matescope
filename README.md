# MateScope

A free, browser-based chess analysis and training site for GitHub Pages. Import PGNs or public Chess.com games, analyse with Stockfish, explore opening statistics, practise mistakes and keep a local library.

## Features

- Paste PGN or upload \`.pgn\` / \`.txt\` files
- Find recent public games using a Chess.com username and bulk-save the results to your library
- Custom inline SVG Staunton-style chess pieces
- Four board colour themes, board flipping and last-move highlighting
- Click or drag pieces in a legal-move exploration mode
- Best-move arrows and legal-move indicators
- Stockfish 19 Lite single-threaded WebAssembly engine, hosted in this repository
- Top three engine continuations for any selected position
- Evaluation graph, move verdicts and estimated accuracy
- Move-by-move coach explanations, including the engine's preferred move and best reply
- Opening, middlegame and endgame performance breakdown
- Lichess Masters opening explorer with master-game statistics and popular continuations
- Mistake training: turns inaccuracies, mistakes and blunders into playable positions, with saved attempt/correct/solved progress
- Browser-local game library with search, analysis summaries and PGN export
- Dark and light themes
- No application server, account, API key or build step

## Run locally

Because JavaScript modules and Web Workers need an HTTP origin, do not open \`index.html\` directly as a file.

With Python installed:

\`\`\`
python -m http.server 8000
\`\`\`

Then visit http://localhost:8000.

## Publish on GitHub Pages

1. Open Settings → Pages.
2. Under Build and deployment, choose Deploy from a branch.
3. Choose branch \`main\` and folder \`/(root)\`, then click Save.
4. Wait for the Pages deployment to finish.

The site URL is https://de4dm0use.github.io/matescope/.

## Engine details

MateScope loads the Stockfish 19 Lite single-threaded worker and WebAssembly files from the local \`engine/\` directory. Keeping the engine on the same origin avoids the cross-origin worker problem that occurred when loading it directly from a CDN. The single-threaded build does not require cross-origin isolation headers.

The engine files are vendored by the GitHub Actions workflow in \`.github/workflows/vendor-stockfish.yml\`. Stockfish is free software under the GNU General Public License v3.

## External data and privacy

- Chess.com games are retrieved from Chess.com's public, read-only PubAPI. Only public games are available.
- Opening names, master-game statistics and popular opening moves are retrieved from the public Lichess Opening Explorer at \`https://explorer.lichess.org\`. This feature needs an internet connection.
- Stockfish analysis runs locally in the browser.
- Saved games and the local game library stay in browser \`localStorage\`; they are not uploaded to a MateScope server. Clearing browser site data will remove the library, so export important PGNs.

External services control their own availability, caching and rate limits.

## Accuracy caveat

Displayed accuracy is a MateScope estimate derived from centipawn loss at the selected engine depth. It is not Chess.com's accuracy formula. Move labels are heuristic and the game-phase breakdown uses a simple material/ply estimate. Engine results can change with depth and hardware.

Mistake-training answers are compared with the engine's best move at the selected analysis depth; other good moves may exist that the engine does not rank first.

## Dependencies and attribution

- Stockfish: https://github.com/official-stockfish/Stockfish — GPL v3
- Stockfish.js browser build: https://github.com/nmrugg/stockfish.js
- chess.js: https://github.com/jhlywa/chess.js — BSD 2-Clause
- Opening data: Lichess Opening Explorer, https://lichess.org
- Chess.com public game data: https://www.chess.com/news/view/published-data-api

MateScope is an independent project and is not affiliated with Chess.com or Lichess.

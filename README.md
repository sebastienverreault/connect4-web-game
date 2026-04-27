# Connect 4 WebAssembly Game

A browser-based Connect 4 game with the rules and AI implemented in Rust and compiled to WebAssembly. The UI is a Vite app using plain JavaScript and CSS.

## Features

- 2-player local mode.
- Player vs AI mode.
- Simple minimax AI with alpha-beta pruning.
- AI settings for thinking-time limit and search strength.
- Practice mode backed by a plain JSON problem set.
- Board coordinates with columns `A` through `G` and rows `1` through `6`, where row `1` is the bottom row.
- Move numbers rendered on played tokens, useful for practice positions.

## Requirements

- Rust and Cargo.
- `wasm-pack`.
- Node.js and npm.
- Optional: `lsof` or `ss` for `make kill`.

Install the project dependencies:

```sh
make setup
```

If `wasm-pack` is missing, install it from the Rust/WASM project instructions or your system package manager.

## Development

Start the dev server:

```sh
make run
```

By default this uses `http://localhost:5173/`. The `run` target first calls `make kill`, so a previous Vite server listening on the same port is stopped before a new one starts. The kill target filters for listening sockets only, so browser tabs connected to the dev server are not targeted.

Use a different port:

```sh
make run PORT=5180
```

Useful targets:

```sh
make help
make wasm
make build
make preview
make restart
make kill
make check
make clean
```

`make check` formats Rust, validates the practice problem database, and runs a production build.

## Deployment

Build the static site:

```sh
make build
```

Deploy the contents of `dist/` to any static host. The host must serve `.wasm` files correctly, ideally with:

```text
Content-Type: application/wasm
```

The app fetches `problems.json` from the deployed public root, so make sure `dist/problems.json` is included with the deployment.

For a quick local production preview:

```sh
make preview
```

## Practice Problems

Practice problems live in [public/problems.json](public/problems.json). The file is a JSON array:

```json
[
  {
    "title": "Easy 1",
    "level": "easy",
    "description": "Red to play. Finish the vertical threat.",
    "moves": "D1 c1 D2 c2 D3 _",
    "answer": "Play D4 to connect four vertically."
  }
]
```

Fields:

- `title`: Display name in the practice selector.
- `level`: One of `easy`, `medium`, `hard`, `expert`, or `challenger`.
- `description`: Short prompt shown to the player.
- `moves`: Space-separated move list used to pre-fill the board.
- `answer`: Text shown when the player asks for the answer.

Move notation:

- The letter is the column: `A` through `G`.
- The number is the row: `1` through `6`, counted from the bottom.
- Uppercase column letters are Red moves.
- Lowercase column letters are Yellow moves.
- `_` marks the point where the player should solve.
- Parenthesized tokens like `(15)` are ignored and may be used as comments or move-count markers.

Example:

```text
D1 c1 F1 b1 E1 g1 F2 d2 F3 f4 D3 C2 c3 (15) _
```

After editing the problem set, validate it:

```sh
make validate-problems
```

The validator checks that each move obeys Connect 4 gravity, so a token like `C2` is rejected unless row `C1` is already occupied.

## Project Layout

- [src/lib.rs](src/lib.rs): Rust board logic, puzzle loading, win detection, and AI search.
- [web/main.js](web/main.js): Browser UI and interaction wiring.
- [web/style.css](web/style.css): Board and app styling.
- [public/problems.json](public/problems.json): Practice problem database.
- [pkg/](pkg): Generated WebAssembly package from `wasm-pack`.
- [dist/](dist): Production build output from Vite.

use js_sys::Uint8Array;
use serde::Serialize;
use wasm_bindgen::prelude::*;

const ROWS: usize = 6;
const COLS: usize = 7;
const CELLS: usize = ROWS * COLS;
const EMPTY: u8 = 0;
const RED: u8 = 1;
const BLACK: u8 = 2;

#[derive(Clone)]
struct SearchDeadline {
    started_ms: f64,
    limit_ms: f64,
}

impl SearchDeadline {
    fn expired(&self) -> bool {
        js_sys::Date::now() - self.started_ms >= self.limit_ms
    }
}

#[wasm_bindgen]
pub struct Connect4 {
    board: [u8; CELLS],
    move_numbers: [u8; CELLS],
    current_player: u8,
    winner: u8,
    draw: bool,
    move_count: u8,
}

#[derive(Serialize)]
struct MoveOutcome {
    ok: bool,
    row: i32,
    col: i32,
    player: u8,
    winner: u8,
    draw: bool,
    message: String,
}

#[wasm_bindgen]
impl Connect4 {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Connect4 {
        Connect4 {
            board: [EMPTY; CELLS],
            move_numbers: [0; CELLS],
            current_player: RED,
            winner: EMPTY,
            draw: false,
            move_count: 0,
        }
    }

    pub fn reset(&mut self) {
        self.board = [EMPTY; CELLS];
        self.move_numbers = [0; CELLS];
        self.current_player = RED;
        self.winner = EMPTY;
        self.draw = false;
        self.move_count = 0;
    }

    pub fn board(&self) -> Uint8Array {
        Uint8Array::from(self.board.as_slice())
    }

    pub fn move_numbers(&self) -> Uint8Array {
        Uint8Array::from(self.move_numbers.as_slice())
    }

    pub fn current_player(&self) -> u8 {
        self.current_player
    }

    pub fn winner(&self) -> u8 {
        self.winner
    }

    pub fn is_draw(&self) -> bool {
        self.draw
    }

    pub fn can_play(&self, col: usize) -> bool {
        col < COLS && self.winner == EMPTY && !self.draw && self.board[idx(ROWS - 1, col)] == EMPTY
    }

    pub fn play_column(&mut self, col: usize) -> JsValue {
        match self.drop_piece(col, self.current_player) {
            Ok(row) => {
                let player = self.current_player;
                self.after_move(row, col, player);
                to_js(MoveOutcome {
                    ok: true,
                    row: row as i32,
                    col: col as i32,
                    player,
                    winner: self.winner,
                    draw: self.draw,
                    message: String::new(),
                })
            }
            Err(message) => to_js(MoveOutcome {
                ok: false,
                row: -1,
                col: col as i32,
                player: self.current_player,
                winner: self.winner,
                draw: self.draw,
                message,
            }),
        }
    }

    pub fn ai_move(&mut self, max_ms: u32, strength: u8) -> JsValue {
        if self.winner != EMPTY || self.draw {
            return to_js(MoveOutcome {
                ok: false,
                row: -1,
                col: -1,
                player: self.current_player,
                winner: self.winner,
                draw: self.draw,
                message: "Game is already finished.".to_string(),
            });
        }

        let deadline = SearchDeadline {
            started_ms: js_sys::Date::now(),
            limit_ms: max_ms.max(15) as f64,
        };
        let depth = strength.clamp(1, 8) as i32;
        let col = choose_ai_column(self.board, self.current_player, depth, &deadline);
        self.play_column(col)
    }

    pub fn load_moves(&mut self, moves: &str) -> JsValue {
        self.reset();
        let mut stopped_at_solution = false;
        for token in moves.split_whitespace() {
            let cleaned = token.trim_matches(|ch: char| ch == ',' || ch == ';');
            if cleaned.chars().all(|ch| ch == '_') {
                stopped_at_solution = true;
                break;
            }
            if cleaned.starts_with('(') && cleaned.ends_with(')') {
                continue;
            }
            let chars: Vec<char> = cleaned.chars().collect();
            if chars.len() < 2 {
                continue;
            }

            let player = if chars[0].is_ascii_uppercase() {
                RED
            } else {
                BLACK
            };
            let col = match column_from_char(chars[0]) {
                Some(value) => value,
                None => return JsValue::from_str(&format!("Invalid column in move '{cleaned}'.")),
            };
            let expected_row = match chars[1].to_digit(10) {
                Some(value @ 1..=6) => value as usize - 1,
                _ => return JsValue::from_str(&format!("Invalid row in move '{cleaned}'.")),
            };

            let row = match self.drop_piece(col, player) {
                Ok(value) => value,
                Err(message) => return JsValue::from_str(&message),
            };
            if row != expected_row {
                return JsValue::from_str(&format!(
                    "Move '{cleaned}' lands on row {}, not row {}.",
                    row + 1,
                    expected_row + 1
                ));
            }
            self.after_move(row, col, player);
            if self.winner != EMPTY {
                break;
            }
        }

        if self.winner == EMPTY && !self.draw {
            if stopped_at_solution {
                self.current_player = if self.move_count % 2 == 0 { RED } else { BLACK };
            } else {
                self.current_player = if self.move_count % 2 == 0 { RED } else { BLACK };
            }
        }
        JsValue::NULL
    }
}

impl Connect4 {
    fn drop_piece(&mut self, col: usize, player: u8) -> Result<usize, String> {
        if col >= COLS {
            return Err("Column is outside the board.".to_string());
        }
        if self.winner != EMPTY || self.draw {
            return Err("Game is already finished.".to_string());
        }
        for row in 0..ROWS {
            let cell = idx(row, col);
            if self.board[cell] == EMPTY {
                self.board[cell] = player;
                self.move_count += 1;
                self.move_numbers[cell] = self.move_count;
                return Ok(row);
            }
        }
        Err("Column is full.".to_string())
    }

    fn after_move(&mut self, row: usize, col: usize, player: u8) {
        if has_winner(&self.board, row, col, player) {
            self.winner = player;
        } else if self.move_count as usize == CELLS {
            self.draw = true;
        } else {
            self.current_player = other(player);
        }
    }
}

fn choose_ai_column(
    board: [u8; CELLS],
    player: u8,
    depth: i32,
    deadline: &SearchDeadline,
) -> usize {
    let legal = legal_columns(&board);
    for &col in &legal {
        let mut next = board;
        if let Some(row) = apply_move(&mut next, col, player) {
            if has_winner(&next, row, col, player) {
                return col;
            }
        }
    }

    let mut best_col = *legal.first().unwrap_or(&3);
    let mut best_score = i32::MIN;
    for &col in &center_ordered(&legal) {
        if deadline.expired() {
            break;
        }
        let mut next = board;
        if let Some(row) = apply_move(&mut next, col, player) {
            let score = if has_winner(&next, row, col, player) {
                1_000_000
            } else {
                minimax(
                    next,
                    other(player),
                    player,
                    depth - 1,
                    i32::MIN + 1,
                    i32::MAX - 1,
                    deadline,
                )
            };
            if score > best_score {
                best_score = score;
                best_col = col;
            }
        }
    }
    best_col
}

fn minimax(
    board: [u8; CELLS],
    turn: u8,
    ai_player: u8,
    depth: i32,
    mut alpha: i32,
    mut beta: i32,
    deadline: &SearchDeadline,
) -> i32 {
    if depth == 0 || deadline.expired() || legal_columns(&board).is_empty() {
        return evaluate(&board, ai_player);
    }

    let legal = legal_columns(&board);
    if turn == ai_player {
        let mut value = i32::MIN + 1;
        for &col in &center_ordered(&legal) {
            let mut next = board;
            if let Some(row) = apply_move(&mut next, col, turn) {
                let score = if has_winner(&next, row, col, turn) {
                    900_000 + depth
                } else {
                    minimax(
                        next,
                        other(turn),
                        ai_player,
                        depth - 1,
                        alpha,
                        beta,
                        deadline,
                    )
                };
                value = value.max(score);
                alpha = alpha.max(score);
                if alpha >= beta || deadline.expired() {
                    break;
                }
            }
        }
        value
    } else {
        let mut value = i32::MAX - 1;
        for &col in &center_ordered(&legal) {
            let mut next = board;
            if let Some(row) = apply_move(&mut next, col, turn) {
                let score = if has_winner(&next, row, col, turn) {
                    -900_000 - depth
                } else {
                    minimax(
                        next,
                        other(turn),
                        ai_player,
                        depth - 1,
                        alpha,
                        beta,
                        deadline,
                    )
                };
                value = value.min(score);
                beta = beta.min(score);
                if alpha >= beta || deadline.expired() {
                    break;
                }
            }
        }
        value
    }
}

fn evaluate(board: &[u8; CELLS], player: u8) -> i32 {
    let opponent = other(player);
    let mut score = 0;
    for row in 0..ROWS {
        if board[idx(row, 3)] == player {
            score += 6;
        }
    }

    for window in windows() {
        let mut mine = 0;
        let mut theirs = 0;
        let mut empty = 0;
        for &cell in &window {
            match board[cell] {
                value if value == player => mine += 1,
                value if value == opponent => theirs += 1,
                _ => empty += 1,
            }
        }
        score += score_window(mine, theirs, empty);
    }
    score
}

fn score_window(mine: i32, theirs: i32, empty: i32) -> i32 {
    match (mine, theirs, empty) {
        (4, 0, _) => 100_000,
        (3, 0, 1) => 120,
        (2, 0, 2) => 18,
        (1, 0, 3) => 2,
        (0, 3, 1) => -150,
        (0, 2, 2) => -20,
        (0, 4, _) => -100_000,
        _ => 0,
    }
}

fn windows() -> Vec<[usize; 4]> {
    let mut result = Vec::new();
    for row in 0..ROWS {
        for col in 0..COLS - 3 {
            result.push([
                idx(row, col),
                idx(row, col + 1),
                idx(row, col + 2),
                idx(row, col + 3),
            ]);
        }
    }
    for col in 0..COLS {
        for row in 0..ROWS - 3 {
            result.push([
                idx(row, col),
                idx(row + 1, col),
                idx(row + 2, col),
                idx(row + 3, col),
            ]);
        }
    }
    for row in 0..ROWS - 3 {
        for col in 0..COLS - 3 {
            result.push([
                idx(row, col),
                idx(row + 1, col + 1),
                idx(row + 2, col + 2),
                idx(row + 3, col + 3),
            ]);
        }
    }
    for row in 3..ROWS {
        for col in 0..COLS - 3 {
            result.push([
                idx(row, col),
                idx(row - 1, col + 1),
                idx(row - 2, col + 2),
                idx(row - 3, col + 3),
            ]);
        }
    }
    result
}

fn apply_move(board: &mut [u8; CELLS], col: usize, player: u8) -> Option<usize> {
    for row in 0..ROWS {
        let cell = idx(row, col);
        if board[cell] == EMPTY {
            board[cell] = player;
            return Some(row);
        }
    }
    None
}

fn legal_columns(board: &[u8; CELLS]) -> Vec<usize> {
    (0..COLS)
        .filter(|&col| board[idx(ROWS - 1, col)] == EMPTY)
        .collect()
}

fn center_ordered(cols: &[usize]) -> Vec<usize> {
    let order = [3, 2, 4, 1, 5, 0, 6];
    order.into_iter().filter(|col| cols.contains(col)).collect()
}

fn has_winner(board: &[u8; CELLS], row: usize, col: usize, player: u8) -> bool {
    [(1, 0), (0, 1), (1, 1), (1, -1)].iter().any(|&(dr, dc)| {
        1 + count_dir(board, row, col, player, dr, dc)
            + count_dir(board, row, col, player, -dr, -dc)
            >= 4
    })
}

fn count_dir(
    board: &[u8; CELLS],
    row: usize,
    col: usize,
    player: u8,
    dr: isize,
    dc: isize,
) -> usize {
    let mut total = 0;
    let mut r = row as isize + dr;
    let mut c = col as isize + dc;
    while r >= 0 && r < ROWS as isize && c >= 0 && c < COLS as isize {
        if board[idx(r as usize, c as usize)] != player {
            break;
        }
        total += 1;
        r += dr;
        c += dc;
    }
    total
}

fn column_from_char(ch: char) -> Option<usize> {
    match ch.to_ascii_uppercase() {
        'A'..='G' => Some(ch.to_ascii_uppercase() as usize - 'A' as usize),
        _ => None,
    }
}

fn other(player: u8) -> u8 {
    if player == RED {
        BLACK
    } else {
        RED
    }
}

fn idx(row: usize, col: usize) -> usize {
    row * COLS + col
}

fn to_js<T: Serialize>(value: T) -> JsValue {
    JsValue::from_str(&serde_json::to_string(&value).unwrap())
}

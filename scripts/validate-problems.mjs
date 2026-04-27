import fs from "node:fs/promises";

const rows = 6;
const cols = 7;
const problems = JSON.parse(await fs.readFile("public/problems.json", "utf8"));
let valid = true;

function idx(row, col) {
  return row * cols + col;
}

function columnFromToken(token) {
  return token[0].toUpperCase().charCodeAt(0) - "A".charCodeAt(0);
}

for (const problem of problems) {
  const board = Array(rows * cols).fill(0);
  for (const rawToken of problem.moves.split(/\s+/)) {
    const token = rawToken.trim();
    if (!token || token === "_" || /^\(.+\)$/.test(token)) {
      break;
    }

    const col = columnFromToken(token);
    const expectedRow = Number(token[1]) - 1;
    if (col < 0 || col >= cols || expectedRow < 0 || expectedRow >= rows) {
      console.error(`${problem.title}: invalid token ${token}`);
      valid = false;
      continue;
    }

    let landingRow = 0;
    while (landingRow < rows && board[idx(landingRow, col)]) {
      landingRow += 1;
    }

    if (landingRow >= rows) {
      console.error(`${problem.title}: column is full before ${token}`);
      valid = false;
      continue;
    }

    if (landingRow !== expectedRow) {
      console.error(`${problem.title}: ${token} lands on row ${landingRow + 1}`);
      valid = false;
    }

    board[idx(landingRow, col)] = /[A-G]/.test(token[0]) ? 1 : 2;
  }
}

if (!valid) {
  process.exit(1);
}

console.log(`validated ${problems.length} practice problem records`);

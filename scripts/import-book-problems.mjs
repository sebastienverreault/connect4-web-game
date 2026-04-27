import { execFileSync } from "node:child_process";
import fs from "node:fs";

const sourcePdf = "book/Connect4-Ch01-02_recognized_1.pdf";
const outputPath = "public/problems.json";
const rows = 6;
const cols = 7;

const baseProblems = JSON.parse(fs.readFileSync(outputPath, "utf8")).filter(
  (problem) => !problem.source?.startsWith("The Complete Book of Connect 4"),
);

const rawText = execFileSync("pdftotext", ["-raw", sourcePdf, "-"], {
  encoding: "utf8",
});

const parsed = parseRawProblems(rawText);
const imported = [];
const skipped = [];

for (const problem of parsed) {
  const tokens = tokenizeMoves(problem.movesRaw);
  const errors = validateMoves(tokens);
  if (errors.length) {
    skipped.push({ problem: problem.num, errors, moves: problem.movesRaw.trim() });
    continue;
  }

  const moveCount = tokens.filter((token) => token !== "_").length;
  const side = moveCount % 2 === 0 ? "Red" : "Yellow";
  imported.push({
    title: `Book Problem ${problem.num}`,
    level: problem.level,
    description: `${side} to play. Imported from Chapter 2 problem set.`,
    moves: `${tokens.join(" ")} _`.replace(/\s+_\s+_$/, " _"),
    answer: "Solution text was not present in the provided chapter excerpt.",
    source: "The Complete Book of Connect 4, Chapter 2 problem set",
    sourceProblem: problem.num,
  });
}

imported.sort((a, b) => a.sourceProblem - b.sourceProblem);
fs.writeFileSync(outputPath, `${JSON.stringify([...baseProblems, ...imported], null, 2)}\n`);

console.log(`parsed ${parsed.length} OCR problem records`);
console.log(`imported ${imported.length} validated practice problems`);
console.log(`skipped ${skipped.length} OCR-ambiguous records`);
if (skipped.length) {
  console.log(`first skipped records: ${skipped.slice(0, 12).map((entry) => entry.problem).join(", ")}`);
}

function parseRawProblems(text) {
  const lines = text.split("\n");
  const problems = [];
  let level = null;
  let current = null;
  let multi = null;

  const finishCurrent = () => {
    if (current?.movesRaw?.trim()) {
      problems.push(current);
    }
    current = null;
  };

  const finishMulti = () => {
    if (multi) {
      for (const record of multi) {
        if (record.movesRaw.trim()) {
          problems.push(record);
        }
      }
    }
    multi = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const setMatch = line.match(/Problem Set\s+.+?\s*\((Easy|Medium|Hard|Expert|Challenger)\)/i);
    if (setMatch) {
      finishCurrent();
      finishMulti();
      level = setMatch[1].toLowerCase();
      continue;
    }
    if (!level) {
      continue;
    }

    const problemNumbers = [...line.matchAll(/PROBLEM\s+(\d+)/g)].map((match) => Number(match[1]));
    if (problemNumbers.length === 1) {
      finishCurrent();
      finishMulti();
      current = { num: problemNumbers[0], level, movesRaw: "" };
      continue;
    }
    if (problemNumbers.length > 1) {
      finishCurrent();
      finishMulti();
      multi = problemNumbers.map((num) => ({ num, level, movesRaw: "" }));
      continue;
    }

    if (multi) {
      appendMultiMoves(multi, line);
      continue;
    }

    if (!current) {
      continue;
    }
    if (line.includes("Moves:")) {
      current.movesRaw += ` ${line.split("Moves:").slice(1).join(" Moves: ")}`;
      continue;
    }
    if (current.movesRaw && !current.movesRaw.includes("__") && !current.movesRaw.includes(" _")) {
      current.movesRaw += ` ${line}`;
    }
  }

  finishCurrent();
  finishMulti();
  return dedupeByProblemNumber(problems);
}

function appendMultiMoves(records, line) {
  const moveParts = line.split("Moves:").slice(1);
  if (moveParts.length >= records.length) {
    for (let index = 0; index < records.length; index += 1) {
      records[index].movesRaw += ` ${moveParts[index]}`;
    }
    return;
  }

  if (line.includes("__")) {
    const parts = line.split(/__\s+/);
    if (parts.length >= records.length) {
      for (let index = 0; index < records.length; index += 1) {
        const suffix = index === 0 ? " __" : "";
        records[index].movesRaw += ` ${parts[index]}${suffix}`;
      }
      return;
    }
  }

  if (records[0].movesRaw && !records[0].movesRaw.includes("__")) {
    records[0].movesRaw += ` ${line}`;
  }
}

function dedupeByProblemNumber(problems) {
  const byNumber = new Map();
  for (const problem of problems) {
    byNumber.set(problem.num, problem);
  }
  return [...byNumber.values()].sort((a, b) => a.num - b.num);
}

function normalizeMoves(text) {
  return text
    .replace(/[¢©]/g, "c")
    .replace(/€/g, "e")
    .replace(/[£{]/g, "f")
    .replace(/[é]/g, "6")
    .replace(/S/g, "5")
    .replace(/[Il|]/g, "1")
    .replace(/[‘’]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/__/g, " _ ")
    .replace(/[!?.,;:]/g, " ");
}

function tokenizeMoves(text) {
  const normalized = normalizeMoves(text);
  const tokens = [];
  for (let index = 0; index < normalized.length; index += 1) {
    const column = normalized[index];
    if (column === "_") {
      break;
    }
    if (!/[A-Ga-g]/.test(column)) {
      continue;
    }

    let rowIndex = index + 1;
    while (rowIndex < normalized.length && /\s/.test(normalized[rowIndex])) {
      rowIndex += 1;
    }
    if (/[1-6]/.test(normalized[rowIndex])) {
      tokens.push(`${column}${normalized[rowIndex]}`);
      index = rowIndex;
    }
  }
  return tokens;
}

function validateMoves(tokens) {
  const board = Array(rows * cols).fill(0);
  const errors = [];
  for (const token of tokens) {
    const col = token[0].toUpperCase().charCodeAt(0) - "A".charCodeAt(0);
    const expectedRow = Number(token[1]) - 1;
    if (col < 0 || col >= cols || expectedRow < 0 || expectedRow >= rows) {
      errors.push(`${token}: invalid coordinate`);
      continue;
    }

    let landingRow = 0;
    while (landingRow < rows && board[landingRow * cols + col]) {
      landingRow += 1;
    }
    if (landingRow !== expectedRow) {
      errors.push(`${token}: lands on row ${landingRow + 1}`);
    }
    board[landingRow * cols + col] = token[0] === token[0].toUpperCase() ? 1 : 2;
  }
  return errors;
}

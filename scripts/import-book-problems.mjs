import { execFileSync } from "node:child_process";
import fs from "node:fs";

const sourcePdf = "book/Connect4-Ch01-02_recognized_1.pdf";
const answerPdf = "book/Connect4-Glossary_recognized_1.pdf";
const outputPath = "public/problems.json";
const reviewPath = "docs/book-ocr-review.md";
const rows = 6;
const cols = 7;

const baseProblems = JSON.parse(fs.readFileSync(outputPath, "utf8")).filter(
  (problem) => !problem.source?.startsWith("The Complete Book of Connect 4"),
);

const rawText = execFileSync("pdftotext", ["-raw", sourcePdf, "-"], {
  encoding: "utf8",
});
const answerText = execFileSync("pdftotext", ["-layout", answerPdf, "-"], {
  encoding: "utf8",
});

const parsed = parseRawProblems(rawText);
const answers = parseAnswers(answerText);
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
    answer:
      answers.get(problem.num) ??
      "Solution text was not present in the provided OCR answer excerpt.",
    source: "The Complete Book of Connect 4, Chapter 2 problem set",
    sourceProblem: problem.num,
  });
}

imported.sort((a, b) => a.sourceProblem - b.sourceProblem);
fs.writeFileSync(outputPath, `${JSON.stringify([...baseProblems, ...imported], null, 2)}\n`);
writeReviewFile(skipped, answers);

console.log(`parsed ${parsed.length} OCR problem records`);
console.log(`imported ${imported.length} validated practice problems`);
console.log(`skipped ${skipped.length} OCR-ambiguous records`);
console.log(`parsed ${answers.size} answer records`);
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

function parseAnswers(text) {
  const start = text.indexOf("Answers to Problem Sets");
  const end = text.indexOf("Diagrams for Selected Answers");
  const answerText = text.slice(start, end > 0 ? end : undefined);
  const answers = new Map();
  let current = null;

  for (const rawLine of answerText.split("\n")) {
    const line = rawLine.trim();
    if (!line || /^\d+$/.test(line) || /^Answers?\s*to Problem Set/i.test(line)) {
      continue;
    }

    const match = line.match(/^(?:Problem|Prob\.?\s*em)\s+(\d+)\s*:?\s*(.*)$/i);
    if (match) {
      if (current) {
        answers.set(current.num, cleanAnswer(current.text));
      }
      current = { num: Number(match[1]), text: match[2] };
      continue;
    }

    if (current) {
      current.text += ` ${line}`;
    }
  }

  if (current) {
    answers.set(current.num, cleanAnswer(current.text));
  }
  return answers;
}

function cleanAnswer(text) {
  return text
    .replace(/[¢©]/g, "c")
    .replace(/€/g, "e")
    .replace(/£/g, "f")
    .replace(/\bAl\b/g, "A1")
    .replace(/\bCl\b/g, "C1")
    .replace(/\bDG6\b/g, "D6")
    .replace(/\s+/g, " ")
    .trim();
}

function writeReviewFile(skipped, answers) {
  fs.mkdirSync("docs", { recursive: true });
  const skippedNumbers = skipped.map((entry) => entry.problem).sort((a, b) => a - b);
  const answerMissing = Array.from({ length: 300 }, (_, index) => index + 1).filter(
    (problemNumber) => !answers.has(problemNumber),
  );
  const lines = [
    "# Book OCR Review",
    "",
    "This file is generated by `node scripts/import-book-problems.mjs`.",
    "",
    "The importer only adds book problems whose OCR move lists pass Connect 4 gravity validation. The records below need manual review before they can be safely added.",
    "",
    `Skipped OCR-ambiguous problem count: ${skippedNumbers.length}`,
    "",
    `Skipped problem numbers: ${skippedNumbers.join(", ")}`,
    "",
    `Answer records parsed: ${answers.size}`,
    "",
    `Problem numbers without parsed answers: ${answerMissing.join(", ")}`,
    "",
    "Note: the provided glossary OCR appears to jump from book page 251 to page 254, so answers for problems 239-270 were not present in the extracted text.",
    "",
    "## Skipped Problems",
    "",
  ];

  for (const entry of skipped.sort((a, b) => a.problem - b.problem)) {
    lines.push(`### Problem ${entry.problem}`, "");
    lines.push(`Errors: ${entry.errors.join("; ")}`, "");
    lines.push("Raw OCR moves:");
    lines.push("");
    lines.push("```text");
    lines.push(entry.moves);
    lines.push("```");
    lines.push("");
  }

  fs.writeFileSync(reviewPath, `${lines.join("\n")}\n`);
}

import init, { Connect4 } from "../pkg/connect4_web_game.js";
import "./style.css";

const PLAYER_RED = 1;
const PLAYER_BLACK = 2;
const columns = ["A", "B", "C", "D", "E", "F", "G"];
const state = {
  game: null,
  mode: "ai",
  aiPlayer: PLAYER_BLACK,
  aiThinking: false,
  aiMs: 350,
  aiStrength: 4,
  problems: [],
  problemIndex: 0,
  selectedSetName: "",
  activeProblem: null,
  solutionVisible: false,
};

const app = document.querySelector("#app");

await init();
state.game = new Connect4();
state.problems = await fetch(`${import.meta.env.BASE_URL}problems_with_answers.json`).then((res) => res.json());
state.selectedSetName = problemSetNames()[0] ?? "";
render();

function render() {
  const currentProblem = currentProblemList().find(({ index }) => index === state.problemIndex)?.problem ?? currentProblemList()[0]?.problem;

  app.innerHTML = `
    <main class="shell">
      <section class="game-area">
        <div class="topbar">
          <div>
            <h1 class="brand-title" aria-label="Connect 4">
              <span class="connect-mark">Connect</span>
              <span class="four-mark">4</span>
            </h1>
            <p>${statusText()}</p>
          </div>
        </div>
        <div class="board-wrap">
          <div class="board-row">
            <div class="row-labels" aria-hidden="true">
              ${[6, 5, 4, 3, 2, 1].map((row) => `<span>${row}</span>`).join("")}
            </div>
            <div class="board" role="grid" aria-label="Connect Four board">
              ${renderBoard()}
            </div>
          </div>
          <div class="column-labels" aria-hidden="true">
            ${columns.map((col) => `<span>${col}</span>`).join("")}
          </div>
        </div>
      </section>

      <aside class="panel">
        <div class="panel-actions">
          <button class="reset-button" data-action="reset">New Game</button>
          <button class="reset-button" data-action="undo" ${state.aiThinking || !state.game.can_undo() ? "disabled" : ""}>Undo</button>
        </div>
        <div class="control-group">
          <span class="label">Mode</span>
          <div class="segmented">
            <button data-mode="two" class="${state.mode === "two" ? "active" : ""}">2 Player</button>
            <button data-mode="ai" class="${state.mode === "ai" ? "active" : ""}">vs AI</button>
            <button data-mode="practice" class="${state.mode === "practice" ? "active" : ""}">Practice</button>
          </div>
        </div>

        <div class="control-grid ${state.mode === "ai" ? "" : "muted"}">
          <label>
            <span>AI thinking limit</span>
            <input type="range" min="50" max="2000" step="50" value="${state.aiMs}" data-setting="aiMs" ${state.mode === "ai" ? "" : "disabled"} />
            <strong>${state.aiMs} ms</strong>
          </label>
          <label>
            <span>AI strength</span>
            <input type="range" min="1" max="8" step="1" value="${state.aiStrength}" data-setting="aiStrength" ${state.mode === "ai" ? "" : "disabled"} />
            <strong>${state.aiStrength}</strong>
          </label>
        </div>

        <div class="practice ${state.mode === "practice" ? "" : "muted"}">
          <label class="select-row">
            <span>Problem set</span>
            <select data-set-select ${state.mode === "practice" ? "" : "disabled"}>
              ${renderSetOptions()}
            </select>
          </label>
          <label class="select-row">
            <span>Position</span>
            <select data-problem-select ${state.mode === "practice" ? "" : "disabled"}>
              ${renderProblemOptions()}
            </select>
          </label>
          <div class="problem-copy">
            <h2>${currentProblem?.title ?? "No problem"}</h2>
            <p>${currentProblem?.description ?? ""}</p>
            <code>${currentProblem?.moves ?? ""}</code>
          </div>
          <div class="problem-actions">
            <button data-action="load-problem" ${state.mode === "practice" ? "" : "disabled"}>Load</button>
            <button data-action="show-answer" ${state.mode === "practice" ? "" : "disabled"}>${state.solutionVisible ? "Hide" : "Answer"}</button>
          </div>
          ${state.solutionVisible && currentProblem ? `<p class="answer">${currentProblem.answer}</p>` : ""}
        </div>
      </aside>
    </main>
  `;

  bindEvents();
}

function renderBoard() {
  const board = state.game.board();
  const moveNumbers = state.game.move_numbers();
  const cells = [];

  for (let visualRow = 5; visualRow >= 0; visualRow -= 1) {
    for (let col = 0; col < 7; col += 1) {
      const index = visualRow * 7 + col;
      const value = board[index];
      const move = moveNumbers[index];
      const playerClass = value === PLAYER_RED ? "red" : value === PLAYER_BLACK ? "black" : "empty";
      cells.push(`
        <button
          class="slot ${playerClass}"
          data-col="${col}"
          role="gridcell"
          aria-label="${columns[col]}${visualRow + 1}"
          ${state.aiThinking ? "disabled" : ""}
        >
          <span class="disc">${move ? `<em>${move}</em>` : ""}</span>
        </button>
      `);
    }
  }

  return cells.join("");
}

function bindEvents() {
  app.querySelectorAll("[data-col]").forEach((button) => {
    button.addEventListener("click", () => handleColumn(Number(button.dataset.col)));
  });

  app.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const previousMode = state.mode;
      const nextMode = button.dataset.mode;
      const continuePracticePosition = previousMode === "practice" && nextMode === "ai";

      state.mode = nextMode;
      state.solutionVisible = false;

      if (continuePracticePosition) {
        state.aiPlayer = state.game.current_player();
        render();
        maybeRunAiTurn();
        return;
      }

      state.game.reset();
      if (state.mode === "ai") {
        state.aiPlayer = PLAYER_BLACK;
      }
      if (state.mode === "practice") {
        selectFirstProblemInSet();
        loadCurrentProblem();
      }
      render();
    });
  });

  app.querySelectorAll("[data-setting]").forEach((input) => {
    input.addEventListener("input", () => {
      state[input.dataset.setting] = Number(input.value);
      render();
    });
  });

  app.querySelector("[data-set-select]")?.addEventListener("change", (event) => {
    state.selectedSetName = event.target.value;
    state.solutionVisible = false;
    selectFirstProblemInSet();
    loadCurrentProblem();
    render();
  });

  app.querySelector("[data-problem-select]")?.addEventListener("change", (event) => {
    state.problemIndex = Number(event.target.value);
    state.solutionVisible = false;
    loadCurrentProblem();
    render();
  });

  app.querySelector("[data-action='reset']")?.addEventListener("click", () => {
    state.solutionVisible = false;
    state.game.reset();
    if (state.mode === "ai") {
      state.aiPlayer = PLAYER_BLACK;
    }
    if (state.mode === "practice") {
      loadCurrentProblem();
    }
    render();
  });

  app.querySelector("[data-action='undo']")?.addEventListener("click", () => {
    if (state.aiThinking || !state.game.can_undo()) return;
    state.solutionVisible = false;
    state.game.undo_move();
    render();
  });

  app.querySelector("[data-action='load-problem']")?.addEventListener("click", () => {
    loadCurrentProblem();
    render();
  });

  app.querySelector("[data-action='show-answer']")?.addEventListener("click", () => {
    state.solutionVisible = !state.solutionVisible;
    render();
  });
}

function handleColumn(col) {
  if (state.aiThinking) return;
  const outcome = parseOutcome(state.game.play_column(col));
  if (!outcome.ok) {
    render();
    return;
  }
  render();

  maybeRunAiTurn();
}

async function runAi() {
  state.aiThinking = true;
  render();
  await new Promise((resolve) => setTimeout(resolve, 40));
  state.game.ai_move(state.aiMs, state.aiStrength);
  state.aiThinking = false;
  render();
}

function maybeRunAiTurn() {
  if (state.mode === "ai" && !state.game.winner() && !state.game.is_draw() && state.game.current_player() === state.aiPlayer) {
    runAi();
  }
}

function loadCurrentProblem() {
  const problem = state.problems[state.problemIndex] ?? currentProblemList()[0]?.problem;
  if (!problem) return;
  const error = state.game.load_moves(problem.moves);
  if (typeof error === "string" && error.length) {
    console.error(error);
  }
  state.activeProblem = problem;
}

function statusText() {
  if (state.aiThinking) return "AI is thinking...";
  const winner = state.game.winner();
  if (winner) return `${playerName(winner)} wins.`;
  if (state.game.is_draw()) return "Draw game.";
  if (state.mode === "practice") return `${playerName(state.game.current_player())} to solve.`;
  return `${playerName(state.game.current_player())} to move.`;
}

function playerName(player) {
  return player === PLAYER_RED ? "Red" : "Yellow";
}

function parseOutcome(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

function renderProblemOptions() {
  return currentProblemList()
    .map(({ problem, index }) => `<option value="${index}" ${index === state.problemIndex ? "selected" : ""}>${escapeHtml(problem.title)}</option>`)
    .join("");
}

function renderSetOptions() {
  return problemSetNames()
    .map((setName) => `<option value="${escapeHtml(setName)}" ${setName === state.selectedSetName ? "selected" : ""}>${escapeHtml(setName)}</option>`)
    .join("");
}

function currentProblemList() {
  return state.problems
    .map((problem, index) => ({ problem, index }))
    .filter(({ problem }) => problemSetName(problem) === state.selectedSetName);
}

function selectFirstProblemInSet() {
  state.problemIndex = currentProblemList()[0]?.index ?? 0;
}

function problemSetNames() {
  return [...new Set(state.problems.map(problemSetName))].sort(compareProblemSetNames);
}

function problemSetName(problem) {
  return problem.set_name ?? problem.setName ?? problem.level ?? "Practice Problems";
}

function compareProblemSetNames(a, b) {
  return setDifficultyRank(a) - setDifficultyRank(b) || a.localeCompare(b, undefined, { numeric: true });
}

function setDifficultyRank(setName) {
  const name = setName.toLowerCase();
  if (name.includes("easy")) return 0;
  if (name.includes("medium")) return 1;
  if (name.includes("hard")) return 2;
  if (name.includes("expert")) return 3;
  if (name.includes("challenger")) return 4;
  return 5;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

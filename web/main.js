import init, { Connect4 } from "../pkg/connect4_web_game.js";
import "./style.css";

const PLAYER_RED = 1;
const PLAYER_BLACK = 2;
const columns = ["A", "B", "C", "D", "E", "F", "G"];
const levels = ["easy", "medium", "hard", "expert", "challenger"];

const state = {
  game: null,
  mode: "ai",
  aiPlayer: PLAYER_BLACK,
  aiThinking: false,
  aiMs: 350,
  aiStrength: 4,
  problems: [],
  level: "easy",
  problemIndex: 0,
  activeProblem: null,
  solutionVisible: false,
};

const app = document.querySelector("#app");

await init();
state.game = new Connect4();
state.problems = await fetch(`${import.meta.env.BASE_URL}problems.json`).then((res) => res.json());
render();

function render() {
  const problemList = state.problems.filter((problem) => problem.level === state.level);
  const currentProblem = problemList[state.problemIndex] ?? problemList[0];

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
          <div class="control-group">
            <span class="label">Problem set</span>
            <div class="level-list">
              ${levels.map((level) => `<button data-level="${level}" class="${state.level === level ? "active" : ""}" ${state.mode === "practice" ? "" : "disabled"}>${titleCase(level)}</button>`).join("")}
            </div>
          </div>
          <label class="select-row">
            <span>Position</span>
            <select data-problem-select ${state.mode === "practice" ? "" : "disabled"}>
              ${problemList.map((problem, index) => `<option value="${index}" ${index === state.problemIndex ? "selected" : ""}>${problem.title}</option>`).join("")}
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
      state.mode = button.dataset.mode;
      state.solutionVisible = false;
      state.game.reset();
      if (state.mode === "practice") {
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

  app.querySelectorAll("[data-level]").forEach((button) => {
    button.addEventListener("click", () => {
      state.level = button.dataset.level;
      state.problemIndex = 0;
      state.solutionVisible = false;
      loadCurrentProblem();
      render();
    });
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
    if (state.mode === "practice") {
      loadCurrentProblem();
    }
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

  if (state.mode === "ai" && !state.game.winner() && !state.game.is_draw() && state.game.current_player() === state.aiPlayer) {
    runAi();
  }
}

async function runAi() {
  state.aiThinking = true;
  render();
  await new Promise((resolve) => setTimeout(resolve, 40));
  state.game.ai_move(state.aiMs, state.aiStrength);
  state.aiThinking = false;
  render();
}

function loadCurrentProblem() {
  const problem = state.problems.filter((entry) => entry.level === state.level)[state.problemIndex];
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

function titleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

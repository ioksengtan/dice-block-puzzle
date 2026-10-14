// 骰陣拼圖
// Die faces name one blocked cell each (rows A–F, columns 1–6). Each of
// the 36 cells appears on exactly one die; two dice repeat faces. These
// are the physical faces listed by ManGo's Gaming (corrected) and by
// mitchblank/gsqsolve, which cites the same coordinates:
// https://mangosgaming.uk/portfolio/review-genius-square/
// https://github.com/mitchblank/gsqsolve/blob/main/gsqsolve.cpp
// https://www.reddit.com/r/boardgames/comments/kxt1q3/comment/gjc5m2n/
// Keep the face lists in sync with tools/verify_solvability.py.

const DICE = [
  ["A1", "C1", "D1", "D2", "E2", "F3"],
  ["A2", "B2", "C2", "A3", "B1", "B3"],
  ["C3", "D3", "E3", "B4", "C4", "D4"],
  ["E1", "F2", "F2", "B6", "A5", "A5"],
  ["A4", "B5", "C6", "C5", "D6", "F6"],
  ["E4", "F4", "E5", "F5", "D5", "E6"],
  ["F1", "F1", "F1", "A6", "A6", "A6"],
];

const DIE_NUMERALS = ["一", "二", "三", "四", "五", "六", "七"];
const ROW_LETTERS = "ABCDEF";

const TEMPLATES = [
  { id: "mono", name: "單格方塊", color: "#c9842a", cells: [[0, 0]] },
  { id: "domino", name: "雙格方塊", color: "#1f8a70", cells: [[0, 0], [0, 1]] },
  { id: "straight3", name: "直線三格方塊", color: "#d85a30", cells: [[0, 0], [0, 1], [0, 2]] },
  { id: "angle3", name: "角形三格方塊", color: "#7a5ea7", cells: [[0, 0], [1, 0], [1, 1]] },
  { id: "straight4", name: "直線四格方塊", color: "#2c6e9b", cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
  { id: "square4", name: "方形四格方塊", color: "#5c8a2e", cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
  { id: "tee4", name: "丁字形四格方塊", color: "#e09a12", cells: [[0, 0], [0, 1], [0, 2], [1, 1]] },
  { id: "skew4", name: "之字形四格方塊", color: "#c43b63", cells: [[0, 1], [0, 2], [1, 0], [1, 1]] },
  { id: "angle4", name: "長角形四格方塊", color: "#3e4c8a", cells: [[0, 0], [1, 0], [2, 0], [2, 1]] },
];

const timerEl = document.querySelector("#timer");
const messageEl = document.querySelector("#message");
const selectionEl = document.querySelector("#selection");
const diceEl = document.querySelector("#dice");
const boardEl = document.querySelector("#board");
const trayEl = document.querySelector("#tray");
const flipBtn = document.querySelector("#flip");
const againBtn = document.querySelector("#again");
const dragLayer = document.querySelector("#drag-layer");
const announceEl = document.querySelector("#announce");

const state = {
  dice: [],
  blockers: new Set(),
  pieces: [],
  selectedId: null,
  complete: false,
  message: "",
};

let startedAt = 0;
let frozenSeconds = 0;
let timerHandle = 0;
let drag = null;

function randomIndex() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % 6;
}

function coord(row, col) {
  return ROW_LETTERS[row] + String(col + 1);
}

function pieceById(id) {
  return state.pieces.find((piece) => piece.id === id) || null;
}

function normalize(cells) {
  const minRow = Math.min(...cells.map(([row]) => row));
  const minCol = Math.min(...cells.map(([, col]) => col));
  return cells
    .map(([row, col]) => [row - minRow, col - minCol])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

function boundsOf(cells) {
  let height = 0;
  let width = 0;
  for (const [row, col] of cells) {
    height = Math.max(height, row + 1);
    width = Math.max(width, col + 1);
  }
  return { height, width };
}

function occupancy(ignoreId) {
  const taken = new Set();
  for (const piece of state.pieces) {
    if (!piece.anchor || piece.id === ignoreId) continue;
    for (const [row, col] of piece.cells) {
      taken.add(`${piece.anchor.row + row},${piece.anchor.col + col}`);
    }
  }
  return taken;
}

function canPlace(piece, anchor, cells) {
  const taken = occupancy(piece.id);
  for (const [row, col] of cells) {
    const nextRow = anchor.row + row;
    const nextCol = anchor.col + col;
    if (nextRow < 0 || nextCol < 0 || nextRow >= 6 || nextCol >= 6) return false;
    if (state.blockers.has(coord(nextRow, nextCol))) return false;
    if (taken.has(`${nextRow},${nextCol}`)) return false;
  }
  return true;
}

function isFull() {
  if (state.pieces.some((piece) => !piece.anchor)) return false;
  return occupancy(null).size === 36 - state.blockers.size;
}

function currentSeconds() {
  if (state.complete) return frozenSeconds;
  return Math.floor((performance.now() - startedAt) / 1000);
}

function paintTimer() {
  const label = state.complete ? "完成時間" : "時間";
  timerEl.textContent = `${label}：${currentSeconds()} 秒`;
}

function startTimer() {
  startedAt = performance.now();
  frozenSeconds = 0;
  window.clearInterval(timerHandle);
  timerHandle = window.setInterval(paintTimer, 200);
  paintTimer();
}

function announce(text) {
  announceEl.textContent = text;
}

function setMessage(text) {
  state.message = text;
}

function paintStatus() {
  const piece = pieceById(state.selectedId);
  selectionEl.textContent = piece ? `目前選取：${piece.name}` : "尚未選取拼圖";
  messageEl.textContent = state.message;
  messageEl.classList.toggle("done", state.complete);
  flipBtn.disabled = state.complete;
}

function renderDice() {
  diceEl.replaceChildren();
  state.dice.forEach((face, index) => {
    const item = document.createElement("li");
    item.dataset.die = String(index + 1);
    const numeral = document.createElement("span");
    numeral.className = "die-index";
    numeral.textContent = DIE_NUMERALS[index];
    const value = document.createElement("span");
    value.className = "die-face";
    value.textContent = face;
    item.append(numeral, value);
    item.setAttribute("aria-label", `第${DIE_NUMERALS[index]}顆骰子，${face}`);
    diceEl.append(item);
  });
}

function renderShape(parent, piece) {
  const bounds = boundsOf(piece.cells);
  const shape = document.createElement("div");
  shape.className = "shape";
  shape.style.setProperty("--cols", String(bounds.width));
  shape.style.setProperty("--rows", String(bounds.height));
  shape.style.gridTemplateColumns = `repeat(${bounds.width}, minmax(0, 1fr))`;
  shape.style.gridTemplateRows = `repeat(${bounds.height}, minmax(0, 1fr))`;
  const filled = new Set(piece.cells.map(([row, col]) => `${row},${col}`));
  for (let row = 0; row < bounds.height; row += 1) {
    for (let col = 0; col < bounds.width; col += 1) {
      const pip = document.createElement("span");
      if (filled.has(`${row},${col}`)) {
        pip.className = "pip on";
        pip.dataset.dr = String(row);
        pip.dataset.dc = String(col);
        pip.style.background = piece.color;
      } else {
        pip.className = "pip off";
      }
      shape.append(pip);
    }
  }
  parent.append(shape);
  return bounds;
}

function renderBoard() {
  boardEl.replaceChildren();
  const corner = document.createElement("div");
  corner.className = "axis corner";
  corner.style.gridColumn = "1";
  corner.style.gridRow = "1";
  boardEl.append(corner);
  for (let col = 0; col < 6; col += 1) {
    const label = document.createElement("div");
    label.className = "axis col";
    label.textContent = String(col + 1);
    label.style.gridColumn = String(col + 2);
    label.style.gridRow = "1";
    boardEl.append(label);
  }
  for (let row = 0; row < 6; row += 1) {
    const label = document.createElement("div");
    label.className = "axis row";
    label.textContent = ROW_LETTERS[row];
    label.style.gridColumn = "1";
    label.style.gridRow = String(row + 2);
    boardEl.append(label);
    for (let col = 0; col < 6; col += 1) {
      const id = coord(row, col);
      const blocked = state.blockers.has(id);
      const cell = document.createElement("div");
      cell.className = blocked ? "cell blocked" : "cell";
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);
      cell.dataset.coord = id;
      cell.style.gridColumn = String(col + 2);
      cell.style.gridRow = String(row + 2);
      if (blocked) {
        const peg = document.createElement("span");
        peg.className = "peg";
        peg.setAttribute("aria-hidden", "true");
        const text = document.createElement("span");
        text.className = "coord";
        text.textContent = id;
        cell.append(peg, text);
      }
      cell.setAttribute(
        "aria-label",
        blocked ? `${ROW_LETTERS[row]} 列 ${col + 1} 行，阻擋` : `${ROW_LETTERS[row]} 列 ${col + 1} 行`,
      );
      boardEl.append(cell);
    }
  }
  for (const piece of state.pieces) {
    if (!piece.anchor) continue;
    const bounds = boundsOf(piece.cells);
    const el = document.createElement("div");
    el.className = "piece";
    el.dataset.piece = piece.id;
    el.dataset.anchor = `${piece.anchor.row},${piece.anchor.col}`;
    el.style.gridColumn = `${piece.anchor.col + 2} / span ${bounds.width}`;
    el.style.gridRow = `${piece.anchor.row + 2} / span ${bounds.height}`;
    el.style.setProperty("--cols", String(bounds.width));
    el.style.setProperty("--rows", String(bounds.height));
    el.dataset.cells = piece.cells.map(([row, col]) => `${row},${col}`).join(" ");
    el.setAttribute("role", "group");
    el.setAttribute("aria-label", `${piece.name}，已放在棋盤`);
    if (piece.id === state.selectedId) el.classList.add("selected");
    renderShape(el, piece);
    boardEl.append(el);
  }
}

function renderTray() {
  trayEl.replaceChildren();
  for (const piece of state.pieces) {
    if (piece.anchor) continue;
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.piece = piece.id;
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", `${piece.name}，尚未放置`);
    if (piece.id === state.selectedId) card.classList.add("selected");
    const hit = document.createElement("div");
    hit.className = "shape-hit";
    const bounds = renderShape(hit, piece);
    card.style.setProperty("--cols", String(bounds.width));
    card.style.setProperty("--rows", String(bounds.height));
    card.dataset.cells = piece.cells.map(([row, col]) => `${row},${col}`).join(" ");
    card.append(hit);
    const name = document.createElement("p");
    name.className = "piece-name";
    name.textContent = piece.name;
    card.append(name);
    trayEl.append(card);
  }
}

function fitBoard() {
  const section = document.querySelector(".board-section");
  if (!section || !boardEl.querySelector(".cell")) return;
  boardEl.style.width = "100%";
  const available = section.clientHeight;
  const measured = boardEl.getBoundingClientRect();
  if (measured.height > available + 1 && measured.height > 0) {
    boardEl.style.width = `${Math.max(160, Math.floor(measured.width * (available / measured.height)))}px`;
  }
}

function render() {
  renderDice();
  renderBoard();
  renderTray();
  paintStatus();
  paintTimer();
  fitBoard();
}

function finishRound() {
  if (state.complete) return;
  state.complete = true;
  frozenSeconds = Math.floor((performance.now() - startedAt) / 1000);
  window.clearInterval(timerHandle);
  state.message = "棋盤已填滿";
  render();
  announce(`棋盤已填滿，完成時間 ${frozenSeconds} 秒。`);
}

function commit() {
  if (!state.complete && isFull()) finishRound();
  else render();
}

function flash(id) {
  const el = document.querySelector(`[data-piece="${id}"]`);
  if (!el) return;
  el.classList.remove("shake");
  void el.offsetWidth;
  el.classList.add("shake");
}

function applyCells(piece, nextCells) {
  const normalized = normalize(nextCells);
  if (!piece.anchor) {
    piece.cells = normalized;
    state.message = "";
    render();
    return;
  }
  const previous = new Set(piece.cells.map(([row, col]) => `${piece.anchor.row + row},${piece.anchor.col + col}`));
  let best = null;
  let bestScore = -1;
  let bestDistance = Infinity;
  for (let row = 0; row < 6; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      if (!canPlace(piece, { row, col }, normalized)) continue;
      let score = 0;
      for (const [cellRow, cellCol] of normalized) {
        if (previous.has(`${row + cellRow},${col + cellCol}`)) score += 1;
      }
      const distance = Math.abs(row - piece.anchor.row) + Math.abs(col - piece.anchor.col);
      if (score > bestScore || (score === bestScore && distance < bestDistance)) {
        bestScore = score;
        bestDistance = distance;
        best = { row, col };
      }
    }
  }
  if (!best || bestScore < 1) {
    state.message = "這個方向放不下";
    paintStatus();
    flash(piece.id);
    return;
  }
  piece.cells = normalized;
  piece.anchor = best;
  state.message = "";
  commit();
}

function rotatePiece(piece) {
  applyCells(piece, piece.cells.map(([row, col]) => [col, -row]));
}

function flipPiece(piece) {
  applyCells(piece, piece.cells.map(([row, col]) => [row, -col]));
}

function newRound(shouldAnnounce) {
  drag = null;
  dragLayer.hidden = true;
  dragLayer.replaceChildren();
  state.dice = DICE.map((faces) => faces[randomIndex()]);
  state.blockers = new Set(state.dice);
  state.pieces = TEMPLATES.map((template) => ({
    id: template.id,
    name: template.name,
    color: template.color,
    cells: template.cells.map((cell) => cell.slice()),
    anchor: null,
  }));
  state.selectedId = null;
  state.complete = false;
  state.message = "";
  startTimer();
  render();
  if (shouldAnnounce) announce("已重新擲骰，時間重新計算。");
}

function boardMetrics() {
  const origin = boardEl.querySelector('.cell[data-row="0"][data-col="0"]').getBoundingClientRect();
  const right = boardEl.querySelector('.cell[data-row="0"][data-col="1"]').getBoundingClientRect();
  const below = boardEl.querySelector('.cell[data-row="1"][data-col="0"]').getBoundingClientRect();
  const last = boardEl.querySelector('.cell[data-row="5"][data-col="5"]').getBoundingClientRect();
  return {
    left: origin.left,
    top: origin.top,
    strideX: right.left - origin.left,
    strideY: below.top - origin.top,
    cellW: origin.width,
    cellH: origin.height,
    right: last.right,
    bottom: last.bottom,
  };
}

function boardCellAt(x, y) {
  const metrics = boardMetrics();
  if (metrics.strideX <= 0 || metrics.strideY <= 0) return null;
  if (x < metrics.left || y < metrics.top || x > metrics.right || y > metrics.bottom) return null;
  return {
    row: Math.min(5, Math.max(0, Math.floor((y - metrics.top) / metrics.strideY))),
    col: Math.min(5, Math.max(0, Math.floor((x - metrics.left) / metrics.strideX))),
  };
}

function clearPreview() {
  boardEl.querySelectorAll(".preview-ok, .preview-bad").forEach((cell) => {
    cell.classList.remove("preview-ok", "preview-bad");
  });
}

function removeGhost() {
  dragLayer.replaceChildren();
  dragLayer.hidden = true;
  document.querySelectorAll(".lifting").forEach((el) => el.classList.remove("lifting"));
}

function buildGhost(piece, session) {
  const bounds = boundsOf(piece.cells);
  const metrics = boardMetrics();
  session.cols = bounds.width;
  session.rows = bounds.height;
  const ghost = document.createElement("div");
  ghost.className = "ghost";
  ghost.style.width = `${bounds.width * metrics.strideX - (metrics.strideX - metrics.cellW)}px`;
  ghost.style.height = `${bounds.height * metrics.strideY - (metrics.strideY - metrics.cellH)}px`;
  ghost.style.gridTemplateColumns = `repeat(${bounds.width}, ${metrics.cellW}px)`;
  ghost.style.gridTemplateRows = `repeat(${bounds.height}, ${metrics.cellH}px)`;
  ghost.style.columnGap = `${Math.max(0, metrics.strideX - metrics.cellW)}px`;
  ghost.style.rowGap = `${Math.max(0, metrics.strideY - metrics.cellH)}px`;
  const filled = new Set(piece.cells.map(([row, col]) => `${row},${col}`));
  for (let row = 0; row < bounds.height; row += 1) {
    for (let col = 0; col < bounds.width; col += 1) {
      const pip = document.createElement("span");
      if (filled.has(`${row},${col}`)) {
        pip.className = "pip on";
        pip.style.background = piece.color;
      } else {
        pip.className = "pip off";
      }
      ghost.append(pip);
    }
  }
  dragLayer.hidden = false;
  dragLayer.replaceChildren(ghost);
  session.ghost = ghost;
}

function positionGhost(x, y, session) {
  const metrics = boardMetrics();
  const left = x - (session.dc * metrics.strideX + metrics.cellW / 2);
  const top = y - (session.dr * metrics.strideY + metrics.cellH / 2);
  session.ghost.style.transform = `translate(${left}px, ${top}px)`;
}

function updatePreview(event, session) {
  clearPreview();
  const hit = boardCellAt(event.clientX, event.clientY);
  if (!hit) return;
  const piece = pieceById(session.id);
  const anchor = { row: hit.row - session.dr, col: hit.col - session.dc };
  const ok = canPlace(piece, anchor, piece.cells);
  for (const [row, col] of piece.cells) {
    const cell = boardEl.querySelector(
      `.cell[data-row="${anchor.row + row}"][data-col="${anchor.col + col}"]`,
    );
    if (cell) cell.classList.add(ok ? "preview-ok" : "preview-bad");
  }
}

function endDrag(session, event) {
  const piece = pieceById(session.id);
  const hit = boardCellAt(event.clientX, event.clientY);
  clearPreview();
  removeGhost();
  if (!hit) {
    const wasPlaced = piece.anchor !== null;
    piece.anchor = null;
    state.message = wasPlaced ? "已收回拼圖" : "";
    render();
    return;
  }
  const anchor = { row: hit.row - session.dr, col: hit.col - session.dc };
  if (canPlace(piece, anchor, piece.cells)) {
    piece.anchor = anchor;
    state.message = "";
    commit();
    return;
  }
  state.message = "這個位置放不下";
  render();
  flash(piece.id);
}

function nearestPip(card, x, y) {
  let best = null;
  let bestDistance = Infinity;
  for (const pip of card.querySelectorAll(".pip.on")) {
    const rect = pip.getBoundingClientRect();
    const dx = rect.left + rect.width / 2 - x;
    const dy = rect.top + rect.height / 2 - y;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = pip;
    }
  }
  return best;
}

document.addEventListener("pointerdown", (event) => {
  if (drag || state.complete || !event.isPrimary || event.button > 0) return;
  const card = event.target.closest("[data-piece]");
  if (!card) return;
  state.selectedId = card.dataset.piece;
  paintStatus();
  document.querySelectorAll("[data-piece]").forEach((el) => {
    el.classList.toggle("selected", el.dataset.piece === state.selectedId);
  });
  const onBoard = card.classList.contains("piece");
  const handle = onBoard ? event.target.closest(".pip.on") : event.target.closest(".shape-hit");
  if (!handle || !card.contains(handle)) return;
  const pip = event.target.closest(".pip.on");
  const grabbed = pip && card.contains(pip) ? pip : nearestPip(card, event.clientX, event.clientY);
  if (!grabbed) return;
  card.setPointerCapture(event.pointerId);
  drag = {
    id: card.dataset.piece,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    dr: Number(grabbed.dataset.dr),
    dc: Number(grabbed.dataset.dc),
    moved: false,
    card,
  };
  event.preventDefault();
});

document.addEventListener("pointermove", (event) => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  if (!drag.moved && dx * dx + dy * dy < 100) return;
  if (!drag.moved) {
    drag.moved = true;
    drag.card.classList.add("lifting");
    buildGhost(pieceById(drag.id), drag);
  }
  positionGhost(event.clientX, event.clientY, drag);
  updatePreview(event, drag);
  event.preventDefault();
}, { passive: false });

document.addEventListener("pointerup", (event) => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const session = drag;
  drag = null;
  if (!session.moved) {
    rotatePiece(pieceById(session.id));
    return;
  }
  endDrag(session, event);
});

document.addEventListener("pointercancel", (event) => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  drag = null;
  clearPreview();
  removeGhost();
});

flipBtn.addEventListener("click", () => {
  const piece = pieceById(state.selectedId);
  if (!piece || state.complete) {
    state.message = "請先點選一塊拼圖";
    paintStatus();
    return;
  }
  flipPiece(piece);
});

againBtn.addEventListener("click", () => {
  newRound(true);
});

document.addEventListener("contextmenu", (event) => {
  if (event.target.closest("[data-piece]")) event.preventDefault();
});

newRound(false);
window.addEventListener("resize", fitBoard);

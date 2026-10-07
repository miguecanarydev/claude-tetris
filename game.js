'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - azul pálido
  '#ffb74d', // L - orange
  '#b0bec5', // Tuerca - gris acero
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Tuerca (3x3 con hueco)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const startScreen = document.getElementById('start-screen');
const playBtn = document.getElementById('play-btn');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const recordsGameOver = document.getElementById('records-gameover');
const recordForm = document.getElementById('record-form');
const recordNameInput = document.getElementById('record-name');
const recordNewEl = document.getElementById('record-new');

let gridColor = '#22222e';
let blockEdge = 'transparent';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, combo, maxComboThisGame;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  return cleared;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  updateCombo(clearLines());
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.strokeStyle = blockEdge;
  context.lineWidth = 1;
  context.strokeRect(x * size + 1.5, y * size + 1.5, size - 3, size - 3);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  showGameOverRecords();
  overlay.classList.remove('hidden');
  if (pendingRecord) recordNameInput.focus();
}

function togglePause() {
  if (gameOver || !current) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  // endGame() puede haberse llamado desde lockPiece() dentro de este mismo
  // fotograma; no reprogramar el bucle o seguiría apilando piezas.
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  // Si se reinicia sin guardar un récord pendiente, guardarlo como Anónimo
  if (typeof pendingRecord !== 'undefined' && pendingRecord) commitRecord(recordNameInput.value);
  if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  combo = 0;
  maxComboThisGame = 0;
  startScreen.classList.add('hidden');
  recordsGameOver.classList.add('hidden');
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  // Escribir el nombre en un campo de texto no debe mover piezas ni pausar
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  // Sin partida activa (pantalla de inicio) no hay pieza que manejar
  if (!current) return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const isLight = theme === 'light';
  themeToggle.textContent = isLight ? 'Modo oscuro' : 'Modo claro';
  themeToggle.setAttribute('aria-pressed', String(isLight));
  const styles = getComputedStyle(document.documentElement);
  gridColor = styles.getPropertyValue('--grid-color').trim();
  blockEdge = styles.getPropertyValue('--block-edge').trim();
  try { localStorage.setItem('theme', theme); } catch (e) {}
  // Redibujar sin tocar animId (el bucle está cancelado en pausa/game over)
  if (current && next) { draw(); drawNext(); }
}

themeToggle.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  themeToggle.blur();
});

let savedTheme = null;
try { savedTheme = localStorage.getItem('theme'); } catch (e) {}
applyTheme(savedTheme === 'light' ? 'light' : 'dark');

/* ---- Récords ---- */
const RECORDS_KEY = 'tetris-records';
const MAX_RECORDS = 5;
let records = loadRecords();
let pendingRecord = false;

function emptyRecords() {
  return { top: [], bestCombo: 0, maxLines: 0 };
}

function loadRecords() {
  const data = emptyRecords();
  try {
    const parsed = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.top)) {
        data.top = parsed.top
          .filter(e => e && Number.isFinite(e.score))
          .sort((a, b) => b.score - a.score)
          .slice(0, MAX_RECORDS)
          .map(e => ({
            name: String(e.name ?? '').slice(0, 12),
            score: e.score,
            lines: Number(e.lines) || 0,
            level: Number(e.level) || 1,
          }));
      }
      data.bestCombo = Number(parsed.bestCombo) || 0;
      data.maxLines = Number(parsed.maxLines) || 0;
    }
  } catch (e) {}
  return data;
}

function saveRecords() {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(records)); } catch (e) {}
}

function updateCombo(cleared) {
  combo = cleared ? combo + 1 : 0;
  if (combo > maxComboThisGame) maxComboThisGame = combo;
}

function qualifiesForTop(sc) {
  if (sc <= 0) return false;
  return records.top.length < MAX_RECORDS || sc > records.top[records.top.length - 1].score;
}

function renderRecordsTable(container, highlightIdx) {
  container.textContent = '';
  if (!records.top.length) {
    const p = document.createElement('p');
    p.className = 'records-empty';
    p.textContent = 'Aún no hay récords';
    container.appendChild(p);
    return;
  }
  const table = document.createElement('table');
  table.className = 'records-table';
  const head = table.createTHead().insertRow();
  ['#', 'Nombre', 'Puntos', 'Líneas', 'Nivel'].forEach(t => {
    const th = document.createElement('th');
    th.textContent = t;
    head.appendChild(th);
  });
  const body = table.createTBody();
  records.top.forEach((e, i) => {
    const tr = body.insertRow();
    if (i === highlightIdx) tr.className = 'highlight';
    [i + 1, e.name || 'Anónimo', e.score.toLocaleString(), e.lines, e.level].forEach(v => {
      tr.insertCell().textContent = v;
    });
  });
  container.appendChild(table);
}

function renderRecordStats(el) {
  el.textContent = `Mejor combo: ${records.bestCombo} · Máx. líneas: ${records.maxLines}`;
}

function renderStartScreen() {
  renderRecordsTable(document.getElementById('records-table-start'), -1);
  renderRecordStats(document.getElementById('records-stats-start'));
}

function renderGameOverRecords(highlightIdx) {
  renderRecordsTable(document.getElementById('records-table-go'), highlightIdx);
  renderRecordStats(document.getElementById('records-stats-go'));
}

function showGameOverRecords() {
  // Mejor combo y máx. líneas se actualizan aunque la puntuación no entre en el top
  if (maxComboThisGame > records.bestCombo) records.bestCombo = maxComboThisGame;
  if (lines > records.maxLines) records.maxLines = lines;
  saveRecords();
  pendingRecord = qualifiesForTop(score);
  recordNewEl.classList.add('hidden');
  recordForm.classList.toggle('hidden', !pendingRecord);
  recordNameInput.value = '';
  renderGameOverRecords(-1);
  recordsGameOver.classList.remove('hidden');
}

function commitRecord(name) {
  pendingRecord = false;
  const entry = { name: name.trim().slice(0, 12) || 'Anónimo', score, lines, level };
  // Inserta tras las entradas con igual puntuación
  let idx = records.top.findIndex(r => r.score < entry.score);
  if (idx === -1) idx = records.top.length;
  records.top.splice(idx, 0, entry);
  records.top = records.top.slice(0, MAX_RECORDS);
  saveRecords();
  return idx;
}

recordForm.addEventListener('submit', e => {
  e.preventDefault();
  if (!pendingRecord) return;
  const idx = commitRecord(recordNameInput.value);
  recordForm.classList.add('hidden');
  recordNewEl.classList.remove('hidden');
  renderGameOverRecords(idx);
});

resetRecordsBtn.addEventListener('click', () => {
  if (!confirm('¿Borrar todos los récords?')) return;
  records = emptyRecords();
  saveRecords();
  renderStartScreen();
});

playBtn.addEventListener('click', init);

renderStartScreen();

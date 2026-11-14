/* ==========================================================================
   孔明棋 規則核心 (純邏輯，不含 3D 畫面)
   - 棋盤：英式十字 33 孔，座標 (r, c)，r、c 都是 0~6；四個角落 2×2 不是孔
   - 盤面用長度 49 的陣列表示：1 = 有棋子、0 = 空孔、-1 = 不是孔
   - 走法：棋子沿上下左右跳過「相鄰的一顆棋子」，落在後面的空孔，被跳過的棋子拿掉
   這段程式已用 Node.js 測試過，貼進 index.html 時請整段原樣貼上，不要修改。
   ========================================================================== */
const KM_SIZE = 7;
const KM_CENTER = { r: 3, c: 3 };
const KM_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

function kmIsHole(r, c) {
  if (r < 0 || r >= KM_SIZE || c < 0 || c >= KM_SIZE) return false;
  const inMiddleRows = r >= 2 && r <= 4;
  const inMiddleCols = c >= 2 && c <= 4;
  return inMiddleRows || inMiddleCols;
}

function kmIndex(r, c) { return r * KM_SIZE + c; }

// 關卡：pegs 列出一開始有棋子的孔；goal 是最後要剩下的那一顆的位置 (完美解)
const KM_LEVELS = [
  {
    id: 'cross', name: '① 十字架', stars: 1,
    desc: '6 顆棋子，暖身用！',
    pegs: [[1, 3], [2, 2], [2, 3], [2, 4], [3, 3], [4, 3]],
    goal: { r: 3, c: 3 }
  },
  {
    id: 'plus', name: '② 加號', stars: 1,
    desc: '9 顆棋子，試著讓最後一顆停在正中央。',
    pegs: [[1, 3], [2, 3], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [4, 3], [5, 3]],
    goal: { r: 3, c: 3 }
  },
  {
    id: 'fireplace', name: '③ 壁爐', stars: 2,
    desc: '11 顆棋子，要先想好順序喔！',
    pegs: [[0, 2], [0, 3], [0, 4], [1, 2], [1, 3], [1, 4], [2, 2], [2, 3], [2, 4], [3, 2], [3, 4]],
    goal: { r: 3, c: 3 }
  },
  {
    id: 'diamond', name: '④ 鑽石', stars: 2,
    desc: '12 顆棋子圍成鑽石，中間是空的。',
    pegs: [[1, 3], [2, 2], [2, 3], [2, 4], [3, 1], [3, 2], [3, 4], [3, 5], [4, 2], [4, 3], [4, 4], [5, 3]],
    goal: { r: 3, c: 3 }
  },
  {
    id: 'pyramid', name: '⑤ 金字塔', stars: 2,
    desc: '16 顆棋子排成金字塔。',
    pegs: [[1, 3], [2, 2], [2, 3], [2, 4], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [4, 0], [4, 1], [4, 2], [4, 3], [4, 4], [4, 5], [4, 6]],
    goal: { r: 3, c: 3 }
  },
  {
    id: 'arrow', name: '⑥ 箭頭', stars: 3,
    desc: '17 顆棋子排成往上的箭頭。',
    pegs: [[0, 3], [1, 2], [1, 3], [1, 4], [2, 1], [2, 2], [2, 3], [2, 4], [2, 5], [3, 3], [4, 3], [5, 2], [5, 3], [5, 4], [6, 2], [6, 3], [6, 4]],
    goal: { r: 3, c: 3 }
  },
  {
    id: 'classic', name: '⑦ 經典全盤', stars: 3,
    desc: '32 顆棋子、中央空一格。孔明棋的終極挑戰！',
    pegs: 'ALL_BUT_CENTER',
    goal: { r: 3, c: 3 }
  }
];

function kmCreateBoard(level) {
  const board = new Array(KM_SIZE * KM_SIZE).fill(-1);
  for (let r = 0; r < KM_SIZE; r++) {
    for (let c = 0; c < KM_SIZE; c++) {
      if (kmIsHole(r, c)) board[kmIndex(r, c)] = 0;
    }
  }
  if (level.pegs === 'ALL_BUT_CENTER') {
    for (let i = 0; i < board.length; i++) if (board[i] === 0) board[i] = 1;
    board[kmIndex(KM_CENTER.r, KM_CENTER.c)] = 0;
  } else {
    level.pegs.forEach(([r, c]) => { board[kmIndex(r, c)] = 1; });
  }
  return board;
}

function kmCountPegs(board) {
  let n = 0;
  for (const v of board) if (v === 1) n++;
  return n;
}

// 某一顆棋子的所有合法跳法：[{ from:{r,c}, over:{r,c}, to:{r,c} }]
function kmMovesFrom(board, r, c) {
  const moves = [];
  if (!kmIsHole(r, c) || board[kmIndex(r, c)] !== 1) return moves;
  for (const [dr, dc] of KM_DIRS) {
    const or = r + dr, oc = c + dc;
    const tr = r + 2 * dr, tc = c + 2 * dc;
    if (!kmIsHole(tr, tc)) continue;
    if (board[kmIndex(or, oc)] === 1 && board[kmIndex(tr, tc)] === 0) {
      moves.push({ from: { r, c }, over: { r: or, c: oc }, to: { r: tr, c: tc } });
    }
  }
  return moves;
}

function kmAllMoves(board) {
  const moves = [];
  for (let r = 0; r < KM_SIZE; r++) {
    for (let c = 0; c < KM_SIZE; c++) {
      if (board[kmIndex(r, c)] === 1) moves.push(...kmMovesFrom(board, r, c));
    }
  }
  return moves;
}

// 回傳新的盤面 (不修改原本的陣列)
function kmApplyMove(board, move) {
  const next = board.slice();
  next[kmIndex(move.from.r, move.from.c)] = 0;
  next[kmIndex(move.over.r, move.over.c)] = 0;
  next[kmIndex(move.to.r, move.to.c)] = 1;
  return next;
}

// 結果評語：remaining = 剩下幾顆；onGoal = 剩一顆且停在目標位置
function kmRating(remaining, onGoal) {
  if (remaining === 1 && onGoal) return { title: '🏆 完美！孔明再世！', stars: 3 };
  if (remaining === 1) return { title: '🎉 天才！只剩一顆！', stars: 3 };
  if (remaining === 2) return { title: '😺 非常聰明！只差一點點', stars: 2 };
  if (remaining <= 4) return { title: '👍 很棒！再挑戰看看', stars: 1 };
  return { title: '🐾 多試幾次就會越來越厲害！', stars: 0 };
}

/* --------------------------------------------------------------------------
   提示：從目前盤面找出「還能解到剩一顆」的下一步
   - 深度優先搜尋 + 記住走不通的盤面，限時 timeLimitMs 毫秒
   - 回傳 { status: 'ok', move } / { status: 'unsolvable' } / { status: 'timeout' }
   - requireGoal = true 時，必須剩一顆且停在 goal 位置才算解開
   -------------------------------------------------------------------------- */
function kmFindHint(board, goal, requireGoal, timeLimitMs) {
  const deadline = Date.now() + (timeLimitMs || 1500);
  const failed = new Set();
  const goalIdx = goal ? kmIndex(goal.r, goal.c) : -1;
  let timedOut = false;
  let nodes = 0;

  function key(b) {
    // 33 個孔各用一個字元，作為記憶用的鍵
    let s = '';
    for (let i = 0; i < b.length; i++) if (b[i] !== -1) s += b[i];
    return s;
  }

  function solved(b) {
    if (kmCountPegs(b) !== 1) return false;
    return !requireGoal || b[goalIdx] === 1;
  }

  function dfs(b) {
    if (solved(b)) return true;
    if ((++nodes & 1023) === 0 && Date.now() > deadline) { timedOut = true; return false; }
    const k = key(b);
    if (failed.has(k)) return false;
    for (const m of kmAllMoves(b)) {
      if (dfs(kmApplyMove(b, m))) return true;
      if (timedOut) return false;
    }
    failed.add(k);
    return false;
  }

  if (solved(board)) return { status: 'solved' };
  for (const m of kmAllMoves(board)) {
    if (dfs(kmApplyMove(board, m))) return { status: 'ok', move: m };
    if (timedOut) return { status: 'timeout' };
  }
  return { status: 'unsolvable' };
}

// 讓 Node.js 測試時可以載入；在瀏覽器裡這段不會執行
if (typeof module !== 'undefined') {
  module.exports = { KM_LEVELS, kmIsHole, kmIndex, kmCreateBoard, kmCountPegs, kmMovesFrom, kmAllMoves, kmApplyMove, kmRating, kmFindHint };
}

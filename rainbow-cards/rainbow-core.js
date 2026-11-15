// 阿喵彩虹牌 規則核心
// 只負責規則，不碰畫面。瀏覽器用 <script> 載入後，所有名稱都是全域的。
// 重要：rbApply / rbMeow 不會修改傳入的 state，而是回傳新的 state 與「發生了哪些事」的 events 清單。
// 畫面程式請不要自己改 state 的內容，一律透過這裡的函式。
(function (root) {
  'use strict';

  const RB_FAMILIES = [
    { id: 'cat',    name: '橘花貓',   emoji: '🐱', color: '#f28c28', dark: '#b85f0a', light: '#ffe3c2', pattern: 'dots' },
    { id: 'frog',   name: '綠青蛙',   emoji: '🐸', color: '#3fae5a', dark: '#23763a', light: '#d3f2da', pattern: 'leaves' },
    { id: 'owl',    name: '白貓頭鷹', emoji: '🦉', color: '#eef2f7', dark: '#5f7189', light: '#ffffff', pattern: 'stars' },
    { id: 'rabbit', name: '粉紅兔',   emoji: '🐰', color: '#f48fb1', dark: '#c2507a', light: '#ffe0eb', pattern: 'hearts' }
  ];
  const FAMILY_IDS = RB_FAMILIES.map(f => f.id);

  const RB_TYPES = {
    num:     { name: '數字',     desc: '沒有特別效果。' },
    sleep:   { name: '打瞌睡',   desc: '下一位睡著了，暫停一次。' },
    reverse: { name: '回頭走',   desc: '出牌方向反過來。兩個人玩的時候，等於自己再出一次。' },
    fish:    { name: '請吃魚',   desc: '下一位抽 2 張牌，並暫停一次。' },
    peek:    { name: '偷看',     desc: '選一位對手，偷看他的手牌。' },
    gift:    { name: '送禮',     desc: '從自己的手牌挑一張，送給下一位。' },
    rainbow: { name: '彩虹牌',   desc: '什麼時候都能出，出牌的人指定接下來的家族。' },
    storm:   { name: '彩虹風暴', desc: '指定家族，下一位抽 3 張牌，並暫停一次。' }
  };

  const RB_HAND_SIZE = 7;
  const RB_DECK_SIZE = 110;
  const AI_NAMES = ['小橘', '呱呱', '咕咕'];

  // ---------- 小工具 ----------

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // mulberry32：可重現的亂數。種子存在 state.seed，所以同一個種子會發出同一副牌
  function nextSeed(seed) { return (seed + 0x6D2B79F5) >>> 0; }
  function seedToFloat(seed) {
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function rnd(s) { s.seed = nextSeed(s.seed); return seedToFloat(s.seed); }
  function shuffle(arr, s) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd(s) * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function isWild(card) { return card.type === 'rainbow' || card.type === 'storm'; }

  // ---------- 牌組 ----------

  // 回傳 110 張牌：{ id, family, type, value }
  // family 是 'cat' | 'frog' | 'owl' | 'rabbit'，彩虹牌與彩虹風暴是 null；value 只有數字牌有（1–9）
  function rbCreateDeck() {
    const deck = [];
    let id = 0;
    const add = (family, type, value) => deck.push({ id: id++, family, type, value: value == null ? null : value });
    for (const fam of FAMILY_IDS) {
      for (let v = 1; v <= 9; v++) { add(fam, 'num', v); add(fam, 'num', v); }
      for (const t of ['sleep', 'reverse', 'fish']) { add(fam, t); add(fam, t); }
      add(fam, 'peek');
      add(fam, 'gift');
    }
    for (let i = 0; i < 4; i++) add(null, 'rainbow');
    for (let i = 0; i < 2; i++) add(null, 'storm');
    return deck;
  }

  function rbFamily(id) { return RB_FAMILIES.find(f => f.id === id) || null; }

  // 牌的中文名稱，例如「橘花貓 5」、「綠青蛙 打瞌睡」、「彩虹牌」
  function rbCardName(card) {
    if (isWild(card)) return RB_TYPES[card.type].name;
    const fam = rbFamily(card.family).name;
    return card.type === 'num' ? fam + ' ' + card.value : fam + ' ' + RB_TYPES[card.type].name;
  }

  // ---------- 開局 ----------

  // opts: { playerCount: 2–4, difficulty: 'easy'|'normal'|'hard', autoMeow: true|false, seed: 整數 }
  // 0 號玩家是學生（isHuman: true），其餘是電腦。回傳 { state, events }
  function rbCreateGame(opts) {
    opts = opts || {};
    const n = Math.min(4, Math.max(2, opts.playerCount || 4));
    const difficulty = ['easy', 'normal', 'hard'].includes(opts.difficulty) ? opts.difficulty : 'normal';
    const seed = (opts.seed == null ? Math.floor(Math.random() * 4294967296) : opts.seed) >>> 0;
    const s = {
      config: { playerCount: n, difficulty, autoMeow: !!opts.autoMeow },
      seed,
      players: [],
      drawPile: [],
      discardPile: [],
      currentFamily: null,
      turn: 0,
      direction: 1,
      phase: 'play',        // 'play' 等出牌或抽牌；'drawn' 剛抽到一張能出的牌；'over' 結束
      drawnCardId: null,    // phase 是 'drawn' 時，剛抽到的那張牌的 id
      meowed: [],           // 每位玩家是否已經喊過「喵！」
      meowPending: null,    // 剩一張卻還沒喊的玩家編號（下一個動作發生時會被罰）
      lacks: [],            // 困難電腦的記憶：每位玩家已知缺哪些家族
      idlePasses: 0,
      winner: null,
      winReason: null
    };
    for (let i = 0; i < n; i++) {
      s.players.push({ name: i === 0 ? '你' : AI_NAMES[i - 1], isHuman: i === 0, hand: [] });
      s.meowed.push(false);
      s.lacks.push([]);
    }
    s.drawPile = shuffle(rbCreateDeck(), s);
    for (let r = 0; r < RB_HAND_SIZE; r++) {
      for (let i = 0; i < n; i++) s.players[i].hand.push(s.drawPile.pop());
    }
    // 第一張棄牌一定是數字牌：從抽牌堆最上面往下找第一張數字牌
    let k = s.drawPile.length - 1;
    while (s.drawPile[k].type !== 'num') k--;
    const first = s.drawPile.splice(k, 1)[0];
    s.discardPile.push(first);
    s.currentFamily = first.family;
    const events = [
      { type: 'deal', hands: s.players.map(p => clone(p.hand)) },
      { type: 'start', card: clone(first) },
      { type: 'turn', player: 0 }
    ];
    return { state: s, events };
  }

  // ---------- 查詢 ----------

  function rbTopCard(state) { return state.discardPile[state.discardPile.length - 1]; }

  // 從目前輪到的人往出牌方向數 steps 位
  function rbNextPlayer(state, steps) {
    const n = state.players.length;
    const k = steps == null ? 1 : steps;
    return (((state.turn + state.direction * k) % n) + n) % n;
  }

  // 這張牌現在能不能出（不檢查是誰的牌）
  function rbCanPlay(card, state) {
    if (isWild(card)) return true;
    if (card.family === state.currentFamily) return true;
    const top = rbTopCard(state);
    if (card.type === 'num') return top.type === 'num' && top.value === card.value;
    return top.type === card.type;
  }

  // 這位玩家現在可以出的牌（不是輪到他、或遊戲結束時回傳空陣列）
  function rbPlayableCards(state, player) {
    if (state.phase === 'over' || state.turn !== player) return [];
    const hand = state.players[player].hand;
    if (state.phase === 'drawn') return hand.filter(c => c.id === state.drawnCardId);
    return hand.filter(c => rbCanPlay(c, state));
  }

  // 輪到的人出這張牌之前，畫面還要先問什麼：
  // { family: 要選家族, target: 要選一位對手, gift: 要挑一張手牌送人 }
  // 出的是最後一張牌時，三個都是 false（直接獲勝）
  function rbNeeds(state, card) {
    const remaining = state.players[state.turn].hand.length - 1;
    const more = remaining > 0;
    return {
      family: more && isWild(card),
      target: more && card.type === 'peek',
      gift: more && card.type === 'gift'
    };
  }

  // ---------- 內部：抽牌、換人、喵 ----------

  function drawCards(s, player, count, reason, ev) {
    const got = [];
    for (let i = 0; i < count; i++) {
      if (s.drawPile.length === 0) {
        if (s.discardPile.length <= 1) break;
        const top = s.discardPile.pop();
        const rest = s.discardPile;
        s.discardPile = [top];
        s.drawPile = shuffle(rest, s);
        ev.push({ type: 'reshuffle', count: s.drawPile.length });
      }
      const c = s.drawPile.pop();
      s.players[player].hand.push(c);
      got.push(c);
    }
    if (reason !== 'turn') s.lacks[player] = [];
    if (got.length) ev.push({ type: 'draw', player, cards: clone(got), reason });
    return got;
  }

  function syncMeow(s) {
    for (let i = 0; i < s.players.length; i++) {
      if (s.players[i].hand.length > 2) s.meowed[i] = false;
    }
  }

  // 忘記喊喵的人，要等「別人」動作時才會被抓到。
  // 如果下一個動作還是他自己（例如兩人局出了打瞌睡），沒有人抓，就不罰。
  function resolveMeowPending(s, ev) {
    const q = s.meowPending;
    s.meowPending = null;
    if (q != null && q !== s.turn && s.players[q].hand.length === 1 && !s.meowed[q]) {
      ev.push({ type: 'penalty', player: q });
      drawCards(s, q, 2, 'penalty', ev);
    }
  }

  function advance(s, steps, ev) {
    s.turn = rbNextPlayer(s, steps);
    s.phase = 'play';
    s.drawnCardId = null;
    ev.push({ type: 'turn', player: s.turn });
  }

  function finish(s, winner, reason, ev) {
    s.phase = 'over';
    s.winner = winner;
    s.winReason = reason;
    s.drawnCardId = null;
    s.meowPending = null;
    ev.push({ type: 'win', player: winner, reason });
  }

  function fail(state, error) { return { ok: false, error, state, events: [] }; }

  // ---------- 執行一個動作 ----------

  // action（都是「目前輪到的人」的動作）：
  //   { type: 'play', cardId, family?, target?, giftCardId? }
  //   { type: 'draw' }
  //   { type: 'pass' }   只有 phase 是 'drawn' 時可以用：抽到能出的牌但不想出
  // 回傳 { ok: true, state: 新狀態, events: [...] }；不合法時回傳 { ok: false, error, state: 原狀態, events: [] }
  function rbApply(state, action) {
    if (!action || !action.type) return fail(state, 'badAction');
    if (state.phase === 'over') return fail(state, 'gameOver');
    const s = clone(state);
    const ev = [];
    const p = s.turn;
    const n = s.players.length;
    resolveMeowPending(s, ev);

    if (action.type === 'draw') {
      if (s.phase !== 'play') return fail(state, 'cannotDraw');
      const got = drawCards(s, p, 1, 'turn', ev);
      if (got.length === 0) {
        // 抽牌堆與棄牌堆都沒牌了
        s.idlePasses++;
        ev.push({ type: 'pass', player: p });
        if (s.idlePasses >= n) {
          let best = 0;
          for (let i = 1; i < n; i++) if (s.players[i].hand.length < s.players[best].hand.length) best = i;
          finish(s, best, 'stalemate', ev);
        } else {
          advance(s, 1, ev);
        }
      } else if (rbCanPlay(got[0], s)) {
        s.phase = 'drawn';
        s.drawnCardId = got[0].id;
        ev.push({ type: 'canPlayDrawn', player: p, card: clone(got[0]) });
      } else {
        s.lacks[p] = [s.currentFamily];
        ev.push({ type: 'pass', player: p });
        advance(s, 1, ev);
      }
      syncMeow(s);
      return { ok: true, state: s, events: ev };
    }

    if (action.type === 'pass') {
      if (s.phase !== 'drawn') return fail(state, 'cannotPass');
      ev.push({ type: 'pass', player: p });
      advance(s, 1, ev);
      syncMeow(s);
      return { ok: true, state: s, events: ev };
    }

    if (action.type !== 'play') return fail(state, 'badAction');

    const hand = s.players[p].hand;
    const idx = hand.findIndex(c => c.id === action.cardId);
    if (idx < 0) return fail(state, 'notInHand');
    const card = hand[idx];
    if (s.phase === 'drawn' && card.id !== s.drawnCardId) return fail(state, 'mustPlayDrawn');
    if (!rbCanPlay(card, s)) return fail(state, 'notPlayable');
    const more = hand.length - 1 > 0;
    if (more && isWild(card) && !FAMILY_IDS.includes(action.family)) return fail(state, 'needFamily');
    if (more && card.type === 'peek') {
      const t = action.target;
      if (!Number.isInteger(t) || t < 0 || t >= n || t === p) return fail(state, 'needTarget');
    }
    if (more && card.type === 'gift') {
      if (action.giftCardId === card.id || !hand.some(c => c.id === action.giftCardId)) return fail(state, 'needGift');
    }

    hand.splice(idx, 1);
    s.discardPile.push(card);
    s.phase = 'play';
    s.drawnCardId = null;
    s.idlePasses = 0;
    if (card.family) s.currentFamily = card.family;
    ev.push({ type: 'play', player: p, card: clone(card) });

    if (hand.length === 0) {
      finish(s, p, 'empty', ev);
      return { ok: true, state: s, events: ev };
    }

    let skip = 0;
    const next = rbNextPlayer(s, 1);
    switch (card.type) {
      case 'rainbow':
        s.currentFamily = action.family;
        ev.push({ type: 'family', player: p, family: action.family });
        break;
      case 'storm':
        s.currentFamily = action.family;
        ev.push({ type: 'family', player: p, family: action.family });
        drawCards(s, next, 3, 'storm', ev);
        ev.push({ type: 'skip', player: next });
        skip = 1;
        break;
      case 'sleep':
        ev.push({ type: 'skip', player: next });
        skip = 1;
        break;
      case 'fish':
        drawCards(s, next, 2, 'fish', ev);
        ev.push({ type: 'skip', player: next });
        skip = 1;
        break;
      case 'reverse':
        s.direction *= -1;
        ev.push({ type: 'reverse', direction: s.direction });
        if (n === 2) { ev.push({ type: 'skip', player: next }); skip = 1; }
        break;
      case 'peek':
        ev.push({ type: 'peek', by: p, target: action.target, cards: clone(s.players[action.target].hand) });
        break;
      case 'gift': {
        const gi = hand.findIndex(c => c.id === action.giftCardId);
        const g = hand.splice(gi, 1)[0];
        s.players[next].hand.push(g);
        s.lacks[next] = [];
        ev.push({ type: 'gift', from: p, to: next, card: clone(g) });
        if (hand.length === 0) {
          finish(s, p, 'empty', ev);
          return { ok: true, state: s, events: ev };
        }
        break;
      }
    }

    if (hand.length === 1) {
      if (s.meowed[p] || !s.players[p].isHuman || s.config.autoMeow) {
        s.meowed[p] = true;
        ev.push({ type: 'meow', player: p });
      } else {
        s.meowPending = p;
      }
    }
    advance(s, 1 + skip, ev);
    syncMeow(s);
    return { ok: true, state: s, events: ev };
  }

  // 玩家按「喵！」。兩種時機都算數：
  //   1. 輪到自己、手上剩 2 張（出牌前先喊）
  //   2. 剛出完牌剩 1 張，而且下一個動作還沒發生（補喊）
  // 回傳格式與 rbApply 相同
  function rbMeow(state, player) {
    if (state.phase === 'over') return fail(state, 'gameOver');
    if (!Number.isInteger(player) || player < 0 || player >= state.players.length) return fail(state, 'badPlayer');
    const len = state.players[player].hand.length;
    if (state.meowed[player]) return fail(state, 'alreadyMeowed');
    const late = len === 1 && state.meowPending === player;
    const early = len === 2 && state.turn === player;
    if (!late && !early) return fail(state, 'notNow');
    const s = clone(state);
    s.meowed[player] = true;
    if (late) s.meowPending = null;
    return { ok: true, state: s, events: [{ type: 'meow', player, early }] };
  }

  // 玩家現在按「喵！」有沒有用（給畫面決定按鈕要不要跳動）
  function rbCanMeow(state, player) {
    return rbMeow(state, player).ok;
  }

  // ---------- 電腦出牌 ----------

  function familyCounts(cards) {
    const c = {};
    for (const f of FAMILY_IDS) c[f] = 0;
    for (const k of cards) if (k.family) c[k.family]++;
    return c;
  }

  function pickMax(items, scoreFn, rand) {
    let best = null, bestScore = -Infinity;
    for (const it of items) {
      const sc = scoreFn(it) + rand() * 0.5;
      if (sc > bestScore) { bestScore = sc; best = it; }
    }
    return best;
  }

  // 幫「目前輪到的人」決定動作，回傳可以直接丟給 rbApply 的 action。
  // difficulty 省略時用 state.config.difficulty。也可以拿來當學生的提示（傳 'normal'）。
  function rbChooseAction(state, difficulty) {
    const diff = difficulty || state.config.difficulty;
    const p = state.turn;
    const n = state.players.length;
    const hand = state.players[p].hand;
    const playable = rbPlayableCards(state, p);
    if (playable.length === 0) return { type: 'draw' };

    let seed = (state.seed ^ 0x9E3779B9) >>> 0;
    const rand = () => { seed = nextSeed(seed); return seedToFloat(seed); };
    const next = rbNextPlayer(state, 1);
    const nextCount = state.players[next].hand.length;
    const counts = familyCounts(hand);

    let card;
    if (diff === 'easy') {
      card = playable[Math.floor(rand() * playable.length)];
    } else {
      card = pickMax(playable, c => {
        let sc = c.type === 'num' ? 30 : c.type === 'rainbow' ? 5 : c.type === 'storm' ? 3 : 20;
        if (c.family) sc += (counts[c.family] - 1) * 2;
        if (diff === 'hard' && nextCount <= 2) {
          if (c.type === 'storm') sc += 45;
          else if (c.type === 'fish') sc += 40;
          else if (c.type === 'sleep') sc += 35;
          else if (c.type === 'reverse') sc += n === 2 ? 35 : 15;
          else if (c.type === 'gift') sc += 30;
        }
        return sc;
      }, rand);
    }

    const action = { type: 'play', cardId: card.id };
    const rest = hand.filter(c => c.id !== card.id);
    if (rest.length === 0) return action;
    const restCounts = familyCounts(rest);

    if (isWild(card)) {
      if (diff === 'easy') {
        action.family = FAMILY_IDS[Math.floor(rand() * 4)];
      } else {
        const victim = rbNextPlayer(state, card.type === 'storm' ? 2 : 1);
        const lacks = state.lacks[victim] || [];
        action.family = pickMax(FAMILY_IDS, f =>
          restCounts[f] * 2 + (diff === 'hard' && victim !== p && lacks.includes(f) ? 3 : 0), rand);
      }
    }
    if (card.type === 'peek') {
      const others = [];
      for (let i = 0; i < n; i++) if (i !== p) others.push(i);
      action.target = diff === 'hard'
        ? pickMax(others, i => -state.players[i].hand.length, rand)
        : others[Math.floor(rand() * others.length)];
    }
    if (card.type === 'gift') {
      const g = diff === 'easy'
        ? rest[Math.floor(rand() * rest.length)]
        : pickMax(rest, c => (isWild(c) ? -100 : 0) - (c.family ? restCounts[c.family] * 2 : 0) + (c.type === 'num' ? 1 : 0), rand);
      action.giftCardId = g.id;
    }
    return action;
  }

  const api = {
    RB_FAMILIES, RB_TYPES, RB_HAND_SIZE, RB_DECK_SIZE,
    rbCreateDeck, rbFamily, rbCardName, rbCreateGame,
    rbTopCard, rbNextPlayer, rbCanPlay, rbPlayableCards, rbNeeds,
    rbApply, rbMeow, rbCanMeow, rbChooseAction
  };
  for (const k in api) root[k] = api[k];
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

// 撲克牌「九九」規則核心（公規）
// 只負責規則，不碰畫面。瀏覽器用 <script> 載入後，所有名稱都是全域的。
// 重要：nnApply 不會修改傳入的 state，而是回傳新的 state 與「發生了哪些事」的 events 清單。
// 畫面程式請不要自己改 state 的內容，一律透過這裡的函式。
//
// 規則（依維基百科「九九 (撲克牌)」條目的公規）：
//   A、2、3、6、7、8、9：加牌面點數（黑桃 A 也是加 1）
//   4：迴轉   5：指定（不能指定自己）   10：加或減 10   J：跳過   Q：加或減 20   K：變成 99
//   桌面數字不能超過 99；減到 0 以下就是 0。手上每一張牌都不能出的人淘汰，最後留下的人獲勝。
(function (root) {
  'use strict';

  const NN_LIMIT = 99;
  const NN_HAND_SIZE = 5;

  const NN_SUITS = [
    { id: 'S', name: '黑桃', symbol: '♠', color: 'black' },
    { id: 'H', name: '紅心', symbol: '♥', color: 'red' },
    { id: 'D', name: '方塊', symbol: '♦', color: 'red' },
    { id: 'C', name: '梅花', symbol: '♣', color: 'black' }
  ];

  // kind：num 數值牌、reverse 迴轉、assign 指定、pm 加或減、pass 跳過、max 變成 99
  const NN_RANKS = {
    1:  { label: 'A',  kind: 'num',     amount: 1,  short: '+1',   name: 'A',  desc: '加 1。' },
    2:  { label: '2',  kind: 'num',     amount: 2,  short: '+2',   name: '2',  desc: '加 2。' },
    3:  { label: '3',  kind: 'num',     amount: 3,  short: '+3',   name: '3',  desc: '加 3。' },
    4:  { label: '4',  kind: 'reverse', amount: 0,  short: '迴轉', name: '4',  desc: '迴轉：出牌方向反過來，桌面數字不變。' },
    5:  { label: '5',  kind: 'assign',  amount: 0,  short: '指定', name: '5',  desc: '指定：指定另一位玩家出牌，桌面數字不變。' },
    6:  { label: '6',  kind: 'num',     amount: 6,  short: '+6',   name: '6',  desc: '加 6。' },
    7:  { label: '7',  kind: 'num',     amount: 7,  short: '+7',   name: '7',  desc: '加 7。' },
    8:  { label: '8',  kind: 'num',     amount: 8,  short: '+8',   name: '8',  desc: '加 8。' },
    9:  { label: '9',  kind: 'num',     amount: 9,  short: '+9',   name: '9',  desc: '加 9。' },
    10: { label: '10', kind: 'pm',      amount: 10, short: '±10',  name: '10', desc: '加 10 或減 10，出牌的人自己選。' },
    11: { label: 'J',  kind: 'pass',    amount: 0,  short: '跳過', name: 'J',  desc: '跳過：桌面數字不變，直接換下一位。' },
    12: { label: 'Q',  kind: 'pm',      amount: 20, short: '±20',  name: 'Q',  desc: '加 20 或減 20，出牌的人自己選。' },
    13: { label: 'K',  kind: 'max',     amount: 0,  short: '99',   name: 'K',  desc: '桌面數字直接變成 99。' }
  };

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
  function makeRand(seed) {
    let s = seed >>> 0;
    return function () { s = nextSeed(s); return seedToFloat(s); };
  }
  function shuffleInState(s, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      s.seed = nextSeed(s.seed);
      const j = Math.floor(seedToFloat(s.seed) * (i + 1));
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
  }

  // ---------- 牌 ----------

  function nnCreateDeck() {
    const deck = [];
    for (let si = 0; si < 4; si++) {
      for (let rank = 1; rank <= 13; rank++) {
        deck.push({ id: si * 13 + rank - 1, suit: NN_SUITS[si].id, rank: rank });
      }
    }
    return deck;
  }

  function nnSuit(id) { return NN_SUITS.find(s => s.id === id); }
  function nnRank(card) { return NN_RANKS[card.rank]; }
  function nnCardName(card) { return nnSuit(card.suit).name + ' ' + NN_RANKS[card.rank].label; }
  function nnIsFunctionCard(card) { return NN_RANKS[card.rank].kind !== 'num'; }

  // ---------- 開局 ----------

  // options: { playerCount: 2–4, difficulty: 'easy'|'normal'|'hard', seed: 可省略 }
  function nnCreateGame(options) {
    options = options || {};
    const playerCount = Math.max(2, Math.min(4, options.playerCount || 4));
    const difficulty = ['easy', 'normal', 'hard'].indexOf(options.difficulty) >= 0 ? options.difficulty : 'normal';
    const seed = (options.seed === undefined || options.seed === null)
      ? (Math.floor(Math.random() * 4294967296) >>> 0)
      : (options.seed >>> 0);

    const s = {
      players: [],
      drawPile: nnCreateDeck(),
      discardPile: [],
      total: 0,
      turn: 0,
      direction: 1,
      phase: 'play',
      winner: null,
      seed: seed,
      config: { playerCount: playerCount, difficulty: difficulty, handSize: NN_HAND_SIZE }
    };
    shuffleInState(s, s.drawPile);
    for (let i = 0; i < playerCount; i++) {
      s.players.push({
        name: i === 0 ? '你' : AI_NAMES[i - 1],
        isHuman: i === 0,
        hand: [],
        out: false,
        functionsPlayed: 0   // 已經出過幾張功能牌（公開資訊，困難電腦會參考）
      });
    }
    for (let k = 0; k < NN_HAND_SIZE; k++) {
      for (let i = 0; i < playerCount; i++) s.players[i].hand.push(s.drawPile.pop());
    }
    const events = [
      { type: 'deal', hands: s.players.map(p => p.hand.map(c => c.id)) },
      { type: 'turn', player: 0 }
    ];
    return { ok: true, state: s, events: events };
  }

  // ---------- 查詢 ----------

  function nnAlivePlayers(state) {
    const list = [];
    for (let i = 0; i < state.players.length; i++) if (!state.players[i].out) list.push(i);
    return list;
  }

  // 從 from 開始，依目前方向找下一位還沒淘汰的玩家
  function nextAlive(state, from) {
    const n = state.players.length;
    let i = from;
    for (let k = 0; k < n; k++) {
      i = (i + state.direction + n) % n;
      if (!state.players[i].out) return i;
    }
    return from;
  }
  function nnNextPlayer(state) { return nextAlive(state, state.turn); }

  // 這張牌現在有哪些出法。每一項是 { total, sign?, target? }；total 是出了之後的桌面數字。
  // 回傳空陣列表示這張牌現在不能出。player 省略時用 state.turn。
  function nnOptions(state, card, player) {
    const p = (player === undefined || player === null) ? state.turn : player;
    const info = NN_RANKS[card.rank];
    const t = state.total;
    const list = [];
    if (info.kind === 'num') {
      if (t + info.amount <= NN_LIMIT) list.push({ total: t + info.amount });
    } else if (info.kind === 'pm') {
      if (t + info.amount <= NN_LIMIT) list.push({ sign: 'plus', total: t + info.amount });
      list.push({ sign: 'minus', total: Math.max(0, t - info.amount) });
    } else if (info.kind === 'assign') {
      for (let i = 0; i < state.players.length; i++) {
        if (i !== p && !state.players[i].out) list.push({ target: i, total: t });
      }
    } else if (info.kind === 'max') {
      list.push({ total: NN_LIMIT });
    } else {
      list.push({ total: t });   // 迴轉、跳過
    }
    return list;
  }

  function nnCanPlay(state, card, player) { return nnOptions(state, card, player).length > 0; }

  function nnPlayableCards(state, player) {
    const p = (player === undefined || player === null) ? state.turn : player;
    return state.players[p].hand.filter(c => nnCanPlay(state, c, p));
  }

  // 出這張牌前要先問學生什麼：{ sign, target }
  function nnNeeds(state, card) {
    const kind = NN_RANKS[card.rank].kind;
    return { sign: kind === 'pm', target: kind === 'assign' };
  }

  // 給畫面用的算式文字，例如「85 + 9 = 94」「99 − 20 = 79」「迴轉」
  function nnFormula(from, card, option) {
    const info = NN_RANKS[card.rank];
    if (info.kind === 'num') return from + ' + ' + info.amount + ' = ' + option.total;
    if (info.kind === 'pm') {
      return option.sign === 'plus'
        ? from + ' + ' + info.amount + ' = ' + option.total
        : (from < info.amount
          ? from + ' − ' + info.amount + ' → 0（最少是 0）'
          : from + ' − ' + info.amount + ' = ' + option.total);
    }
    if (info.kind === 'max') return from + ' → 99';
    return info.short + '（還是 ' + option.total + '）';
  }

  // ---------- 執行動作 ----------

  function drawOne(s, p, events) {
    if (s.drawPile.length === 0) {
      // 抽牌堆用完：把出過的牌重洗（留下最上面那張給畫面顯示），桌面數字不變
      const top = s.discardPile.pop();
      const rest = s.discardPile;
      s.discardPile = top ? [top] : [];
      if (rest.length > 0) {
        shuffleInState(s, rest);
        s.drawPile = rest;
        events.push({ type: 'reshuffle', count: rest.length });
      }
    }
    if (s.drawPile.length === 0) return;
    const card = s.drawPile.pop();
    s.players[p].hand.push(card);
    events.push({ type: 'draw', player: p, card: card });
  }

  // action: { type: 'play', cardId, sign?: 'plus'|'minus', target?: 玩家編號 }
  function nnApply(state, action) {
    function fail(error) { return { ok: false, state: state, events: [], error: error }; }
    if (state.phase !== 'play') return fail('遊戲已經結束');
    if (!action || action.type !== 'play') return fail('不認得的動作');

    const p = state.turn;
    const card = state.players[p].hand.find(c => c.id === action.cardId);
    if (!card) return fail('手上沒有這張牌');

    const info = NN_RANKS[card.rank];
    const options = nnOptions(state, card, p);
    if (options.length === 0) return fail('這張牌出了會超過 99');
    let option;
    if (info.kind === 'pm') {
      option = options.find(o => o.sign === action.sign);
      if (!option) return fail(action.sign === 'plus' ? '加上去會超過 99' : '要選加或減');
    } else if (info.kind === 'assign') {
      option = options.find(o => o.target === action.target);
      if (!option) return fail('要指定一位還沒淘汰的其他玩家');
    } else {
      option = options[0];
    }

    const s = clone(state);
    s.seed = nextSeed(s.seed);
    const events = [];
    const me = s.players[p];
    const from = s.total;

    me.hand = me.hand.filter(c => c.id !== card.id);
    s.discardPile.push(card);
    s.total = option.total;
    if (info.kind !== 'num') me.functionsPlayed++;

    events.push({
      type: 'play', player: p, card: card, from: from, to: s.total,
      sign: option.sign || null, target: (option.target === undefined ? null : option.target),
      formula: nnFormula(from, card, option)
    });

    if (info.kind === 'reverse') {
      s.direction = -s.direction;
      events.push({ type: 'reverse', direction: s.direction });
    } else if (info.kind === 'pass') {
      events.push({ type: 'pass', player: p });
    } else if (info.kind === 'assign') {
      events.push({ type: 'assign', by: p, target: option.target });
    }

    drawOne(s, p, events);

    // 換誰：5 是被指定的人，其他是依方向的下一位
    let next = info.kind === 'assign' ? option.target : nextAlive(s, p);

    // 輪到的人如果每一張都不能出，就淘汰，再換下一位
    while (true) {
      if (nnPlayableCards(s, next).length > 0) break;
      const loser = s.players[next];
      const cards = loser.hand;
      loser.hand = [];
      loser.out = true;
      // 淘汰者的手牌放到出過的牌堆最下面，不影響桌面數字，也不蓋住最上面那張
      s.discardPile = cards.concat(s.discardPile);
      events.push({ type: 'eliminate', player: next, cards: cards, total: s.total });
      const alive = nnAlivePlayers(s);
      if (alive.length === 1) {
        s.phase = 'over';
        s.winner = alive[0];
        s.turn = alive[0];
        events.push({ type: 'win', player: alive[0] });
        return { ok: true, state: s, events: events };
      }
      next = nextAlive(s, next);
    }

    s.turn = next;
    events.push({ type: 'turn', player: next });
    return { ok: true, state: s, events: events };
  }

  // ---------- 電腦 ----------

  function pickRandom(list, rand) { return list[Math.floor(rand() * list.length)]; }

  // 幫輪到的玩家決定動作。difficulty 省略時用 state.config.difficulty。
  // 電腦只看得到自己的手牌與桌面上公開的資訊，不會偷看別人的牌。
  function nnChooseAction(state, difficulty) {
    const diff = difficulty || state.config.difficulty;
    const p = state.turn;
    const hand = state.players[p].hand;
    const rand = makeRand(state.seed ^ (hand.length * 7919 + state.discardPile.length * 104729));

    const playable = hand.filter(c => nnCanPlay(state, c, p));
    if (playable.length === 0) return null;

    function toAction(card, option) {
      const a = { type: 'play', cardId: card.id };
      if (option.sign) a.sign = option.sign;
      if (option.target !== undefined) a.target = option.target;
      return a;
    }

    // 幼幼班：能出的牌隨機挑，出法也隨機
    if (diff === 'easy') {
      const card = pickRandom(playable, rand);
      return toAction(card, pickRandom(nnOptions(state, card, p), rand));
    }

    const numbers = playable.filter(c => NN_RANKS[c.rank].kind === 'num');
    const functions = hand.filter(c => NN_RANKS[c.rank].kind !== 'num');
    const byKind = kind => playable.filter(c => NN_RANKS[c.rank].kind === kind);
    const others = nnAlivePlayers(state).filter(i => i !== p);

    function assignTarget() {
      if (diff !== 'hard') return pickRandom(others, rand);
      // 大班：指定已經用掉最多功能牌的人（他手上剩下的救命牌可能最少）
      let best = [others[0]];
      for (const i of others.slice(1)) {
        const a = state.players[i].functionsPlayed, b = state.players[best[0]].functionsPlayed;
        if (a > b) best = [i]; else if (a === b) best.push(i);
      }
      return pickRandom(best, rand);
    }

    // 大班：手上救命牌夠多（含 K 至少 4 張）而且數字還沒到 99，就用 K 直接拉到 99，逼沒有功能牌的人出局
    // （門檻 4 是用電腦對打試出來的：2、3、4 之中 4 的勝率最高）
    if (diff === 'hard' && state.total < NN_LIMIT && functions.length >= 4) {
      const k = byKind('max')[0];
      if (k) return toAction(k, { total: NN_LIMIT });
    }

    // 中班以上：有數值牌能出，就先出最大的（大的牌越晚越出不掉），功能牌留著救命
    if (numbers.length > 0) {
      let best = numbers[0];
      for (const c of numbers) if (c.rank > best.rank) best = c;
      return toAction(best, nnOptions(state, best, p)[0]);
    }

    // 只剩功能牌能出
    // 數字已經是 99 時，K 等於免費的跳過，先用掉
    if (state.total === NN_LIMIT) {
      const k = byKind('max')[0];
      if (k) return toAction(k, { total: NN_LIMIT });
    }
    const pass = byKind('pass')[0];
    if (pass) return toAction(pass, { total: state.total });
    const rev = byKind('reverse')[0];
    if (rev) return toAction(rev, { total: state.total });
    const assign = byKind('assign')[0];
    if (assign) return toAction(assign, { target: assignTarget(), total: state.total });
    // 加減牌：先用 10 再用 Q，一律選減（走到這裡代表數值牌都出不了）
    const pm = byKind('pm').sort((a, b) => a.rank - b.rank)[0];
    if (pm) return toAction(pm, { sign: 'minus' });
    const k = byKind('max')[0];
    if (k) return toAction(k, { total: NN_LIMIT });

    const card = playable[0];
    return toAction(card, nnOptions(state, card, p)[0]);
  }

  const api = {
    NN_LIMIT, NN_HAND_SIZE, NN_SUITS, NN_RANKS,
    nnCreateDeck, nnSuit, nnRank, nnCardName, nnIsFunctionCard,
    nnCreateGame, nnAlivePlayers, nnNextPlayer,
    nnOptions, nnCanPlay, nnPlayableCards, nnNeeds, nnFormula,
    nnApply, nnChooseAction
  };
  for (const k in api) root[k] = api[k];
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

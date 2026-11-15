// 「牌型大師」規則核心
// 只負責規則，不碰畫面。瀏覽器用 <script> 載入後，所有名稱都是全域的。
// 重要：pmApply 不會修改傳入的 state，而是回傳新的 state 與「發生了哪些事」的 events 清單。
// 畫面程式請不要自己改 state 的內容，也不要自己重寫牌型判斷，一律透過這裡的函式。
//
// 規則（依老師提供的學校版本）：
//   52 張牌。4 人每人 13 張；3 人每人 17 張，多的一張給拿到梅花 3 的人。
//   數字大小 2 > A > K > Q > J > 10 > … > 3；數字相同比花色 黑桃 > 紅心 > 方塊 > 梅花。
//   牌型只有 6 種：單張、一對、順子、葫蘆、鐵支、同花順（沒有同花，不能單獨出三張）。
//   順子共 9 組：2-3-4-5-6、3-4-5-6-7 … 10-J-Q-K-A；比「最大的那張」，所以 2-3-4-5-6 最大。
//   跟牌要同張數且更大；五張牌型之間 同花順 > 鐵支 > 葫蘆 > 順子。
//   鐵支、同花順可以壓單張和一對。「過」只是這一次不出，下次輪到還能出。
//   其他人全部過牌後，最後出牌的人自由出牌。梅花 3 先出，第一手要包含梅花 3。逆時針輪流。
(function (root) {
  'use strict';

  const PM_SUITS = [
    { id: 'S', name: '黑桃', symbol: '♠', color: 'black', power: 3 },
    { id: 'H', name: '紅心', symbol: '♥', color: 'red',   power: 2 },
    { id: 'D', name: '方塊', symbol: '♦', color: 'red',   power: 1 },
    { id: 'C', name: '梅花', symbol: '♣', color: 'black', power: 0 }
  ];
  const PM_LABELS = { 1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K' };

  // tier：五張牌型之間的高低；bomb：可以壓單張和一對
  const PM_TYPES = {
    single:    { name: '單張',   count: 1, tier: 0, bomb: false, desc: '任意一張牌。先比數字，數字一樣再比花色。' },
    pair:      { name: '一對',   count: 2, tier: 0, bomb: false, desc: '兩張數字一樣的牌。先比數字，數字一樣就比花色最大的那張。' },
    straight:  { name: '順子',   count: 5, tier: 1, bomb: false, desc: '五張數字連號的牌，花色不限。比最大的那張。' },
    fullhouse: { name: '葫蘆',   count: 5, tier: 2, bomb: false, desc: '三張一樣 + 一對。只比三張的那一組。' },
    four:      { name: '鐵支',   count: 5, tier: 3, bomb: true,  desc: '四張一樣 + 任意一張。可以壓順子、葫蘆，也可以壓單張和一對。' },
    sflush:    { name: '同花順', count: 5, tier: 4, bomb: true,  desc: '五張連號而且花色一樣。全場最大的牌型，什麼都能壓。' }
  };
  const PM_TYPE_ORDER = ['single', 'pair', 'straight', 'fullhouse', 'four', 'sflush'];
  const PM_CLUB3_ID = 3 * 13 + 2;
  const AI_NAMES = ['小橘', '呱呱', '咕咕'];

  // ---------- 小工具 ----------

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function nextSeed(seed) { return (seed + 0x6D2B79F5) >>> 0; }
  function seedToFloat(seed) {
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // ---------- 牌 ----------

  function pmCreateDeck() {
    const deck = [];
    for (let si = 0; si < 4; si++) {
      for (let rank = 1; rank <= 13; rank++) {
        deck.push({ id: si * 13 + rank - 1, suit: PM_SUITS[si].id, rank: rank });
      }
    }
    return deck;
  }

  function pmSuit(id) { return PM_SUITS.find(s => s.id === id); }
  function pmLabel(card) { return PM_LABELS[card.rank]; }
  function pmCardName(card) { return pmSuit(card.suit).name + ' ' + PM_LABELS[card.rank]; }
  function rankPower(rank) { return (rank + 10) % 13; }          // 3→0 … K→10、A→11、2→12
  function natural(rank) { return rank === 1 ? 14 : rank; }      // 排順子用：A 當 14
  // 單張的大小：0（梅花 3）到 51（黑桃 2）
  function pmPower(card) { return rankPower(card.rank) * 4 + pmSuit(card.suit).power; }

  function byPower(a, b) { return pmPower(a) - pmPower(b); }

  // mode：'rank' 依數字（小到大）、'suit' 依花色（同花色放一起）
  function pmSortHand(hand, mode) {
    const out = hand.slice();
    if (mode === 'suit') {
      out.sort((a, b) => (pmSuit(a.suit).power - pmSuit(b.suit).power) || (rankPower(a.rank) - rankPower(b.rank)));
    } else {
      out.sort(byPower);
    }
    return out;
  }

  // ---------- 牌型 ----------

  // 回傳 null（不是合法牌型）或 { type, key, cards, text }。key 只在同牌型之間比較。
  function pmClassify(cards) {
    const n = cards.length;
    const sorted = cards.slice().sort(byPower);
    const top = sorted[n - 1];
    if (n === 1) return { type: 'single', key: pmPower(top), cards: sorted, text: '單張 ' + pmCardName(top) };
    if (n === 2) {
      if (cards[0].rank !== cards[1].rank) return null;
      return { type: 'pair', key: pmPower(top), cards: sorted, text: '一對 ' + PM_LABELS[top.rank] };
    }
    if (n !== 5) return null;

    const counts = {};
    for (const c of cards) counts[c.rank] = (counts[c.rank] || 0) + 1;
    const groups = Object.keys(counts).map(r => ({ rank: +r, c: counts[r] })).sort((a, b) => b.c - a.c);

    if (groups.length === 2) {
      const main = groups[0].rank, sub = groups[1].rank;
      if (groups[0].c === 4) {
        return { type: 'four', key: rankPower(main), cards: sorted, text: '鐵支 ' + PM_LABELS[main] };
      }
      return { type: 'fullhouse', key: rankPower(main), cards: sorted, text: '葫蘆 ' + PM_LABELS[main] + ' 帶 ' + PM_LABELS[sub] };
    }
    if (groups.length !== 5) return null;

    // 順子：A 當 14，五個數字連續。2-3-4-5-6 合法；A-2-3-4-5 與 J-Q-K-A-2 自然不成立
    const nat = cards.slice().sort((a, b) => natural(a.rank) - natural(b.rank));
    if (natural(nat[4].rank) - natural(nat[0].rank) !== 4) return null;
    const range = PM_LABELS[nat[0].rank] + ' 到 ' + PM_LABELS[nat[4].rank];
    const flush = cards.every(c => c.suit === cards[0].suit);
    if (flush) return { type: 'sflush', key: pmPower(top), cards: sorted, text: '同花順 ' + pmSuit(top.suit).name + ' ' + range };
    return { type: 'straight', key: pmPower(top), cards: sorted, text: '順子 ' + range };
  }

  // combo 能不能壓過 table（table 為 null 代表自由出牌）
  function pmBeats(combo, table) {
    if (!table) return true;
    const a = PM_TYPES[combo.type], b = PM_TYPES[table.type];
    if (a.bomb) {
      if (!b.bomb) return true;
      return a.tier !== b.tier ? a.tier > b.tier : combo.key > table.key;
    }
    if (a.count !== b.count) return false;
    if (a.count < 5) return combo.type === table.type && combo.key > table.key;
    return a.tier !== b.tier ? a.tier > b.tier : combo.key > table.key;
  }

  function whyCantBeat(combo, table) {
    const cn = PM_TYPES[combo.type].name, tn = PM_TYPES[table.type].name;
    if (combo.type === table.type) return '不夠大，要比桌上的「' + table.text + '」大';
    if (combo.cards.length === 5 && PM_TYPES[table.type].count === 5) return cn + '壓不過' + tn;
    if (table.type === 'sflush') return '桌上是同花順，要出更大的同花順';
    if (table.type === 'four') return '桌上是鐵支，要出更大的鐵支或同花順';
    return '桌上是' + tn + '，要出更大的' + tn + '（或用鐵支、同花順來壓）';
  }

  // 列出一手牌能組出的牌型。為了不讓順子的花色組合爆量：
  // 順子只列「最大那張各種選法、其餘用最小花色」，再加上所有同花順；葫蘆的三張與一對都用最小花色。
  function pmCombos(hand) {
    const out = [];
    const seen = new Set();
    function add(cards) {
      const sig = cards.map(c => c.id).sort((a, b) => a - b).join(',');
      if (seen.has(sig)) return;
      const combo = pmClassify(cards);
      if (combo) { seen.add(sig); out.push(combo); }
    }
    const byRank = {};
    for (const c of hand) (byRank[c.rank] = byRank[c.rank] || []).push(c);
    for (const r in byRank) byRank[r].sort(byPower);

    for (const c of hand) add([c]);
    for (const r in byRank) {
      const g = byRank[r];
      for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) add([g[i], g[j]]);
    }
    for (const r in byRank) {
      const g = byRank[r];
      if (g.length >= 3) {
        for (const r2 in byRank) {
          if (r2 !== r && byRank[r2].length >= 2) add([g[0], g[1], g[2], byRank[r2][0], byRank[r2][1]]);
        }
      }
      if (g.length === 4) {
        for (const c of hand) if (c.rank !== g[0].rank) add(g.concat([c]));
      }
    }
    for (let start = 2; start <= 10; start++) {
      const ranks = [];
      for (let v = start; v < start + 5; v++) ranks.push(v === 14 ? 1 : v);
      if (!ranks.every(r => byRank[r])) continue;
      let topRank = ranks[0];
      for (const r of ranks) if (rankPower(r) > rankPower(topRank)) topRank = r;
      for (const topCard of byRank[topRank]) {
        add(ranks.map(r => (r === topRank ? topCard : byRank[r][0])));
      }
      for (const s of PM_SUITS) {
        const cards = ranks.map(r => byRank[r].find(c => c.suit === s.id));
        if (cards.every(Boolean)) add(cards);
      }
    }
    return out;
  }

  function comboStrength(c) { return PM_TYPES[c.type].tier * 100 + c.key; }

  // 「我能組什麼」：每種牌型列出代表組合（同樣數字的只列一組），由小到大
  function pmGroups(hand) {
    const res = { pair: [], straight: [], fullhouse: [], four: [], sflush: [] };
    const seen = new Set();
    const combos = pmCombos(hand).sort((a, b) => comboStrength(a) - comboStrength(b));
    for (const c of combos) {
      if (!res[c.type]) continue;
      const counts = {};
      for (const x of c.cards) counts[x.rank] = (counts[x.rank] || 0) + 1;
      let sig;
      if (c.type === 'four') sig = 'four:' + c.key;
      else if (c.type === 'sflush') sig = 'sflush:' + c.cards.map(x => x.id).join(',');
      else sig = c.type + ':' + Object.keys(counts).map(r => r + 'x' + counts[r]).join(',');
      if (seen.has(sig)) continue;
      seen.add(sig);
      res[c.type].push(c);
    }
    return res;
  }

  // ---------- 開局 ----------

  // options: { playerCount: 3|4, difficulty: 'easy'|'normal'|'hard', seed: 可省略 }
  function pmCreateGame(options) {
    const o = options || {};
    const n = o.playerCount === 3 ? 3 : 4;
    const s = {
      players: [],
      turn: 0,
      table: null,          // { player, type, key, cards, text }；null 代表自由出牌
      passes: 0,            // 桌上這手牌之後連續幾個人過
      firstMove: true,
      phase: 'play',        // 'play' | 'over'
      winner: null,
      ranking: null,
      played: [],           // 已經出過的牌 id（公開資訊）
      log: [],              // 出牌紀錄 { round, player, text | pass }
      round: 1,
      config: { playerCount: n, difficulty: o.difficulty || 'normal' },
      seed: (o.seed == null ? Math.floor(Math.random() * 4294967296) : o.seed) >>> 0
    };
    const deck = pmCreateDeck();
    for (let i = deck.length - 1; i > 0; i--) {
      s.seed = nextSeed(s.seed);
      const j = Math.floor(seedToFloat(s.seed) * (i + 1));
      const tmp = deck[i]; deck[i] = deck[j]; deck[j] = tmp;
    }
    const each = n === 4 ? 13 : 17;
    for (let p = 0; p < n; p++) {
      s.players.push({ name: p === 0 ? '你' : AI_NAMES[p - 1], isHuman: p === 0, hand: deck.slice(p * each, (p + 1) * each) });
    }
    let extra = null;
    if (n === 3) {
      extra = deck[51];
      let owner = s.players.findIndex(pl => pl.hand.some(c => c.id === PM_CLUB3_ID));
      if (owner < 0) {            // 多的那張剛好就是梅花 3：隨機給一位
        s.seed = nextSeed(s.seed);
        owner = Math.floor(seedToFloat(s.seed) * 3);
      }
      s.players[owner].hand.push(extra);
      extra = { player: owner, card: extra };
    }
    for (const pl of s.players) pl.hand.sort(byPower);
    s.turn = s.players.findIndex(pl => pl.hand.some(c => c.id === PM_CLUB3_ID));
    const events = [{ type: 'deal', counts: s.players.map(pl => pl.hand.length), extra: extra },
                    { type: 'turn', player: s.turn, free: true, first: true }];
    return { ok: true, state: s, events: events };
  }

  // ---------- 檢查與出牌 ----------

  function findCards(hand, cardIds) {
    const ids = Array.from(new Set(cardIds));
    const cards = ids.map(id => hand.find(c => c.id === id));
    return cards.every(Boolean) ? cards : null;
  }

  // 這幾張牌現在能不能出。回傳 { ok:true, combo } 或 { ok:false, code, message, combo? }
  function pmCheckPlay(state, cardIds, player) {
    const p = player == null ? state.turn : player;
    if (state.phase === 'over') return { ok: false, code: 'over', message: '這一局已經結束了' };
    if (p !== state.turn) return { ok: false, code: 'notTurn', message: '還沒輪到你' };
    if (!cardIds || !cardIds.length) return { ok: false, code: 'empty', message: '先點選要出的牌' };
    const cards = findCards(state.players[p].hand, cardIds);
    if (!cards) return { ok: false, code: 'notInHand', message: '手上沒有這張牌' };
    const combo = pmClassify(cards);
    if (!combo) {
      const n = cards.length;
      let msg;
      if (n === 2) msg = '這兩張數字不一樣，不是一對';
      else if (n === 3) msg = '不能單獨出三張，要再加一對變成葫蘆';
      else if (n === 4) msg = '沒有四張的牌型，鐵支要再加任意一張';
      else if (n === 5) msg = '這五張組不成牌型';
      else msg = '一次最多出五張';
      return { ok: false, code: 'noType', message: msg };
    }
    if (state.firstMove && !cards.some(c => c.id === PM_CLUB3_ID)) {
      return { ok: false, code: 'needClub3', message: '第一手要包含梅花 3', combo: combo };
    }
    if (!pmBeats(combo, state.table)) {
      return { ok: false, code: 'cantBeat', message: whyCantBeat(combo, state.table), combo: combo };
    }
    return { ok: true, combo: combo };
  }

  // 輪到的人現在可以出的所有組合（由小到大；王牌牌型排最後）
  function pmLegalPlays(state) {
    if (state.phase === 'over') return [];
    const hand = state.players[state.turn].hand;
    let list = pmCombos(hand).filter(c => pmBeats(c, state.table));
    if (state.firstMove) list = list.filter(c => c.cards.some(x => x.id === PM_CLUB3_ID));
    return list.sort((a, b) => comboStrength(a) - comboStrength(b));
  }

  function pmCanPass(state) { return state.phase === 'play' && !!state.table; }

  // action: { type:'play', cardIds:[…] } 或 { type:'pass' }
  function pmApply(state, action) {
    if (state.phase === 'over') return { ok: false, code: 'over', message: '這一局已經結束了' };
    const n = state.players.length;
    const p = state.turn;

    if (action.type === 'pass') {
      if (!state.table) return { ok: false, code: 'mustLead', message: '現在是自由出牌，不能過' };
      const s = clone(state);
      const ev = [];
      s.seed = nextSeed(s.seed);
      s.passes++;
      s.log.push({ round: s.round, player: p, pass: true });
      ev.push({ type: 'pass', player: p });
      s.turn = (p + 1) % n;
      if (s.passes >= n - 1) {           // 其他人都過了，回到最後出牌的人
        s.table = null;
        s.passes = 0;
        s.round++;
        ev.push({ type: 'clear', player: s.turn });
      }
      ev.push({ type: 'turn', player: s.turn, free: !s.table });
      return { ok: true, state: s, events: ev };
    }

    if (action.type === 'play') {
      const chk = pmCheckPlay(state, action.cardIds, p);
      if (!chk.ok) return chk;
      const s = clone(state);
      const ev = [];
      const combo = chk.combo;
      const ids = combo.cards.map(c => c.id);
      s.seed = nextSeed(s.seed);
      const overTable = s.table ? s.table.type : null;
      s.players[p].hand = s.players[p].hand.filter(c => ids.indexOf(c.id) < 0);
      s.played = s.played.concat(ids);
      s.table = { player: p, type: combo.type, key: combo.key, cards: combo.cards, text: combo.text };
      s.passes = 0;
      s.firstMove = false;
      s.log.push({ round: s.round, player: p, text: combo.text, cardIds: ids });
      ev.push({
        type: 'play', player: p, cards: combo.cards, comboType: combo.type, text: combo.text,
        left: s.players[p].hand.length, lead: !overTable,
        bomb: PM_TYPES[combo.type].bomb
      });
      if (s.players[p].hand.length === 0) {
        s.phase = 'over';
        s.winner = p;
        s.ranking = s.players.map((pl, i) => ({ player: i, left: pl.hand.length }))
          .sort((a, b) => a.left - b.left || a.player - b.player);
        ev.push({ type: 'win', player: p, ranking: s.ranking });
        return { ok: true, state: s, events: ev };
      }
      s.turn = (p + 1) % n;
      ev.push({ type: 'turn', player: s.turn, free: false });
      return { ok: true, state: s, events: ev };
    }

    return { ok: false, code: 'unknown', message: '不認得的動作' };
  }

  // ---------- 電腦對手 ----------

  // 估計這手牌最少要幾次才出得完（只看數字，不看花色）
  function planTurns(hand) {
    const cnt = new Array(13).fill(0);
    for (const c of hand) cnt[rankPower(c.rank)]++;
    return Math.min(planWith(cnt.slice(), false), planWith(cnt.slice(), true));
  }
  // 順子的數字位置（power）：3-7 … 10-A，加上 2-3-4-5-6
  const RUNS = [[0, 1, 2, 3, 4], [1, 2, 3, 4, 5], [2, 3, 4, 5, 6], [3, 4, 5, 6, 7], [4, 5, 6, 7, 8],
                [5, 6, 7, 8, 9], [6, 7, 8, 9, 10], [7, 8, 9, 10, 11], [12, 0, 1, 2, 3]];
  function planWith(cnt, singlesOnly) {
    let turns = 0, fours = 0;
    for (let i = 0; i < 13; i++) if (cnt[i] === 4) { fours++; cnt[i] = 0; }
    for (const run of RUNS) {
      while (run.every(i => (singlesOnly ? cnt[i] === 1 : cnt[i] >= 1))) {
        for (const i of run) cnt[i]--;
        turns++;
      }
    }
    let t = 0, p = 0, s = 0;
    for (let i = 0; i < 13; i++) {
      if (cnt[i] === 3) t++; else if (cnt[i] === 2) p++; else if (cnt[i] === 1) s++;
    }
    const fh = Math.min(t, p);
    t -= fh; p -= fh;
    // 剩下的三張：兩組可以湊一個葫蘆加一張單張，單獨一組只能拆成一對加一張
    const pairUp = Math.floor(t / 2);
    turns += fh + pairUp;
    s += pairUp;
    if (t % 2) { p++; s++; }
    turns += fours + p + s - Math.min(fours, s);   // 鐵支可以順便帶走一張單張
    return turns;
  }

  function pmChooseAction(state, difficulty) {
    const d = difficulty || state.config.difficulty;
    const p = state.turn;
    const hand = state.players[p].hand;
    const legal = pmLegalPlays(state);
    if (!legal.length) return { type: 'pass' };

    const toAction = c => ({ type: 'play', cardIds: c.cards.map(x => x.id) });
    const leading = !state.table;
    let oppMin = 99;
    state.players.forEach((pl, i) => { if (i !== p) oppMin = Math.min(oppMin, pl.hand.length); });
    const isBomb = c => PM_TYPES[c.type].bomb;
    const strength = c => (c.type === 'fullhouse' || c.type === 'four') ? c.key / 12 : c.key / 51;

    if (d === 'easy') {
      const r = seedToFloat(nextSeed(state.seed ^ (hand.length * 7919)));
      if (!leading && r < 0.2) return { type: 'pass' };
      let pool = leading ? legal.filter(c => c.cards.length <= 2) : legal;
      if (!pool.length) pool = legal;
      const plain = pool.filter(c => !isBomb(c));
      if (plain.length) pool = plain;
      return toAction(pool[0]);
    }

    const finish = legal.find(c => c.cards.length === hand.length);
    if (finish) return toAction(finish);

    const base = planTurns(hand);
    // 沒出過、也不在自己手上的牌裡，最大的單張有多大
    let unseenMax = -1;
    if (d === 'hard') {
      const mine = new Set(hand.map(c => c.id));
      const gone = new Set(state.played);
      for (const c of pmCreateDeck()) {
        if (!mine.has(c.id) && !gone.has(c.id)) unseenMax = Math.max(unseenMax, pmPower(c));
      }
    }

    let best = null;
    for (const c of legal) {
      const ids = new Set(c.cards.map(x => x.id));
      const t = planTurns(hand.filter(x => !ids.has(x.id)));
      let score = t * 100 + strength(c) * 20 - (leading ? c.cards.length * 4 : 0);
      let saving = false;
      if (isBomb(c) && t > 1 && oppMin > 2) { score += 60; saving = true; }
      if (d === 'hard') {
        if (t > 2 && oppMin > 3 && c.cards.some(x => x.rank === 2)) score += 25;   // 2 留到後面
        if (oppMin === 1 && c.type === 'single') {
          score = t * 100 - strength(c) * 20;          // 有人只剩一張：單張要出最大的
          if (leading) score += 80;                     // 能不帶單張就不帶
        }
        if (leading && c.type === 'single' && t <= 1 && c.key > unseenMax) score -= 150;  // 先出沒人壓得過的牌再收尾
      }
      if (!best || score < best.score) best = { combo: c, score: score, turns: t, saving: saving };
    }

    if (!leading && oppMin > 3 && (best.saving || best.turns >= base)) return { type: 'pass' };
    return toAction(best.combo);
  }

  const api = {
    PM_SUITS, PM_LABELS, PM_TYPES, PM_TYPE_ORDER, PM_CLUB3_ID,
    pmCreateDeck, pmSuit, pmLabel, pmCardName, pmPower, pmSortHand,
    pmClassify, pmBeats, pmCombos, pmGroups,
    pmCreateGame, pmCheckPlay, pmLegalPlays, pmCanPass, pmApply, pmChooseAction
  };
  for (const k in api) root[k] = api[k];
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

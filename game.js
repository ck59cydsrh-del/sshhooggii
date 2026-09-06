'use strict';

/* ============================================================
   駒狩り — 持ち駒ローグ
   駒の動き・成り・持ち駒・二歩・行き所のない駒は本将棋の規則。
   盤5×5・成り域は最奥1段・初期戦力はテンポ用の独自設計。
   能力はその規則を意図的に破るための層。
   ============================================================ */

const R = 5, C = 5, NS = 25;
const SENTE = 's', GOTE = 'g';

const GLYPH  = { K:'王', R:'飛', B:'角', G:'金', S:'銀', N:'桂', L:'香', P:'歩' };
const PGLYPH = { R:'龍', B:'馬', S:'全', N:'圭', L:'杏', P:'と' };
const NAME   = { K:'玉', R:'飛', B:'角', G:'金', S:'銀', N:'桂', L:'香', P:'歩' };
const VAL    = { K:20000, R:600, B:550, G:400, S:350, N:250, L:230, P:100 };
const PVAL   = { R:800, B:750, S:420, N:420, L:420, P:420 };
const KAN = ['一','二','三','四','五'];
const HAND_ORDER = ['R','B','G','S','N','L','P'];
const KING8 = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

const fwd   = o => (o === SENTE ? -1 : 1);
const other = o => (o === SENTE ? GOTE : SENTE);
const rowOf = i => (i / C) | 0;
const colOf = i => i % C;
const pieceVal = p => (p.pr ? (PVAL[p.t] || VAL[p.t]) : VAL[p.t]);
const sqName = i => `${C - colOf(i)}${KAN[rowOf(i)]}`;
const homeRow = o => (o === SENTE ? R-1 : 0);

/* 能力は側ごとに持つ(対戦では双方が持ちうる) */
let sideAb = { s:{}, g:{} };
const ab = (o, id) => (sideAb[o][id] || 0);

/* ============================================================
   能力
   ============================================================ */
const RARITY = { 1:'並', 2:'希', 3:'極' };

const ABILITIES = [
  // --- 即時獲得 ---
  { id:'gainP2', n:'歩兵徴発',   r:1, d:'いま歩を2枚もらう',            pick:r=>addPool(r,{P:2}) },
  { id:'gainP4', n:'歩兵大徴発', r:2, d:'いま歩を4枚もらう',            pick:r=>addPool(r,{P:4}) },
  { id:'gainS',  n:'銀の招集',   r:1, d:'いま銀を1枚もらう',            pick:r=>addPool(r,{S:1}) },
  { id:'gainN',  n:'桂の招集',   r:1, d:'いま桂を1枚もらう',            pick:r=>addPool(r,{N:1}) },
  { id:'gainL',  n:'香の招集',   r:1, d:'いま香を1枚もらう',            pick:r=>addPool(r,{L:1}) },
  { id:'gainG',  n:'金の招集',   r:1, d:'いま金を1枚もらう',            pick:r=>addPool(r,{G:1}) },
  { id:'gainB',  n:'角の招集',   r:2, d:'いま角を1枚もらう',            pick:r=>addPool(r,{B:1}) },
  { id:'gainR',  n:'飛の招集',   r:2, d:'いま飛を1枚もらう',            pick:r=>addPool(r,{R:1}) },
  { id:'gainRnd',n:'大盤振る舞い',r:2, d:'いきなり駒を3枚、種類はおまかせ', pick:r=>{ for(let i=0;i<3;i++) addPool(r,{[rndPiece()]:1}); } },
  { id:'jackpot',n:'大当たり',   r:3, d:'いま飛・角・金を1枚ずつもらう', pick:r=>addPool(r,{R:1,B:1,G:1}) },

  // --- 毎階の収入 ---
  { id:'tax',     n:'徴税',   r:1, d:'階の開始時、歩を1枚もらう' },
  { id:'tax2',    n:'重税',   r:2, d:'階の開始時、歩を3枚もらう' },
  { id:'tribute', n:'貢物',   r:2, d:'階の開始時、ランダムな駒を1枚もらう' },
  { id:'interest',n:'利息',   r:2, d:'階の突破時、持ち駒の1/4を歩で上乗せ' },
  { id:'warChest',n:'軍資金', r:1, d:'階の突破時、スコア +1200×階(倍率も乗る)' },
  { id:'vanguard',n:'先遣隊', r:1, d:'階の開始時、持ち駒から1枚が自陣に出ている' },
  { id:'smelt',   n:'鋳潰し', r:2, d:'階の突破時、歩3枚ごとに銀1枚へ鋳直す' },
  { id:'recycle', n:'再利用', r:2, d:'自分の駒が取られると、歩を1枚もらう' },

  // --- 駒の動き ---
  { id:'pawnRun',    n:'韋駄天',    r:2, d:'自分の歩は2マス進める(空きマスのみ)' },
  { id:'rookDragon', n:'飛龍',      r:2, d:'自分の飛は最初から龍の動き' },
  { id:'bishopHorse',n:'角馬',      r:2, d:'自分の角は最初から馬の動き' },
  { id:'goldKing',   n:'金剛',      r:2, d:'自分の金は玉と同じ動き' },
  { id:'silverWide', n:'銀嶺',      r:1, d:'自分の銀は横にも動ける' },
  { id:'silverBack', n:'銀の帰還',  r:1, d:'自分の銀は真後ろにも動ける' },
  { id:'knightBack', n:'逆跳ね',    r:1, d:'自分の桂は後ろにも跳べる' },
  { id:'knightFar',  n:'大跳ね',    r:2, d:'自分の桂は前2横2にも跳べる' },
  { id:'lanceBack',  n:'双香',      r:1, d:'自分の香は後ろにも走れる' },
  { id:'kingRun',    n:'韋駄天玉',  r:1, d:'自分の玉は縦横に2マス動ける' },
  { id:'pawnDiag',   n:'歩兵突撃',  r:1, d:'自分の歩は斜め前にも進める' },
  { id:'tokinPlus',  n:'と金無双',  r:2, d:'成った小駒は斜め後ろにも動ける' },

  // --- 成り ---
  { id:'zone2',        n:'早成り',  r:2, d:'自分の成り域が2段になる' },
  { id:'dropPromoted', n:'打ち成り',r:3, d:'打った駒は成った状態で盤に出る' },
  { id:'promoteChain', n:'昇格伝染',r:2, d:'駒を取ると、自分の盤上の駒が1枚成る' },

  // --- 打ち込み ---
  { id:'nifuOk',      n:'二歩御免',  r:1, d:'同じ筋に歩を何枚でも打てる' },
  { id:'dropAny',     n:'天井打ち',  r:2, d:'動けなくなるマスにも打てる。その駒は成って出る' },
  { id:'dropStrike',  n:'強襲打ち',  r:2, d:'駒を打つ手は手数を消費しない' },
  { id:'noEnemyDrop', n:'封鎖',      r:2, d:'敵は持ち駒を打てなくなる' },
  { id:'fortress',    n:'堅陣',      r:1, d:'玉の隣接8マスに敵の駒は現れない(打ち込みも増援も)' },

  // --- 手番 ---
  { id:'extraTurn',  n:'連撃',   r:2, d:'駒を取ると、続けてもう一手(階1回)' },
  { id:'extraTurn2', n:'連撃改', r:2, d:'連撃の回数 +1', req:'extraTurn' },
  { id:'firstStrike',n:'先制',   r:2, d:'最初の一手のあと、もう一手' },

  // --- 略奪 ---
  { id:'duplicate', n:'複製',   r:3, d:'取った駒が2枚になる' },
  { id:'spoils',    n:'戦利品', r:2, d:'階の突破時、その階の戦果をもう1組' },
  { id:'sweep',     n:'総取り', r:3, d:'階の突破時、盤に残った敵の駒を全部奪う(斬首したとき有効)' },

  // --- 狩り(突破の仕方で分岐する) ---
  { id:'hunter',   n:'狩人',   r:1, d:'守備隊を狩り尽くして突破すると、スコア2倍' },
  { id:'decap',    n:'首狩り', r:1, d:'玉を取って突破すると、速攻ボーナスが2倍' },
  { id:'massacre', n:'皆殺し', r:3, d:'狩り尽くして突破すると、その階の戦果をさらに2組もらう' },

  // --- 連鎖 ---
  { id:'chainMult',  n:'連鎖倍加', r:2, d:'連鎖1つあたりのスコア倍率が2倍になる' },
  { id:'chainRush',  n:'連鎖疾走', r:3, d:'連鎖3以上のあいだ、手数を消費しない' },
  { id:'chainBlast', n:'連鎖爆風', r:3, d:'連鎖5以上で取ると、その隣にいる敵の駒も巻き込んで取る' },

  // --- 崩壊 ---
  { id:'collapseGuard', n:'支柱',   r:1, d:'崩壊が始まってから3手は増援が降らない' },
  { id:'overtime',      n:'火事場', r:2, d:'崩壊しているあいだ、スコア倍率3倍' },
  { id:'deadline',      n:'秒読み', r:2, d:'残り手数が5以下のとき、スコア倍率2倍' },
  { id:'warBonds',      n:'戦時国債', r:2, d:'持ち駒が10枚以上のとき、スコア倍率 +1.0' },

  // --- 生存 ---
  { id:'revive',    n:'影武者',   r:3, d:'玉を取られても1度だけ復活(持ち駒は半減)' },
  { id:'revive2',   n:'影武者衆', r:2, d:'復活の回数 +1', req:'revive' },
  { id:'sacrifice', n:'身代わり', r:3, d:'玉を取られるとき、持ち駒の歩1枚を失って無かったことにする' },

  // --- 地形 ---
  { id:'terrainMine', n:'抜け道',   r:1, d:'通行不可マスを通り抜けられる(止まれはしない)' },
  { id:'demolish',    n:'破壊工作', r:1, d:'階の開始時、通行不可マスを1つ消す' },

  // --- スコア ---
  { id:'greed',     n:'強欲',     r:1, d:'スコア倍率 +0.3' },
  { id:'snowball',  n:'雪だるま', r:2, d:'スコア倍率 +0.1×到達階' },
  { id:'bigGame',   n:'一攫千金', r:2, d:'飛・角を取るとスコア3倍' },
  { id:'comboKeep', n:'粘着',     r:1, d:'連鎖が切れるまでの猶予 +1手' },

  // --- 手数 ---
  { id:'budget',    n:'兵站',     r:1, d:'各階の手数 +4' },
  { id:'budget2',   n:'長征',     r:2, d:'各階の手数 +9' },
  { id:'killClock', n:'追撃戦',   r:2, d:'駒を取るたび手数 +1' },
  { id:'swift',     n:'電撃戦',   r:2, d:'速攻ボーナスが2倍' },
  { id:'chainStart',n:'助走',     r:1, d:'各階、連鎖1から始まる' },
];
const ABI_BY_ID = Object.fromEntries(ABILITIES.map(a => [a.id, a]));


/* 能力の分類。何の系統かを一目で分かるようにする */
const CAT = {
  獲得:['gainP2','gainP4','gainS','gainN','gainL','gainG','gainB','gainR','gainRnd','jackpot'],
  収入:['tax','tax2','tribute','interest','warChest','vanguard','smelt','recycle'],
  動き:['pawnRun','rookDragon','bishopHorse','goldKing','silverWide','silverBack',
        'knightBack','knightFar','lanceBack','kingRun','pawnDiag','tokinPlus'],
  成り:['zone2','dropPromoted','promoteChain'],
  打込:['nifuOk','dropAny','dropStrike','noEnemyDrop','fortress'],
  手番:['extraTurn','extraTurn2','firstStrike'],
  略奪:['duplicate','spoils','sweep'],
  狩り:['hunter','decap','massacre'],
  連鎖:['chainMult','chainRush','chainBlast','comboKeep','chainStart'],
  崩壊:['collapseGuard','overtime','deadline','warBonds'],
  生存:['revive','revive2','sacrifice'],
  地形:['terrainMine','demolish'],
  score:['greed','snowball','bigGame'],
  手数:['budget','budget2','killClock','swift'],
};
const CAT_OF = {};
for (const k in CAT) for (const id of CAT[k]) CAT_OF[id] = (k === 'score' ? '得点' : k);
const catOf = id => CAT_OF[id] || '—';
/* 開始2回目のドラフト用。駒はもう配ったので、能力だけを引かせる */
const NON_GAIN = Object.keys(CAT_OF).filter(id => !CAT['獲得'].includes(id));

/* 能力名の読み。漢字だけだと読めないので選択画面と発動表示に添える */
const YOMI = {
  gainP2:'hohei chohatsu', gainP4:'hohei daichohatsu', gainS:'gin no shoshu',
  gainN:'kei no shoshu', gainL:'kyo no shoshu', gainG:'kin no shoshu',
  gainB:'kaku no shoshu', gainR:'hi no shoshu', gainRnd:'oban burumai',
  jackpot:'oatari',
  tax:'chozei', tax2:'juzei', tribute:'mitsugimono', interest:'risoku',
  warChest:'gunshikin', vanguard:'senkentai', smelt:'itsubushi', recycle:'sairiyo',
  pawnRun:'idaten', rookDragon:'hiryu', bishopHorse:'kakuma', goldKing:'kongo',
  silverWide:'ginrei', silverBack:'gin no kikan', knightBack:'gyakubane',
  knightFar:'obane', lanceBack:'sokyo', kingRun:'idaten gyoku',
  pawnDiag:'hohei totsugeki', tokinPlus:'tokin muso',
  zone2:'hayanari', dropPromoted:'uchinari', promoteChain:'shokaku densen',
  nifuOk:'nifu gomen', dropAny:'tenjouchi', dropStrike:'kyoshu uchi',
  noEnemyDrop:'fusa', fortress:'kenjin',
  extraTurn:'rengeki', extraTurn2:'rengeki kai', firstStrike:'sensei',
  duplicate:'fukusei', spoils:'senrihin', sweep:'sodori',
  hunter:'kariudo', decap:'kubikari', massacre:'minagoroshi',
  chainMult:'rensa baika', chainRush:'rensa shisso', chainBlast:'rensa bakufu',
  collapseGuard:'shichu', overtime:'kajiba', deadline:'byoyomi', warBonds:'senji kokusai',
  revive:'kagemusha', revive2:'kagemusha shu', sacrifice:'migawari',
  terrainMine:'nukemichi', demolish:'hakai kosaku',
  greed:'goyoku', snowball:'yukidaruma', bigGame:'ikkaku senkin', comboKeep:'nenchaku',
  budget:'heitan', budget2:'chosei', killClock:'tsuigekisen', swift:'dengekisen',
  chainStart:'joso',
};
const yomi = id => YOMI[id] || '';

/* 対戦で実際に働く能力だけ。手数・スコア・階の収入・地形・狩りは
   対戦盤には存在しないので、選べても無意味になる。 */
const VS_OK = new Set([
  'pawnRun','rookDragon','bishopHorse','goldKing','silverWide','silverBack',
  'knightBack','knightFar','lanceBack','kingRun','pawnDiag','tokinPlus',
  'zone2','dropPromoted','promoteChain',
  'nifuOk','dropAny','noEnemyDrop','fortress',
  'duplicate','recycle','vanguard',
  'revive','revive2','sacrifice',
]);
const VS_ABILITIES = ABILITIES.filter(a => VS_OK.has(a.id));
/* 対戦では追加手番(連撃・連撃改・先制)を禁止する。kozakiの指定。
   1手の価値が固定の対人戦では、手番が2回来る効果は釣り合いを壊す。 */

/* デッキ構築: 並2 / 希4 / 極10、予算10、枠5。修得済みは1安い */
/* 既定編成 = 25種すべてから選べるが高い。
   潜って持ち帰った編成 = 修得したものだけだが、ひとつずつが大幅に安い。
   「広さ」と「深さ」の取引にしてある。 */
const AB_COST      = { 1:2, 2:4, 3:10 };   // 既定編成
const AB_COST_DIVE = { 1:1, 2:2, 3:5  };   // 潜って持ち帰った編成
const DECK_BUDGET = 10, DECK_SLOTS = 5, DECK_PIECES = 10;
const abCost = (a, dive) => (dive ? AB_COST_DIVE : AB_COST)[a.r];
const deckCost = (abils, dive) =>
  Object.keys(abils).reduce((s, id) =>
    s + (ABI_BY_ID[id] ? abCost(ABI_BY_ID[id], dive) : 0), 0);
const rndPiece = () => ['P','P','L','N','S','G','B','R'][(Math.random()*8)|0];
function addPool(r, obj) { for (const t in obj) r.pool[t] = (r.pool[t] || 0) + obj[t]; }

/* ============================================================
   盤・駒の規則
   ============================================================ */
function stepOffsets(t, pr, o) {
  const d = fwd(o);
  const gold = [[d,0],[d,-1],[d,1],[0,-1],[0,1],[-d,0]];
  if (pr) {
    if (t === 'P' || t === 'L' || t === 'N' || t === 'S')
      return ab(o,'tokinPlus') ? gold.concat([[-d,-1],[-d,1]]) : gold;
    if (t === 'R') return [[1,1],[1,-1],[-1,1],[-1,-1]];
    if (t === 'B') return [[1,0],[-1,0],[0,1],[0,-1]];
  }
  switch (t) {
    case 'K': return KING8;
    case 'G': return ab(o,'goldKing') ? KING8 : gold;
    case 'S': {
      let s = [[d,0],[d,-1],[d,1],[-d,-1],[-d,1]];
      if (ab(o,'silverWide')) s = s.concat([[0,-1],[0,1]]);
      if (ab(o,'silverBack')) s = s.concat([[-d,0]]);
      return s;
    }
    case 'N': {
      let n = [[2*d,-1],[2*d,1]];
      if (ab(o,'knightBack')) n = n.concat([[-2*d,-1],[-2*d,1]]);
      if (ab(o,'knightFar'))  n = n.concat([[2*d,-2],[2*d,2]]);
      return n;
    }
    case 'P': return ab(o,'pawnDiag') ? [[d,0],[d,-1],[d,1]] : [[d,0]];
    case 'R': return ab(o,'rookDragon') ? [[1,1],[1,-1],[-1,1],[-1,-1]] : [];
    case 'B': return ab(o,'bishopHorse') ? [[1,0],[-1,0],[0,1],[0,-1]] : [];
    default:  return [];
  }
}
function slideDirs(t, pr, o) {
  if (t === 'R') return [[1,0],[-1,0],[0,1],[0,-1]];
  if (t === 'B') return [[1,1],[1,-1],[-1,1],[-1,-1]];
  if (t === 'L' && !pr) {
    const d = fwd(o);
    return ab(o,'lanceBack') ? [[d,0],[-d,0]] : [[d,0]];
  }
  return [];
}
/* 距離制限つきの走り(能力用) */
function limitedSlides(t, pr, o) {
  const out = [], d = fwd(o);
  if (!pr && t === 'P' && ab(o,'pawnRun')) out.push([d,0,2]);
  if (t === 'K' && ab(o,'kingRun')) out.push([1,0,2],[-1,0,2],[0,1,2],[0,-1,2]);
  return out;
}

function targets(pos, idx) {
  const p = pos.b[idx];
  if (!p) return [];
  const r = rowOf(idx), c = colOf(idx), set = new Set();
  // 通行不可マスには誰も止まれない。「抜け道」は走りの進路を遮られないだけ
  for (const [dr,dc] of stepOffsets(p.t, p.pr, p.o)) {
    const nr = r+dr, nc = c+dc;
    if (nr<0||nr>=R||nc<0||nc>=C) continue;
    const ni = nr*C+nc;
    if (pos.blocked.has(ni)) continue;
    const q = pos.b[ni];
    if (q && q.o === p.o) continue;
    set.add(ni);
  }
  const runs = slideDirs(p.t, p.pr, p.o).map(([dr,dc]) => [dr,dc,99])
    .concat(limitedSlides(p.t, p.pr, p.o));
  const slips = ab(p.o, 'terrainMine');
  for (const [dr,dc,max] of runs) {
    let nr = r+dr, nc = c+dc, n = 0;
    while (nr>=0 && nr<R && nc>=0 && nc<C && n++ < max) {
      const ni = nr*C+nc;
      if (pos.blocked.has(ni)) {
        if (!slips) break;
        nr += dr; nc += dc; continue;
      }
      const q = pos.b[ni];
      if (q) { if (q.o !== p.o) set.add(ni); break; }
      set.add(ni);
      nr += dr; nc += dc;
    }
  }
  // 行き所のない駒になる着手は禁じ手。成れるなら可(盤が5段なので桂の2段目で起きる)。
  // 成り駒は金以上の動きになるので対象外(これを外していて成桂が前に進めなかった)
  return [...set].filter(to => p.pr || !stuckAt(p.t, p.o, rowOf(to)) || canPromote(p, idx, to));
}

const zoneDepth = o => (ab(o,'zone2') ? 2 : 1);
function inZone(row, o) {
  const d = zoneDepth(o);
  return o === SENTE ? row < d : row >= R - d;
}
/* そのマスから一手も指せなくなる駒か(=成りを強制される) */
function stuckAt(t, o, row) {
  if (t === 'P') return o === SENTE ? row === 0 : row === R-1;
  if (t === 'L') return ab(o,'lanceBack') ? false : (o === SENTE ? row === 0 : row === R-1);
  if (t === 'N') return ab(o,'knightBack') ? false : (o === SENTE ? row <= 1 : row >= R-2);
  return false;
}
function canPromote(p, from, to) {
  if (p.pr || p.t === 'K' || p.t === 'G') return false;
  return inZone(rowOf(from), p.o) || inZone(rowOf(to), p.o);
}
function mustPromote(p, to) {
  if (p.pr || p.t === 'K' || p.t === 'G') return false;
  return stuckAt(p.t, p.o, rowOf(to)) && canPromote(p, to, to);
}

function findKing(pos, o) {
  for (let i = 0; i < NS; i++) { const p = pos.b[i]; if (p && p.o === o && p.t === 'K') return i; }
  return -1;
}
function nearKing(pos, o, idx) {
  const k = findKing(pos, o);
  return k >= 0 && Math.abs(rowOf(k) - rowOf(idx)) <= 1 && Math.abs(colOf(k) - colOf(idx)) <= 1;
}

function canDropAt(pos, t, o, idx) {
  if (pos.b[idx] || pos.blocked.has(idx)) return false;
  const r = rowOf(idx), c = colOf(idx), foe = other(o);
  if (!ab(o,'dropAny') && stuckAt(t, o, r) && !ab(o,'dropPromoted')) return false;
  if (!ab(o,'nifuOk') && t === 'P') {                       // 二歩
    for (let rr = 0; rr < R; rr++) {
      const q = pos.b[rr*C+c];
      if (q && q.o === o && q.t === 'P' && !q.pr) return false;
    }
  }
  if (ab(foe,'noEnemyDrop')) return false;
  if (ab(foe,'fortress') && nearKing(pos, foe, idx)) return false;
  return true;
}

function genMoves(pos, o, forAI) {
  const mv = [];
  for (let i = 0; i < NS; i++) {
    const p = pos.b[i];
    if (!p || p.o !== o) continue;
    for (const to of targets(pos, i)) {
      if (mustPromote(p, to)) mv.push({ from:i, to, pr:true });
      else if (canPromote(p, i, to)) {
        mv.push({ from:i, to, pr:true });
        if (!forAI) mv.push({ from:i, to, pr:false });
      } else mv.push({ from:i, to, pr:false });
    }
  }
  const hand = pos.h[o];
  for (const t of HAND_ORDER) {
    if (!hand[t]) continue;
    for (let i = 0; i < NS; i++) if (canDropAt(pos, t, o, i)) mv.push({ drop:t, to:i });
  }
  return mv;
}

/* ソロでは敵は取った駒を溜め込まない。交換のたびに盤上の駒が純減し、
   局面が必ず整理に向かう(泥沼化の主因だった無限の補充を断つ)。 */
const banks = owner => !(mode === 'solo' && owner === GOTE);

function make(pos, mv) {
  const u = { cap:null, wasPr:false };
  const mover = pos.turn;
  if (mv.drop) {
    const promotable = mv.drop !== 'G' && mv.drop !== 'K';
    const promoted = promotable && (!!ab(mover,'dropPromoted')
      || (!!ab(mover,'dropAny') && stuckAt(mv.drop, mover, rowOf(mv.to))));
    pos.b[mv.to] = { t:mv.drop, o:mover, pr:promoted };
    pos.h[mover][mv.drop]--;
  } else {
    const p = pos.b[mv.from], cap = pos.b[mv.to];
    if (cap) {
      u.cap = { ...cap };
      if (cap.t !== 'K' && banks(mover)) {
        const dup = ab(mover,'duplicate') ? 2 : 1;
        pos.h[mover][cap.t] = (pos.h[mover][cap.t] || 0) + dup;
      }
    }
    u.wasPr = p.pr;
    pos.b[mv.to] = mv.pr && !p.pr ? { ...p, pr:true } : p;
    pos.b[mv.from] = null;
  }
  pos.turn = other(mover);
  return u;
}
function unmake(pos, mv, u) {
  pos.turn = other(pos.turn);
  const mover = pos.turn;
  if (mv.drop) {
    pos.b[mv.to] = null;
    pos.h[mover][mv.drop]++;
  } else {
    const p = pos.b[mv.to];
    pos.b[mv.from] = p.pr !== u.wasPr ? { ...p, pr:u.wasPr } : p;
    pos.b[mv.to] = u.cap || null;
    if (u.cap && u.cap.t !== 'K' && banks(mover)) pos.h[mover][u.cap.t] -= ab(mover,'duplicate') ? 2 : 1;
  }
}

/* ============================================================
   CPU
   ============================================================ */
function evaluate(pos, o) {
  let s = 0;
  for (let i = 0; i < NS; i++) {
    const p = pos.b[i];
    if (!p) continue;
    let v = pieceVal(p);
    if (p.t !== 'K') v += (p.o === SENTE ? (R-1-rowOf(i)) : rowOf(i)) * 8;
    s += p.o === o ? v : -v;
  }
  for (const side of [SENTE, GOTE])
    for (const t in pos.h[side]) s += (side === o ? 1 : -1) * VAL[t] * 0.95 * pos.h[side][t];
  return s;
}
function negamax(pos, depth, alpha, beta, deadline) {
  if (depth === 0 || Date.now() > deadline) return evaluate(pos, pos.turn);
  const moves = genMoves(pos, pos.turn, true);
  if (!moves.length) return -90000;
  moves.sort((a,b) => {
    const qa = pos.b[a.to], qb = pos.b[b.to];
    return (qb ? pieceVal(qb) : 0) - (qa ? pieceVal(qa) : 0);
  });
  let best = -Infinity;
  for (const mv of moves) {
    const u = make(pos, mv);
    const sc = (u.cap && u.cap.t === 'K') ? 90000 : -negamax(pos, depth-1, -beta, -alpha, deadline);
    unmake(pos, mv, u);
    if (sc > best) best = sc;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}
function chooseMove(src, budget = 420) {
  const p = {
    b: src.b.map(x => (x ? { ...x } : null)),
    blocked: src.blocked,
    h: { s:{ ...src.h.s }, g:{ ...src.h.g } },
    turn: src.turn,
  };
  const deadline = Date.now() + budget;
  const moves = genMoves(p, p.turn, true);
  if (!moves.length) return null;
  let best = moves[0];
  for (let depth = 1; depth <= 4; depth++) {
    let bestSc = -Infinity, bestMv = null;
    for (const mv of moves) {
      const u = make(p, mv);
      const sc = (u.cap && u.cap.t === 'K') ? 90000
               : -negamax(p, depth-1, -Infinity, Infinity, deadline);
      unmake(p, mv, u);
      if (sc > bestSc || (sc === bestSc && Math.random() < 0.3)) { bestSc = sc; bestMv = mv; }
    }
    if (bestMv) best = bestMv;
    if (Date.now() > deadline || bestSc >= 90000) break;
  }
  return best;
}

/* ============================================================
   階層生成
   ============================================================ */
const FLOOR_FORCE = [
  ['P'], ['G','P'], ['S','P','P'], ['S','N','P','P'], ['G','S','P','P'],
  ['B','S','P','P'], ['R','S','P','P'], ['R','G','S','P','P'],
  ['R','B','S','P','P'], ['R','B','G','S','P','P'],
];
function enemyForce(floor) {
  if (floor <= FLOOR_FORCE.length) return FLOOR_FORCE[floor-1].slice();
  const base = FLOOR_FORCE[FLOOR_FORCE.length-1].slice();
  for (let i = 0; i < Math.floor((floor - FLOOR_FORCE.length + 1) / 2); i++) base.push(rndPiece());
  return base.slice(0, 8);
}
function enemyHand(floor) {
  const h = {};
  const n = floor >= 8 ? Math.min(4, Math.floor((floor - 6) / 2)) : 0;
  for (let i = 0; i < n; i++) { const t = rndPiece(); h[t] = (h[t]||0) + 1; }
  return h;
}
function makeTerrain(floor) {
  const s = new Set();
  let n = floor >= 9 ? 3 : floor >= 6 ? 2 : floor >= 3 ? 1 : 0;
  const cands = [10,11,12,13,14];
  if (floor >= 6) cands.push(5,6,7,8,9,15,16,17,18,19);
  while (n-- > 0 && cands.length) s.add(cands.splice((Math.random()*cands.length)|0, 1)[0]);
  return s;
}
function placeEnemy(pos, floor) {
  pos.b[2] = { t:'K', o:GOTE, pr:false };
  const force = enemyForce(floor);
  const back = [1,3,0,4], front = [7,6,8,5,9];
  const promoChance = floor >= 12 ? Math.min(0.5, (floor-10) * 0.06) : 0;
  const put = (t, slots) => {
    for (const s of slots)
      if (!pos.b[s] && !pos.blocked.has(s)) {
        const pr = t !== 'G' && Math.random() < promoChance;
        pos.b[s] = { t, o:GOTE, pr };
        return;
      }
  };
  for (const t of force.filter(t => t !== 'P')) put(t, [...back, ...front]);
  for (const t of force.filter(t => t === 'P')) put(t, [...front, ...back]);
  pos.h.g = enemyHand(floor);
}

/* ============================================================
   状態
   ============================================================ */
const BEST_KEY = 'komagari.best', SCORE_KEY = 'komagari.bestScore', PRESET_KEY = 'komagari.presets';
const SLOTS = 5;

let pos = null, mode = 'solo', run = null;
let sel = null, legal = [], busy = false, pendingPromo = null;
let goteIsCPU = true;
let floorState = null;   // 階ごとの使い切り
let soundOn = localStorage.getItem('komagari.sound') !== '0';
const numOpt = (k, d) => { const v = parseFloat(localStorage.getItem(k)); return isNaN(v) ? d : v; };
let volBgm = numOpt('komagari.volBgm', 0.5);
let volSfx = numOpt('komagari.volSfx', 0.9);
let motionCalm = localStorage.getItem('komagari.motion') === 'calm';

const $ = id => document.getElementById(id);
const newPos = blocked => ({ b:new Array(NS).fill(null), blocked, h:{ s:{}, g:{} }, turn:SENTE });

function loadPresets() {
  try { const a = JSON.parse(localStorage.getItem(PRESET_KEY) || '[]'); return Array.isArray(a) ? a : []; }
  catch (e) { return []; }
}
function savePresets(a) { try { localStorage.setItem(PRESET_KEY, JSON.stringify(a)); } catch (e) {} }

/* 先遣隊: 持ち駒から1枚を自陣に出しておく(ソロ・対戦の両方で使う) */
function deployVanguard(o) {
  const near = o === SENTE ? [21,23,20,24,16,18,15,19] : [1,3,0,4,6,8,5,9];
  for (let n = ab(o,'vanguard'); n > 0; n--) {
    const t = HAND_ORDER.find(x => pos.h[o][x] > 0);
    if (!t) break;
    const spot = near.find(i => !pos.b[i] && !pos.blocked.has(i));
    if (spot === undefined) break;
    pos.h[o][t]--;
    pos.b[spot] = { t, o, pr:false };
  }
}

/* 局面の世代。保留中のCPU思考が別の局面に着手するのを防ぐ */
let gen = 0;

/* ---------- ラン ---------- */
function startRun() {
  mode = 'solo';
  run = { floor:1, pool:{ G:1, P:1 }, abilities:{}, score:0, reviveLeft:0, comboBest:0 };
  scoreShown = 0; $('score').textContent = '0';
  sideAb = { s:run.abilities, g:{} };
  startFloor();
  // 序盤は選択肢が最も少ないのに最も精密さを要求される、という逆転が起きていたので
  // 開始時は「駒」と「能力」を続けて引かせて、最初から手札に幅を持たせる
  openDraft(
    () => openDraft(startFloor, 'DIVE 01', '初期能力 — 戦い方を決める', NON_GAIN),
    'DIVE 01', '初期配備 — 駒を選ぶ', CAT.獲得);
}

function startFloor() {
  gen++;
  const blocked = makeTerrain(run.floor);
  for (let n = ab(SENTE,'demolish'); n > 0; n--) {
    const first = [...blocked][0];
    if (first === undefined) break;
    blocked.delete(first);
  }
  pos = newPos(blocked);
  pos.b[22] = { t:'K', o:SENTE, pr:false };
  placeEnemy(pos, run.floor);
  if (garrisonLeft(pos) === 0) pos.h.g = { P:1 };   // 地形で配置が全部潰れた場合の保険

  // 毎階の収入(何をもらったか階の頭で見せる)
  const income = [];
  if (ab(SENTE,'tax'))  { const n = ab(SENTE,'tax');     addPool(run, { P:n });   income.push(['tax', `歩 +${n}`]); }
  if (ab(SENTE,'tax2')) { const n = 3 * ab(SENTE,'tax2'); addPool(run, { P:n });   income.push(['tax2', `歩 +${n}`]); }
  for (let i = 0; i < ab(SENTE,'tribute'); i++) {
    const t = rndPiece(); addPool(run, { [t]:1 });        income.push(['tribute', `${NAME[t]} +1`]);
  }
  if (ab(SENTE,'vanguard')) income.push(['vanguard', '1枚を先に配置した']);
  if (ab(SENTE,'demolish')) income.push(['demolish', '通行不可マスを崩した']);
  pos.h.s = { ...run.pool };

  deployVanguard(SENTE);

  const budget = floorBudget(run.floor);
  floorState = {
    combo: ab(SENTE,'chainStart') ? 1 : 0,
    extraLeft: { s: ab(SENTE,'extraTurn') ? 1 + ab(SENTE,'extraTurn2') : 0, g: 0 },
    firstStrike: { s:false, g:false },
    captured: {}, moves: 0,
    budget, movesLeft: budget, grace: 0, collapse: 0, bestChain: 0, lastCalled: false,
  };
  sel = null; legal = []; busy = false;
  hideOverlay(); $('draft').classList.add('hidden');
  showCombo(0); setFever(false);
  drawSigil(run.floor * 977 + 13);
  setLog(run.floor === 1
    ? '玉は盤に、他はすべて持ち駒。空いていればどこにでも打てる。'
    : `${run.floor}階。稼いだ駒を打ち込め。`);
  render();
  income.forEach(([id, detail], i) => setTimeout(() => announce(id, detail), 160 * i));
}

/* 対戦は2本先取。局ごとに先番を入れ替えて先手の利を分ける */
function startMatch(senteSrc, goteSrc, cpu) {
  match = { s:senteSrc, g:goteSrc, cpu, wins:{ s:0, g:0 }, game:1 };
  startVersus();
}

function startVersus() {
  gen++;
  mode = 'versus';
  run = null;
  goteIsCPU = match.cpu;
  sideAb = { s: match.s.abilities || {}, g: match.g.abilities || {} };
  pos = newPos(new Set());
  pos.b[22] = { t:'K', o:SENTE, pr:false };
  pos.b[2]  = { t:'K', o:GOTE,  pr:false };
  pos.h.s = { ...match.s.pool };
  pos.h.g = { ...match.g.pool };
  pos.turn = match.game % 2 === 0 ? GOTE : SENTE;
  deployVanguard(SENTE); deployVanguard(GOTE);
  floorState = {
    combo: 0,
    extraLeft: { s: ab(SENTE,'extraTurn') ? 1+ab(SENTE,'extraTurn2') : 0,
                 g: ab(GOTE,'extraTurn')  ? 1+ab(GOTE,'extraTurn2')  : 0 },
    firstStrike: { s:false, g:false },
    captured: {}, moves: 0,
    budget: 0, movesLeft: Infinity, grace: 0, collapse: 0,
    reviveLeft: { s: ab(SENTE,'revive') + ab(SENTE,'revive2'),
                  g: ab(GOTE,'revive')  + ab(GOTE,'revive2') },
  };
  sel = null; legal = []; busy = false;
  hideOverlay(); $('draft').classList.add('hidden');
  showCombo(0);
  drawSigil(7 + match.game * 131);
  setLog(`第${match.game}局。${pos.turn === SENTE ? '▲' : '△'}から指します。`);
  render();
  maybeCpuMove();
}

/* ============================================================
   演出
   ============================================================ */
let actx = null;
const BUF = {};
const SFX_FILES = {
  move:'sfx/move.wav', ui:'sfx/ui.wav', drop:'sfx/drop.wav', hit:'sfx/hit.wav',
  power:'sfx/power.wav', alarm:'sfx/alarm.wav', heavy:'sfx/heavy.wav', clear:'sfx/clear.wav',
};
function ac() {
  if (!actx) {
    const A = window.AudioContext || window.webkitAudioContext;
    if (A) actx = new A();
    // iOS: 消音スイッチは尊重しつつ、着信音が入っていれば鳴らす区分にする
    try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch (e) {}
  }
  if (actx && actx.state === 'suspended') actx.resume();
  return actx;
}

/* 音は最初から鳴らす。自動再生が塞がれている場合に備え、
   最初の操作(種類を問わない)でも起こす。成功したら解除する。 */
function primeAudio() {
  loadSfx();
  const x = ac();
  if (x && x.state === 'running') {
    startBgm();
    if (bgmSrc) unbindPrime();
  }
}
const PRIME_EVENTS = ['pointerdown', 'touchstart', 'touchend', 'mousedown', 'keydown', 'click'];
function unbindPrime() {
  PRIME_EVENTS.forEach(t => document.removeEventListener(t, primeAudio, true));
}
PRIME_EVENTS.forEach(t => document.addEventListener(t, primeAudio, true));
// 画面に戻ってきたときに止まったままにしない
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const x = ac();
  if (x && x.state === 'suspended') x.resume();
  if (soundOn && volBgm > 0 && !bgmSrc && bgmBuf && bgmBuf !== 'loading') startBgm();
});
function loadSfx() {
  const x = ac(); if (!x) return;
  loadBgm();
  for (const k in SFX_FILES) {
    if (BUF[k] !== undefined) continue;
    BUF[k] = null;
    fetch(SFX_FILES[k])
      .then(r => r.arrayBuffer())
      .then(b => x.decodeAudioData(b))
      .then(buf => { BUF[k] = buf; })
      .catch(() => {});
  }
}
/* rate で音程、gain で強さを変える。連鎖で高くなるのが気持ちよさの本体 */
function play(key, rate = 1, gain = 0.9) {
  if (!soundOn || volSfx <= 0) return;
  const x = ac(); if (!x || !BUF[key]) return;
  const src = x.createBufferSource(), g = x.createGain();
  src.buffer = BUF[key];
  src.playbackRate.value = rate;
  g.gain.value = gain * volSfx;
  src.connect(g); g.connect(x.destination);
  src.start();
}
const sfx = {
  move:  () => play('move', 0.95 + Math.random()*0.1, 0.8),
  ui:    () => play('ui', 1, 0.7),
  drop:  () => play('drop', 1, 0.8),
  take:  n => {                                   // 連鎖でピッチが上がっていく
    const r = Math.min(2.2, 1 + Math.min(n, 14) * 0.075);
    play('hit', r, 0.95);
    if (n >= 5) play('power', r * 0.9, 0.35);
  },
  heavy: () => play('heavy', 1, 1),
  power: r => play('power', r === 3 ? 0.82 : r === 2 ? 1.06 : 1.3, 0.85),
  alarm: () => play('alarm', 1, 0.8),
  clear: () => play('clear', 1, 1),
  pick:  r => play('power', r === 3 ? 0.8 : r === 2 ? 1.0 : 1.2, 0.9),
  dead:  () => play('clear', 0.62, 1),
  revive:() => play('heavy', 1.35, 0.9),
};

function shake(power = 1) {
  if (motionCalm) power *= 0.35;
  const w = $('board-wrap');
  w.style.setProperty('--shake', power);
  w.classList.remove('shaking'); void w.offsetWidth; w.classList.add('shaking');
}
function popText(idx, text, cls = '') {
  const cell = $('board').children[idx];
  if (!cell) return;
  const b = $('board').getBoundingClientRect(), c = cell.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'pop ' + cls;
  el.textContent = text;
  el.style.left = (c.left - b.left + c.width/2) + 'px';
  el.style.top  = (c.top  - b.top  + c.height/2) + 'px';
  $('fx').appendChild(el);
  setTimeout(() => el.remove(), 1100);
}
function burst(idx) {
  const cell = $('board').children[idx];
  if (!cell) return;
  const b = $('board').getBoundingClientRect(), c = cell.getBoundingClientRect();
  const x = c.left - b.left + c.width/2, y = c.top - b.top + c.height/2;
  for (let i = 0; i < 12; i++) {
    const s = document.createElement('div');
    s.className = 'spark' + (i % 3 === 0 ? ' tri' : '');
    const a = Math.random()*Math.PI*2, d = 24 + Math.random()*38;
    s.style.left = x + 'px'; s.style.top = y + 'px';
    s.style.setProperty('--dx', Math.cos(a)*d + 'px');
    s.style.setProperty('--dy', Math.sin(a)*d + 'px');
    $('fx').appendChild(s);
    setTimeout(() => s.remove(), 700);
  }
}
/* 能力が発動したら名前と効果を大きく出す。連続発動は積んで見せる */
function announce(id, detail) {
  const a = ABI_BY_ID[id];
  if (!a) return;
  const box = $('announce');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'ann r' + a.r;
  el.innerHTML = `<i>${RARITY[a.r]}</i><b>${a.n}</b>`
    + `<span class="ann-yomi">${yomi(id)}</span>`
    + `<span>${detail || a.d}</span>`;
  box.appendChild(el);
  shake(a.r === 3 ? 2 : a.r === 2 ? 1.3 : 0.8);
  sfx.power(a.r);
  flashScreen(a.r === 3 ? 'hard' : '');
  ringBurst(a.r);
  setTimeout(() => el.classList.add('out'), a.r === 3 ? 1500 : 1200);
  setTimeout(() => el.remove(), a.r === 3 ? 1900 : 1600);
  while (box.children.length > 3) box.firstChild.remove();
}


/* ---------- 階の遷移。墨の帯が走り、階数が刻まれる ---------- */
function floorTransition(floor, then) {
  const el = $('transition');
  if (!el || motionCalm) { then(); return; }
  $('tr-num').textContent = String(floor).padStart(2, '0');
  $('tr-label').textContent = 'floor';
  el.classList.remove('hidden', 'run');
  void el.offsetWidth;
  el.classList.add('run');
  play('heavy', 1.5, 0.5);
  setTimeout(() => { then(); }, 340);                 // 帯が覆った瞬間に中身を差し替える
  setTimeout(() => { el.classList.add('hidden'); }, 900);
}

/* 盤の中央に大きく一言を刻む。判定と同じ場所を使う */
function stamp(text, cls = '') {
  const box = $('judge');
  if (!box || motionCalm) return;
  const el = document.createElement('div');
  el.className = 'stamp ' + cls;
  el.textContent = text;
  box.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

/* 到達したら一度だけ出す区切り。連鎖・スコア・自己新 */
function checkMilestones() {
  if (mode !== 'solo' || !run) return;
  const c = floorState.combo;
  if (c >= 10 && c > (run.shownChain || 0) && c % 5 === 0) {
    run.shownChain = c;
    stamp(`${c} 連鎖`, 'big');
    flashScreen('hard'); sfx.heavy(); shake(2);
  }
  const marks = [100000, 500000, 1000000, 3000000];
  for (const m of marks) {
    if (run.score >= m && !(run.shownScore || []).includes(m)) {
      run.shownScore = (run.shownScore || []).concat(m);
      stamp(m.toLocaleString('ja-JP'), 'score');
      sfx.power(2);
    }
  }
  const best = Number(localStorage.getItem(SCORE_KEY) || 0);
  if (best > 0 && run.score > best && !run.shownBest) {
    run.shownBest = true;
    stamp('自己新', 'best');
    flashScreen('hard'); sfx.clear();
  }
}


/* 対戦で「誰が何を取ったか」を盤上に出す */
function captureBanner(mover, cap) {
  const box = $('announce');
  if (!box || motionCalm) return;
  const el = document.createElement('div');
  el.className = 'ann cap' + (mover === GOTE ? ' gote' : '');
  const glyph = cap.pr ? PGLYPH[cap.t] : NAME[cap.t];
  el.innerHTML =
    `<i>${mover === SENTE ? '▲' : '△'}</i>` +
    `<b>${glyph} を取った</b>` +
    `<span>${mover === SENTE ? '先手' : '後手'}の持ち駒になった</span>`;
  box.appendChild(el);
  setTimeout(() => el.classList.add('out'), 900);
  setTimeout(() => el.remove(), 1250);
  while (box.children.length > 3) box.firstChild.remove();
}

/* 盤の縁から広がる輪。発動を盤面全体で知らせる */
function ringBurst(strength = 1) {
  const w = $('board-wrap');
  if (!w) return;
  const r = document.createElement('div');
  r.className = 'ringburst' + (strength === 3 ? ' hard' : '');
  w.appendChild(r);
  setTimeout(() => r.remove(), 620);
}

function showCombo(n) {
  const el = $('combo');
  if (n < 2) { el.classList.add('hidden'); return; }
  $('combo-n').textContent = '×' + n;
  el.classList.remove('hidden');
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}
function flashScore() {
  const el = $('score');
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}
function flashScreen(kind = '') {
  if (motionCalm && kind !== 'hard') return;
  const f = $('flash');
  f.className = ''; void f.offsetWidth;
  f.className = 'on' + (kind ? ' ' + kind : '');
}

/* ---------- BGM。132BPM / 64小節ちょうどなので継ぎ目なく回す ---------- */
const BGM_BARS = 116.363636;
let bgmSrc = null, bgmGain = null, bgmBuf = null;
function loadBgm() {
  const x = ac(); if (!x || bgmBuf !== null) return;
  bgmBuf = 'loading';
  fetch('bgm/loop.webm')
    .then(r => r.arrayBuffer())
    .then(b => x.decodeAudioData(b))
    .then(buf => { bgmBuf = buf; if (soundOn && volBgm > 0) startBgm(); })
    .catch(() => { bgmBuf = null; });
}
function startBgm() {
  const x = ac();
  if (!x || !bgmBuf || bgmBuf === 'loading' || bgmSrc) return;
  bgmGain = x.createGain();
  bgmGain.gain.value = 0;
  bgmGain.connect(x.destination);
  bgmSrc = x.createBufferSource();
  bgmSrc.buffer = bgmBuf;
  bgmSrc.loop = true;
  bgmSrc.loopStart = 0;
  bgmSrc.loopEnd = Math.min(BGM_BARS, bgmBuf.duration);  // 小節の切れ目で正確に折り返す
  bgmSrc.connect(bgmGain);
  bgmSrc.start();
  bgmGain.gain.linearRampToValueAtTime(volBgm, x.currentTime + 1.2);
}
function stopBgm() {
  if (!bgmSrc) return;
  const x = ac();
  try {
    bgmGain.gain.cancelScheduledValues(x.currentTime);
    bgmGain.gain.setValueAtTime(bgmGain.gain.value, x.currentTime);
    bgmGain.gain.linearRampToValueAtTime(0, x.currentTime + 0.3);
    bgmSrc.stop(x.currentTime + 0.35);
  } catch (e) {}
  bgmSrc = null; bgmGain = null;
}
/* FEVER中だけ少し前に出す */
function duckBgm(up) {
  if (!bgmGain) return;
  const x = ac();
  bgmGain.gain.cancelScheduledValues(x.currentTime);
  bgmGain.gain.linearRampToValueAtTime(up ? Math.min(1, volBgm * 1.35) : volBgm, x.currentTime + 0.25);
}
function applyBgmVolume() {
  if (!bgmGain) return;
  const x = ac();
  bgmGain.gain.cancelScheduledValues(x.currentTime);
  bgmGain.gain.linearRampToValueAtTime(volBgm, x.currentTime + 0.08);
}

/* 判定。連鎖と取った駒の格で四段階。将棋の講評語をそのまま使う */
const JUDGE = ['好手', '妙手', '絶妙手', '神'];
function showJudge(chain, big) {
  let t = chain >= 8 ? 3 : chain >= 5 ? 2 : chain >= 3 ? 1 : 0;
  if (big && t < 3) t++;
  const box = $('judge');
  box.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'jd t' + (t + 1);
  el.textContent = JUDGE[t];
  box.appendChild(el);
  setTimeout(() => el.remove(), 520);
  if (t >= 2) { flashScreen(); sfx.heavy(); }
  return t;
}

/* FEVER: 連鎖5以上。画面が変わり、倍率も乗る */
function setFever(on) {
  if (document.body.classList.contains('fever') === on) return;
  document.body.classList.toggle('fever', on);
  duckBgm(on);
  if (on) { flashScreen('hard'); sfx.power(3); ringBurst(3); stamp('FEVER', 'fever'); }
}

/* スコアは一気に増えず、転がって増える */
let scoreShown = 0, scoreTimer = null;
function rollScore() {
  const el = $('score');
  if (scoreTimer) return;
  scoreTimer = setInterval(() => {
    const target = run ? run.score : 0;
    const diff = target - scoreShown;
    if (Math.abs(diff) < 1) {
      scoreShown = target; clearInterval(scoreTimer); scoreTimer = null;
    } else scoreShown += Math.ceil(Math.abs(diff) / 6) * Math.sign(diff);
    el.textContent = Math.round(scoreShown).toLocaleString('ja-JP');
  }, 28);
}

/* 突破時のランク。速さと連鎖で決まる */
function clearRank(spareRatio, bestChain) {
  const pts = spareRatio * 60 + Math.min(bestChain, 10) * 4;
  return pts >= 68 ? 'S' : pts >= 50 ? 'A' : pts >= 30 ? 'B' : 'C';
}

/* ---------- スコア ---------- */
function scoreMult() {
  if (mode !== 'solo') return 1;
  let m = 1 + 0.3*ab(SENTE,'greed') + 0.1*ab(SENTE,'snowball')*run.floor;
  if (floorState) {
    const hand = Object.values(pos ? pos.h.s : {}).reduce((a,b) => a+b, 0);
    if (ab(SENTE,'warBonds') && hand >= 10) m += 1;
    if (ab(SENTE,'deadline') && floorState.movesLeft <= 5 && floorState.movesLeft >= 0) m *= 2;
    if (ab(SENTE,'overtime') && floorState.movesLeft < 0) m *= 3;
    if (floorState.combo >= 5) m *= 1.5;                 // FEVER
  }
  return m;
}
function addScore(n) {
  if (mode !== 'solo') return 0;
  const v = Math.round(n);
  run.score += v;
  rollScore();
  flashScore();
  return v;
}

/* ============================================================
   描画
   ============================================================ */
const SVGNS = 'http://www.w3.org/2000/svg';
const PENTA = '50,3 84,20 95,106 5,106 16,20';
function pieceEl(p, extra = '') {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 110');
  svg.setAttribute('class', 'pc ' + (p.o === GOTE ? 'gote ' : '') + (p.pr ? 'pr ' : '') + extra);
  const poly = document.createElementNS(SVGNS, 'polygon');
  poly.setAttribute('points', PENTA);
  const txt = document.createElementNS(SVGNS, 'text');
  txt.setAttribute('x', '50'); txt.setAttribute('y', '66');
  txt.setAttribute('text-anchor', 'middle');
  txt.setAttribute('dominant-baseline', 'central');
  txt.textContent = p.pr ? PGLYPH[p.t] : (p.t === 'K' && p.o === GOTE ? '玉' : GLYPH[p.t]);
  svg.appendChild(poly); svg.appendChild(txt);
  return svg;
}

/* 階ごとのシジル(黒地に白のディザ片) */
function drawSigil(seed) {
  const cv = $('sigil'); if (!cv) return;
  const S = cv.width, ctx = cv.getContext('2d');
  let s = (seed * 2654435761) % 2147483647 || 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  ctx.fillStyle = '#17171B'; ctx.fillRect(0, 0, S, S);
  const cx = S/2 - .5, cy = S/2 - .5, Rr = S * 0.40;
  ctx.fillStyle = '#EFEEEA';
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x-cx, y-cy) / Rr;
    if (d < 1 && rnd() > d*d*0.95) ctx.fillRect(x, y, 1, 1);
  }
  ctx.fillStyle = '#17171B';
  for (let k = 0; k < 4; k++) {
    const a = rnd()*Math.PI*2, r = rnd()*Rr*0.6;
    ctx.fillRect(Math.round(cx + Math.cos(a)*r), Math.round(cy + Math.sin(a)*r), 1 + (rnd()*2|0), 1 + (rnd()*2|0));
  }
}
function humanControls(o) {
  if (mode !== 'versus') return o === SENTE;
  if (net.on) return o === net.seat;      // 通信対戦では自分の側だけ動かせる
  return o === SENTE || !goteIsCPU;
}
let axisFlipped = null;
function renderAxis() {
  const f = $('files'), r = $('ranks'), fl = flipped();
  if (f.childElementCount && axisFlipped === fl) return;
  axisFlipped = fl;
  f.innerHTML = ''; r.innerHTML = '';
  for (let c = 0; c < C; c++) {
    const e = document.createElement('span');
    e.textContent = fl ? c + 1 : C - c;         // 反転すると筋の並びも逆になる
    f.appendChild(e);
  }
  for (let i = 0; i < R; i++) {
    const e = document.createElement('span');
    e.textContent = KAN[fl ? R - 1 - i : i];
    r.appendChild(e);
  }
}

/* 自分の駒が常に手前に来るようにする。通信対戦で後手を持つと
   盤が上下逆になり、端末を回さないと指せなかった。 */
function myView() {
  if (mode === 'versus' && net.on) return net.seat;   // 通信では自分の席が手前
  return SENTE;                                        // それ以外は先手が手前
}
const flipped = () => myView() === GOTE;
/* 画面の並び順 d ↔ 盤の位置 i */
const viewToBoard = d => (flipped() ? NS - 1 - d : d);

function render() {
  renderAxis();
  const board = $('board');
  board.innerHTML = '';
  const active = humanControls(pos.turn) && !busy;
  document.body.classList.toggle('flipped', flipped());

  for (let d = 0; d < NS; d++) {
    const i = viewToBoard(d);
    const cell = document.createElement('div');
    cell.className = 'cell';
    const me = myView(), foe = other(me);
    if (pos.blocked.has(i)) cell.classList.add('blocked');
    else if (inZone(rowOf(i), me)) cell.classList.add('zone');        // 自分の成り域
    else if (inZone(rowOf(i), foe)) cell.classList.add('zone', 'zone-foe');
    if (legal.includes(i)) {
      cell.classList.add('clickable', pos.b[i] ? 'capture' : 'move');
    }
    if (sel && sel.kind === 'board' && sel.idx === i) cell.classList.add('sel');
    const p = pos.b[i];
    if (p) {
      cell.appendChild(pieceEl(p));
      if (active && p.o === pos.turn) cell.classList.add('clickable');
    }
    cell.addEventListener('click', () => onCell(i));
    board.appendChild(cell);
  }

  // 手前が自分、奥が相手になるようトレイも入れ替える
  const meTray = flipped() ? 'g' : 's', foeTray = flipped() ? 's' : 'g';
  renderHand(meTray, 'hand-s'); renderHand(foeTray, 'hand-g');
  document.querySelector('.tray-self .tray-label').textContent = '自';
  document.querySelector('.tray-enemy .tray-label').textContent = '敵';
  renderAbilityBar(); renderCharges(); renderClock();

  if (mode === 'solo') {
    $('floor-label').textContent = 'FLOOR ' + String(run.floor).padStart(2, '0');
    $('turn-label').textContent = pos.turn === SENTE
      ? 'GARRISON ' + String(garrisonLeft(pos)).padStart(2, '0')
      : 'ENEMY THINKING';
    $('score').textContent = run.score.toLocaleString('ja-JP');
    $('score').style.visibility = '';
  } else {
    $('floor-label').textContent = `GAME ${match.game} / 2WINS`;
    $('turn-label').textContent = pos.turn === SENTE
      ? `▲ ${match.s.name}`
      : `△ ${match.g.name}`;
    $('score').style.visibility = 'hidden';
  }
}

function renderHand(side, into) {
  const row = $(into || (side === 's' ? 'hand-s' : 'hand-g'));
  row.innerHTML = '';
  const hand = pos.h[side], owner = side === 's' ? SENTE : GOTE;
  const entries = HAND_ORDER.filter(t => hand[t] > 0);
  if (!entries.length) {
    const e = document.createElement('span');
    e.className = 'tray-empty'; e.textContent = '—— EMPTY';
    row.appendChild(e); return;
  }
  const selectable = humanControls(owner) && pos.turn === owner && !busy;
  for (const t of entries) {
    const item = document.createElement('div');
    item.className = 'hand-item';
    const isSel = sel && sel.kind === 'hand' && sel.t === t && sel.owner === owner;
    const el = pieceEl({ t, o:owner, pr:false }, 'hand ' + (isSel ? 'selected' : ''));
    if (selectable) el.addEventListener('click', () => onHand(t, owner));
    else el.style.cursor = 'default';
    item.appendChild(el);
    if (hand[t] > 1) {
      const n = document.createElement('span');
      n.className = 'hand-count'; n.textContent = '×' + hand[t];
      item.appendChild(n);
    }
    row.appendChild(item);
  }
}

function renderAbilityBar() {
  const bar = $('ability-bar');
  bar.innerHTML = '';
  if (mode === 'versus') return renderVersusAbilities(bar);
  const my = sideAb[SENTE];
  const ids = Object.keys(my).filter(id => my[id] > 0);
  if (!ids.length) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  for (const id of ids) {
    const a = ABI_BY_ID[id]; if (!a) continue;
    const c = document.createElement('span');
    c.className = 'chip r' + a.r;
    c.innerHTML = `<i>${RARITY[a.r]}</i>${a.n}${my[id] > 1 ? '×' + my[id] : ''}`;
    c.title = a.d;
    c.addEventListener('click', openAbilityList);
    bar.appendChild(c);
  }
}

/* 手数計。参照画像の縦罫の面をそのままメーターに使う */
function renderClock() {
  const box = $('clock'), ticks = $('clock-ticks'), label = $('clock-label');
  if (mode !== 'solo' || !floorState) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  const left = floorState.movesLeft, total = floorState.budget;
  const collapsed = left < 0;
  box.classList.toggle('low', !collapsed && left <= 5);
  box.classList.toggle('collapse', collapsed);
  document.body.classList.toggle('urgent', !collapsed && left >= 0 && left <= 3);
  document.body.classList.toggle('collapsing', collapsed);
  label.textContent = collapsed
    ? `COLLAPSE ${String(floorState.collapse).padStart(2,'0')}`
    : `MOVES ${String(left).padStart(2,'0')}`;
  const shown = Math.min(total, 34);
  const scale = total / shown;
  ticks.innerHTML = '';
  for (let i = 0; i < shown; i++) {
    const b = document.createElement('b');
    if (i >= Math.ceil(Math.max(left,0) / scale)) b.className = 'spent';
    ticks.appendChild(b);
  }
}

/* 対戦では両者の能力を並べて出す。相手が何を積んでいるか常に見える */
function renderVersusAbilities(bar) {
  bar.classList.remove('hidden');
  bar.classList.add('vs-abils');
  const me = myView(), foe = other(me);
  for (const [side, label] of [[me, '自'], [foe, '敵']]) {
    const ids = Object.keys(sideAb[side]).filter(id => sideAb[side][id] > 0);
    const row = document.createElement('div');
    row.className = 'vs-row' + (side === me ? ' mine' : '');
    row.innerHTML = `<span class="vs-who">${label}</span>`;
    if (!ids.length) row.innerHTML += '<span class="ap-none">なし</span>';
    for (const id of ids) {
      const a = ABI_BY_ID[id]; if (!a) continue;
      const c = document.createElement('span');
      c.className = 'chip r' + a.r;
      c.innerHTML = `<i>${RARITY[a.r]}</i>${a.n}`;
      c.title = a.d;
      c.addEventListener('click', () => openAbilityList(side));
      row.appendChild(c);
    }
    bar.appendChild(row);
  }
}

/* 残回数は実心の点列で示す */
function renderCharges() {
  const box = $('charges');
  box.innerHTML = '';
  if (!floorState) { box.classList.add('hidden'); return; }
  const rows = [];
  if (mode === 'versus' && match) {
    rows.push(['▲ ' + match.s.name, match.wins.s, 2, false]);
    rows.push(['△ ' + match.g.name, match.wins.g, 2, false]);
  }
  const maxExtra = ab(SENTE,'extraTurn') ? 1 + ab(SENTE,'extraTurn2') : 0;
  if (maxExtra) rows.push(['CHAIN-HIT', floorState.extraLeft.s, maxExtra, false]);
  if (ab(SENTE,'firstStrike')) rows.push(['FIRST', floorState.firstStrike.s ? 0 : 1, 1, false]);
  if (floorState.combo > 0) rows.push(['CHAIN-GRACE', floorState.grace, 3 + ab(SENTE,'comboKeep'), false]);
  if (mode === 'solo' && (ab(SENTE,'revive') || run.reviveLeft))
    rows.push(['REVIVE', run.reviveLeft, ab(SENTE,'revive') + ab(SENTE,'revive2'), true]);
  if (!rows.length) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  for (const [label, left, max, hot] of rows) {
    const d = document.createElement('div');
    d.className = 'charge' + (hot ? ' hot' : '');
    const dots = Array.from({ length: Math.max(max, left) },
      (_, k) => `<b class="${k < left ? '' : 'off'}"></b>`).join('');
    d.innerHTML = `${label}<i>${dots}</i>`;
    box.appendChild(d);
  }
}

const setLog = t => { $('log').textContent = t; };

/* ============================================================
   入力
   ============================================================ */
function onHand(t, owner) {
  if (busy) return;
  if (sel && sel.kind === 'hand' && sel.t === t) { sel = null; legal = []; render(); return; }
  sel = { kind:'hand', t, owner };
  legal = [];
  for (let i = 0; i < NS; i++) if (canDropAt(pos, t, owner, i)) legal.push(i);
  render();
}
function onCell(i) {
  if (busy || !humanControls(pos.turn)) return;
  if (sel && legal.includes(i)) {
    if (sel.kind === 'hand') return applyMove({ drop:sel.t, to:i });
    const p = pos.b[sel.idx];
    if (mustPromote(p, i)) return applyMove({ from:sel.idx, to:i, pr:true });
    if (canPromote(p, sel.idx, i)) { pendingPromo = { from:sel.idx, to:i }; $('promo').classList.remove('hidden'); return; }
    return applyMove({ from:sel.idx, to:i, pr:false });
  }
  const p = pos.b[i];
  if (p && p.o === pos.turn) { sel = { kind:'board', idx:i }; legal = targets(pos, i); }
  else { sel = null; legal = []; }
  render();
}
$('promo-yes').addEventListener('click', () => { $('promo').classList.add('hidden'); applyMove({ ...pendingPromo, pr:true }); });
$('promo-no').addEventListener('click',  () => { $('promo').classList.add('hidden'); applyMove({ ...pendingPromo, pr:false }); });

function moveText(mv, mover) {
  const mark = mover === SENTE ? '▲' : '△';
  if (mv.drop) return `${mark}${sqName(mv.to)}${NAME[mv.drop]}打`;
  const p = pos.b[mv.to];
  const base = p.pr && !mv.pr ? PGLYPH[p.t] : NAME[p.t];
  return `${mark}${sqName(mv.to)}${base}${mv.pr ? '成' : ''}`;
}

function applyMove(mv, fromNet) {
  const mover = pos.turn;
  if (net.on && !fromNet && mover === net.seat) netSend(mv);
  const captured = mv.drop ? null : pos.b[mv.to];
  make(pos, mv);
  sel = null; legal = [];
  floorState.moves++;
  const landed = mv.to;

  let msg = moveText(mv, mover);
  let extra = false;
  if (ab(mover,'firstStrike') && !floorState.firstStrike[mover]) { floorState.firstStrike[mover] = true; extra = true; announce('firstStrike'); }

  if (captured && captured.t !== 'K') {
    if (mover === SENTE) {
      floorState.combo++;
      floorState.grace = 3 + ab(SENTE,'comboKeep');
      floorState.captured[captured.t] = (floorState.captured[captured.t] || 0) + 1;
      const big = ab(SENTE,'bigGame') && (captured.t === 'R' || captured.t === 'B' || captured.t === 'G') ? 3 : 1;
      const per = ab(SENTE,'chainMult') ? 0.5 : 0.25;
      const gained = addScore(pieceVal(captured) * (1 + floorState.combo*per) * scoreMult() * big);
      popText(mv.to, '+' + gained.toLocaleString('ja-JP'), big > 1 ? 'big' : '');
      showCombo(floorState.combo);
      floorState.bestChain = Math.max(floorState.bestChain || 0, floorState.combo);
      showJudge(floorState.combo, big > 1 || captured.t === 'R' || captured.t === 'B');
      setFever(floorState.combo >= 5);
      if (run) run.comboBest = Math.max(run.comboBest, floorState.combo);
      if (ab(SENTE,'killClock')) { floorState.movesLeft++; announce('killClock', `手数 +1(残り${floorState.movesLeft})`); }
      checkMilestones();
      if (floorState.combo === 3 || floorState.combo === 5 || floorState.combo === 8 || floorState.combo >= 12)
        popText(mv.to, floorState.combo >= 8 ? '猛攻' : '連鎖', 'mark');
      sfx.take(floorState.combo);
    } else sfx.take(1);

    // 何が取られたかを対戦でもはっきり示す
    if (mode === 'versus') {
      captureBanner(mover, captured);
      const tray = $(mover === SENTE ? 'hand-s' : 'hand-g');
      tray.classList.remove('gained'); void tray.offsetWidth; tray.classList.add('gained');
    }
    burst(mv.to); shake(captured.t === 'R' || captured.t === 'B' ? 1.6 : 1);
    if (ab(mover,'duplicate')) { msg += ' 複製!'; announce('duplicate', `${NAME[captured.t]}が2枚になった`); }
    if (ab(mover,'promoteChain') && promoteOne(mover)) { msg += ' 昇格伝染!'; announce('promoteChain'); }
    if (mover === SENTE && ab(SENTE,'chainBlast') && floorState.combo >= 5) {
      const n = chainBlast(mv.to);
      if (n) { msg += ` 爆風 ${n}枚!`; announce('chainBlast', `隣の${n}枚を巻き込んだ`); }
    }
    const victim = other(mover);                 // 取られた側
    if (ab(victim,'recycle')) {
      pos.h[victim].P = (pos.h[victim].P || 0) + 1;
      if (mode === 'solo' && victim === SENTE) run.pool.P = (run.pool.P || 0) + 1;
      popText(mv.to, '再利用', 'mark');
      announce('recycle', `${NAME[captured.t]}の代わりに歩が1枚`);
    }
    if (!extra && floorState.extraLeft[mover] > 0) { floorState.extraLeft[mover]--; extra = true; announce('extraTurn', `もう一手(残り${floorState.extraLeft[mover]})`); }
  } else if (mv.drop) sfx.drop();
  else sfx.move();

  if (mv.pr && mover === SENTE) {
    popText(mv.to, '成', 'mark'); burst(mv.to); sfx.power(2);
  }
  if (captured && captured.t === 'K') {
    sfx.heavy(); flashScreen(); shake(2.6);
    setLog(msg + '  玉を取った'); render(); return finish(mover, 'king');
  }

  if (mode === 'solo' && captured && garrisonLeft(pos) === 1 && !floorState.lastCalled) {
    floorState.lastCalled = true;
    stamp('あと 1 枚', 'last'); sfx.power(2);
  }

  // 守備隊を狩り尽くしたら突破(玉だけが残った状態)
  if (mode === 'solo' && captured && garrisonLeft(pos) === 0) {
    setLog(msg + '  守備隊は全滅した');
    render();
    return finish(SENTE, 'strip');
  }

  if (extra) { pos.turn = mover; msg += '  →  もう一手!'; popText(mv.to, '追撃', 'extra'); }

  // 手番を明け渡すときだけ手数を消費する(追撃はタダ、強襲打ちなら打つ手もタダ)
  if (mode === 'solo' && mover === SENTE && !extra) {
    if (!captured && floorState.combo > 0 && --floorState.grace <= 0) {
      floorState.combo = 0; showCombo(0); setFever(false);
    }
    const rush = ab(SENTE,'chainRush') && floorState.combo >= 3;
    const freeDrop = (mv.drop && ab(SENTE,'dropStrike')) || rush;
    if (freeDrop) { msg += rush ? '  ／疾走' : '  ／強襲'; announce(rush ? 'chainRush' : 'dropStrike', '手数を使わなかった'); }
    else floorState.movesLeft--;
    if (!freeDrop && floorState.movesLeft < 0) {
      floorState.collapse++;
      const idx = spawnReinforcement();
      shake(2.2); sfx.alarm(); flashScreen();
      msg += idx === null ? '  ／崩壊' : '  ／崩壊 増援';
    } else if (!freeDrop && floorState.movesLeft === 0) {
      popText(22, '手数切れ', 'warn'); shake(1.4);
    }
  }
  setLog(msg);
  render();
  if (!motionCalm) {
    const cell = $('board').children[landed];
    const pcEl = cell && cell.querySelector('.pc');
    if (pcEl) { pcEl.classList.add('placed'); setTimeout(() => pcEl.classList.remove('placed'), 460); }
  }

  // 指せる手がない側が負け(追加手番で自分に回ってきた場合も同じ)
  if (!genMoves(pos, pos.turn, false).length) return finish(other(pos.turn), 'stall');

  maybeCpuMove();
}

function maybeCpuMove() {
  const cpuTurn = mode === 'solo' ? pos.turn === GOTE : (goteIsCPU && pos.turn === GOTE);
  if (!cpuTurn) return;
  busy = true; render();
  const myGen = gen;
  setTimeout(() => {
    if (myGen !== gen) return;            // 別の局面に移っていたら破棄
    const best = chooseMove(pos);
    if (myGen !== gen) return;
    busy = false;
    if (!best) return finish(other(pos.turn), 'stall');
    applyMove(best);
  }, 240);
}

/* 守備隊の残り(盤上+持ち駒、玉を除く)。0になれば階は突破 */
function garrisonLeft(p) {
  let n = 0;
  for (let i = 0; i < NS; i++) { const q = p.b[i]; if (q && q.o === GOTE && q.t !== 'K') n++; }
  for (const t in p.h.g) n += p.h.g[t];
  return n;
}

function floorBudget(floor) {
  return 14 + floor * 2 + 4 * ab(SENTE,'budget') + 9 * ab(SENTE,'budget2');
}

/* 連鎖爆風: 取ったマスの隣接4マスにいる敵の駒も巻き込む(玉は巻き込めない) */
function chainBlast(at) {
  const r = rowOf(at), c = colOf(at);
  let n = 0;
  for (const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const nr = r+dr, nc = c+dc;
    if (nr<0||nr>=R||nc<0||nc>=C) continue;
    const ni = nr*C+nc, q = pos.b[ni];
    if (!q || q.o !== GOTE || q.t === 'K') continue;
    pos.b[ni] = null;
    const dup = ab(SENTE,'duplicate') ? 2 : 1;
    pos.h.s[q.t] = (pos.h.s[q.t] || 0) + dup;
    floorState.captured[q.t] = (floorState.captured[q.t] || 0) + 1;
    addScore(pieceVal(q) * scoreMult());
    burst(ni); popText(ni, '爆風', 'warn');
    n++;
  }
  if (n) shake(2.2);
  return n;
}

/* 崩壊: 手数を使い切った後は、一手ごとに敵の増援が降ってくる */
function spawnReinforcement() {
  const empty = [];
  for (let i = 0; i < NS; i++) if (!pos.b[i] && !pos.blocked.has(i)) empty.push(i);
  if (!empty.length) return null;
  if (floorState.collapse <= 3 * ab(SENTE,'collapseGuard')) return null;
  for (let tries = 0; tries < 12; tries++) {
    const idx = empty[(Math.random() * empty.length) | 0];
    const t = rndPiece();
    if (stuckAt(t, GOTE, rowOf(idx))) continue;
    if (ab(SENTE,'fortress') && nearKing(pos, SENTE, idx)) continue;
    pos.b[idx] = { t, o:GOTE, pr:false };
    popText(idx, '増援', 'warn');
    burst(idx);
    return idx;
  }
  return null;
}

function promoteOne(o) {
  let bestIdx = -1, bestAdv = -1;
  for (let i = 0; i < NS; i++) {
    const p = pos.b[i];
    if (!p || p.o !== o || p.pr || p.t === 'K' || p.t === 'G') continue;
    const adv = o === SENTE ? R-1-rowOf(i) : rowOf(i);
    if (adv > bestAdv) { bestAdv = adv; bestIdx = i; }
  }
  if (bestIdx < 0) return false;
  pos.b[bestIdx] = { ...pos.b[bestIdx], pr:true };
  popText(bestIdx, '成', 'promo');
  return true;
}

/* ============================================================
   決着
   ============================================================ */
function finish(winner, how) {
  busy = true; render();

  if (mode === 'versus') {
    if (how === 'king' && cheatDeath(other(winner))) return;
    sfx.clear();
    match.wins[winner]++;
    const w = match.wins;
    const score = `▲ ${w.s} — ${w.g} △`;
    const why = how === 'king' ? '玉を取った。' : '指せる手が無くなった。';
    if (w.s >= 2 || w.g >= 2) {
      const champ = w.s > w.g ? match.s : match.g;
      const mark  = w.s > w.g ? '▲' : '△';
      showOverlay(`${mark} ${champ.name} の勝利`, `${score}\n2本先取で決着。`, [
        ['同じ組み合わせでもう一番', () => startMatch(match.s, match.g, match.cpu)],
        ['編成を選び直す', openSetup],
        ['タイトルへ', toTitle],
      ], 'MATCH END');
    } else {
      showOverlay(`第${match.game}局  ${winner === SENTE ? '▲' : '△'}の勝ち`,
        `${why}\n${score}\n先に2勝した方が勝ちです。`, [
        ['次の局へ', () => { match.game++; startVersus(); }],
        ['タイトルへ', toTitle],
      ], `GAME ${match.game}`);
    }
    return;
  }

  if (winner === GOTE) {
    if (cheatDeath(SENTE)) return;
    return runOver();
  }

  // --- 突破 ---
  const pool = {};
  for (const t in pos.h.s) if (t !== 'K' && pos.h.s[t]) pool[t] = (pool[t]||0) + pos.h.s[t];
  for (let i = 0; i < NS; i++) {
    const p = pos.b[i];
    if (p && p.o === SENTE && p.t !== 'K') pool[p.t] = (pool[p.t]||0) + 1;
  }
  const bonus = [];
  if (ab(SENTE,'sweep')) {
    let n = 0;
    for (let i = 0; i < NS; i++) { const p = pos.b[i]; if (p && p.o === GOTE && p.t !== 'K') { pool[p.t] = (pool[p.t]||0)+1; n++; } }
    if (n) bonus.push(`総取り +${n}`);
  }
  if (ab(SENTE,'spoils')) {
    let n = 0;
    for (const t in floorState.captured) { pool[t] = (pool[t]||0) + floorState.captured[t]; n += floorState.captured[t]; }
    if (n) bonus.push(`戦利品 +${n}`);
  }
  if (how === 'strip' && ab(SENTE,'massacre')) {
    let n = 0;
    for (const t in floorState.captured) { const c = floorState.captured[t]*2; pool[t] = (pool[t]||0) + c; n += c; }
    if (n) bonus.push(`皆殺し +${n}`);
  }
  if (ab(SENTE,'interest')) {
    const total = Object.values(pool).reduce((a,b)=>a+b,0);
    const add = Math.ceil(total/4);
    pool.P = (pool.P||0) + add;
    bonus.push(`利息 +${add}`);
  }
  if (ab(SENTE,'smelt')) {
    const melt = Math.floor((pool.P||0) / 3);
    if (melt) { pool.P -= melt*3; pool.S = (pool.S||0) + melt; bonus.push(`鋳潰し 歩${melt*3}→銀${melt}`); }
  }
  const before = Object.values(run.pool).reduce((a,b)=>a+b,0);
  const after  = Object.values(pool).reduce((a,b)=>a+b,0);
  run.pool = pool;

  const mult = scoreMult() * (how === 'strip' && ab(SENTE,'hunter') ? 2 : 1);
  const spare = Math.max(0, floorState.movesLeft);
  const swiftMult = (ab(SENTE,'swift') ? 2 : 1) * (how === 'king' && ab(SENTE,'decap') ? 2 : 1);
  const swift = spare * 300 * run.floor * swiftMult * mult;
  const clearScore = addScore((2000 * run.floor + 1200 * run.floor * ab(SENTE,'warChest')) * mult + swift);
  sfx.clear(); shake(2);
  bonus.unshift(how === 'strip' ? '狩り尽くし' : how === 'king' ? '斬首' : '敵は動けなくなった');
  if (spare) bonus.splice(1, 0, `速攻 残${spare}手 +${Math.round(swift).toLocaleString('ja-JP')}`);

  const body = `手駒 ${before} → ${after}    +${clearScore.toLocaleString('ja-JP')}点`
    + (bonus.length ? '\n' + bonus.join('   ') : '');
  const rank = clearRank(floorState.budget ? spare / floorState.budget : 0, floorState.bestChain || run.comboBest);
  showOverlay(`${run.floor}階 突破`, body, [
    ['能力を選ぶ', () => openDraft(() => { run.floor++; floorTransition(run.floor, startFloor); },
        'CLEAR ' + String(run.floor).padStart(2, '0'), `${run.floor}階の戦利`)],
    ['撤退して編成を保存', () => openPresets('save')],
  ], 'CLEAR ' + String(run.floor).padStart(2, '0'), rank);
}

function restoreKing(o) {
  const home = o === SENTE ? 22 : 2;
  let spot = home;
  if (pos.b[spot] || pos.blocked.has(spot)) {
    const order = o === SENTE ? [...Array(NS).keys()].reverse() : [...Array(NS).keys()];
    for (const i of order) if (!pos.b[i] && !pos.blocked.has(i)) { spot = i; break; }
  }
  pos.b[spot] = { t:'K', o, pr:false };
  pos.turn = o; busy = false;
  return spot;
}

const reviveStock = o => (mode === 'solo' ? run.reviveLeft : floorState.reviveLeft[o]);
function spendRevive(o) {
  if (mode === 'solo') run.reviveLeft--;
  else floorState.reviveLeft[o]--;
}

/* 玉を取られた側が生き延びられるか。身代わり(歩1枚)→影武者(持ち駒半減)の順に試す */
function cheatDeath(o) {
  if (ab(o,'sacrifice') && pos.h[o].P > 0) {
    pos.h[o].P--;
    sfx.revive(); shake(1.8);
    const spot = restoreKing(o);
    popText(spot, '身代わり', 'mark');
    announce('sacrifice', `歩を1枚失って助かった(残り${pos.h[o].P}枚)`);
    setLog(`歩が1枚、玉の代わりに落ちた。(残り${pos.h[o].P}枚)`);
    render();
    maybeCpuMove();
    return true;
  }
  if (reviveStock(o) > 0) {
    spendRevive(o);
    sfx.revive(); shake(2.4);
    const half = {};
    for (const t in pos.h[o]) { const n = Math.floor(pos.h[o][t]/2); if (n) half[t] = n; }
    pos.h[o] = half;
    const spot = restoreKing(o);
    if (o === SENTE) { floorState.combo = 0; showCombo(0); }
    popText(spot, '影武者', 'revive');
    announce('revive', `復活した(残り${reviveStock(o)})`);
    setLog(`影武者が身代わりに立った。持ち駒は半分になった。(残り${reviveStock(o)})`);
    render();
    maybeCpuMove();
    return true;
  }
  return false;
}

function runOver() {
  sfx.dead(); shake(2); flashScreen('hard');
  const reached = run.floor;
  const best = Math.max(reached, Number(localStorage.getItem(BEST_KEY) || 0));
  const bestScore = Math.max(run.score, Number(localStorage.getItem(SCORE_KEY) || 0));
  const isNewScore = run.score >= bestScore && run.score > 0;
  try { localStorage.setItem(BEST_KEY, String(best)); localStorage.setItem(SCORE_KEY, String(bestScore)); } catch (e) {}
  showOverlay('討ち死に',
    `到達 ${reached}階   最高連鎖 ×${run.comboBest}\nスコア ${run.score.toLocaleString('ja-JP')}`
    + (isNewScore ? '   自己新!' : `\n最高 ${bestScore.toLocaleString('ja-JP')}`)
    + '\n持ち駒はすべて失われた。', [
    ['もう一度潜る', startRun],
    ['タイトルへ', toTitle],
  ], 'SIGNAL LOST ' + String(reached).padStart(2, '0'));
}

/* ============================================================
   能力ドラフト
   ============================================================ */
function draftPool() {
  const my = sideAb[SENTE];
  return ABILITIES.filter(a => {
    if (a.req && !my[a.req]) return false;
    if (a.pick && (my[a.id] || 0) >= 3) return false;
    // 数値が積み上がるものだけ重ね取りを許す
    const STACKABLE = ['tax','tax2','greed','snowball','extraTurn2','revive2','tribute',
                       'warChest','budget','budget2','comboKeep','vanguard','collapseGuard'];
    if (!a.pick && !STACKABLE.includes(a.id) && my[a.id]) return false;
    if (STACKABLE.includes(a.id) && my[a.id] >= 3) return false;
    return true;
  });
}
function rollChoices(n = 3, only = null) {
  const pool = draftPool().filter(a => !only || only.includes(a.id));
  const picked = [];
  const legendBoost = Math.min(3, 1 + run.floor * 0.12);
  const weight = a => (a.r === 1 ? 100 : a.r === 2 ? 38 : 9 * legendBoost);
  const avail = pool.slice();
  while (picked.length < n && avail.length) {
    let total = 0; for (const a of avail) total += weight(a);
    let x = Math.random() * total, k = 0;
    for (; k < avail.length; k++) { x -= weight(avail[k]); if (x <= 0) break; }
    picked.push(avail.splice(Math.min(k, avail.length-1), 1)[0]);
  }
  return picked;
}


/* 効果の図解。エンジンに実際に問い合わせて「その能力で増える動き」を差分で出す。
   能力を追加しても図が自動的に正しくなる。 */
const DIAG_PIECE = {
  pawnRun:{t:'P'}, pawnDiag:{t:'P'}, tokinPlus:{t:'P',pr:true},
  silverWide:{t:'S'}, silverBack:{t:'S'},
  knightBack:{t:'N'}, knightFar:{t:'N'},
  lanceBack:{t:'L'}, kingRun:{t:'K'}, goldKing:{t:'G'},
  rookDragon:{t:'R'}, bishopHorse:{t:'B'},
};
function movesFor(abil, spec) {
  const saved = sideAb;
  sideAb = { s: abil, g: {} };
  const p = { b:new Array(NS).fill(null), blocked:new Set(), h:{ s:{}, g:{} }, turn:SENTE };
  p.b[12] = { t:spec.t, o:SENTE, pr:!!spec.pr };
  const r = new Set(targets(p, 12));
  sideAb = saved;
  return r;
}
function diagramSVG(id) {
  const spec = DIAG_PIECE[id];
  const cell = 15, pad = 1;
  const box = (i, cls) => {
    const x = pad + (i % C) * cell, y = pad + ((i / C) | 0) * cell;
    return `<rect class="${cls}" x="${x + 3}" y="${y + 3}" width="${cell - 6}" height="${cell - 6}"/>`;
  };
  let marks = '', glyph = '';
  if (spec) {
    const base = movesFor({}, spec), add = movesFor({ [id]:1 }, spec);
    for (const i of add) marks += box(i, base.has(i) ? 'd-base' : 'd-new');
    glyph = `<text class="d-pc" x="${pad + 2*cell + cell/2}" y="${pad + 2*cell + cell/2}"
      text-anchor="middle" dominant-baseline="central">${spec.pr ? PGLYPH[spec.t] : GLYPH[spec.t]}</text>`;
  } else if (id === 'zone2') {
    for (let i = 0; i < C; i++) marks += box(i, 'd-base');
    for (let i = C; i < C*2; i++) marks += box(i, 'd-new');
  } else if (id === 'nifuOk') {
    for (const i of [2, 7, 17]) marks += box(i, 'd-new');
    glyph = `<text class="d-pc" x="${pad + 2*cell + cell/2}" y="${pad + 2*cell + cell/2}"
      text-anchor="middle" dominant-baseline="central">歩</text>`;
  } else if (id === 'fortress') {
    for (const i of [6,7,8,11,13,16,17,18]) marks += box(i, 'd-new');
    glyph = `<text class="d-pc" x="${pad + 2*cell + cell/2}" y="${pad + 2*cell + cell/2}"
      text-anchor="middle" dominant-baseline="central">玉</text>`;
  } else return '';

  let grid = '';
  for (let i = 0; i <= C; i++) {
    grid += `<line class="d-grid" x1="${pad}" y1="${pad+i*cell}" x2="${pad+C*cell}" y2="${pad+i*cell}"/>`;
    grid += `<line class="d-grid" x1="${pad+i*cell}" y1="${pad}" x2="${pad+i*cell}" y2="${pad+R*cell}"/>`;
  }
  return `<svg class="ac-diag" viewBox="0 0 ${pad*2+C*cell} ${pad*2+R*cell}">${grid}${marks}${glyph}</svg>`;
}

/* 能力カードの中身。稀少度・分類・名前・読み・効果を決まった位置に置く */
function abilityCard(a, i) {
  const rank = ['', '並', '希', '極'][a.r];
  return (
    `<span class="ac-top">` +
      `<span class="ac-badge">${rank}</span>` +
      `<span class="ac-cat">${catOf(a.id)}</span>` +
      `<span class="ac-no">${String(i+1).padStart(2,'0')}</span>` +
    `</span>` +
    `<span class="ac-body">` +
      `<span class="ac-text">` +
        `<span class="ac-name">${a.n}</span>` +
        `<span class="ac-yomi">${yomi(a.id)}</span>` +
      `</span>` +
      diagramSVG(a.id) +
    `</span>` +
    `<span class="ac-desc">${a.d}</span>`
  );
}

let afterDraft = null;
function openDraft(next, tag, note, only) {
  hideOverlay();
  const choices = rollChoices(3, only);
  if (!choices.length) { next(); return; }      // 引ける能力が尽きたら素通し
  afterDraft = next;
  const box = $('draft-choices');
  box.innerHTML = '';
  $('draft-tag').textContent = (tag || 'SEARCH');
  $('draft-head').textContent = (note ? note + '  /  ' : '') + `FOUND ${choices.length} / PICK 1`;
  choices.forEach((a, i) => {
    const card = document.createElement('button');
    card.className = 'draft-choice r' + a.r;
    card.style.setProperty('--i', i);
    card.innerHTML = abilityCard(a, i);
    card.addEventListener('click', () => {
      if (box.classList.contains('locked')) return;   // 二重選択を防ぐ
      box.classList.add('locked');
      card.classList.add('chosen');
      [...box.children].forEach(c => { if (c !== card) c.classList.add('dimmed'); });
      sfx.ui();
      setTimeout(() => takeAbility(a), 380);
    });
    box.appendChild(card);
  });
  box.classList.remove('locked');
  // 稀少度に応じた音で一枚ずつ配る
  if (!motionCalm) choices.forEach((a, i) => setTimeout(() => sfx.power(a.r), 90 + i * 110));
  $('draft').classList.remove('hidden');
}
function takeAbility(a) {
  const my = sideAb[SENTE];
  my[a.id] = (my[a.id] || 0) + 1;
  if (a.pick) a.pick(run);
  if (a.id === 'revive')  run.reviveLeft += 1;
  if (a.id === 'revive2') run.reviveLeft += 1;
  sfx.pick(a.r);
  $('draft').classList.add('hidden');
  const next = afterDraft;
  afterDraft = null;
  if (next) next();
}
function openAbilityList(side) {
  const box = $('ability-list');
  box.innerHTML = '';
  const who = side || SENTE;
  const my = sideAb[who];
  const head = $('ability-modal').querySelector('.tag');
  if (head) head.textContent = mode === 'versus'
    ? (who === myView() ? '自分の能力' : '相手の能力') : 'abilities';
  for (const id of Object.keys(my)) {
    const a = ABI_BY_ID[id]; if (!a || !my[id]) continue;
    const row = document.createElement('div');
    row.className = 'ability-row r' + a.r;
    row.innerHTML =
      `<span class="da-main">` +
        `<span class="da-head"><span class="da-badge">${RARITY[a.r]}</span>` +
        `<span class="da-cat">${catOf(id)}</span></span>` +
        `<b>${a.n}${my[id]>1 ? ' ×'+my[id] : ''}</b>` +
        `<span class="da-yomi">${yomi(id)}</span>` +
        `<span class="da-desc">${a.d}</span>` +
      `</span>` + diagramSVG(id);
    box.appendChild(row);
  }
  $('ability-modal').classList.remove('hidden'); sfx.ui();
}
$('ability-close').addEventListener('click', () => $('ability-modal').classList.add('hidden'));

/* ============================================================
   オーバーレイ / 画面
   ============================================================ */
function showOverlay(title, body, actions, tag = 'RESULT', rank = null) {
  $('overlay-tag').textContent = tag;
  const rk = $('overlay-rank');
  if (rank) {
    rk.classList.remove('hidden', 's', 'c');
    if (rank === 'S') rk.classList.add('s');
    if (rank === 'C') rk.classList.add('c');
    $('rank-letter').textContent = rank;
  } else rk.classList.add('hidden');
  $('overlay-title').textContent = title;
  $('overlay-body').textContent = body;
  const box = $('overlay-actions');
  box.innerHTML = '';
  actions.forEach(([label, fn], i) => {
    const b = document.createElement('button');
    b.className = 'btn' + (i === 0 ? ' primary' : '');
    b.textContent = label;
    b.addEventListener('click', fn);
    box.appendChild(b);
  });
  $('overlay').classList.remove('hidden');
}
const hideOverlay = () => $('overlay').classList.add('hidden');

function toTitle() {
  gen++;
  busy = false;
  $('btn-presets-back').classList.remove('danger');
  ['game','setup','presets','deck','tutorial'].forEach(id => $(id).classList.add('hidden'));
  $('title').classList.remove('hidden');
  showBest();
}
function toGame() {
  ['title','setup','presets','deck','tutorial'].forEach(id => $(id).classList.add('hidden'));
  $('game').classList.remove('hidden');
}
function showBest() {
  const f = Number(localStorage.getItem(BEST_KEY) || 0);
  const s = Number(localStorage.getItem(SCORE_KEY) || 0);
  $('best-record').textContent = f ? `最高到達 ${f}階   最高スコア ${s.toLocaleString('ja-JP')}` : '';
  showRoute();
}

/* このゲームの本筋は「潜って持ち帰った編成で対戦する」こと。
   持ち帰りがあるかどうかで、タイトルの主役を潜るか対戦かに振り替える。 */
function showRoute() {
  const saved = loadPresets().filter(Boolean);
  const vs = $('btn-versus');
  vs.querySelector('.mi-sub').textContent =
      saved.length === 0 ? '既定編成で遊べます。潜れば自分の編成で戦えます'
    : saved.length === 1 ? `${saved[0].name}で戦う`
    :                      `${saved[0].name}ほか${saved.length - 1}件で戦う`;
  // 持ち帰りがあれば対戦も主役に上げる(潜る→対戦がこのゲームの本筋)
  vs.classList.toggle('primary', saved.length > 0);
  $('btn-presets').querySelector('.mi-sub').textContent =
    saved.length ? `持ち帰った編成 ${saved.length} / ${SLOTS}` : 'まだ何も持ち帰っていない';
}

/* ---------- プリセット ---------- */
let presetMode = 'view', pendingSlot = -1, abandonArmed = false;
function poolText(pool) {
  const s = HAND_ORDER.filter(t => pool[t]).map(t => NAME[t] + (pool[t] > 1 ? '×'+pool[t] : '')).join(' ');
  return s || 'なし';
}
function saveToSlot(i) {
  const d = loadPresets();
  d[i] = {
    name: `${run.floor}階の編成`,
    floor: run.floor, score: run.score,
    pool: { ...run.pool }, abilities: { ...run.abilities },
  };
  savePresets(d);
  sfx.clear();
  presetMode = 'saved';
  openPresets('saved', i);
}

let presetOpen = -1;            // いま中身を開いている枠

/* 編成の中身。何を持ち帰ったのかは、ここで全部見せる */
function presetBody(p) {
  const value = HAND_ORDER.reduce((s, t) => s + VAL[t] * (p.pool[t] || 0), 0);
  const chips = HAND_ORDER.filter(t => p.pool[t])
    .map(t => `<span class="ap"><b>${NAME[t]}</b>${p.pool[t] > 1 ? `<i>${p.pool[t]}</i>` : ''}</span>`).join('');

  const ids = Object.keys(p.abilities || {});
  const rows = ids
    .sort((a, b) => (ABI_BY_ID[b].r - ABI_BY_ID[a].r) || a.localeCompare(b))
    .map(id => {
      const a = ABI_BY_ID[id];
      if (!a) return '';
      const n = p.abilities[id];
      const vs = VS_OK.has(id);
      return `<div class="pb-ab r${a.r}${vs ? '' : ' solo-only'}">
        <span class="pb-r">${RARITY[a.r]}</span>
        <span class="pb-n"><b>${a.n}</b>${n > 1 ? `<i>×${n}</i>` : ''}
          <span class="pb-y">${yomi(id)}</span></span>
        <span class="pb-tag">${vs ? catOf(id) : '潜行のみ'}</span>
        <span class="pb-d">${a.d}${DIAG_PIECE[id] ? diagramSVG(id) : ''}</span>
      </div>`;
    }).join('');

  const usable = ids.filter(id => VS_OK.has(id)).length;
  return `<div class="preset-body">
    <p class="pb-head"><span>駒</span><b>${poolTotal(p.pool)}枚 / 価値 ${value.toLocaleString('ja-JP')}</b></p>
    <div class="pb-pieces">${chips}</div>
    <p class="pb-head"><span>能力</span><b>${ids.length}個${
      usable < ids.length ? ` / 対戦で使えるのは ${usable}個` : ''}</b></p>
    <div class="pb-abils">${rows || '<span class="ap-none">能力なし</span>'}</div>
    <p class="pb-note">対戦に持ち込むときは、この中から<b>駒10枚</b>と、
      <b>能力は予算10・枠5まで</b>を選びます。持ち帰った能力の値は 並1 / 希2 / 極5。</p>
  </div>`;
}

function openPresets(m, savedIdx = -1, keepOpen = false) {
  presetMode = m;
  pendingSlot = -1; abandonArmed = false;
  ['title','game','setup','deck'].forEach(id => $(id).classList.add('hidden'));
  $('presets').classList.remove('hidden');
  const data = loadPresets();
  const have = data.filter(Boolean).length;

  $('presets-tag').innerHTML =
    (m === 'save' ? 'RETREAT / SAVE' : m === 'saved' ? 'SAVED' : 'UNITS');
  $('presets-title').textContent =
    m === 'save' ? '編成を保存' : m === 'saved' ? '保存しました' : '保存した編成';
  $('presets-hint').textContent =
    m === 'save'  ? '枠を選ぶと、いまの持ち駒と能力ごと保存してランを終えます。'
  : m === 'saved' ? `枠${savedIdx+1}に保存しました。このまま対戦に持ち込めます。`
  : have          ? '押すと中身が開きます。選んだ編成でそのまま対戦へ。'
  :                 'まだ何もありません。潜って撤退すると、そのときの駒と能力ごと残せます。';
  $('btn-presets-back').querySelector('b').textContent =
    m === 'save' ? '保存せずに終える' : '戻る';

  // 開く枠。保存直後はその枠、ふだんは最初の1件。
  // 開け閉めの再描画では、いま開いている枠をそのまま引き継ぐ
  if (!keepOpen) {
    presetOpen = m === 'save' ? -1
      : savedIdx >= 0 ? savedIdx
      : data.findIndex(Boolean);
  }

  const list = $('preset-list');
  list.innerHTML = '';
  for (let i = 0; i < SLOTS; i++) {
    const p = data[i];
    const wrap = document.createElement('div');
    wrap.className = 'preset-row' + (p && i === presetOpen ? ' open' : '');

    const row = document.createElement('button');
    row.className = 'preset' + (p ? '' : ' empty') + (i === savedIdx ? ' just-saved' : '');
    row.innerHTML = `<span class="pslot">${String(i+1).padStart(2,'0')}</span>` + (p
      ? `<span class="pmain"><b>${p.name}</b>
           <span class="pmeta">${p.floor || '?'}階到達 / ${(p.score||0).toLocaleString('ja-JP')}点 / 駒${poolTotal(p.pool)}枚 / 能力${Object.keys(p.abilities||{}).length}個</span></span>
         <span class="pmore">${m === 'save' ? '' : (i === presetOpen ? 'とじる' : '中身')}</span>`
      : `<span class="pmain"><b>空き枠</b><span class="pmeta">${
          m === 'save' ? 'ここに保存する' : '潜って撤退すると、ここに残せます'}</span></span>`);

    if (m === 'save') {
      row.addEventListener('click', () => {
        if (!p || pendingSlot === i) return saveToSlot(i);
        pendingSlot = i;
        [...list.querySelectorAll('.preset')].forEach(c => c.classList.remove('confirm'));
        row.classList.add('confirm');
        row.querySelector('.pmain b').textContent = 'もう一度押すと上書き';
      });
    } else if (p) {
      row.addEventListener('click', () => {           // 開いた枠が、そのまま対戦に持ち込む枠になる
        sfx.ui();
        presetOpen = (presetOpen === i) ? -1 : i;
        openPresets(presetMode, savedIdx, true);
      });
    }
    wrap.appendChild(row);
    if (p && i === presetOpen && m !== 'save') {
      wrap.insertAdjacentHTML('beforeend', presetBody(p));
    }
    list.appendChild(wrap);
  }

  // 開いている編成をそのまま対戦へ(ここが本筋の合流点)
  const go = presetOpen >= 0 && data[presetOpen] ? presetOpen : -1;
  const btn = $('btn-presets-versus');
  btn.classList.toggle('hidden', m === 'save' || go < 0);
  if (go >= 0) {
    $('pv-sub').textContent = `${data[go].name} — 能力が安く積めます`;
    btn.onclick = () => { sfx.ui(); openSetup('s' + go); };
  }
}

$('btn-presets-back').addEventListener('click', () => {
  const b = $('btn-presets-back').querySelector('b');
  if (presetMode === 'save' && !abandonArmed) {
    abandonArmed = true;
    b.textContent = '本当に破棄する？';
    $('btn-presets-back').classList.add('danger');
    return;
  }
  toTitle();
});

/* ---------- 対戦セットアップ ---------- */
/* 既定編成。駒の合計価値をおおよそ揃えたうえで、噛み合いが変わるように能力を振ってある */
/* 既定編成。駒はどれも10枚、能力は予算10ぶん(修得割引なし)で組んである */
const BUILTIN = [
  { id:'b0', name:'均衡',   note:'素直に強い。迷ったらこれ',
    pool:{ G:1, S:2, N:1, L:1, P:5 }, abilities:{ silverWide:1, nifuOk:1, kingRun:1, pawnDiag:1, silverBack:1 } },
  { id:'b1', name:'急襲隊', note:'数で押す。歩が2マス進み、桂が前後に跳ぶ',
    pool:{ S:1, N:2, L:2, P:5 }, abilities:{ pawnRun:1, knightBack:1, knightFar:1 } },
  { id:'b2', name:'重装',   note:'大駒中心。一撃が重く、金が玉の動きをする',
    pool:{ R:1, B:1, G:1, P:7 }, abilities:{ goldKing:1, zone2:1, kingRun:1 } },
  { id:'b3', name:'搦手',   note:'二歩御免と歩兵突撃で歩が牙を剥く',
    pool:{ S:1, N:2, L:2, P:5 }, abilities:{ nifuOk:1, pawnDiag:1, promoteChain:1, silverBack:1 } },
  { id:'b4', name:'城塞',   note:'玉の周りに敵を寄せつけず、粘り強い',
    pool:{ G:2, S:2, P:6 }, abilities:{ fortress:1, silverWide:1, recycle:1, lanceBack:1 } },
];
for (const b of BUILTIN) {
  for (const id of Object.keys(b.abilities)) if (!VS_OK.has(id)) delete b.abilities[id];
}
const STANDARD = BUILTIN[0];
let lastVersus = { s:STANDARD, g:STANDARD };
let match = null;
function fillSelect(sel) {
  sel.innerHTML = '';
  const saved = loadPresets();
  // このゲームの主役は「潜って持ち帰った編成で戦う」ことなので先頭に置く
  if (saved.some(Boolean)) {
    const g = document.createElement('optgroup');
    g.label = '★ 持ち帰った編成 — 能力が安く積める';
    saved.forEach((p, i) => {
      if (!p) return;
      const o = document.createElement('option');
      o.value = 's' + i;
      o.textContent = `${p.name} — ${poolTotal(p.pool)}枚から10枚 / ${p.floor || '?'}階`;
      g.appendChild(o);
    });
    sel.appendChild(g);
  }
  const made = document.createElement('optgroup');
  made.label = saved.some(Boolean) ? '既定編成 — 駒は固定' : '既定編成';
  BUILTIN.forEach((b, i) => {
    const o = document.createElement('option');
    o.value = 'b' + i;
    o.textContent = `${b.name} — ${poolText(b.pool)}`;
    made.appendChild(o);
  });
  sel.appendChild(made);
}
/* 最初に選ばせたい編成。持ち帰ったものがあればそれを既定にする */
function defaultSide(skip) {
  const saved = loadPresets();
  for (let i = 0; i < saved.length; i++) if (saved[i] && 's'+i !== skip) return 's' + i;
  return skip === 'b0' ? 'b1' : 'b0';
}
function pickSide(sel) {
  const v = sel.value || 'b0';
  if (v[0] === 'b') return BUILTIN[Number(v.slice(1))] || STANDARD;
  const p = loadPresets()[Number(v.slice(1))];
  return p
    ? { name:p.name, pool:p.pool, abilities:p.abilities || {}, editable:true,
        note:`潜って持ち帰った${poolTotal(p.pool)}枚から選べます` }
    : STANDARD;
}
/* ============================================================
   デッキ構築
   ============================================================ */
let deckEdit = null, deckFilter = null, deckStep = 'pieces';

const poolTotal = pool => Object.values(pool).reduce((a,b) => a+b, 0);

/* 価値の高い順に10枚まで自動で選ぶ */
function autoPieces(src) {
  const picked = {};
  const flat = [];
  for (const t of HAND_ORDER) for (let i = 0; i < (src[t]||0); i++) flat.push(t);
  flat.sort((a,b) => VAL[b] - VAL[a]);
  for (const t of flat.slice(0, DECK_PIECES)) picked[t] = (picked[t]||0) + 1;
  return picked;
}

/* おまかせ。修得済みを厚めに引きつつ毎回ばらけるよう、重み付きで抽選する。
   最後に余った予算は安いもので埋めて必ず使い切る。 */
function autoAbilities(pool0, dive) {
  const chosen = {};
  const weight = a => (a.r === 3 ? 1 : a.r === 2 ? 2 : 3);
  const pool = pool0.filter(a => !a.req);
  const fits = (id) => {
    if (chosen[id] || Object.keys(chosen).length >= DECK_SLOTS) return false;
    return deckCost({ ...chosen, [id]:1 }, dive) <= DECK_BUDGET;
  };
  for (let guard = 0; guard < 60; guard++) {
    const avail = pool.filter(a => fits(a.id));
    if (!avail.length) break;
    let total = 0; for (const a of avail) total += weight(a);
    let x = Math.random() * total, k = 0;
    for (; k < avail.length - 1; k++) { x -= weight(avail[k]); if (x <= 0) break; }
    chosen[avail[k].id] = 1;
    // 前提つき(影武者衆)は親を取った直後に抽選対象へ
    for (const dep of pool0)
      if (dep.req === avail[k].id && Math.random() < 0.5 && fits(dep.id)) chosen[dep.id] = 1;
  }
  return chosen;
}

function openDeck(side, src, next) {
  const dive = !!src.editable;                  // 潜って持ち帰った編成か
  const earned = {};
  for (const id in (src.abilities || {})) if (VS_OK.has(id)) earned[id] = 1;
  // 潜った編成は修得したものだけ。既定編成は全部から選べる
  const choosable = dive ? VS_ABILITIES.filter(a => earned[a.id]) : VS_ABILITIES;
  deckFilter = null;
  deckStep = 'pieces';
  deckEdit = {
    side, src, next, earned, dive, choosable,
    fixed: !dive,                               // 既定編成は駒を固定
    available: { ...src.pool },
    pieces: dive ? autoPieces(src.pool) : { ...src.pool },
    abilities: autoAbilities(choosable, dive),
  };
  ['title','game','setup','presets'].forEach(id => $(id).classList.add('hidden'));
  $('deck').classList.remove('hidden');
  $('deck-tag').textContent = `DECK ${side === SENTE ? '▲ SENTE' : '△ GOTE'}`;
  $('deck-title').innerHTML =
    `<span class="dt-side">${side === SENTE ? '▲ 先手' : '△ 後手'}</span>` +
    `<span class="dt-name">${src.name}</span>`;
  $('deck-piece-hint').textContent = deckEdit.fixed
    ? '既定編成の駒は固定です。能力だけ組み替えられます。'
    : '潜って持ち帰った駒から10枚を選びます。';
  renderDeck();
}

function renderDeck() {
  const d = deckEdit;
  const total = poolTotal(d.pieces);
  $('deck-piece-count').textContent = `${total} / ${DECK_PIECES}`;
  $('deck-piece-count').classList.toggle('over', total !== DECK_PIECES);

  const value = HAND_ORDER.reduce((v, t) => v + VAL[t] * (d.pieces[t] || 0), 0);
  $('deck-piece-value').textContent = `価値 ${value.toLocaleString('ja-JP')}`;
  $('deck-quick').classList.toggle('hidden', d.fixed);

  const box = $('deck-pieces');
  box.innerHTML = '';
  for (const t of HAND_ORDER) {
    const have = d.available[t] || 0;
    if (!have) continue;
    const got = d.pieces[t] || 0;
    const row = document.createElement('div');
    row.className = 'deck-piece' + (got ? ' on' : '');
    row.innerHTML = `<span class="dp-name">${NAME[t]}</span>` +
      `<span class="dp-count">${got}<i> / ${have}</i></span>`;
    if (!d.fixed) {
      const minus = document.createElement('button');
      minus.className = 'dp-btn'; minus.textContent = '−';
      minus.addEventListener('click', () => {
        if (d.pieces[t]) { d.pieces[t]--; if (!d.pieces[t]) delete d.pieces[t]; renderDeck(); }
      });
      const plus = document.createElement('button');
      plus.className = 'dp-btn'; plus.textContent = '＋';
      plus.addEventListener('click', () => {
        if ((d.pieces[t]||0) < have && poolTotal(d.pieces) < DECK_PIECES) {
          d.pieces[t] = (d.pieces[t]||0) + 1; renderDeck();
        }
      });
      row.append(minus, plus);
    }
    box.appendChild(row);
  }

  const cost = deckCost(d.abilities, d.dive);
  const slots = Object.keys(d.abilities).length;
  $('deck-cost').innerHTML =
    `コスト <b class="${cost >= DECK_BUDGET ? 'full' : ''}">${cost}</b> / ${DECK_BUDGET}` +
    `　枠 <b class="${slots >= DECK_SLOTS ? 'full' : ''}">${slots}</b> / ${DECK_SLOTS}`;
  const meter = $('deck-meter');
  meter.innerHTML = '';
  for (let i = 0; i < DECK_BUDGET; i++) {
    const b = document.createElement('b');
    if (i >= cost) b.className = 'spent';
    meter.appendChild(b);
  }

  // 分類の絞り込み
  const fbox = $('deck-filter');
  fbox.innerHTML = '';
  const cats = [...new Set(d.choosable.map(a => catOf(a.id)))];
  for (const c of [null, ...cats]) {
    const b = document.createElement('button');
    b.className = 'fchip' + (deckFilter === c ? ' on' : '');
    b.textContent = c === null ? 'すべて' : c;
    b.addEventListener('click', () => { deckFilter = c; sfx.ui(); renderDeck(); });
    fbox.appendChild(b);
  }

  const list = $('deck-abilities');
  list.innerHTML = '';
  // 選んだものを先頭に固定して、いま何を積んでいるかが常に見えるようにする
  const sorted = d.choosable.slice()
    .filter(a => d.abilities[a.id] || !deckFilter || catOf(a.id) === deckFilter)
    .sort((a, b) => {
      const sa = d.abilities[a.id] ? 1 : 0, sb = d.abilities[b.id] ? 1 : 0;
      if (sa !== sb) return sb - sa;
      const ea = d.earned[a.id] ? 1 : 0, eb = d.earned[b.id] ? 1 : 0;
      if (ea !== eb) return eb - ea;
      return a.r - b.r;
    });
  for (const a of sorted) {
    const on = !!d.abilities[a.id];
    const c = abCost(a, d.dive);
    const wouldCost = cost + c;
    const blockedReq = a.req && !d.abilities[a.req];
    const cannot = !on && (wouldCost > DECK_BUDGET || slots >= DECK_SLOTS || blockedReq);
    const row = document.createElement('button');
    row.className = `deck-ab r${a.r}` + (on ? ' on' : '') + (cannot ? ' off' : '');
    row.innerHTML =
      `<span class="da-tick">${on ? '■' : '□'}</span>` +
      `<span class="da-cost">${c}</span>` +
      `<span class="da-main">` +
        `<span class="da-head">` +
          `<span class="da-badge">${RARITY[a.r]}</span>` +
          `<span class="da-cat">${catOf(a.id)}</span>` +
          (d.dive ? `<span class="da-earned">修得</span>` : '') +
        `</span>` +
        `<b>${a.n}</b><span class="da-yomi">${yomi(a.id)}</span>` +
        `<span class="da-desc">${a.d}</span>` +
      `</span>` +
      diagramSVG(a.id);
    row.addEventListener('click', () => {
      if (on) {
        delete d.abilities[a.id];
        for (const dep of d.choosable)             // 前提を外したら依存も外す
          if (dep.req === a.id) delete d.abilities[dep.id];
      } else if (!cannot) d.abilities[a.id] = 1;
      renderDeck();
    });
    list.appendChild(row);
  }
  // 手順(駒 → 能力)の出し分け
  const onPieces = deckStep === 'pieces';
  $('deck-sec-pieces').classList.toggle('hidden', !onPieces);
  $('deck-sec-abils').classList.toggle('hidden', onPieces);
  $('btn-deck-auto').classList.toggle('hidden', onPieces && d.fixed);
  $('btn-deck-ok').querySelector('b').textContent = onPieces ? 'つぎへ' : '決　定';
  $('btn-deck-ok').querySelector('.mi-sub').textContent =
    onPieces ? '能力を選ぶ' : 'この編成で始める';
  const short = poolTotal(d.pieces) !== DECK_PIECES && !d.fixed;
  $('btn-deck-ok').classList.toggle('disabled', onPieces ? short : poolTotal(d.pieces) === 0);
  $('deck-step').textContent = onPieces ? '1 / 2　駒をえらぶ' : '2 / 2　能力をえらぶ';
}

$('btn-pc-auto').addEventListener('click', () => {
  if (deckEdit && !deckEdit.fixed) { deckEdit.pieces = autoPieces(deckEdit.available); sfx.ui(); renderDeck(); }
});
$('btn-pc-clear').addEventListener('click', () => {
  if (deckEdit && !deckEdit.fixed) { deckEdit.pieces = {}; sfx.ui(); renderDeck(); }
});
$('btn-deck-auto').addEventListener('click', () => {
  const d = deckEdit;
  sfx.ui();
  if (deckStep === 'pieces') { if (!d.fixed) d.pieces = autoPieces(d.available); }
  else d.abilities = autoAbilities(d.choosable, d.dive);
  renderDeck();
});
$('btn-deck-back').addEventListener('click', () => {
  if (deckStep === 'abils') { deckStep = 'pieces'; sfx.ui(); renderDeck(); }
  else openSetup();
});
$('btn-deck-ok').addEventListener('click', () => {
  const d = deckEdit;
  if (deckStep === 'pieces') {
    if (!d.fixed && poolTotal(d.pieces) !== DECK_PIECES) return;
    deckStep = 'abils'; sfx.ui(); renderDeck(); window.scrollTo(0, 0); return;
  }
  if (!poolTotal(d.pieces)) return;
  d.next({ name: d.src.name, pool: { ...d.pieces }, abilities: { ...d.abilities }, dive: d.dive });
});

/* 対戦画面で編成の中身を見せる。selectだけだと何が入っているか分からない */
function renderArmy(selId, piecesId, abilsId, noteId) {
  const src = pickSide($(selId));
  const pbox = $(piecesId), abox = $(abilsId);
  pbox.innerHTML = ''; abox.innerHTML = '';

  // 潜って持ち帰った編成が主役。何が違うのかをその場で言う
  const army = $(selId).closest('.army');
  army.classList.toggle('is-dive', !!src.editable);
  const head = army.querySelector('.army-head');
  let tag = head.querySelector('.army-tag');
  if (!tag) {                                   // 名前のすぐ隣に置く。選択肢の下に回すと目に入らない
    tag = document.createElement('span'); tag.className = 'army-tag';
    head.insertBefore(tag, head.querySelector('select'));
  }
  tag.className = 'army-tag' + (src.editable ? ' dive' : '');
  tag.textContent = src.editable ? '持ち帰った編成' : '既定編成';

  const shown = src.editable ? autoPieces(src.pool) : src.pool;
  let value = 0;
  for (const t of HAND_ORDER) {
    const n = shown[t] || 0;
    if (!n) continue;
    value += VAL[t] * n;
    const el = document.createElement('span');
    el.className = 'ap';
    el.innerHTML = `<b>${NAME[t]}</b>${n > 1 ? `<i>${n}</i>` : ''}`;
    pbox.appendChild(el);
  }
  const total = Object.values(shown).reduce((a, b) => a + b, 0);
  const sum = document.createElement('span');
  sum.className = 'ap-sum';
  sum.textContent = `${total}枚 / 価値 ${value.toLocaleString('ja-JP')}`;
  pbox.appendChild(sum);

  const abils = Object.keys(src.abilities || {}).filter(id => VS_OK.has(id));
  if (abils.length) {
    for (const id of abils) {
      const a = ABI_BY_ID[id];
      const el = document.createElement('span');
      el.className = 'chip r' + a.r;
      el.innerHTML = `<i>${RARITY[a.r]}</i>${a.n}`;
      abox.appendChild(el);
    }
  } else {
    abox.innerHTML = '<span class="ap-none">能力なし(編成画面で選べます)</span>';
  }
  showNote(selId, noteId);
}

function showNote(selId, noteId) {
  const src = pickSide($(selId));
  // 対戦で働かない能力(手数・スコア等)は挙げない
  const abNames = Object.keys(src.abilities || {})
    .filter(id => VS_OK.has(id))
    .map(id => ABI_BY_ID[id].n);
  // 持ち帰った能力のうち、対戦の盤に対応物が無いものは黙って消さずに数を言う
  const soloOnly = Object.keys(src.abilities || {}).filter(id => !VS_OK.has(id)).length;
  $(noteId).innerHTML = src.editable
    ? '駒を10枚に絞り、<b>修得ずみの能力だけ</b>を選びます。'
      + '既定編成より安く積めます(並1 / 希2 / 極5)。'
      + (soloOnly ? `<span class="note-ab">手数・得点まわりの${soloOnly}個は対戦の盤に出番がないので候補に出ません</span>` : '')
    : '駒は固定。能力は全種から選べますが値は張ります(並2 / 希4 / 極10)。'
      + (abNames.length ? `<span class="note-ab">初期の能力 ${abNames.join(' / ')}</span>` : '');
}
function openSetup(prefer) {
  ['title','game','presets','deck'].forEach(id => $(id).classList.add('hidden'));
  $('setup').classList.remove('hidden');
  fillSelect($('sel-sente')); fillSelect($('sel-gote'));
  $('sel-sente').value = prefer || defaultSide();
  $('sel-gote').value  = defaultSide($('sel-sente').value);
  applyVsMode();
  renderArmy('sel-sente', 'pieces-sente', 'abils-sente', 'note-sente');
  renderArmy('sel-gote', 'pieces-gote', 'abils-gote', 'note-gote');
}
$('sel-sente').addEventListener('change', () => { renderArmy('sel-sente','pieces-sente','abils-sente','note-sente'); sfx.ui(); });
$('sel-gote').addEventListener('change',  () => { renderArmy('sel-gote','pieces-gote','abils-gote','note-gote'); sfx.ui(); });
/* 先手→後手の順に編成させてから開始。CPU側は自動で組む */
let vsMode = 'cpu';        // cpu / hotseat / p2p / net

function applyVsMode() {
  const isNet = vsMode === 'p2p' || vsMode === 'net';
  $('net-box').classList.toggle('hidden', !isNet);
  // 後手の編成を選べるのは、この端末で2人が指すときだけ
  $('gote-pick').classList.toggle('hidden', vsMode !== 'hotseat');
  $('side-label').textContent = vsMode === 'hotseat' ? '▲ 先手' : '自分';
  $('setup-hint').innerHTML =
    vsMode === 'cpu'     ? '相手の編成はその場でランダムに決まります。先に2勝した方の勝ち。'
  : vsMode === 'hotseat' ? '同じ端末を渡しながら指します。両方の編成をここで選びます。'
  : vsMode === 'p2p'     ? '2台で同じ合言葉を入れます。<b>先手側が先にすすんで</b>ください。'
  :                        'serve.py で起動した端末どうしで繋ぎます。回線は使いません。';
  if (vsMode === 'p2p') {
    $('net-url').textContent = '';
    $('net-hint').textContent = 'ブラウザ同士を直接つなぎます。離れた場所とも遊べます。';
    netStatus('2台で同じ合言葉を入れてください。');
  } else if (vsMode === 'net') {
    $('net-url').textContent = location.origin.replace('localhost', '(この端末のIP)');
    $('net-hint').textContent = 'serve.py で起動している必要があります。';
    netStatus('同じWi-Fiの2台で、同じ合言葉を入れてください。');
  }
}
$('mode-menu').addEventListener('click', e => {
  const b = e.target.closest('.mode');
  if (!b) return;
  vsMode = b.dataset.mode;
  [...$('mode-menu').children].forEach(c => c.classList.toggle('on', c === b));
  sfx.ui();
  applyVsMode();
});

$('sel-sente').addEventListener('change', () => { renderArmy('sel-sente','pieces-sente','abils-sente','note-sente'); sfx.ui(); });
$('sel-gote').addEventListener('change',  () => { renderArmy('sel-gote','pieces-gote','abils-gote','note-gote'); sfx.ui(); });

/* 開始前に、両者の編成を見せる */
function showMatchup(a, b, then) {
  const box = $('matchup');
  const card = (side, d) => {
    const abils = Object.keys(d.abilities || {}).map(id => {
      const x = ABI_BY_ID[id];
      return `<span class="chip r${x.r}"><i>${RARITY[x.r]}</i>${x.n}</span>`;
    }).join('') || '<span class="ap-none">能力なし</span>';
    const pieces = HAND_ORDER.filter(t => d.pool[t]).map(t =>
      `<span class="ap"><b>${NAME[t]}</b>${d.pool[t] > 1 ? `<i>${d.pool[t]}</i>` : ''}</span>`).join('');
    const val = Object.entries(d.pool).reduce((v, [t, n]) => v + VAL[t]*n, 0);
    return `<div class="mu-side"><p class="mu-name"><span>${side}</span>${d.name}</p>` +
           `<div class="mu-pieces">${pieces}</div>` +
           `<p class="mu-val">${poolTotal(d.pool)}枚 / 価値 ${val.toLocaleString('ja-JP')}</p>` +
           `<div class="mu-abils">${abils}</div></div>`;
  };
  box.innerHTML = card('▲ 先手', a) + '<div class="mu-vs">対</div>' + card('△ 後手', b);
  box.classList.remove('hidden');
  sfx.clear();
  const go = () => { box.classList.add('hidden'); box.removeEventListener('click', go); then(); };
  box.addEventListener('click', go);
  setTimeout(go, 4200);            // 触らなくても進む
}

$('btn-setup-start').addEventListener('click', async () => {
  const srcS = pickSide($('sel-sente'));
  const srcG = vsMode === 'hotseat' ? pickSide($('sel-gote')) : null;
  const cpu = vsMode === 'cpu';

  const autoBuild = src => {
    const dive = !!src.editable;
    const earned = {};
    for (const id in (src.abilities || {})) if (VS_OK.has(id)) earned[id] = 1;
    const pool = dive ? VS_ABILITIES.filter(a => earned[a.id]) : VS_ABILITIES;
    return { name:src.name, pool: dive ? autoPieces(src.pool) : { ...src.pool },
             abilities: autoAbilities(pool.length ? pool : VS_ABILITIES, dive) };
  };
  // CPUの編成はその場でランダムに決める
  const randomFoe = () => {
    const b = BUILTIN[(Math.random() * BUILTIN.length) | 0];
    return autoBuild(b);
  };

  if (vsMode === 'p2p' || vsMode === 'net') {
    const room = ($('net-room').value || '').trim().toUpperCase();
    if (!room) { netStatus('合言葉を入れてください。', 'bad'); return; }
    net.room = room; net.seat = $('net-seat').value; net.token = netToken();
    net.mode = vsMode === 'p2p' ? 'p2p' : 'lan';
    netStatus('つないでいます…');
    if (net.mode === 'p2p') {
      try { await p2pConnect(room, net.seat); net.on = true; }
      catch (e) {
        const m = String(e.message);
        netStatus(
          m === 'room-taken' ? 'その合言葉は先手側が使っています。後手を選んでください。'
          : m === 'no-host'  ? '先手側が見つかりません。先に先手側ですすんでください。'
          : m === 'peerjs-missing' ? '通信部品を読み込めませんでした。'
          : '繋がりませんでした。合言葉と回線を確認してください。', 'bad');
        return;
      }
    } else {
      try {
        const r = await netCall(`/api/join?room=${encodeURIComponent(room)}&seat=${net.seat}&token=${net.token}`);
        if (!r.ok) { netStatus('その席は相手が使っています。', 'bad'); return; }
        net.on = true; net.since = r.count || 0;
        netStatus(`部屋「${room}」に入りました。`, 'good');
        netPoll();
      } catch (e) { netStatus('中継所に届きません。serve.py で起動してください。', 'bad'); return; }
    }
  } else { net.on = false; net.mode = 'lan'; }

  // 通信対戦は自分の側だけ組み、相手の編成は受け取る
  if (net.on) {
    openDeck(net.seat, srcS, async deck => {
      const foe = other(net.seat);
      netStatus('相手の編成を待っています…');
      let meta = null;
      if (net.mode === 'p2p') {
        p2p.pendingMeta = { [net.seat]: deck };
        p2pSend({ kind:'meta', payload: p2p.pendingMeta });
        for (let i = 0; i < 150 && !meta; i++) {
          if (p2p.meta && p2p.meta[foe]) meta = p2p.meta;
          else { p2pSend({ kind:'meta', payload: p2p.pendingMeta }); await new Promise(z => setTimeout(z, 600)); }
        }
      } else {
        await netCall('/api/meta', { room: net.room, meta: { [net.seat]: deck } }).catch(() => {});
        for (let i = 0; i < 120 && !meta; i++) {
          const r = await netCall(`/api/join?room=${encodeURIComponent(net.room)}&seat=${net.seat}&token=${net.token}`).catch(() => null);
          if (r && r.meta && r.meta[foe]) meta = r.meta;
          if (!meta) await new Promise(z => setTimeout(z, 700));
        }
      }
      const theirs = (meta && meta[foe]) || randomFoe();
      lastVersus = net.seat === SENTE ? { s:deck, g:theirs } : { s:theirs, g:deck };
      toGame();
      showMatchup(lastVersus.s, lastVersus.g, () => startMatch(lastVersus.s, lastVersus.g, false));
    });
    return;
  }

  openDeck(SENTE, srcS, deckS => {
    if (cpu) {
      lastVersus = { s:deckS, g:randomFoe() };
      toGame();
      return showMatchup(lastVersus.s, lastVersus.g, () => startMatch(lastVersus.s, lastVersus.g, true));
    }
    openDeck(GOTE, srcG, deckG => {
      lastVersus = { s:deckS, g:deckG };
      toGame();
      showMatchup(deckS, deckG, () => startMatch(deckS, deckG, false));
    });
  });
});
$('btn-setup-back').addEventListener('click', toTitle);

/* 押した要素を一度だけ揺らす */
function jelly(el) {
  if (!el || motionCalm) return;
  el.classList.remove('jelly'); void el.offsetWidth; el.classList.add('jelly');
  setTimeout(() => el.classList.remove('jelly'), 460);
}
document.addEventListener('pointerdown', e => {
  const t = e.target.closest('.btn,.mi,.preset,.draft-choice,.dp-btn');
  if (t && !t.classList.contains('disabled')) jelly(t);
}, true);


/* ============================================================
   ローカル通信。同じWi-Fiの2台で1局を共有する。
   turn-based なので着手を順番に積んで、相手のぶんを取りに行くだけでよい。
   serve.py が中継所。python3 -m http.server では動かない。
   ============================================================ */
const net = {
  on:false, mode:'lan', room:'', seat:SENTE, token:'', since:0, polling:false, alive:false,
};
function netToken() {
  let t = localStorage.getItem('komagari.token');
  if (!t) { t = Math.random().toString(36).slice(2, 10); saveOpt('komagari.token', t); }
  return t;
}
async function netCall(path, body) {
  const opt = body
    ? { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) }
    : {};
  const r = await fetch(path, opt);
  return r.json();
}
function netStatus(text, kind) {
  const el = $('net-status');
  if (!el) return;
  el.textContent = text;
  el.className = 'net-status' + (kind ? ' ' + kind : '');
}

/* 相手の着手を待ち続ける。長ポーリングなので取りこぼさない */
async function netPoll() {
  if (net.mode !== 'lan' || net.polling) return;
  net.polling = true;
  while (net.on) {
    try {
      const r = await netCall(`/api/poll?room=${encodeURIComponent(net.room)}&since=${net.since}`);
      if (!net.on) break;
      net.alive = true;
      for (const mv of (r.moves || [])) {
        net.since++;
        if (mv && mv.by !== net.seat) applyRemoteMove(mv);
      }
    } catch (e) {
      net.alive = false;
      netStatus('中継所に届きません。serve.py で起動しているか確認してください。', 'bad');
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  net.polling = false;
}

function applyRemoteMove(mv) {
  if (mode !== 'versus' || !mv.move) return;
  busy = false;
  applyMove(mv.move, true);          // 相手の手はそのまま反映し、送り返さない
}

function netSend(move) {
  if (!net.on) return;
  const payload = { by: net.seat, move };
  if (net.mode === 'p2p') { p2pSend({ kind:'move', payload }); return; }
  // since を進めるのは受信ループだけにする。送信側でも書くと、
  // 相手の手を飛び越して盤面が食い違う(実際に起きた)。
  // 自分の手はポーリングで戻ってくるが by で弾くので二重適用にならない。
  netCall('/api/move', { room: net.room, move: payload }).catch(() => {});
}

/* ============================================================
   インターネット越しの対戦。PeerJS の公開ブローカー経由で
   ブラウザ同士を直結(WebRTC)する。こちらでサーバを持たないので
   GitHub Pages のような静的配信でも動く。
   先手が部屋を開き、後手がその合言葉に繋ぐ。
   ============================================================ */
const p2p = { peer:null, conn:null, ready:false, meta:null };
const P2P_ID = code => 'sshhooggii-' + code;

function p2pSend(msg) {
  if (p2p.conn && p2p.conn.open) { try { p2p.conn.send(msg); } catch (e) {} }
}
function p2pBind(conn) {
  p2p.conn = conn;
  conn.on('open', () => {
    p2p.ready = true;
    netStatus('相手と繋がりました。', 'good');
    if (p2p.pendingMeta) p2pSend({ kind:'meta', payload:p2p.pendingMeta });
  });
  conn.on('data', d => {
    if (!d || !d.kind) return;
    if (d.kind === 'move' && d.payload && d.payload.by !== net.seat) applyRemoteMove(d.payload);
    if (d.kind === 'meta') p2p.meta = d.payload;
  });
  conn.on('close', () => { p2p.ready = false; netStatus('相手との接続が切れました。', 'bad'); });
  conn.on('error', () => { p2p.ready = false; netStatus('接続に失敗しました。', 'bad'); });
}
function p2pConnect(code, seat) {
  return new Promise((resolve, reject) => {
    if (typeof Peer === 'undefined') return reject(new Error('peerjs-missing'));
    const host = seat === SENTE;                    // 先手が部屋を開く
    const id = host ? P2P_ID(code) : undefined;
    const peer = new Peer(id, { debug: 0 });
    p2p.peer = peer;
    let settled = false;
    const done = (fn, v) => { if (!settled) { settled = true; fn(v); } };

    peer.on('open', () => {
      if (host) {
        netStatus(`合言葉「${code}」で待っています。相手が入るまでこのままで。`);
        peer.on('connection', c => p2pBind(c));
        done(resolve, true);
      } else {
        const c = peer.connect(P2P_ID(code), { reliable: true });
        p2pBind(c);
        c.on('open', () => done(resolve, true));
        setTimeout(() => done(reject, new Error('timeout')), 12000);
      }
    });
    peer.on('error', e => {
      const msg = String(e && e.type || e);
      if (msg.includes('unavailable-id')) done(reject, new Error('room-taken'));
      else if (msg.includes('peer-unavailable')) done(reject, new Error('no-host'));
      else done(reject, new Error(msg));
    });
    setTimeout(() => done(reject, new Error('timeout')), 15000);
  });
}


/* ============================================================
   はじめての説明。文章を減らし、盤の図で見せる。
   ============================================================ */
/* 説明用の小さな盤。本体の盤と同じ語彙で描く。
   静止した盤に印を置くだけでは「どの駒がどこへ動いて取ったのか」が
   読めなかったので、矢印と手順番号を描けるようにしてある。 */
function miniBoard(cells, marks, opt) {
  opt = opt || {};
  const cell = 22, pad = 1, W = pad * 2 + C * cell, H = pad * 2 + R * cell;
  const cx = i => pad + (i % C) * cell + cell / 2;
  const cy = i => pad + ((i / C) | 0) * cell + cell / 2;

  let g = '';
  for (let i = 0; i <= C; i++) {
    g += `<line class="m-grid" x1="${pad}" y1="${pad+i*cell}" x2="${pad+C*cell}" y2="${pad+i*cell}"/>`;
    g += `<line class="m-grid" x1="${pad+i*cell}" y1="${pad}" x2="${pad+i*cell}" y2="${pad+R*cell}"/>`;
  }

  let m = '';
  for (const k in (marks || {})) {
    const i = +k, x = pad + (i % C) * cell, y = pad + ((i / C) | 0) * cell;
    const kind = marks[k];
    if (kind === 'take' || kind === 'land')   // 駒の外側を囲まないと黒い駒の上で枠が消える
      m += `<rect class="m-${kind}" x="${x+1}" y="${y+1}" width="${cell-2}" height="${cell-2}"/>`;
    else if (kind === 'ruin')
      m += `<rect class="m-ruin" x="${x+1}" y="${y+1}" width="${cell-2}" height="${cell-2}"/>`;
    else m += `<circle class="m-${kind}" cx="${cx(i)}" cy="${cy(i)}" r="${cell*(kind==='base'?0.15:0.20)}"/>`;
  }

  /* 矢印。隣り合うマスだと駒の外には線を引く余地がないので、
     駒の上に重ねて描き、紙色の縁で抜いて読めるようにする */
  let a = '';
  for (const ar of (opt.arrows || [])) {
    const x1 = cx(ar.from), y1 = cy(ar.from), x2 = cx(ar.to), y2 = cy(ar.to);
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    const off = Math.min(cell * 0.24, len * 0.24);
    const tipX = x2 - ux * off, tipY = y2 - uy * off;
    const hl = 6.2, hw = 3.8;
    const bx = tipX - ux * hl, by = tipY - uy * hl;
    const px = -uy, py = ux;
    const seg = `x1="${(x1+ux*off).toFixed(1)}" y1="${(y1+uy*off).toFixed(1)}" `
              + `x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}"`;
    a += `<line class="m-arrow-bg" ${seg}/>`
       + `<line class="m-arrow${ar.dash ? ' dash' : ''}" ${seg}/>`
       + `<polygon class="m-head" points="${tipX.toFixed(1)},${tipY.toFixed(1)} `
       + `${(bx+px*hw).toFixed(1)},${(by+py*hw).toFixed(1)} `
       + `${(bx-px*hw).toFixed(1)},${(by-py*hw).toFixed(1)}"/>`;
  }

  let p = '';
  for (const k in (cells || {})) {
    const i = +k, c = cells[k];
    const x = pad + (i % C) * cell, y = pad + ((i / C) | 0) * cell;
    const gl = c.pr ? PGLYPH[c.t] : (c.t === 'K' && c.o === GOTE ? '玉' : GLYPH[c.t]);
    p += `<g class="${c.ghost ? 'm-ghost' : ''}" transform="translate(${x},${y})${c.o === GOTE ? ` rotate(180 ${cell/2} ${cell/2})` : ''}">` +
         `<polygon class="m-pc ${c.o === GOTE ? 'gote' : ''} ${c.pr ? 'pr' : ''}" points="${
            [[cell*0.5,cell*0.08],[cell*0.86,cell*0.24],[cell*0.95,cell*0.94],[cell*0.05,cell*0.94],[cell*0.14,cell*0.24]]
            .map(v => v.map(n => n.toFixed(1)).join(',')).join(' ')}"/>` +
         `<text class="m-gl ${c.pr ? 'pr' : ''} ${c.o === GOTE ? 'gote' : ''}" x="${cell/2}" y="${cell*0.58}" ` +
         `text-anchor="middle" dominant-baseline="central">${gl}</text></g>`;
  }

  /* 手順の番号。連鎖のように順序が要る図でだけ使う */
  let b = '';
  for (const k in (opt.badge || {})) {
    const i = +k, x = pad + (i % C) * cell, y = pad + ((i / C) | 0) * cell;
    b += `<circle class="m-badge" cx="${x+cell*0.19}" cy="${y+cell*0.19}" r="${cell*0.17}"/>`
       + `<text class="m-badge-t" x="${x+cell*0.19}" y="${y+cell*0.21}" text-anchor="middle" `
       + `dominant-baseline="central">${opt.badge[k]}</text>`;
  }

  return `<svg class="tfig ${opt.cls || ''}" viewBox="0 0 ${W} ${H}">${g}${m}${p}${a}${b}</svg>`;
}

/* 図の部品。盤だけでは足りないもの(持ち駒・手数・凡例)を組む */
const figPc = (t, o, cls) =>
  `<span class="tf-pc ${o === GOTE ? 'gote' : ''} ${cls || ''}">${t === 'K' && o === GOTE ? '玉' : GLYPH[t]}</span>`;

function figTray(label, have, gain) {
  const pcs = have.map(t => figPc(t, SENTE)).join('')
            + (gain ? `<span class="tf-plus">＋</span>${figPc(gain, SENTE, 'new')}` : '');
  return `<div class="tf-tray"><span class="tf-tray-l">${label}</span><span class="tf-pcs">${pcs}</span></div>`;
}

function figMeter(label, left, total, warn) {
  let s = '';
  for (let i = 0; i < total; i++) s += `<i class="${i < left ? 'on' : ''}${warn && i < left ? ' warn' : ''}"></i>`;
  return `<div class="tf-meter"><span class="tf-meter-l">${label}</span>${s}<b>${left}</b></div>`;
}

const figCap = (svg, cap) => `<div class="tf-one">${svg}<span class="tf-cap">${cap}</span></div>`;
const figPair = (a, b) => `<div class="tf-row">${a}<span class="tf-then">▶</span>${b}</div>`;
const figLegend = items =>
  `<div class="tf-legend">${items.map(x => `<span><i class="${x.k}"></i>${x.t}</span>`).join('')}</div>`;

/* 銀の動きを、能力のあるなしで引き比べる。エンジンに聞くので実装とずれない */
function silverReach(abils) {
  const saved = sideAb; sideAb = { s: abils || {}, g: {} };
  const p = { b: new Array(NS).fill(null), blocked: new Set(), h: { s:{}, g:{} }, turn: SENTE };
  p.b[12] = { t:'S', o:SENTE };
  const ms = targets(p, 12);
  sideAb = saved;
  return ms;
}

/* 駒ごとの動きの図。エンジンに問い合わせるので常に実装と一致する */
function pieceDiagram(t, pr) {
  const at = (t === 'N' || t === 'L') ? 22 : 12;      // 桂と香は下段に置くと分かりやすい
  const saved = sideAb; sideAb = { s:{}, g:{} };
  const p = { b:new Array(NS).fill(null), blocked:new Set(), h:{ s:{}, g:{} }, turn:SENTE };
  p.b[at] = { t, o:SENTE, pr };
  const ms = targets(p, at);
  sideAb = saved;
  const marks = {}; for (const i of ms) marks[i] = 'move';
  return miniBoard({ [at]: { t, o:SENTE, pr } }, marks, { cls:'small' });
}

const PIECE_GUIDE = [
  ['K', false, '王 / 玉', 'まわり8マスへ1つ'],
  ['R', false, '飛', 'たて・よこに走る'],
  ['B', false, '角', 'ななめに走る'],
  ['G', false, '金', '前3・横2・後ろ1'],
  ['S', false, '銀', '前3・ななめ後ろ2'],
  ['N', false, '桂', '前2よこ1へ跳ぶ。間の駒は飛び越す'],
  ['L', false, '香', '前に走る'],
  ['P', false, '歩', '前へ1つ'],
  ['R', true,  '龍(成飛)', '飛にななめ1つが加わる'],
  ['B', true,  '馬(成角)', '角にたて・よこ1つが加わる'],
  ['P', true,  'と(成歩)', '金と同じ動きになる'],
];
function renderPieceGuide() {
  const box = $('piece-guide');
  if (!box || box.childElementCount) return;
  for (const [t, pr, name, desc] of PIECE_GUIDE) {
    const d = document.createElement('div');
    d.className = 'pg';
    d.innerHTML = pieceDiagram(t, pr) +
      `<span class="pg-t"><b>${name}</b><span>${desc}</span></span>`;
    box.appendChild(d);
  }
}

/* 説明の各ページ。図が主役で、文章は一行に抑える */
const TUTORIAL = [
  {
    title: '駒を奪って、次の階へ',
    text: '相手の駒を取ると、それは<b>自分の持ち駒</b>になります。取った駒は次の階にも持って行けます。',
    fig: () => miniBoard(
      { 2:{t:'K',o:GOTE}, 7:{t:'S',o:GOTE}, 12:{t:'G',o:SENTE}, 22:{t:'K',o:SENTE} },
      { 7:'take' },
      { arrows:[{ from:12, to:7 }] })
      + figTray('自分の持ち駒', ['P'], 'S'),
    note: '金で銀を取る。銀はそのまま自分の持ち駒になる',
  },
  {
    title: '持ち駒は、どこにでも打てる',
    text: '持ち駒は<b>空いているマスなら、どこにでも置けます</b>。敵陣のいちばん奥でも構いません。ここがこのゲームの中心です。',
    fig: () => {
      const cells = { 2:{t:'K',o:GOTE}, 12:{t:'S',o:GOTE}, 22:{t:'K',o:SENTE} };
      const marks = {};
      for (let i = 0; i < NS; i++) if (!cells[i] && i !== 1) marks[i] = 'drop';
      marks[1] = 'land';
      cells[1] = { t:'G', o:SENTE };
      return miniBoard(cells, marks, {}) + figTray('持ち駒', ['S','P'], null);
    },
    note: '緑の点すべてが、打てる場所。金は敵の玉の隣に打った',
  },
  {
    title: '守備隊を狩り尽くせば突破',
    text: '玉以外の敵の駒を<b>すべて取れば</b>、その階は突破です。玉を取っても抜けられますが、取り分は減ります。',
    fig: () => figPair(
      figCap(miniBoard(
        { 2:{t:'K',o:GOTE}, 7:{t:'P',o:GOTE}, 12:{t:'G',o:SENTE}, 22:{t:'K',o:SENTE} },
        { 7:'take' }, { cls:'pair', arrows:[{ from:12, to:7 }] }), '守備隊 残り 1'),
      figCap(miniBoard(
        { 2:{t:'K',o:GOTE}, 7:{t:'G',o:SENTE}, 22:{t:'K',o:SENTE} },
        {}, { cls:'pair' }), '守備隊 0 → 突破')),
    note: '玉は守備隊に数えません',
  },
  {
    title: '手数が尽きると、崩れる',
    text: '階ごとに<b>手数</b>が決まっています。使い切ると<b>崩壊</b>がはじまり、一手ごとに床が抜け、敵の増援が降ってきます。',
    fig: () => figPair(
      figCap(miniBoard(
        { 2:{t:'K',o:GOTE}, 8:{t:'S',o:GOTE}, 13:{t:'P',o:GOTE}, 22:{t:'K',o:SENTE} },
        {}, { cls:'pair' }), figMeter('のこり手数', 1, 6, true)),
      figCap(miniBoard(
        { 2:{t:'K',o:GOTE}, 8:{t:'S',o:GOTE}, 13:{t:'P',o:GOTE}, 6:{t:'N',o:GOTE}, 22:{t:'K',o:SENTE} },
        { 5:'ruin', 9:'ruin', 15:'ruin', 6:'land' }, { cls:'pair' }), '崩壊。床が抜け、増援')),
    note: '早く抜けるほど、得点は伸びます',
  },
  {
    title: '続けて取ると、跳ねる',
    text: '駒を続けて取ると<b>連鎖</b>が伸び、得点が跳ね上がります。5連鎖で<b>FEVER</b>。取らない手が続くと切れます。',
    fig: () => miniBoard(
      { 2:{t:'K',o:GOTE}, 11:{t:'P',o:GOTE}, 13:{t:'P',o:GOTE},
        12:{t:'R',o:SENTE,pr:true}, 22:{t:'K',o:SENTE} },
      { 11:'take', 13:'take' },
      { arrows:[{ from:12, to:11 }, { from:12, to:13 }], badge:{ 11:'1', 13:'2' } })
      + figMeter('連鎖', 2, 5),
    note: '1手目で取り、次の手でも取る。切らさずに繋ぐ',
  },
  {
    title: '一階ごとに、能力をひとつ',
    text: '階を抜けるたび、<b>3つから1つ</b>能力を選びます。駒の動きが変わるもの、手数が増えるものなど68種類。',
    fig: () => {
      const base = silverReach(null), wide = silverReach({ silverWide:1 });
      const mk = ms => { const o = {}; for (const i of base) o[i] = 'base'; for (const i of ms) if (!base.includes(i)) o[i] = 'move'; return o; };
      return figPair(
        figCap(miniBoard({ 12:{t:'S',o:SENTE} }, mk(base), { cls:'pair' }), 'ふつうの銀'),
        figCap(miniBoard({ 12:{t:'S',o:SENTE} }, mk(wide), { cls:'pair' }), '銀嶺を取ったあと'))
        + figLegend([{ k:'base', t:'もとの動き' }, { k:'move', t:'増えた動き' }]);
    },
    note: '横に2マス増える。図はゲーム本体と同じ計算で描いています',
  },
];

let tutStep = 0;
function openTutorial(from) {
  tutStep = 0;
  tutorialFrom = from || 'title';
  ['title','game','setup','deck','presets'].forEach(id => $(id).classList.add('hidden'));
  $('tutorial').classList.remove('hidden');
  renderTutorial();
}
let tutorialFrom = 'title';
function renderTutorial() {
  const p = TUTORIAL[tutStep];
  $('tut-step').textContent = `${String(tutStep+1).padStart(2,'0')} / ${String(TUTORIAL.length).padStart(2,'0')}`;
  $('tut-title').textContent = p.title;
  $('tut-fig').innerHTML = p.fig() + (p.note ? `<span class="tut-note">${p.note}</span>` : '');
  $('tut-text').innerHTML = p.text;
  $('tut-prev').classList.toggle('hidden', tutStep === 0);
  $('tut-next').querySelector('b').textContent = tutStep === TUTORIAL.length - 1 ? 'はじめる' : 'つぎへ';
}
function closeTutorial() {
  saveOpt('komagari.seen', '1');
  $('tutorial').classList.add('hidden');
  toTitle();
}
$('tut-next').addEventListener('click', () => {
  sfx.ui();
  if (tutStep < TUTORIAL.length - 1) { tutStep++; renderTutorial(); }
  else closeTutorial();
});
$('tut-prev').addEventListener('click', () => { sfx.ui(); if (tutStep > 0) { tutStep--; renderTutorial(); } });
$('tut-skip').addEventListener('click', () => { sfx.ui(); closeTutorial(); });
$('btn-howto').addEventListener('click', () => { primeAudio(); sfx.ui(); openTutorial('title'); });

/* ---------- 設定 ---------- */
function openSettings() {
  $('vol-bgm').value = Math.round(volBgm * 100);
  $('vol-sfx').value = Math.round(volSfx * 100);
  $('vol-bgm-v').textContent = Math.round(volBgm * 100);
  $('vol-sfx-v').textContent = Math.round(volSfx * 100);
  $('opt-motion').value = motionCalm ? 'calm' : 'full';
  $('settings').classList.remove('hidden');
  loadSfx();
}
const saveOpt = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

$('vol-bgm').addEventListener('input', e => {
  volBgm = e.target.value / 100;
  $('vol-bgm-v').textContent = e.target.value;
  saveOpt('komagari.volBgm', volBgm);
  applyBgmVolume();
  if (volBgm > 0 && soundOn && !bgmSrc) startBgm();
});
$('vol-sfx').addEventListener('input', e => {
  volSfx = e.target.value / 100;
  $('vol-sfx-v').textContent = e.target.value;
  saveOpt('komagari.volSfx', volSfx);
});
$('vol-sfx').addEventListener('change', () => sfx.ui());   // 離したときに試聴
$('opt-motion').addEventListener('change', e => {
  motionCalm = e.target.value === 'calm';
  saveOpt('komagari.motion', motionCalm ? 'calm' : 'full');
  document.body.classList.toggle('calm', motionCalm);
});
$('settings-close').addEventListener('click', () => { $('settings').classList.add('hidden'); sfx.ui(); });
$('settings-reset').addEventListener('click', () => {
  volBgm = 0.5; volSfx = 0.9; motionCalm = false;
  saveOpt('komagari.volBgm', volBgm); saveOpt('komagari.volSfx', volSfx);
  saveOpt('komagari.motion', 'full');
  document.body.classList.remove('calm');
  applyBgmVolume();
  if (!soundOn) { soundOn = true; saveOpt('komagari.sound', '1'); $('btn-sound').classList.add('on'); loadSfx(); startBgm(); }
  openSettings();
  sfx.ui();
});
$('btn-settings').addEventListener('click', openSettings);
$('btn-settings-2').addEventListener('click', openSettings);
document.body.classList.toggle('calm', motionCalm);

/* ---------- 起動 ---------- */
$('btn-solo').addEventListener('click',    () => { primeAudio(); sfx.ui(); toGame(); startRun(); });
$('btn-versus').addEventListener('click',  () => { primeAudio(); sfx.ui(); openSetup(); });
$('btn-presets').addEventListener('click', () => openPresets('view'));
$('btn-quit').addEventListener('click', () => {
  if ($('draft').classList.contains('hidden') === false) return;
  showOverlay('中断', 'この階の途中で抜けます。\n潜っていた分の駒と能力は失われます。', [
    ['続ける', hideOverlay],
    ['タイトルへ', toTitle],
  ], 'ABORT?');
});
$('btn-sound').addEventListener('click', () => {
  soundOn = !soundOn;
  try { localStorage.setItem('komagari.sound', soundOn ? '1' : '0'); } catch (e) {}
  $('btn-sound').classList.toggle('on', soundOn);
  if (soundOn) { loadSfx(); startBgm(); } else stopBgm();
});
$('btn-sound').classList.toggle('on', soundOn);
primeAudio();
showBest();
renderPieceGuide();
// はじめて開いたときだけ説明を出す
if (!localStorage.getItem('komagari.seen')) {
  $('title').classList.add('hidden');
  openTutorial('first');
}

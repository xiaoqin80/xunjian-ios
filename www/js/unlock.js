/* 寻见解锁状态机（P0）
 * 单一真源：localStorage.xj_progress
 * 首页抽卡、迦南列表/搜索/深链、阅读页全部读它
 */
window.XJ = (function () {
  const KEY = 'xj_progress';
  const TIERS = {
    light: { k1: 2, k2: 1, chars: 1, daily: 10 },
    std:   { k1: 3, k2: 2, chars: 1, daily: 20 },
    full:  { k1: 5, k2: 3, chars: 2, daily: 30 }
  };

  /* ---------- 持久层：IndexedDB（容量远超 localStorage），localStorage 退为兜底 ---------- */
  const DB_NAME = 'xj', STORE = 'kv';
  let dbP = null, saveTimer = 0;
  function db() {
    if (dbP) return dbP;
    dbP = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => { try { r.result.createObjectStore(STORE); } catch (e) {} };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }).catch(() => null);
    return dbP;
  }
  async function idbGet(k) {
    const d = await db(); if (!d) return null;
    return new Promise(res => {
      const tx = d.transaction(STORE, 'readonly').objectStore(STORE).get(k);
      tx.onsuccess = () => res(tx.result || null);
      tx.onerror = () => res(null);
    });
  }
  async function idbPut(k, v) {
    const d = await db(); if (!d) return false;
    return new Promise(res => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(v, k);
      tx.oncomplete = () => res(true);
      tx.onerror = () => res(false);
    });
  }
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { idbPut('progress', P); }, 400);
  }

  let PLAN = null, P = read(), ready = false, lastLevel = 0;

  function fresh() {
    return { v: 2, tier: 'light', cursor: { book: 1, chap: 1 }, unlocked: {}, learned: {},
             draws: 3, packs: {}, level: { lv: 1, chap: 0, name: '慕道' }, rewards: [],
             streak: { last: '', n: 0 }, daily: { d: '', n: 0 } };
  }
  function nativeGet() {
    try { if (window.XJStore && window.XJStore.get) { const t = window.XJStore.get(); if (t) return JSON.parse(t); } } catch (e) {}
    return null;
  }
  function nativeSet(json) {
    try { if (window.XJStore && window.XJStore.set) window.XJStore.set(json); } catch (e) {}
  }
  function read() {
    try {
      const n = nativeGet();                       // ① 原生存储（APK：换端口也不丢）
      if (n && n.v === 2) return n;
      const o = JSON.parse(localStorage.getItem(KEY) || 'null');   // ② 浏览器
      return o && o.v === 2 ? o : fresh();
    } catch (e) { return fresh(); }
  }
  function save() {
    /* 大表（unlocked / learned）走 IndexedDB；localStorage 只留轻量字段 */
    try {
      /* 兜底：IDB 若不可用（部分 WebView），整份写回 localStorage */
      const full = JSON.stringify(P);
      if (full.length < 900000) localStorage.setItem(KEY, full);
      const light = { v: P.v, tier: P.tier, cursor: P.cursor, draws: P.draws,
                      level: P.level, rewards: P.rewards, streak: P.streak,
                      daily: P.daily, review: P.review, packsLite: 1 };
      localStorage.setItem(KEY + '_lite', JSON.stringify(light));
    } catch (e) {}
    nativeSet(JSON.stringify(P));
    scheduleSave();
  }
  const k = (kind, no) => kind + ':' + no;

  const BOOKS = {};                                  // 已加载的卷分片
  function loadBook(no) {
    if (BOOKS[no]) return Promise.resolve(BOOKS[no]);
    return fetch('data/level/b' + String(no).padStart(2, '0') + '.json')
      .then(r => r.json())
      .then(b => { BOOKS[no] = b; return b; });
  }
  function ensureBook() {
    if (book()) return Promise.resolve(book());
    return loadBook(P.cursor.book).catch(() => null);
  }

  function init() {
    if (ready) return Promise.resolve(PLAN);
    const loadState = idbGet('progress').then(o => {
      const n = nativeGet();
      if (n && n.v === 2) { P = n; return; }        // 原生优先
      if (o && o.v === 2) { P = o; return; }
      const legacy = localStorage.getItem(KEY);
      if (legacy) {                                   // 一次性迁移
        try { const o2 = JSON.parse(legacy); if (o2 && o2.v === 2) { P = o2; idbPut('progress', P); localStorage.removeItem(KEY); } } catch (e) {}
      }
    });
    return loadState.then(() => fetch('data/level/index.json')).then(r => r.json()).then(plan => {
      PLAN = plan;
      if (!plan.books[P.cursor.book - 1]) P.cursor = { book: 1, chap: 1 };
      lastLevel = P.level.lv;
      /* 幂等回填：任何已解锁卡若没有定格记录，补记 1 次（老版本抽的卡也能补上） */
      if (Object.keys(P.unlocked || {}).length) {
        P.frozen = P.frozen || {};
        let added = 0;
        Object.keys(P.unlocked).forEach(k => { if (!P.frozen[k]) { P.frozen[k] = 1; added++; } });
        if (added) {
          P.frozenTotal = Object.keys(P.frozen).reduce((a, k2) => a + (P.frozen[k2] || 0), 0);
          P.frozenBackfill = true;
          save();
        }
      }

      const d = new Date().toISOString().slice(0, 10);
      if (P.daily.d !== d) { P.daily = { d: d, n: 0 }; P.draws = Math.min(5, P.draws + 1); }
      save();
      return ensureBook().then(() => { ready = true; return PLAN; });
    });
  }

  const book = () => BOOKS[P.cursor.book] || null;
  const tier = () => TIERS[P.tier] || TIERS.light;

  const isUnlocked = (kind, no) => !!P.unlocked[k(kind, no)];
  const isLearned  = (kind, no) => !!P.learned[k(kind, no)];
  /* 遇见＝定格次数（抽到即定格，同一张可累计） */
  function markFrozen(kind, no) {
    P.frozen = P.frozen || {};
    const key = k(kind, no);
    P.frozen[key] = (P.frozen[key] || 0) + 1;
    P.frozenTotal = (P.frozenTotal || 0) + 1;
    save();
    return P.frozen[key];
  }
  function isFrozen(kind, no) { return !!(P.frozen && P.frozen[k(kind, no)]); }
  function frozenCount(kind, no) { return (P.frozen && P.frozen[k(kind, no)]) || 0; }
  function frozenTotal() { return P.frozenTotal || 0; }

  function learnInfo(kind, no) { const e = P.learned[k(kind, no)]; return e ? { due: e.due || 0, reps: e.reps || 0, label: e.label || '' } : null; }
  function unlock(kind, no) { const key = k(kind, no); if (!P.unlocked[key]) { P.unlocked[key] = Date.now(); save(); } return true; }
  function unlockMany(kind, list) { let n = 0; list.forEach(no => { if (!P.unlocked[k(kind, no)]) { P.unlocked[k(kind, no)] = Date.now(); n++; } }); if (n) save(); return n; }

  /* 当前卷 · 未解锁的字池 */
  function drawPool() {
    const b = book(); if (!b) return [];
    return b.chars.filter(c => !isUnlocked('z', c.no) || !isLearned('z', c.no));
  }

  /* 抽卡：消耗 1 次，返回字卡对象（已解锁） */
  function draw() {
    if (P.draws <= 0) return null;
    const pool = drawPool();
    if (!pool.length) return null;
    const c = pool[Math.floor(Math.random() * pool.length)];
    P.draws--; unlock('z', c.no); P.packs['z:' + c.no] = Date.now(); save();
    return { kind: 'z', no: c.no, ch: c.ch, py: c.py, freq: c.freq, vols: c.vols,
             bk: c.bk, bkN: c.bkN, words: c.words || [], verse: c.verse, ref: c.ref, raw: c };
  }

  /* 学完一张卡：字卡 → 解锁含该字的词卡（k1 张，本卷内） */
  function learn(kind, no, charText, label) {
    const key = k(kind, no);
    if (!P.learned[key]) {
      P.learned[key] = { ts: Date.now(), reps: 0, due: Date.now() + 86400000 };   // 首次 1 天后复习
    }
    if (label) P.learned[key].label = label;
    P.daily.n = (P.daily.n || 0) + 1;
    save();
    const out = { words: [], verses: 0, chapter: false, levelUp: null };
    if (kind === 'z') {
      const b = book(), k1 = tier().k1;
      const ch = charText || '';
      // 1) 字→词索引（全库，任何字都能解出词）  2) 兜底：本卷词池
      let cand = ((PLAN.cw && PLAN.cw[ch]) || []).map(a => ({ no: a[0], w: a[1], py: a[2], freq: a[3] }));
      if (!cand.length) {
        cand = (b.words || []).filter(w => w.w.indexOf(ch) >= 0)
          .map(w => ({ no: w.no, w: w.w, py: w.py, freq: w.freq }));
      }
      const inBook = new Set((b.words || []).map(w => w.no));
      cand.sort((x, y) => (inBook.has(y.no) ? 1 : 0) - (inBook.has(x.no) ? 1 : 0));
      const hits = cand.filter(w => !isUnlocked('w', w.no)).slice(0, k1);
      out.words = hits;
      unlockMany('w', hits.map(w => w.no));
      if (!hits.length) { P.draws += 1; out.single = true; save(); }   // 单卡闭环：无相关词的字，学完补 1 次机会
    }
    if (kind === 'cp') {
      P.draws += 2; save();
      out.chapter = true;
    }
    const lv = checkLevel();
    if (lv && lv.changed) out.levelUp = lv;
    return out;
  }

  function learnedChapters() { return Object.keys(P.learned).filter(x => x.indexOf('cp:') === 0).length; }
  function checkLevel() {
    const n = learnedChapters(), vols = P.rewards.filter(x => x.indexOf('fig:') === 0).length;
    let cur = PLAN ? PLAN.levels[0] : { lv: 1, name: '慕道', chap: 0 };
    (PLAN ? PLAN.levels : []).forEach(L => {
      if (n >= L.chap && (!L.vols || vols >= L.vols)) cur = L;
    });
    if (cur.lv > P.level.lv) {
      P.level = { lv: cur.lv, chap: n, name: cur.name };
      P.draws += 2; save();
      return { changed: true, lv: cur.lv, name: cur.name };
    }
    P.level.chap = n; save();
    return { changed: false, lv: cur.lv, name: cur.name };
  }

  /* 章卡学完 → 下一章 */
  function nextChapter() {
    const meta = PLAN && PLAN.books[P.cursor.book - 1];
    const total = PLAN ? PLAN.books.length : 66;
    if (meta && P.cursor.chap < meta.chaps) P.cursor.chap++;
    else { P.cursor.book = Math.min(total, P.cursor.book + 1); P.cursor.chap = 1; }
    save();
    loadBook(P.cursor.book).catch(()=>{});          // 预取下一卷
  }

  function countKind(kind) {
    const pre = kind + ':'; let n = 0;
    for (const key in P.unlocked) if (key.indexOf(pre) === 0) n++;
    return n;
  }
  /* 圣殿「痕迹」用：全库口径的学习统计 */
  /* 下一批到期时间（最早的未来 due） */
  function nextDue() {
    const now = Date.now();
    let min = 0;
    for (const key in P.learned) {
      const e = P.learned[key] || {};
      if (e.due && e.due > now && (!min || e.due < min)) min = e.due;
    }
    return min;
  }
  function progressStats() {
    let unlearned = 0, learned = 0, due = 0, mastered = 0;
    const now = Date.now();
    for (const key in P.unlocked) if (!P.learned[key]) unlearned++;
    for (const key in P.learned) {
      const e = P.learned[key] || {};
      learned++;
      if (e.due && e.due <= now) due++;
      if ((e.reps || 0) >= 2) mastered++;
    }
    let likes = 0;
    try {
      const L = JSON.parse(localStorage.getItem('xj_like') || '{}');
      Object.keys(L).forEach(k => { if (L[k]) likes++; });
    } catch (e) {}
    return { unlearned, learned, due, mastered, likes };
  }
  function counts() {
    let n = 0; for (const _ in P.unlocked) n++;
    return { unlocked: n, total: 44428 };
  }
  function toast(msg) {
    let t = document.getElementById('xjToast');
    if (!t) {
      t = document.createElement('div'); t.id = 'xjToast';
      t.style.cssText = 'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:99999;' +
        'background:rgba(38,35,30,.92);color:#FBF8F1;font:12.5px/1.6 "Microsoft YaHei",sans-serif;' +
        'padding:9px 16px;border-radius:999px;letter-spacing:1px;opacity:0;transition:opacity .25s;pointer-events:none';
      document.body.appendChild(t);
    }
    t.textContent = msg; t.style.opacity = '1';
    clearTimeout(t._h); t._h = setTimeout(() => t.style.opacity = '0', 2000);
  }
  function levelOverlay(r) {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(16,14,12,.965);opacity:0;transition:opacity .35s;backdrop-filter:blur(3px);' +
      'font-family:"Noto Serif SC","Songti SC",SimSun,serif;color:#F7F2E8';
    d.innerHTML = '<div style="text-align:center;padding:34px 46px;border:1px solid rgba(181,146,79,.42);' +
      'border-radius:10px;background:rgba(26,23,20,.55)">' +
      '<div style="font-size:12px;letter-spacing:4px;color:#B5924F;margin-bottom:14px">\u5c42\u7ea7\u664b\u5347</div>' +
      '<div style="font-size:34px;letter-spacing:8px">' + r.name + '</div>' +
      '<div style="margin-top:12px;font-size:12px;letter-spacing:2px;color:rgba(247,242,232,.66)">' +
      '\u606d\u559c\u4f60\uff0c\u5c42\u7ea7\u6210\u4e3a \u00b7 ' + r.name + '\u3000Lv' + r.lv + '</div></div>';
    document.body.appendChild(d);
    requestAnimationFrame(() => d.style.opacity = '1');
    setTimeout(() => { d.style.opacity = '0'; setTimeout(() => d.remove(), 400); }, 2400);
  }


  /* ============ P1：词 → 节 → 章 → 卷 → 人物卡 ============ */
  let VINFO = null;                 // vno -> {b, c}
  let WMAP = null, shardCache = {};
  let FIG = null;                   // figures.json

  function setVerseInfo(fn) { VINFO = fn; }

  async function figures() {
    if (FIG) return FIG;
    const r = await fetch('data/figures.json');
    const o = await r.json();
    FIG = o.cards;
    return FIG;
  }
  /* vs 条目形如 "0,25,26,经文…" → {b0,c,v,text} */
  function parseVs(item) {
    if (Array.isArray(item)) {
      return item.length >= 3 ? { b0: +item[0], c: +item[1], v: +item[2], text: item[3] || '' } : null;
    }
    const t = String(item);
    const i = t.indexOf(','), j = t.indexOf(',', i + 1), k = t.indexOf(',', j + 1);
    if (i < 0 || j < 0 || k < 0) return null;
    return { b0: +t.slice(0, i), c: +t.slice(i + 1, j), v: +t.slice(j + 1, k), text: t.slice(k + 1) };
  }
  async function wordVerses(wordNo) {
    if (!WMAP) { WMAP = await (await fetch('data/wordvs/_map.json')).json(); }
    const shard = WMAP[wordNo];
    if (!shard) return [];
    if (!shardCache[shard]) {
      const arr = await (await fetch('data/wordvs/' + shard + '.json')).json();
      shardCache[shard] = {};
      arr.forEach(w => { shardCache[shard][w.no] = (w.vs || []).map(parseVs).filter(Boolean); });
    }
    return shardCache[shard][wordNo] || [];
  }

  /* 学完词卡：解锁 1 张含该词的节卡（本卷优先，其次全书），并记入本章批次 */
  async function wordUnlockVerse(wordNo) {
    const raw = await wordVerses(wordNo);
    if (!raw.length) return null;
    const b = book() ? book().no : 1;
    const rows = raw.map(x => {
      const info = VINFO ? VINFO(x.b0, x.c, x.v) : null;
      return info ? { ...x, ...info } : null;
    }).filter(Boolean);
    const free = rows.filter(x => !isUnlocked('v', x.no));
    if (!free.length) return null;
    const inBook = free.filter(x => x.b === b);
    const pick = (inBook.length ? inBook : free)[0];
    unlock('v', pick.no);
    const key = 'vbatch:' + pick.b + ':' + pick.c;
    const cur = P.packs[key] || [];
    if (cur.indexOf(pick.no) < 0) cur.push(pick.no);
    P.packs[key] = cur;
    save();
    return { vno: pick.no, b: pick.b, c: pick.c, v: pick.v };
  }

  /* 学完节卡：本批节卡全部学完 → 解锁该章章卡 */
  async function afterVerse(vno, b0, c, v) {
    const info = VINFO ? VINFO(b0, c, v) : null;
    if (!info) return null;
    const key = 'vbatch:' + info.b + ':' + info.c;
    const batch = P.packs[key] || [];
    if (!batch.length) return null;
    const allDone = batch.every(n => isLearned('v', n));
    if (!allDone) return { batch: batch.length, pending: batch.filter(n => !isLearned('v', n)).length };
    const bk = BOOKS[info.b] || await loadBook(info.b).catch(() => null);   // 章卡清单在卷分片里
    if (!bk) return null;
    const cp = (bk.cp || []).find(x => x.c === info.c);
    if (!cp) return null;
    const fresh = !isUnlocked('cp', cp.no);
    if (fresh) unlock('cp', cp.no);
    return { cp: cp.no, chapter: info.c, fresh };
  }

  /* 学完章卡：该卷章卡全通 → 发人物卡（并判里程碑 / 君王卡） */
  async function afterChapter(cpNo) {
    // 以章卡号反查所属卷：先看当前卷分片，再按需加载其余卷
    let b = book();
    if (!b || !(b.cp || []).some(c => c.no === cpNo)) {
      b = null;
      for (const meta of (PLAN.books || [])) {
        const shard = BOOKS[meta.no];
        if (shard && (shard.cp || []).some(c => c.no === cpNo)) { b = shard; break; }
      }
      if (!b) {
        const shard = await loadBook(P.cursor.book).catch(() => null);
        if (shard && (shard.cp || []).some(c => c.no === cpNo)) b = shard;
      }
    }
    if (!b) return null;
    const cps = (b.cp || []).map(x => x.no);
    const done = cps.filter(n => isLearned('cp', n)).length;
    if (done < cps.length) return { chapterDone: done, chapterTotal: cps.length, volume: false };
    // 卷通关
    const cards = await figures();
    const got = [];
    const fig = cards.find(x => x.type === 'person' && x.no === b.no);
    if (fig && P.rewards.indexOf(fig.id) < 0) { P.rewards.push(fig.id); got.push(fig); }
    // 里程碑
    const volsDone = new Set(P.rewards.filter(x => x.indexOf('fig:') === 0).map(x => +x.split(':')[1]));
    for (const m of cards.filter(x => x.type === 'milestone')) {
      if (P.rewards.indexOf(m.id) >= 0) continue;
      let all = true;
      for (let i = m.from; i <= m.to; i++) if (!volsDone.has(i)) { all = false; break; }
      if (all) { P.rewards.push(m.id); got.push(m); }
    }
    // 君王卡
    const king = cards.find(x => x.type === 'king');
    if (king && P.rewards.indexOf(king.id) < 0 && volsDone.size >= 66) {
      P.rewards.push(king.id); got.push(king);
    }
    P.draws += 5;
    save();
    return { volume: true, book: b.no, bookName: b.book, rewards: got };
  }


  /* ============ P3：间隔重复复习 ============ */
  const INTERVALS = [1, 3, 7, 21];        // 天
  function dueList() {
    const now = Date.now(), out = [];
    for (const key in P.learned) {
      const e = P.learned[key];
      if (!e || !e.due) continue;
      if (e.due <= now) {
        const i = key.indexOf(':');
        out.push({ key: key, kind: key.slice(0, i), no: +key.slice(i + 1),
                   reps: e.reps || 0, due: e.due, label: e.label || '' });
      }
    }
    out.sort((a, b) => a.due - b.due);
    return out;
  }
  function reviewDone(kind, no) {
    const key = k(kind, no), e = P.learned[key];
    if (!e) return null;
    e.reps = (e.reps || 0) + 1;
    const days = INTERVALS[Math.min(e.reps - 1, INTERVALS.length - 1)];
    e.due = Date.now() + days * 86400000;
    const d = new Date().toISOString().slice(0, 10);
    P.review = P.review || {};
    if (P.review.d !== d) P.review = { d: d, n: 0, paid: false };
    P.review.n++;
    let bonus = false;
    if (!P.review.paid && P.review.n >= 10) { P.draws += 1; P.review.paid = true; bonus = true; }
    save();
    return { reps: e.reps, nextDays: days, count: P.review.n, bonus: bonus };
  }
  function reviewStat() {
    const d = new Date().toISOString().slice(0, 10);
    const r = (P.review && P.review.d === d) ? P.review : { d: d, n: 0, paid: false };
    return { due: dueList().length, doneToday: r.n, paid: r.paid };
  }
  /* 导出 / 导入 */
  function exportJSON() { return JSON.stringify(P); }
  function importJSON(txt) {
    const o = JSON.parse(txt);
    if (!o || o.v !== 2) throw new Error('不是有效的寻见进度文件');
    P = o; save(); idbPut('progress', P); return true;
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => { try { idbPut('progress', P); } catch (e) {} });
    window.addEventListener('beforeunload', () => { try { idbPut('progress', P); } catch (e) {} });
  }

  function hasReward(id) { return P.rewards.indexOf(id) >= 0; }
  function rewardCount() { return P.rewards.length; }

  /* 奖励卡弹层 */
  async function figureOverlay(card) {
    const d = document.createElement('div');
    const isKing = card.type === 'king';
    const label = isKing ? '终局奖励' : (card.type === 'milestone' ? '阶段里程碑' : '本卷人物');
    d.style.cssText = 'position:fixed;inset:0;z-index:1000000;display:flex;align-items:center;justify-content:center;'
      + 'background:rgba(16,14,12,.97);opacity:0;transition:opacity .4s;backdrop-filter:blur(4px);'
      + 'font-family:"Noto Serif SC","Songti SC",SimSun,serif;color:#F7F2E8';
    d.innerHTML = '<div style="width:280px;padding:34px 26px 26px;text-align:center;border:1px solid rgba(181,146,79,.5);'
      + 'border-radius:14px;background:linear-gradient(160deg,rgba(60,48,32,.55),rgba(26,23,20,.9));'
      + 'box-shadow:0 18px 50px rgba(0,0,0,.5)">'
      + '<div style="font-size:11px;letter-spacing:5px;color:#B5924F;margin-bottom:18px">' + label + '</div>'
      + '<div style="font-size:13px;letter-spacing:2px;color:rgba(247,242,232,.6);margin-bottom:8px">'
      + (card.book || card.seg || '') + '</div>'
      + '<div style="font-size:30px;letter-spacing:6px;line-height:1.5">' + card.name + '</div>'
      + '<div style="margin-top:14px;font-size:11.5px;letter-spacing:1px;color:#B5924F">' + (card.ref || card.scope || '') + '</div>'
      + '<div style="margin-top:12px;font-size:12px;line-height:1.95;color:rgba(247,242,232,.78)">' + (card.line || '') + '</div>'
      + '<div style="margin-top:22px;font-size:10.5px;letter-spacing:2px;color:rgba(247,242,232,.45)">轻点任意处收起</div>'
      + '</div>';
    document.body.appendChild(d);
    requestAnimationFrame(() => d.style.opacity = '1');
    d.onclick = () => { d.style.opacity = '0'; setTimeout(() => d.remove(), 400); };
    if (window.XJfx) { XJfx.chime(isKing ? 'level' : 'chapter'); }
  }

  function lockToast(kind, no) {
    const b = book();
    toast('未解锁 · 当前进度：' + (b ? b.book + ' ' + P.cursor.chap + '/' + b.chaps + ' 章' : ''));
  }
  function state() { return P; }
  function setTier(t) { if (TIERS[t]) { P.tier = t; save(); } }

  return { init, levelOverlay, learnInfo, markFrozen, isFrozen, frozenCount, frozenTotal, progressStats, nextDue, tier, TIERS, book, isUnlocked, isLearned, unlock, draw, drawPool, learn, countKind,
           nextChapter, checkLevel, counts, toast, lockToast, state, setTier,
           setVerseInfo, wordUnlockVerse, afterVerse, afterChapter, figures,
           figureOverlay, hasReward, rewardCount,
           dueList, reviewDone, reviewStat, exportJSON, importJSON,
           ensureBook, loadBook, get books() { return BOOKS; },
           get plan() { return PLAN; }, get p() { return P; } };
})();

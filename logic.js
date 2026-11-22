/* Логика приложения: SRS, этапы, тесты. Без DOM — тестируется в node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VL = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DAY = 86400000;
  var PASS_PCT = 80;
  var DUE_LIMIT_FOR_NEW = 40; // при большем числе просроченных новые слова не вводятся

  // Этапы: учим блок из 50 -> тест блока; после каждых двух блоков — тест на 100.
  var STAGES = [
    { id: 'L1', type: 'learn', from: 0, to: 50, title: 'Глаголы 1–50' },
    { id: 'T1', type: 'test', from: 0, to: 50, title: 'Тест: глаголы 1–50' },
    { id: 'L2', type: 'learn', from: 50, to: 100, title: 'Глаголы 51–100' },
    { id: 'T2', type: 'test', from: 50, to: 100, title: 'Тест: глаголы 51–100' },
    { id: 'T12', type: 'test', from: 0, to: 100, title: 'Большой тест: глаголы 1–100' },
    { id: 'L3', type: 'learn', from: 100, to: 150, title: 'Глаголы 101–150' },
    { id: 'T3', type: 'test', from: 100, to: 150, title: 'Тест: глаголы 101–150' },
    { id: 'L4', type: 'learn', from: 150, to: 200, title: 'Глаголы 151–200' },
    { id: 'T4', type: 'test', from: 150, to: 200, title: 'Тест: глаголы 151–200' },
    { id: 'T34', type: 'test', from: 100, to: 200, title: 'Большой тест: глаголы 101–200' },
    { id: 'L5', type: 'learn', from: 200, to: 250, title: 'Глаголы 201–250' },
    { id: 'T5', type: 'test', from: 200, to: 250, title: 'Тест: глаголы 201–250' },
    { id: 'L6', type: 'learn', from: 250, to: 300, title: 'Глаголы 251–300' },
    { id: 'T6', type: 'test', from: 250, to: 300, title: 'Тест: глаголы 251–300' },
    { id: 'T56', type: 'test', from: 200, to: 300, title: 'Большой тест: глаголы 201–300' }
  ];

  function emptyState() {
    return { v: 1, cards: {}, tests: {}, daily: {}, settings: { sound: true, autoplay: false, voice: true, batch: 10 } };
  }

  function dayKey(ts) {
    var d = new Date(ts);
    var m = d.getMonth() + 1, dd = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (dd < 10 ? '0' : '') + dd;
  }

  /* ---------- SRS ---------- */
  function newCard(now) {
    return { r: 0, i: 0, e: 2.5, d: now, l: 0, c: 0, w: 0 };
  }

  // g: 0 не помню, 1 трудно, 2 хорошо, 3 легко
  function grade(card, g, now) {
    var c = Object.assign({}, card);
    if (g === 0) {
      c.l += 1; c.w += 1; c.r = 0; c.i = 0;
      c.e = Math.max(1.3, c.e - 0.2);
      c.d = now + 10 * 60000;
      return c;
    }
    c.c += 1;
    c.r += 1;
    if (g === 1) {
      c.i = c.i > 0 ? Math.max(1, Math.round(c.i * 1.2)) : 1;
      c.e = Math.max(1.3, c.e - 0.15);
    } else if (g === 2) {
      if (c.r === 1) c.i = 1;
      else if (c.r === 2) c.i = 3;
      else c.i = Math.max(c.i + 1, Math.round(c.i * c.e));
    } else {
      if (c.r === 1) c.i = 3;
      else c.i = Math.max(c.i + 1, Math.round(c.i * c.e * 1.3));
      c.e = Math.min(3.0, c.e + 0.15);
    }
    c.d = now + c.i * DAY;
    return c;
  }

  /* ---------- Этапы ---------- */
  function rangeIds(st) {
    var a = [];
    for (var i = st.from; i < st.to; i++) a.push(i);
    return a;
  }

  function learnDone(state, st) {
    return rangeIds(st).every(function (id) {
      var c = state.cards[id];
      return c && c.r >= 1;
    });
  }

  function testDone(state, st) {
    var t = state.tests[st.id];
    return !!(t && t.best >= PASS_PCT);
  }

  function stageDone(state, st) {
    return st.type === 'learn' ? learnDone(state, st) : testDone(state, st);
  }

  // индекс первого незавершённого этапа (STAGES.length — всё пройдено)
  function currentStageIndex(state) {
    for (var i = 0; i < STAGES.length; i++) if (!stageDone(state, STAGES[i])) return i;
    return STAGES.length;
  }

  function dueIds(state, now) {
    var out = [];
    Object.keys(state.cards).forEach(function (k) {
      if (state.cards[k].d <= now) out.push(+k);
    });
    out.sort(function (a, b) { return state.cards[a].d - state.cards[b].d; });
    return out;
  }

  // какие новые глаголы можно ввести сейчас
  function nextNewIds(state, now, n) {
    var idx = currentStageIndex(state);
    if (idx >= STAGES.length) return [];
    var st = STAGES[idx];
    if (st.type !== 'learn') return [];
    if (dueIds(state, now).length > DUE_LIMIT_FOR_NEW) return [];
    return rangeIds(st).filter(function (id) { return !state.cards[id]; }).slice(0, n);
  }

  function introduce(state, ids, now) {
    ids.forEach(function (id) { if (!state.cards[id]) state.cards[id] = newCard(now); });
    bump(state, now, 'newCards', ids.length);
  }

  function bump(state, now, field, n) {
    var k = dayKey(now);
    var d = state.daily[k] || (state.daily[k] = { reviews: 0, newCards: 0 });
    d[field] = (d[field] || 0) + n;
  }

  function applyGrade(state, id, g, now) {
    var c = state.cards[id] || newCard(now);
    state.cards[id] = grade(c, g, now);
    bump(state, now, 'reviews', 1);
    return state.cards[id];
  }

  /* ---------- Сравнение ответов ---------- */
  function strip(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, "'").trim().replace(/\s+/g, ' ');
  }
  function bare(s) { return s.replace(/^(se |s')/, ''); }

  // 'exact' — точно; 'accent' — верно, но без диакритики; 'alt' — другой глагол с тем же переводом; 'wrong'
  function checkTyped(verbs, id, input) {
    var target = verbs[id].fr;
    var typed = input.normalize('NFC').trim().toLowerCase();
    if (!typed) return { kind: 'wrong' };
    if (typed === target) return { kind: 'exact' };
    var t1 = bare(strip(typed)), t2 = bare(strip(target));
    if (t1 === t2) return { kind: 'accent' };
    for (var i = 0; i < verbs.length; i++) {
      if (i === id) continue;
      if (bare(strip(verbs[i].fr)) === t1 && ruConflict(verbs[i].ru, verbs[id].ru)) return { kind: 'alt', other: i };
    }
    return { kind: 'wrong' };
  }

  function lev(a, b) {
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) { d[i] = [i]; }
    for (j = 1; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }

  // Ответ голосом: alts — варианты распознавания. Идём по всем, берём лучший исход.
  // exact/accent/alt как при вводе; near — на слух отличается на 1 букву (только для слов от 5 букв)
  function checkSpoken(verbs, id, alts) {
    var best = null, rank = { exact: 0, accent: 0, alt: 1, near: 2, wrong: 3 };
    var target = bare(strip(verbs[id].fr));
    (alts || []).forEach(function (raw) {
      var clean = String(raw).toLowerCase().replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ').trim();
      var cands = [clean];
      var words = clean.split(' ');
      if (words.length > 1) { cands.push(words[words.length - 1]); cands.push(words.slice(-2).join(' ')); }
      cands.forEach(function (c) {
        var r = checkTyped(verbs, id, c);
        if (r.kind === 'wrong') {
          var t = bare(strip(c));
          if (target.length >= 5 && t.length >= 5 && lev(t, target) <= 1) r = { kind: 'near' };
        }
        if (!best || rank[r.kind] < rank[best.kind]) { best = r; best.heard = raw; }
      });
    });
    if (!best) best = { kind: 'wrong' };
    if (best.kind === 'wrong') best.heard = alts && alts[0];
    return best;
  }

  /* ---------- Тесты ---------- */
  function ruStems(ru) {
    var s = ru.replace(/\([^)]*\)/g, '');
    var out = {};
    s.split(/[,;]/).forEach(function (part) {
      var w = part.trim().split(/\s+/)[0];
      if (w) out[w.toLowerCase().slice(0, 4)] = 1;
    });
    return out;
  }
  function ruConflict(a, b) {
    var A = ruStems(a), B = ruStems(b);
    return Object.keys(A).some(function (k) { return B[k]; });
  }

  function shuffle(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // Вопрос на каждый глагол диапазона; половина fr->ru, половина ru->fr.
  function buildTest(verbs, st, rng, extraPool) {
    rng = rng || Math.random;
    var ids = rangeIds(st);
    var pool = ids.concat(extraPool || []);
    var order = shuffle(ids, rng);
    var dirs = shuffle(order.map(function (_, i) { return i % 2 === 0 ? 'fr2ru' : 'ru2fr'; }), rng);
    return order.map(function (id, qi) {
      var dir = dirs[qi];
      var cands = shuffle(pool.filter(function (o) { return o !== id && !ruConflict(verbs[o].ru, verbs[id].ru); }), rng);
      var opts = [id];
      for (var k = 0; k < cands.length && opts.length < 4; k++) {
        var ok = opts.every(function (o) { return !ruConflict(verbs[o].ru, verbs[cands[k]].ru); });
        if (ok) opts.push(cands[k]);
      }
      return { id: id, dir: dir, options: shuffle(opts, rng) };
    });
  }

  function scoreTest(correct, total) {
    var pct = total ? Math.round((correct / total) * 1000) / 10 : 0;
    return { pct: pct, passed: pct >= PASS_PCT };
  }

  function recordTest(state, stageId, pct, now) {
    var t = state.tests[stageId] || { best: 0, attempts: 0 };
    t.best = Math.max(t.best, pct);
    t.attempts += 1;
    t.last = pct;
    t.at = now;
    state.tests[stageId] = t;
  }

  /* ---------- Статистика ---------- */
  function stats(state, total, now) {
    var ids = Object.keys(state.cards);
    var mature = 0, learning = 0, cs = 0, ws = 0;
    ids.forEach(function (k) {
      var c = state.cards[k];
      if (c.i >= 21) mature++; else learning++;
      cs += c.c; ws += c.w;
    });
    var weak = ids.map(function (k) { return { id: +k, bad: state.cards[k].l }; })
      .filter(function (x) { return x.bad > 0; })
      .sort(function (a, b) { return b.bad - a.bad; }).slice(0, 8);
    return {
      total: total, introduced: ids.length, mature: mature, learning: learning,
      fresh: total - ids.length, due: dueIds(state, now).length,
      accuracy: cs + ws ? Math.round((cs / (cs + ws)) * 100) : null,
      streak: streak(state, now), weak: weak
    };
  }

  function streak(state, now) {
    var n = 0, t = now;
    var today = state.daily[dayKey(t)];
    if (!(today && today.reviews > 0)) t -= DAY; // сегодня ещё не занимался — серия не рвётся до конца дня
    while (true) {
      var d = state.daily[dayKey(t)];
      if (d && d.reviews > 0) { n++; t -= DAY; } else break;
    }
    return n;
  }

  return {
    DAY: DAY, PASS_PCT: PASS_PCT, DUE_LIMIT_FOR_NEW: DUE_LIMIT_FOR_NEW, STAGES: STAGES,
    emptyState: emptyState, newCard: newCard, grade: grade, applyGrade: applyGrade,
    rangeIds: rangeIds, learnDone: learnDone, testDone: testDone, stageDone: stageDone,
    currentStageIndex: currentStageIndex, dueIds: dueIds, nextNewIds: nextNewIds, introduce: introduce,
    checkTyped: checkTyped, checkSpoken: checkSpoken, ruConflict: ruConflict, buildTest: buildTest, scoreTest: scoreTest,
    recordTest: recordTest, stats: stats, streak: streak, dayKey: dayKey, shuffle: shuffle, bump: bump
  };
});

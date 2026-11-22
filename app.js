(function () {
  'use strict';
  var V = window.VERBS, L = window.VL;
  var app = document.getElementById('app');
  var KEY = 'verbes.v1';
  var S, storageOk = true, ses = null;

  /* ---------- хранилище ---------- */
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) { var o = JSON.parse(raw); if (o && o.v === 1) return o; }
    } catch (e) { storageOk = false; }
    return L.emptyState();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { storageOk = false; }
  }
  function now() { return Date.now(); }

  /* ---------- утилиты ---------- */
  function h(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var K = null, lastKey = '';
  function render(html) {
    var k = K || ('x' + Math.random()); K = null;
    var enter = k !== lastKey; lastKey = k;
    app.innerHTML = '<div class="screen' + (enter ? ' enter' : '') + '">' + html + '</div>';
    if (enter) window.scrollTo(0, 0);
  }
  function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* нет вибро */ } }
  function ring(pct, label, sub, cls) {
    var C = 2 * Math.PI * 52;
    return '<div class="ring ' + (cls || '') + '"><svg viewBox="0 0 120 120"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4da3ff"/><stop offset="1" stop-color="#af52de"/></linearGradient></defs>' +
      '<circle class="rt" cx="60" cy="60" r="52"/><circle class="rf" cx="60" cy="60" r="52" style="--c:' + C.toFixed(1) + ';--o:' + (C * (1 - pct / 100)).toFixed(1) + '"/></svg>' +
      '<div class="rc"><b>' + label + '</b><span>' + sub + '</span></div></div>';
  }
  function confetti() {
    var box = document.createElement('div'); box.className = 'confetti';
    var colors = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#af52de'];
    for (var i = 0; i < 46; i++) {
      var p = document.createElement('i');
      p.style.left = (Math.random() * 100) + '%';
      p.style.background = colors[i % colors.length];
      p.style.setProperty('--dx', (Math.random() * 120 - 60) + 'px');
      p.style.setProperty('--r', (Math.random() * 720 - 360) + 'deg');
      p.style.setProperty('--t', (1.6 + Math.random() * 1.4) + 's');
      p.style.animationDelay = (Math.random() * .4) + 's';
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(function () { box.remove(); }, 3600);
  }

  /* ---------- озвучка: готовые аудио, запасной синтезатор ---------- */
  var audioIdx = null, packs = {}, curAudio = null;
  function fetchOk(u, kind) {
    if (typeof fetch !== 'function') return Promise.reject(new Error('no fetch'));
    return fetch(u).then(function (r) { if (!r.ok) throw new Error(r.status); return kind === 'json' ? r.json() : r.arrayBuffer(); });
  }
  function loadIdx() {
    if (!audioIdx) audioIdx = fetchOk('audio-index.json', 'json').catch(function (e) { audioIdx = null; throw e; });
    return audioIdx;
  }
  function loadPack(n) {
    if (!packs[n]) packs[n] = fetchOk('audio-pack' + n + '.mp3').catch(function (e) { delete packs[n]; throw e; });
    return packs[n];
  }
  function synthFallback(t) {
    if (!('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(t);
      u.lang = 'fr-FR'; u.rate = 0.85;
      var v = speechSynthesis.getVoices().filter(function (x) { return /^fr/i.test(x.lang); })[0];
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch (e) { /* озвучка необязательна */ }
  }
  function speak(id) {
    if (!S.settings.sound) return;
    loadIdx().then(function (ix) {
      var e = ix[id];
      if (!e) throw new Error('нет записи');
      return loadPack(e[0]).then(function (buf) {
        var url = URL.createObjectURL(new Blob([buf.slice(e[1], e[1] + e[2])], { type: 'audio/mpeg' }));
        if (curAudio) { try { curAudio.pause(); } catch (x) { /* ок */ } }
        var a = new Audio(url); curAudio = a;
        a.onended = function () { URL.revokeObjectURL(url); };
        return a.play();
      });
    }).catch(function () { synthFallback(V[id].fr); });
  }

  /* ---------- голосовой ввод ---------- */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  function voiceOn() { return !!SR && S.settings.voice !== false; }
  // st(state, text): 'ready' — микрофон включился; 'heard' — промежуточный текст
  function listen(cb, st) {
    var r = new SR(), done = false, alts = [], sil = null, max = null;
    r.lang = 'fr-FR'; r.maxAlternatives = 6; r.interimResults = true; r.continuous = true;
    function note(state, text) { if (st) st(state, text); }
    function fin(o) {
      if (done) return; done = true; clearTimeout(sil); clearTimeout(max);
      try { r.stop(); } catch (e) { /* ок */ }
      cb(o);
    }
    r.onstart = function () { note('ready'); };
    r.onaudiostart = function () { note('ready'); };
    r.onresult = function (e) {
      var res = e.results[e.results.length - 1], list = [];
      for (var i = 0; i < res.length; i++) list.push(res[i].transcript);
      if (list.length) { alts = list; note('heard', list[0]); }
      clearTimeout(sil);
      sil = setTimeout(function () { try { r.stop(); } catch (x) { fin(alts.length ? { alts: alts } : { err: 'no-speech' }); } }, res.isFinal ? 150 : 1400);
    };
    r.onerror = function (e) {
      if (e.error === 'no-speech' && alts.length) return fin({ alts: alts });
      fin({ err: e.error || 'error' });
    };
    r.onend = function () { fin(alts.length ? { alts: alts } : { err: 'no-speech' }); };
    max = setTimeout(function () { try { r.stop(); } catch (x) { fin({ err: 'no-speech' }); } }, 9000);
    try { r.start(); } catch (e) { fin({ err: 'start' }); }
    return r;
  }
  function voiceErr(code) {
    if (code === 'not-allowed' || code === 'service-not-allowed') return 'Нет доступа к микрофону. Разрешите его для сайта в настройках браузера (нужна страница по HTTPS, не предпросмотр).';
    if (code === 'no-speech') return 'Ничего не услышал. Дождитесь надписи «Говорите» и скажите слово чётко, не слишком тихо.';
    if (code === 'network') return 'Распознавание речи работает через интернет — нет связи.';
    if (code === 'audio-capture') return 'Микрофон не найден.';
    return 'Не удалось распознать (' + code + '). Напишите ответ.';
  }
  function setText(id, t) { var el = document.getElementById(id); if (el) el.textContent = t; }
  function micBtn(act) {
    return voiceOn() ? '<button class="mic" data-act="' + act + '" aria-label="Ответить голосом">🎤</button>' : '';
  }
  function stopRec() { if (ses && ses.rec && ses.rec.stop) { try { ses.rec.stop(); } catch (e) { /* ок */ } } if (ses) ses.rec = null; }
  function micOn(on) { var b = document.querySelector('.mic'); if (b) b.classList.toggle('on', on); }

  /* ---------- элементы разметки ---------- */
  function btn(act, label, cls, arg) {
    return '<button class="btn ' + (cls || '') + '" data-act="' + act + '"' + (arg !== undefined ? ' data-arg="' + h(arg) + '"' : '') + '>' + label + '</button>';
  }
  function speakBtn(id) {
    return '<button class="sound" data-act="speak" data-arg="' + id + '" aria-label="Озвучить">🔊</button>';
  }
  function top(title, back) {
    return '<div class="top">' + (back ? '<button class="icon" data-act="home" aria-label="Назад">←</button>' : '<span></span>') +
      '<div class="ttl">' + h(title) + '</div><span></span></div>';
  }
  function clearTimers() { if (ses && ses.tm) { clearTimeout(ses.tm); ses.tm = null; } }

  /* ---------- главный экран ---------- */
  function home() {
    clearTimers(); stopRec();
    ses = null;
    var t = now();
    var st = L.stats(S, V.length, t);
    var idx = L.currentStageIndex(S);
    var stg = L.STAGES[idx];
    var due = st.due;
    var today = S.daily[L.dayKey(t)] || { reviews: 0, newCards: 0 };
    var pct = Math.round(st.introduced / V.length * 100);
    var out = '<div class="top"><div class="ttl big">Les verbes</div><div class="streak" title="Дней подряд">🔥 ' + st.streak + '</div></div>';
    if (!storageOk) out += '<div class="warn">Браузер не даёт сохранять прогресс — он пропадёт при закрытии. Используйте экспорт в настройках.</div>';
    out += '<div class="card hero">' + ring(pct, st.introduced, 'из ' + V.length) +
      '<div class="info"><div class="h2">Прогресс</div><div class="muted">Закреплено надолго: <b>' + st.mature + '</b></div>' +
      '<div class="muted">Сегодня: ' + today.reviews + ' ответов, ' + today.newCards + ' новых</div></div></div>';

    if (idx >= L.STAGES.length) {
      out += '<div class="card ok"><b>Все 300 глаголов и все тесты пройдены.</b><div class="muted">Продолжайте повторения — интервалы будут расти.</div></div>';
    } else {
      out += '<div class="card cur"><div class="muted">Сейчас</div><div class="h2">' + h(stg.title) + '</div>';
      if (stg.type === 'learn') {
        var size = stg.to - stg.from;
        var seen = L.rangeIds(stg).filter(function (i) { return S.cards[i]; }).length;
        out += '<div class="bar"><i style="width:' + Math.round(seen / size * 100) + '%"></i></div><div class="muted">Блок из ' + size + ' глаголов: введено ' + seen + '. Тест откроется после каждых 50.</div>';
        var nn = L.nextNewIds(S, t, S.settings.batch);
        if (nn.length) out += btn('learn', 'Учить новые (' + nn.length + ')', 'primary');
        else if (seen < size) out += '<div class="muted">Новые откроются, когда просроченных карточек станет не больше ' + L.DUE_LIMIT_FOR_NEW + ' (сейчас ' + due + ').</div>';
      } else {
        var tt = S.tests[stg.id];
        out += '<div class="muted">Порог: ' + L.PASS_PCT + '%. ' + (tt ? 'Лучший результат: ' + tt.best + '%, попыток: ' + tt.attempts + '.' : 'Ещё не сдавали.') + '</div>';
        out += btn('test', 'Начать тест (' + (stg.to - stg.from) + ' вопросов)', 'primary');
      }
      out += '</div>';
    }
    out += btn('review', due ? 'Повторить (' + due + ')' : 'Повторять пока нечего', due ? 'primary' : 'ghost');
    out += '<div class="two">' + btn('stats', 'Статистика', 'ghost') + btn('settings', 'Настройки', 'ghost') + '</div>';

    out += '<div class="h3">Путь</div><ul class="path">';
    L.STAGES.forEach(function (s, i) {
      var done = L.stageDone(S, s), cur = i === idx;
      var mark = done ? '✓' : cur ? '▶' : '·';
      var extra = s.type === 'test' && S.tests[s.id] ? ' <span class="muted">' + S.tests[s.id].best + '%</span>' : '';
      out += '<li class="' + (done ? 'done' : cur ? 'cur' : 'lock') + '"><span>' + mark + '</span> ' + h(s.title) + extra + '</li>';
    });
    out += '</ul>';
    render(out);
  }

  /* ---------- новые глаголы: знакомство (одно нажатие на слово) ---------- */
  function startLearn() {
    var ids = L.nextNewIds(S, now(), S.settings.batch);
    if (!ids.length) return home();
    ses = { kind: 'intro', ids: ids, i: 0 };
    renderIntro();
  }
  function renderIntro() {
    var id = ses.ids[ses.i], v = V[id];
    K = 'i' + ses.i;
    render(top('Новый глагол ' + (ses.i + 1) + '/' + ses.ids.length, true) +
      '<div class="card big center pop"><div class="fr">' + h(v.fr) + '</div><div class="ipa">/' + h(v.ipa) + '/</div>' +
      '<div class="ru">' + h(v.ru) + '</div>' + speakBtn(id) +
      (voiceOn() ? '<div class="sayrow">' + micBtn('say') + '<span id="say" class="muted">Нажмите 🎤 и произнесите глагол</span></div>' : '') + '</div>' +
      btn('intro-next', ses.i + 1 < ses.ids.length ? 'Дальше' : 'К вопросам', 'primary'));
    if (S.settings.autoplay) speak(id);
  }
  function introNext() {
    stopRec();
    ses.i++;
    if (ses.i < ses.ids.length) return renderIntro();
    L.introduce(S, ses.ids, now());
    save();
    startLearnQuiz(ses.ids);
  }
  // проверка произношения на карточке (без оценки)
  function micSay() {
    if (!ses || ses.rec) return stopRec();
    var id = ses.ids[ses.i];
    micOn(true); setText('say', 'Подождите секунду…');
    ses.rec = listen(function (o) {
      if (!ses || ses.kind !== 'intro' || ses.ids[ses.i] !== id) return;
      ses.rec = null; micOn(false);
      if (o.err) return setText('say', voiceErr(o.err));
      var r = L.checkSpoken(V, id, o.alts);
      var ok = r.kind !== 'wrong';
      setText('say', ok ? '✓ Распознано: «' + r.heard + '»' : 'Услышал «' + (o.alts[0] || '') + '». Послушайте образец 🔊 и попробуйте ещё раз.');
      buzz(ok ? 12 : [30, 40, 30]);
    }, function (state, t) {
      if (!ses || ses.kind !== 'intro' || ses.ids[ses.i] !== id) return;
      setText('say', state === 'ready' ? '🎙 Говорите…' : 'Слышу: «' + t + '»');
    });
  }

  /* ---------- общий движок вопросов ---------- */
  function newQuiz(o) {
    ses = Object.assign({ kind: 'quiz', queue: [], total: 0, done: 0, n: 0, picked: null, res: null, t0: Date.now(), tm: null, rec: null }, o);
    ses.total = ses.queue.length;
    renderQ();
  }
  function requeue(it) {
    ses.queue.splice(Math.min(4, ses.queue.length), 0, { id: it.id, dir: it.dir, type: it.type, first: false });
    ses.total++;
  }
  function renderQ() {
    var it = ses.queue[0];
    if (!it) return ses.finish();
    if (it.type) return renderType(it);
    var v = V[it.id];
    if (!it.options) it.options = L.options(V, it.id, ses.pool ? ses.pool(it.id) : []);
    if (!it.shown) { it.shown = true; ses.t0 = Date.now(); }
    K = 'q' + ses.n;
    var prompt = it.dir === 'fr2ru'
      ? '<div class="fr">' + h(v.fr) + '</div><div class="ipa">/' + h(v.ipa) + '/</div>' + speakBtn(it.id)
      : '<div class="ru big">' + h(v.ru) + '</div>';
    var opts = it.options.map(function (o) {
      var label = it.dir === 'fr2ru' ? V[o].ru : V[o].fr;
      var cls = '';
      if (ses.picked !== null) cls = o === it.id ? 'right' : (o === ses.picked ? 'wrongc' : 'dim');
      return '<button class="opt ' + cls + '" data-act="pick" data-arg="' + o + '"' + (ses.picked !== null ? ' disabled' : '') + '>' + h(label) + '</button>';
    }).join('');
    var extra = '';
    if (ses.picked !== null) {
      extra = '<div class="cap">' + h(v.fr) + ' /' + h(v.ipa) + '/ — ' + h(v.ru) + '</div>';
      if (ses.picked !== it.id) extra += btn('advance', 'Дальше', 'primary');
    }
    render(head() + '<div class="card big center"><div class="muted">' + (it.dir === 'fr2ru' ? 'Выберите перевод' : 'Выберите французский глагол') + '</div>' + prompt + '</div>' +
      '<div class="opts">' + opts + '</div>' + extra);
  }
  function head() {
    var pct = ses.total ? Math.round(ses.done / ses.total * 100) : 0;
    return '<div class="top"><button class="icon" data-act="quit" aria-label="Выйти">✕</button><div class="ttl">' + h(ses.title) + '</div><span></span></div>' +
      '<div class="bar"><i style="width:' + pct + '%"></i></div>';
  }
  function pick(o) {
    if (!ses || ses.picked !== null) return;
    var it = ses.queue[0], ok = o === it.id, ms = Date.now() - ses.t0;
    ses.picked = o;
    speak(it.id);
    buzz(ok ? 12 : [30, 40, 30]);
    ses.answer(it, ok, ms);
    renderQ();
    if (ok) { clearTimeout(ses.tm); ses.tm = setTimeout(advance, 900); }
  }
  function advance() {
    if (!ses || ses.kind !== 'quiz' || ses.picked === null) return;
    clearTimeout(ses.tm); ses.tm = null;
    ses.queue.shift(); ses.picked = null; ses.res = null; ses.n++;
    renderQ();
  }

  /* ---------- режим ввода / голоса (по желанию, в настройках) ---------- */
  function renderType(it) {
    var v = V[it.id];
    if (!it.shown) { it.shown = true; ses.t0 = Date.now(); }
    K = 'q' + ses.n;
    if (ses.picked === null) {
      render(head() + '<div class="card big center"><div class="muted">' + (voiceOn() ? 'Напишите или скажите' : 'Напишите') + ' по-французски (инфинитив)</div><div class="ru">' + h(v.ru) + '</div>' +
        '<div class="inrow"><input id="ans" class="inp" type="text" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="verbe…">' + micBtn('mic') + '</div>' +
        '<div id="hint" class="muted"></div></div>' +
        '<div class="three3">' + btn('hint', 'Подсказка', 'ghost') + btn('idk', 'Не знаю', 'ghost') + btn('check', 'Проверить', 'primary') + '</div>');
      var inp = document.getElementById('ans');
      if (inp) { inp.focus(); inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') check(); }); }
      return;
    }
    var r = ses.res, good = r.kind !== 'wrong';
    var msg = r.kind === 'exact' ? 'Верно' : r.kind === 'accent' ? 'Верно, но проверьте написание: ' + h(v.fr)
      : r.kind === 'near' ? 'Принято на слух (услышал «' + h(r.heard) + '»). Проверьте написание: ' + h(v.fr)
      : r.kind === 'alt' ? 'Тоже подходит «' + h(V[r.other].fr) + '», но здесь ожидался «' + h(v.fr) + '»' : 'Неверно. Правильно: ' + h(v.fr);
    render(head() + '<div class="card big center pop ' + (good ? 'ok' : 'bad') + '"><div class="msg">' + msg + '</div>' +
      '<div class="fr">' + h(v.fr) + '</div><div class="ipa">/' + h(v.ipa) + '/</div><div class="ru">' + h(v.ru) + '</div>' + speakBtn(it.id) + '</div>' +
      (good ? '' : btn('advance', 'Дальше', 'primary')));
  }
  function resolveType(res) {
    var it = ses.queue[0], ms = Date.now() - ses.t0, ok = res.kind !== 'wrong';
    ses.res = res; ses.picked = true;
    speak(it.id);
    buzz(ok ? 12 : [30, 40, 30]);
    ses.answer(it, ok, ms);
    renderType(it);
    if (ok) { clearTimeout(ses.tm); ses.tm = setTimeout(advance, 1100); }
  }
  function check() {
    stopRec();
    var inp = document.getElementById('ans'), val = inp ? inp.value : '';
    if (!val.trim()) return setText('hint', 'Напишите или скажите ответ, либо нажмите «Не знаю».');
    resolveType(L.checkTyped(V, ses.queue[0].id, val));
  }
  function hint() {
    var v = V[ses.queue[0].id], el = document.getElementById('hint');
    if (el) el.textContent = v.fr.charAt(0) + ' ' + new Array(v.fr.length).join('_ ') + ' (' + v.fr.length + ' букв)';
  }
  function micAnswer() {
    if (!ses || ses.rec) return stopRec();
    var it = ses.queue[0];
    micOn(true); setText('hint', 'Подождите секунду…');
    ses.rec = listen(function (o) {
      if (!ses || ses.queue[0] !== it || ses.picked !== null) return;
      ses.rec = null; micOn(false);
      if (o.err) return setText('hint', voiceErr(o.err));
      var r = L.checkSpoken(V, it.id, o.alts);
      if (r.kind === 'wrong') return setText('hint', 'Услышал: «' + (o.alts[0] || '') + '» — не совпало. Скажите ещё раз, напишите или нажмите «Не знаю».');
      resolveType(r);
    }, function (state, t) {
      if (!ses || ses.queue[0] !== it || ses.picked !== null) return;
      setText('hint', state === 'ready' ? '🎙 Говорите (одно слово, по-французски)…' : 'Слышу: «' + t + '»');
      if (state === 'ready') buzz(10);
    });
  }

  /* ---------- закрепление новой группы ---------- */
  function poolIntroduced() {
    var stg = L.STAGES[L.currentStageIndex(S)];
    var base = Object.keys(S.cards).map(Number);
    return stg && stg.type === 'learn' ? base.concat(L.rangeIds(stg)) : base;
  }
  function startLearnQuiz(ids) {
    var items = [];
    ids.forEach(function (id) {
      items.push({ id: id, dir: 'fr2ru', first: true });
      items.push({ id: id, dir: 'ru2fr', first: true });
    });
    var pool = poolIntroduced(), rec = {};
    newQuiz({
      mode: 'learn', title: 'Закрепление', queue: L.shuffle(items, Math.random), ids: ids,
      pool: function () { return pool; },
      answer: function (it, ok) {
        if (ok) { ses.done++; return; }
        rec[it.id] = (rec[it.id] || 0) + 1;
        requeue(it);
      },
      finish: function () {
        var t = now();
        ids.forEach(function (id) { L.applyGrade(S, id, rec[id] ? 1 : 2, t); });
        save();
        learnGroupDone(ids, Object.keys(rec).length);
      }
    });
  }
  function learnGroupDone(ids, hard) {
    var t = now(), idx = L.currentStageIndex(S), stg = L.STAGES[idx];
    var nn = L.nextNewIds(S, t, S.settings.batch);
    var out = top('Группа пройдена', false) + '<div class="card center ok pop"><div class="h2">✓ ' + ids.length + ' глаголов</div><div class="muted">' +
      (hard ? 'С ошибками: ' + hard + ' — они вернутся в повторения чаще.' : 'Все ответы с первого раза.') + '</div></div>';
    if (stg && stg.type === 'test') out += '<div class="card ok">Блок закреплён — открыт тест: ' + h(stg.title) + '.</div>' + btn('test', 'Начать тест', 'primary');
    else if (nn.length) out += btn('learn', 'Дальше: ещё ' + nn.length + ' глаголов', 'primary');
    else if (stg && stg.type === 'learn') out += '<div class="muted">Новые откроются, когда просроченных карточек станет не больше ' + L.DUE_LIMIT_FOR_NEW + '.</div>';
    out += btn('home', 'На главную', 'ghost');
    ses = { kind: 'result' };
    render(out);
  }

  /* ---------- повторение ---------- */
  function startReview(ids, title) {
    var t = now();
    if (!ids) ids = L.dueIds(S, t).slice(0, 25);
    ids = ids.filter(function (id) { return S.cards[id]; });
    if (!ids.length) return home();
    var items = ids.map(function (id) {
      var c = S.cards[id];
      return { id: id, dir: c.r >= 2 ? 'ru2fr' : 'fr2ru', type: !!(S.settings.typed && c.r >= 3), first: true };
    });
    var pool = Object.keys(S.cards).map(Number), okN = 0, wrongN = 0;
    newQuiz({
      mode: 'review', title: title || 'Повторение', queue: L.shuffle(items, Math.random),
      pool: function () { return pool; },
      answer: function (it, ok, ms) {
        if (it.first !== false) {
          L.applyGrade(S, it.id, L.autoGrade(ok, ms, S.cards[it.id].r), now());
          save();
          if (ok) okN++; else wrongN++;
        }
        if (ok) ses.done++; else requeue(it);
      },
      finish: function () { reviewDone(okN, wrongN); }
    });
  }
  function reviewDone(okN, wrongN) {
    var acc = okN + wrongN ? Math.round(okN / (okN + wrongN) * 100) : 100;
    var idx = L.currentStageIndex(S), stg = L.STAGES[idx];
    var n = L.nextNewIds(S, now(), S.settings.batch).length;
    var next = stg && stg.type === 'test' ? '<div class="card ok">Блок закреплён — открыт тест: ' + h(stg.title) + '.</div>' + btn('test', 'Начать тест', 'primary') : '';
    ses = { kind: 'result' };
    render(top('Готово', false) + '<div class="card center pop"><div class="h2">Сессия завершена</div><div class="muted">Верно с первой попытки: ' + acc + '% (ошибок: ' + wrongN + ')</div></div>' +
      next + (n && !next ? btn('learn', 'Новые глаголы (' + n + ')', 'primary') : '') + btn('home', 'На главную', 'ghost'));
  }

  /* ---------- тест ---------- */
  function startTest() {
    var idx = L.currentStageIndex(S), stg = L.STAGES[idx];
    if (!stg || stg.type !== 'test') return home();
    var correct = 0, wrong = [];
    newQuiz({
      mode: 'test', title: stg.title, queue: L.buildTest(V, stg, Math.random),
      answer: function (it, ok) {
        ses.done++;
        if (ok) correct++; else wrong.push(it.id);
      },
      finish: function () { finishTest(stg, correct, wrong); }
    });
  }
  function finishTest(stg, correct, wrong) {
    var t = now(), n = stg.to - stg.from;
    var sc = L.scoreTest(correct, n);
    L.recordTest(S, stg.id, sc.pct, t);
    wrong.forEach(function (id) { if (S.cards[id]) L.applyGrade(S, id, 0, t); });
    save();
    var list = wrong.map(function (id) { return '<li><b>' + h(V[id].fr) + '</b> /' + h(V[id].ipa) + '/ — ' + h(V[id].ru) + '</li>'; }).join('');
    var nextStg = L.STAGES[L.currentStageIndex(S)];
    var out = top('Результат', false) + '<div class="card center pop ' + (sc.passed ? 'ok' : 'bad') + '">' + ring(sc.pct, sc.pct + '%', 'порог ' + L.PASS_PCT + '%', sc.passed ? '' : 'bad') + '<div class="muted">' + correct + ' из ' + n + '</div>' +
      '<div class="h2">' + (sc.passed ? 'Тест пройден' : 'Пока не хватает — повторите и пересдайте') + '</div></div>';
    if (wrong.length) out += '<div class="h3">Ошибки (' + wrong.length + ') — вернулись в повторения</div><ul class="wl">' + list + '</ul>';
    if (sc.passed) {
      out += nextStg ? '<div class="muted center">Дальше: ' + h(nextStg.title) + '</div>' : '<div class="muted center">Это был последний тест.</div>';
      out += btn('home', 'Продолжить', 'primary');
    } else {
      out += (wrong.length ? btn('review-wrong', 'Повторить ошибки', 'primary') : '') + btn('test', 'Пересдать сразу', 'ghost') + btn('home', 'На главную', 'ghost');
    }
    ses = { kind: 'result', wrong: wrong.slice() };
    render(out);
    if (sc.passed) { confetti(); buzz([20, 60, 20, 60, 40]); }
  }

  /* ---------- статистика ---------- */
  function statsView() {
    var st = L.stats(S, V.length, now());
    var weak = st.weak.map(function (w) {
      return '<li><b>' + h(V[w.id].fr) + '</b> — ' + h(V[w.id].ru) + ' <span class="muted">провалов: ' + w.bad + '</span></li>';
    }).join('') || '<li class="muted">Пока нет.</li>';
    render(top('Статистика', true) +
      '<div class="card"><div class="row"><span>Введено</span><b>' + st.introduced + ' / ' + st.total + '</b></div>' +
      '<div class="row"><span>В обучении (интервал &lt;21 дня)</span><b>' + st.learning + '</b></div>' +
      '<div class="row"><span>Закреплено (≥21 дня)</span><b>' + st.mature + '</b></div>' +
      '<div class="row"><span>Просрочено сейчас</span><b>' + st.due + '</b></div>' +
      '<div class="row"><span>Точность ответов за всё время</span><b>' + (st.accuracy === null ? '—' : st.accuracy + '%') + '</b></div>' +
      '<div class="row"><span>Серия дней</span><b>' + st.streak + '</b></div></div>' +
      '<div class="h3">Самые трудные</div><ul class="wl">' + weak + '</ul>' +
      '<div class="muted">«Закреплено» — оценка по расписанию повторений, а не гарантия, что вы вспомните глагол в речи.</div>');
  }

  /* ---------- настройки ---------- */
  function settingsView(msg) {
    var s = S.settings;
    render(top('Настройки', true) + (msg ? '<div class="card ok">' + h(msg) + '</div>' : '') +
      '<div class="card"><label class="row"><span>Озвучка</span><input type="checkbox" data-set="sound"' + (s.sound ? ' checked' : '') + '></label>' +
      '<label class="row"><span>Автопроизношение на новой карточке</span><input type="checkbox" data-set="autoplay"' + (s.autoplay ? ' checked' : '') + '></label>' +
      (SR ? '<label class="row"><span>Проверка произношения (🎤)</span><input type="checkbox" data-set="voice"' + (s.voice !== false ? ' checked' : '') + '></label>' : '') +
      '<label class="row"><span>Сложнее: вводить или говорить ответ вместо вариантов (для карточек, которые вы уже хорошо знаете)</span><input type="checkbox" data-set="typed"' + (s.typed ? ' checked' : '') + '></label>' +
      '<label class="row"><span>Новых слов в группе</span><select data-set="batch">' + [3, 5, 7].map(function (n) { return '<option' + (n === s.batch ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label></div>' +
      '<div class="h3">Резервная копия</div><div class="muted">Прогресс хранится только в этом браузере. Скопируйте текст ниже и сохраните; для восстановления вставьте его в поле и нажмите «Загрузить».</div>' +
      '<textarea id="bk" class="ta" rows="5"></textarea>' +
      '<div class="two">' + btn('export', 'Показать копию', 'ghost') + btn('import', 'Загрузить', 'ghost') + '</div>' +
      '<div class="h3">Сброс</div>' + btn('reset', 'Стереть весь прогресс', 'danger'));
  }
  function exportData() { var t = document.getElementById('bk'); t.value = JSON.stringify(S); t.select(); }
  function importData() {
    var t = document.getElementById('bk');
    try {
      var o = JSON.parse(t.value);
      if (!o || o.v !== 1 || typeof o.cards !== 'object' || typeof o.tests !== 'object') throw new Error('format');
      S = Object.assign(L.emptyState(), o);
      S.settings = Object.assign(L.emptyState().settings, o.settings || {});
      fixSettings();
      save(); settingsView('Прогресс загружен.');
    } catch (e) { settingsView('Не удалось прочитать копию: неверный формат.'); }
  }
  var resetArmed = false;
  function reset() {
    if (!resetArmed) { resetArmed = true; var b = document.querySelector('[data-act="reset"]'); if (b) b.textContent = 'Нажмите ещё раз — удалить всё'; return; }
    resetArmed = false; S = L.emptyState(); save(); home();
  }
  function fixSettings() {
    S.settings = Object.assign(L.emptyState().settings, S.settings || {});
    if ([3, 5, 7].indexOf(S.settings.batch) < 0) S.settings.batch = 5; // раньше было 10 за раз
  }

  /* ---------- события ---------- */
  app.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    var a = el.getAttribute('data-act'), arg = el.getAttribute('data-arg');
    buzz(6);
    switch (a) {
      case 'home': return home();
      case 'quit': return home();
      case 'learn': return startLearn();
      case 'intro-next': return introNext();
      case 'review': return startReview(null);
      case 'pick': return pick(+arg);
      case 'advance': return advance();
      case 'check': return check();
      case 'hint': return hint();
      case 'idk': stopRec(); return resolveType({ kind: 'wrong' });
      case 'mic': return micAnswer();
      case 'say': return micSay();
      case 'speak': return speak(+arg);
      case 'test': return startTest();
      case 'review-wrong': return startReview(ses && ses.wrong ? ses.wrong.filter(function (x, i, arr) { return arr.indexOf(x) === i; }) : null, 'Разбор ошибок');
      case 'stats': return statsView();
      case 'settings': return settingsView();
      case 'export': return exportData();
      case 'import': return importData();
      case 'reset': return reset();
    }
  });
  app.addEventListener('change', function (e) {
    var k = e.target.getAttribute && e.target.getAttribute('data-set');
    if (!k) return;
    S.settings[k] = e.target.type === 'checkbox' ? e.target.checked : +e.target.value;
    save();
  });

  S = load();
  fixSettings();
  home();

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !window.__SINGLE_FILE__) {
    try { navigator.serviceWorker.register('sw.js').catch(function () {}); } catch (e) { /* без офлайна */ }
  }
})();

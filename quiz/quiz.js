/* CAMM 311 in-class quiz - student page. Plain JS. All checking is on the server; the phone never holds a correct answer. */
(function () {
  'use strict';
  var CFG = window.QUIZ_CFG;
  var SKEY = 'camm311_quiz_session';
  var LKEY = 'camm311_quiz_lang';

  var T = {
    en: {
      title: 'In-class quiz', intro: 'Enter your sign-up email and the room code shown on the screen.',
      email: 'Sign-up email', room: 'Room code', start: 'Start', checking: 'Checking...',
      badEmail: 'Check your email address.', badRoom: 'Enter the room code from the screen.',
      cannot: 'Cannot start. Check your email and the room code, and that the quiz is open.',
      already: 'Already started on another device. Ask the lecturer.',
      poolShort: 'The quiz is not ready. Tell the lecturer.',
      later: 'Too many tries. Wait a few minutes.',
      noServer: 'No connection. Try again.',
      noQuiz: 'No quiz is open right now.', closedNote: 'The quiz is not open. Wait for the lecturer.',
      rules: 'One question at a time, 60 seconds each. No going back. Do not leave this screen: leaving locks the question.',
      qOf: function (a, b) { return 'Question ' + a + ' of ' + b; }, sec: 's',
      calc: 'Calculator', calcBack: 'Back to question', calcErr: 'Error',
      sending: 'Saving...', saved: 'Answer saved.', timeUp: 'Time is up.',
      lockedT: 'Question locked', lockedB: 'You left the app during this question. It is locked and the lecturer can see it.',
      cont: 'Next question', doneT: 'Quiz finished', doneB: 'Your answers are saved. You can close this page.',
      lobT: 'You are signed in', lobB: 'Wait here. The quiz starts when the lecturer presses Start. This page continues by itself.', pendT: 'Waiting for the lecturer', pendB: 'Your device is waiting for approval. This page continues by itself.', closedT: 'Quiz closed', closedB: 'The quiz is closed. Unanswered questions count as wrong.',
      sendFail: 'Could not save. Tap your answer again.', session: 'Session ended. Start again.', as: 'Signed in as'
    },
    gr: {
      title: 'Κουίζ στην τάξη', intro: 'Γράψτε το email εγγραφής σας και τον κωδικό αίθουσας που φαίνεται στην οθόνη.',
      email: 'Email εγγραφής', room: 'Κωδικός αίθουσας', start: 'Έναρξη', checking: 'Έλεγχος...',
      badEmail: 'Ελέγξτε το email σας.', badRoom: 'Γράψτε τον κωδικό αίθουσας από την οθόνη.',
      cannot: 'Δεν είναι δυνατή η έναρξη. Ελέγξτε το email, τον κωδικό και ότι το κουίζ είναι ανοιχτό.',
      already: 'Έχει ήδη ξεκινήσει σε άλλη συσκευή. Ρωτήστε τον διδάσκοντα.',
      poolShort: 'Το κουίζ δεν είναι έτοιμο. Ενημερώστε τον διδάσκοντα.',
      later: 'Πολλές προσπάθειες. Περιμένετε λίγα λεπτά.',
      noServer: 'Δεν υπάρχει σύνδεση. Δοκιμάστε ξανά.',
      noQuiz: 'Δεν υπάρχει ανοιχτό κουίζ αυτή τη στιγμή.', closedNote: 'Το κουίζ δεν είναι ανοιχτό. Περιμένετε τον διδάσκοντα.',
      rules: 'Μία ερώτηση τη φορά, 60 δευτερόλεπτα η καθεμία. Δεν επιστρέφετε πίσω. Μην φύγετε από αυτή την οθόνη: η έξοδος κλειδώνει την ερώτηση.',
      qOf: function (a, b) { return 'Ερώτηση ' + a + ' από ' + b; }, sec: 'δ',
      calc: 'Αριθμομηχανή', calcBack: 'Πίσω στην ερώτηση', calcErr: 'Σφάλμα',
      sending: 'Αποθήκευση...', saved: 'Η απάντηση αποθηκεύτηκε.', timeUp: 'Ο χρόνος τελείωσε.',
      lockedT: 'Η ερώτηση κλειδώθηκε', lockedB: 'Φύγατε από την εφαρμογή κατά τη διάρκεια της ερώτησης. Κλειδώθηκε και ο διδάσκων το βλέπει.',
      cont: 'Επόμενη ερώτηση', doneT: 'Το κουίζ ολοκληρώθηκε', doneB: 'Οι απαντήσεις σας αποθηκεύτηκαν. Μπορείτε να κλείσετε τη σελίδα.',
      lobT: 'Έχετε συνδεθεί', lobB: 'Περιμένετε εδώ. Το κουίζ ξεκινά όταν ο διδάσκων πατήσει Έναρξη. Η σελίδα συνεχίζει αυτόματα.', pendT: 'Αναμονή για τον διδάσκοντα', pendB: 'Η συσκευή σας περιμένει έγκριση. Η σελίδα συνεχίζει αυτόματα.', closedT: 'Το κουίζ έκλεισε', closedB: 'Το κουίζ έκλεισε. Οι αναπάντητες ερωτήσεις μετρούν ως λάθος.',
      sendFail: 'Αποτυχία αποθήκευσης. Πατήστε ξανά την απάντησή σας.', session: 'Η συνεδρία έληξε. Ξεκινήστε ξανά.', as: 'Συνδεδεμένος ως'
    }
  };

  var S = { lang: 'en', sess: null, info: null, q: null, tick: 0, open: false, busy: false, graceTimer: 0 };
  try { S.lang = localStorage.getItem(LKEY) || (/^el/i.test(navigator.language || '') ? 'gr' : 'en'); } catch (e) {}
  try { S.sess = JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch (e) { S.sess = null; }
  /* sessions are tagged with the quiz id; a session left over from an earlier quiz is dropped so everyone signs in again */

  var main = document.getElementById('main');
  function t(k) { return T[S.lang][k]; }
  function el(tag, attrs) {
    var n = document.createElement(tag);
    for (var k in (attrs || {})) {
      if (k === 'class') n.className = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i]; if (c == null) continue;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return n;
  }
  function show(node) { closeCalc(); main.textContent = ''; main.appendChild(node); }

  /* ---------- calculator: inside the page, so the student never leaves the question ---------- */
  var calcNode = null, calcTimer = null;
  function hasMaths(q) {
    var s = q.stem_en || '';
    if (/Regulation/.test(s)) return false;
    var numbers = /€|%|\d{1,2}:\d{2}/.test(s) || (s.match(/\d+(?:[.,]\d+)?/g) || []).length >= 2;
    return numbers && (/€/.test(s) || q.options.some(function (o) { return /\d/.test(o.en); }));
  }
  /* own parser, no eval: x and / before + and -; after + or -, "n%" means n percent of the total so far */
  function calculate(expr) {
    var parts = expr.match(/\d*\.?\d+%?|\d+\.%?|[+−×÷]/g) || [];
    if (parts.join('') !== expr) return null;
    var i = 0;
    function value() {
      var sign = 1;
      while (parts[i] === '−') { sign = -sign; i++; }
      var p = parts[i++];
      if (p == null || /^[+×÷]$/.test(p)) return null;
      var pct = p.slice(-1) === '%';
      return { v: sign * Number(pct ? p.slice(0, -1) : p), pct: pct };
    }
    function term() {
      var a = value(); if (!a) return null;
      var v = a.pct ? a.v / 100 : a.v, lonePct = a.pct ? a.v : null;
      while (parts[i] === '×' || parts[i] === '÷') {
        var op = parts[i++], b = value(); if (!b) return null;
        var n = b.pct ? b.v / 100 : b.v;
        v = op === '×' ? v * n : v / n; lonePct = null;
      }
      return { v: v, lonePct: lonePct };
    }
    var first = term(); if (!first) return null;
    var total = first.v;
    while (i < parts.length) {
      var op = parts[i++]; if (op !== '+' && op !== '−') return null;
      var next = term(); if (!next) return null;
      var add = next.lonePct != null ? total * next.lonePct / 100 : next.v;
      total = op === '+' ? total + add : total - add;
    }
    if (!isFinite(total) || Math.abs(total) >= 1e15) return null;
    var r = Math.round(total * 1e6) / 1e6;
    return String(r).replace('-', '−');
  }
  function openCalc(q) {
    if (calcNode || S.busy) return;
    var done = false;
    var screen = el('output', { class: 'calc-screen', 'aria-live': 'polite' }, '');
    var expr = q._calc || '';
    function paint(text) { screen.textContent = text != null ? text : (expr || '0'); }
    function press(k) {
      if (k === 'C') { expr = ''; done = false; }
      else if (k === '⌫') { expr = expr.slice(0, -1); done = false; }
      else if (k === '=') {
        if (!expr) return;
        var r = calculate(expr);
        if (r == null) { paint(t('calcErr')); return; }
        expr = r; done = true;
      } else {
        if (done && /[\d.]/.test(k)) expr = '';
        done = false;
        if (/[+×÷]/.test(k) && /[+−×÷]$/.test(expr)) expr = expr.replace(/[+−×÷]+$/, '');
        if (k === '−' && /[+−]$/.test(expr)) expr = expr.slice(0, -1);
        if (/[+×÷%]/.test(k) && !expr) return;
        if (k === '%' && !/[\d.]$/.test(expr)) return;
        if (k === '.' && /\.\d*$/.test(expr)) return;
        if (/[\d.]/.test(k) && /%$/.test(expr)) return;
        if (expr.length < 40) expr += k;
      }
      q._calc = expr; paint();
    }
    var keys = el('div', { class: 'calc-keys' });
    ['C', '⌫', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', '.', '='].forEach(function (k) {
      var cls = 'calc-key' + (k === '0' ? ' wide' : '') + (/[\d.]/.test(k) ? '' : k === '=' ? ' eq' : ' fn');
      keys.appendChild(el('button', { class: cls, type: 'button', 'data-k': k, onclick: function () { press(k); } }, k));
    });
    calcTimer = el('span', { class: 'timer' }, '');
    calcNode = el('div', { class: 'calc', role: 'dialog', 'aria-label': t('calc') },
      el('div', { class: 'calc-in' },
        el('div', { class: 'qmeta' }, el('span', {}, t('calc')), calcTimer),
        el('p', { class: 'calc-stem' }, S.lang === 'en' ? q.stem_en : q.stem_gr),
        screen, keys,
        el('button', { class: 'btn block calc-back', type: 'button', onclick: function () { closeCalc(); } }, t('calcBack'))));
    paint();
    main.querySelector('.page').appendChild(calcNode);
    /* the phone's own back button must close the calculator, not leave the page (leaving locks the question) */
    if (!(history.state && history.state.calc)) history.pushState({ calc: 1 }, '');
    tickView(Math.max(0, deadline - performance.now()));
  }
  function removeCalc() {
    if (!calcNode) return false;
    if (calcNode.parentNode) calcNode.parentNode.removeChild(calcNode);
    calcNode = null; calcTimer = null; return true;
  }
  function closeCalc() {
    if (removeCalc() && document.visibilityState !== 'hidden' && history.state && history.state.calc) history.back();
  }
  window.addEventListener('popstate', removeCalc);

  function rpc(fn, body, keepalive) {
    return fetch(CFG.url + '/rest/v1/rpc/' + fn, {
      method: 'POST', keepalive: !!keepalive,
      headers: { apikey: CFG.key, Authorization: 'Bearer ' + CFG.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.text().then(function (x) {
        var d = x ? JSON.parse(x) : null;
        if (!r.ok) { var e = new Error(d && d.message || 'HTTP ' + r.status); e.status = r.status; e.msg = d && d.message; throw e; }
        return d;
      });
    });
  }

  /* ---------- watermark ---------- */
  function setWatermark(name) {
    var wm = document.getElementById('wm');
    if (!name) { wm.hidden = true; return; }
    var esc = name.replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; });
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="260" height="150"><text x="130" y="80" text-anchor="middle" ' +
      'transform="rotate(-24 130 75)" font-family="Segoe UI,Arial,sans-serif" font-size="20" font-weight="600" fill="#1b365d">' + esc + '</text></svg>';
    wm.style.backgroundImage = 'url("data:image/svg+xml;utf8,' + encodeURIComponent(svg) + '")';
    wm.hidden = false;
  }

  /* ---------- screens ---------- */
  function langButtons() {
    Array.prototype.forEach.call(document.querySelectorAll('.lang button'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-l') === S.lang));
      b.onclick = function () { S.lang = b.getAttribute('data-l'); try { localStorage.setItem(LKEY, S.lang); } catch (e) {} document.documentElement.lang = S.lang === 'gr' ? 'el' : 'en'; langButtons(); redraw(); };
    });
  }
  var redraw = function () { route(); };

  function loginScreen(msg) {
    var em = el('input', { id: 'email', type: 'email', autocomplete: 'email', inputmode: 'email', maxlength: '200' });
    var room = el('input', { id: 'room', type: 'text', class: 'code', autocomplete: 'off', autocapitalize: 'characters', maxlength: '8', spellcheck: 'false' });
    var out = el('div', { 'aria-live': 'polite' });
    if (msg) out.appendChild(el('div', { class: 'band err' }, msg));
    var btn = el('button', { class: 'btn block', type: 'submit' }, t('start'));
    var open = !S.info || S.info.open;
    var form = el('form', { class: 'panel', novalidate: 'novalidate', onsubmit: function (e) {
      e.preventDefault(); out.textContent = '';
      var email = em.value.trim().toLowerCase(), rc = room.value.trim().toUpperCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { out.appendChild(el('div', { class: 'band err' }, t('badEmail'))); return; }
      if (!rc) { out.appendChild(el('div', { class: 'band err' }, t('badRoom'))); return; }
      btn.disabled = true; btn.textContent = t('checking');
      rpc('cut_camm311_quiz_start', { p_email: email, p_quiz: S.info.quiz_id, p_room: rc }).then(function (r) {
        if (r && r.token) {
          S.sess = { attempt: r.attempt, token: r.token, name: r.name, n: r.n, quiz: r.quiz };
          try { localStorage.setItem(SKEY, JSON.stringify(S.sess)); } catch (x) {}
          loadNext();
        } else {
          var k = r && r.error === 'already_started' ? 'already' : r && r.error === 'rate_limited' ? 'later' : r && r.error === 'pool_short' ? 'poolShort' : 'cannot';
          out.appendChild(el('div', { class: 'band err' }, t(k)));
        }
      }).catch(function () { out.appendChild(el('div', { class: 'band err' }, t('noServer'))); })
        .then(function () { btn.disabled = false; btn.textContent = t('start'); });
    } },
      el('div', { class: 'field' }, el('label', { for: 'email' }, t('email')), em),
      el('div', { class: 'field' }, el('label', { for: 'room' }, t('room')), room),
      btn, out);
    show(el('div', { class: 'page' }, el('h1', {}, t('title')), el('p', { class: 'lead' }, t('intro')), form,
      el('div', { class: 'band' }, t('rules')),
      open ? null : el('div', { class: 'band err' }, t('closedNote'))));
  }

  function noQuizScreen() { show(el('div', { class: 'page' }, el('h1', {}, t('title')), el('div', { class: 'band' }, t('noQuiz')))); }

  function doneScreen(closed) {
    stopTick(); setLeaveGuard(false); clearTimeout(S.graceTimer);
    show(el('div', { class: 'page' }, el('h1', {}, t(closed ? 'closedT' : 'doneT')), el('div', { class: 'band ok' }, t(closed ? 'closedB' : 'doneB'))));
  }

  function pendingScreen() {
    stopTick(); setLeaveGuard(false); clearTimeout(S.graceTimer);
    show(el('div', { class: 'page' }, el('h1', {}, t('pendT')), el('div', { class: 'band' }, t('pendB'))));
    S.graceTimer = setTimeout(loadNext, 2000);
  }

  function lobbyScreen() {
    stopTick(); setLeaveGuard(false); clearTimeout(S.graceTimer);
    show(el('div', { class: 'page' }, el('h1', {}, t('lobT')), el('p', { class: 'lead' }, S.sess && S.sess.name || ''), el('div', { class: 'band ok' }, t('lobB'))));
    S.graceTimer = setTimeout(loadNext, 2000);
  }

  function lockedScreen() {
    stopTick(); setLeaveGuard(false);
    show(el('div', { class: 'page' }, el('div', { class: 'locked' }, el('h1', {}, t('lockedT')), el('p', {}, t('lockedB'))),
      el('p', {}, el('button', { class: 'btn block', type: 'button', style: 'margin-top:16px', onclick: loadNext }, t('cont')))));
  }

  var timerNode, trackNode, deadline = 0, total = 30000;
  function questionScreen(q) {
    S.q = q; S.busy = false;
    var en = S.lang === 'en';
    var list = el('ol', { class: 'opts' });
    q.options.forEach(function (o, i) {
      var btn = el('button', { class: 'opt', type: 'button', 'data-pos': String(i), onclick: function () { choose(i, btn); } },
        el('b', {}, String.fromCharCode(65 + i)), el('span', {}, en ? o.en : o.gr));
      list.appendChild(el('li', {}, btn));
    });
    timerNode = el('span', { class: 'timer', 'aria-live': 'off' }, '');
    trackNode = el('div', { class: 'track' }, el('i'));
    var status = el('p', { class: 'lead', id: 'qstatus', 'aria-live': 'polite', style: 'margin-top:14px' }, '');
    show(el('div', { class: 'page' },
      el('div', { class: 'qmeta' }, el('span', {}, t('qOf')(q.idx + 1, q.n)), timerNode),
      trackNode,
      el('h1', { class: 'stem' }, en ? q.stem_en : q.stem_gr),
      hasMaths(q) ? el('button', { class: 'btn ghost small calc-open', type: 'button', onclick: function () { openCalc(q); } }, t('calc')) : null,
      list, status));
    if (q._dl == null) q._dl = performance.now() + q.remaining_ms;
    deadline = q._dl;
    total = Math.max((S.info && S.info.seconds * 1000) || 60000, q.remaining_ms);
    setLeaveGuard(true);
    startTick();
  }

  function tickView(left) {
    [timerNode, calcTimer].forEach(function (n) {
      if (n) { n.textContent = Math.ceil(left / 1000) + t('sec'); n.className = 'timer' + (left < 8000 ? ' low' : ''); }
    });
    if (trackNode) { trackNode.firstChild.style.transform = 'scaleX(' + (left / total).toFixed(3) + ')'; trackNode.className = 'track' + (left < 8000 ? ' low' : ''); }
  }

  function startTick() {
    stopTick();
    var run = function () {
      var left = Math.max(0, deadline - performance.now());
      tickView(left);
      if (left <= 0) { stopTick(); timeUp(); }
    };
    run(); S.tick = setInterval(run, 200);
  }
  function stopTick() { if (S.tick) { clearInterval(S.tick); S.tick = 0; } }

  function lockOptions() { Array.prototype.forEach.call(main.querySelectorAll('.opt'), function (b) { b.disabled = true; }); }
  function say(m) { var s = document.getElementById('qstatus'); if (s) s.textContent = m; }

  function choose(pos, btn) {
    if (S.busy || !S.q) return;
    S.busy = true; lockOptions(); btn.classList.add('sel'); say(t('sending'));
    var q = S.q;
    rpc('cut_camm311_quiz_submit', { p_attempt: S.sess.attempt, p_token: S.sess.token, p_idx: q.idx, p_pos: pos }).then(function (r) {
      if (r && r.ok) { say(t('saved')); stopTick(); setLeaveGuard(false); setTimeout(loadNext, 600); }
      else { stopTick(); setLeaveGuard(false); say(t('timeUp')); setTimeout(loadNext, 900); }
    }).catch(function () {
      S.busy = false; say(t('sendFail'));
      Array.prototype.forEach.call(main.querySelectorAll('.opt'), function (b) { b.disabled = false; b.classList.remove('sel'); });
    });
  }

  function timeUp() {
    if (!S.q) return;
    closeCalc(); lockOptions(); say(t('timeUp')); setLeaveGuard(false);
    var cb = main.querySelector('.calc-open'); if (cb) cb.disabled = true;
    // the server accepts a short grace; wait it out, then ask for the next question
    clearTimeout(S.graceTimer);
    S.graceTimer = setTimeout(function () { if (!S.busy) loadNext(); }, 3600);
  }

  function loadNext() {
    clearTimeout(S.graceTimer); S.locked = false;
    if (!S.sess) { route(); return; }
    var prev = S.q ? S.q.idx : (S.prevIdx != null ? S.prevIdx : -1);
    rpc('cut_camm311_quiz_next', { p_attempt: S.sess.attempt, p_token: S.sess.token }).then(function (q) {
      if (q.error === 'closed' || q.closed) { S.q = null; doneScreen(true); }
      else if (q.pending) { S.q = null; pendingScreen(); }
      else if (q.lobby) { S.q = null; lobbyScreen(); }
      else if (q.done) { S.q = null; doneScreen(); }
      else if (q.idx === prev && q.remaining_ms <= 0) { S.graceTimer = setTimeout(loadNext, 1000); }
      else { setWatermark(S.sess.name); questionScreen(q); }
    }).catch(function (e) {
      if (e.msg === 'bad_session') { S.sess = null; try { localStorage.removeItem(SKEY); } catch (x) {} setWatermark(''); loginScreen(t('session')); }
      else { show(el('div', { class: 'page' }, el('div', { class: 'band err' }, t('noServer')), el('p', {}, el('button', { class: 'btn block', type: 'button', style: 'margin-top:16px', onclick: loadNext }, t('start'))))); }
    });
  }

  /* ---------- leaving the app locks the question ---------- */
  var guard = false;
  function setLeaveGuard(on) { guard = on; }
  function leave() {
    if (!guard || !S.q || !S.sess) return;
    guard = false; stopTick(); clearTimeout(S.graceTimer);
    var idx = S.q.idx; S.prevIdx = idx; S.locked = true; S.q = null;
    rpc('cut_camm311_quiz_leave', { p_attempt: S.sess.attempt, p_token: S.sess.token, p_idx: idx }, true).catch(function () {});
    lockedScreen();
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') leave(); });
  var blurCount = 0; window.addEventListener('blur', function () { blurCount++; }); /* blur only counts; it never locks (visibilitychange and pagehide do) */
  window.addEventListener('pagehide', leave);
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* ---------- start ---------- */
  function route() {
    setWatermark(S.sess && S.sess.name);
    if (S.sess && S.info && S.info.quiz_id != null && S.sess.quiz !== S.info.quiz_id) {
      S.sess = null; try { localStorage.removeItem(SKEY); } catch (x) {}
    }
    if (S.sess && !S.info) {
      rpc('cut_camm311_quiz_info', {}).then(function (i) { S.info = i; route(); }).catch(function () { S.info = { quiz_id: S.sess.quiz }; route(); });
      return;
    }
    if (S.sess) {
      if (S.locked) { lockedScreen(); return; }
      if (S.q) { questionScreen(S.q); } else loadNext();
      return;
    }
    if (S.info && S.info.quiz_id == null) { noQuizScreen(); return; }
    if (S.info) { loginScreen(); return; }
    rpc('cut_camm311_quiz_info', {}).then(function (i) { S.info = i; route(); })
      .catch(function () { show(el('div', { class: 'page' }, el('div', { class: 'band err' }, t('noServer')))); });
  }
  document.documentElement.lang = S.lang === 'gr' ? 'el' : 'en';
  langButtons();
  route();
})();

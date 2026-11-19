/* CAMM 311 quiz - lecturer board. The lecturer code is typed here, kept only in this tab (sessionStorage), checked on the server.
   The room code is NOT shown here: it goes to the projector view (separate tab) through localStorage. Scores start hidden. */
(function () {
  'use strict';
  var CFG = window.QUIZ_CFG;
  var T = {
    en: {
      code: 'Lecturer code', open: 'Open board', bad: 'Wrong lecturer code.', later: 'Too many wrong codes. The board is paused for a few minutes.', notSet: 'The lecturer code has not been set yet. See the SQL file header.',
      noServer: 'No connection.',
      newRoom: 'New room code', projector: 'Open projector view', roomHint: 'Press "New room code", then open the projector view and show it to the class. The old code stops working for new starts.',
      scoresShow: 'Show scores', scoresHide: 'Hide scores', scoresNote: 'Scores are hidden until you show them or the quiz closes.',
      approveAll: 'Approve all', approve: 'Approve', clear: 'Clear blocks', clearDone: 'Counters cleared: ',
      aRoom: function (n) { return 'Wrong room codes tried: ' + n; }, aEmail: function (n) { return 'Unknown emails tried: ' + n; }, aLect: function (n) { return 'Wrong lecturer codes: ' + n; },
      legR: 'Left the app', legA: 'Waiting, duplicate start or device reset', legG: 'Finished',
      student: 'Student', section: 'Section', progress: 'Progress', correct: 'Correct', status: 'Status', action: 'Action',
      sLeft: function (n) { return 'Left app x' + n; }, sDup: 'Second start blocked', sReset: 'Reset waiting', sPend: 'Waiting for approval', sDone: 'Finished', sRun: 'In progress', sTime: function (n) { return 'Timeouts ' + n; },
      reset: 'Reset device', confirm: 'Reset the device for ', students: 'students', none: 'No one has started yet.'
    },
    gr: {
      code: 'Κωδικός διδάσκοντα', open: 'Άνοιγμα πίνακα', bad: 'Λάθος κωδικός διδάσκοντα.', later: 'Πολλοί λάθος κωδικοί. Ο πίνακας σταματά για λίγα λεπτά.', notSet: 'Ο κωδικός διδάσκοντα δεν έχει οριστεί ακόμη. Δείτε την επικεφαλίδα του αρχείου SQL.',
      noServer: 'Δεν υπάρχει σύνδεση.',
      newRoom: 'Νέος κωδικός αίθουσας', projector: 'Άνοιγμα προβολής', roomHint: 'Πατήστε "Νέος κωδικός αίθουσας", ανοίξτε την προβολή και δείξτε την στην τάξη. Ο παλιός δεν ισχύει πια για νέες εκκινήσεις.',
      scoresShow: 'Εμφάνιση βαθμών', scoresHide: 'Απόκρυψη βαθμών', scoresNote: 'Οι βαθμοί είναι κρυμμένοι μέχρι να τους εμφανίσετε ή να κλείσει το κουίζ.',
      approveAll: 'Έγκριση όλων', approve: 'Έγκριση', clear: 'Καθαρισμός αποκλεισμών', clearDone: 'Καθαρίστηκαν: ',
      aRoom: function (n) { return 'Λάθος κωδικοί αίθουσας: ' + n; }, aEmail: function (n) { return 'Άγνωστα email: ' + n; }, aLect: function (n) { return 'Λάθος κωδικοί διδάσκοντα: ' + n; },
      legR: 'Έφυγε από την εφαρμογή', legA: 'Αναμονή, διπλή εκκίνηση ή επαναφορά συσκευής', legG: 'Ολοκληρώθηκε',
      student: 'Φοιτητής', section: 'Τμήμα', progress: 'Πρόοδος', correct: 'Σωστές', status: 'Κατάσταση', action: 'Ενέργεια',
      sLeft: function (n) { return 'Έφυγε από εφαρμογή x' + n; }, sDup: 'Αποκλείστηκε δεύτερη εκκίνηση', sReset: 'Αναμονή επαναφοράς', sPend: 'Αναμονή έγκρισης', sDone: 'Ολοκληρώθηκε', sRun: 'Σε εξέλιξη', sTime: function (n) { return 'Εκπρόθεσμες ' + n; },
      reset: 'Επαναφορά συσκευής', confirm: 'Επαναφορά συσκευής για ', students: 'φοιτητές', none: 'Κανείς δεν έχει ξεκινήσει ακόμη.'
    }
  };
  var lang = 'en';
  try { lang = localStorage.getItem('camm311_quiz_lang') || 'en'; } catch (e) {}
  var code = '', quizId = null, timer = 0, data = null, showScores = false, notice = '';
  try { code = sessionStorage.getItem('camm311_quiz_lect') || ''; } catch (e) {}
  var main = document.getElementById('main');
  function t(k) { return T[lang][k]; }
  function el(tag, attrs) {
    var n = document.createElement(tag);
    for (var k in (attrs || {})) {
      if (k === 'class') n.className = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    }
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c == null) continue; n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
    return n;
  }
  function rpc(fn, body) {
    return fetch(CFG.url + '/rest/v1/rpc/' + fn, { method: 'POST',
      headers: { apikey: CFG.key, Authorization: 'Bearer ' + CFG.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.text().then(function (x) { var d = x ? JSON.parse(x) : null; if (!r.ok) { var e = new Error('HTTP ' + r.status); e.status = r.status; throw e; } return d; }); });
  }
  function langButtons() {
    Array.prototype.forEach.call(document.querySelectorAll('.lang button'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-l') === lang));
      b.onclick = function () { lang = b.getAttribute('data-l'); try { localStorage.setItem('camm311_quiz_lang', lang); } catch (e) {} langButtons(); draw(); };
    });
  }

  function login(msg) {
    clearInterval(timer);
    var inp = el('input', { id: 'lc', type: 'password', autocomplete: 'off' });
    var out = el('div', {}); if (msg) out.appendChild(el('div', { class: 'band err' }, msg));
    main.textContent = '';
    main.appendChild(el('div', { class: 'page', style: 'max-width:460px' }, el('h1', {}, 'CAMM 311'),
      el('form', { class: 'panel', onsubmit: function (e) { e.preventDefault(); code = inp.value; try { sessionStorage.setItem('camm311_quiz_lect', code); } catch (x) {} boot(); } },
        el('div', { class: 'field' }, el('label', { for: 'lc' }, t('code')), inp),
        el('button', { class: 'btn block', type: 'submit' }, t('open')), out)));
  }

  /* every lecturer RPC answers 200 with {error} on a bad code; returns true when it handled the error */
  function bad(d) {
    if (!d || !d.error) return false;
    clearInterval(timer);
    code = ''; try { sessionStorage.removeItem('camm311_quiz_lect'); } catch (x) {}
    login(t(d.error === 'rate_limited' ? 'later' : d.error === 'not_set' ? 'notSet' : 'bad'));
    return true;
  }

  function boot() {
    rpc('cut_camm311_quiz_info', {}).then(function (i) { quizId = i.quiz_id; return poll(); })
      .then(function () { if (code) { clearInterval(timer); timer = setInterval(poll, 3000); } })
      .catch(function () { login(t('noServer')); });
  }
  function poll() {
    return rpc('cut_camm311_quiz_board', { p_quiz: quizId, p_code: code, p_scores: showScores }).then(function (d) {
      if (bad(d)) return; data = d; draw();
    }).catch(function () { /* keep the last picture; try again on the next tick */ });
  }
  function act(fn, extra, after) {
    var body = { p_quiz: quizId, p_code: code };
    for (var k in (extra || {})) body[k] = extra[k];
    return rpc(fn, body).then(function (d) { if (bad(d)) return; if (after) after(d); return poll(); }).catch(function () {});
  }

  function newRoom() {
    act('cut_camm311_quiz_room_regen', {}, function (d) {
      try { localStorage.setItem('camm311_quiz_room', d.room); } catch (x) {}
    });
  }
  function openProjector() { window.open('projector.html', 'camm311_projector'); }
  function resetDev(s) {
    if (!window.confirm(t('confirm') + s.name + '?')) return;
    act('cut_camm311_quiz_reset_device', { p_attempt: s.attempt });
  }
  function approve(s) { act('cut_camm311_quiz_approve', { p_attempt: s ? s.attempt : null }); }
  function clearBlocks() { act('cut_camm311_quiz_clear_blocks', {}, function (d) { notice = t('clearDone') + d.cleared; }); }
  function toggleScores() { showScores = !showScores; poll(); }

  function draw() {
    if (!data) return;
    var rows = data.students || [];
    var fin = rows.filter(function (s) { return s.finished; }).length;
    var pend = rows.filter(function (s) { return s.pending; }).length;
    var scores = data.scores_visible === true;
    main.textContent = '';
    var page = el('div', { class: 'page' });
    page.appendChild(el('h1', {}, data.title));
    page.appendChild(el('div', { class: 'room' },
      el('div', {}, el('button', { class: 'btn', id: 'newroom', type: 'button', onclick: newRoom }, t('newRoom')), ' ',
        el('button', { class: 'btn ghost', id: 'projbtn', type: 'button', onclick: openProjector }, t('projector')),
        el('div', { class: 'lab', style: 'margin-top:6px;max-width:420px' }, t('roomHint'))),
      el('div', {}, el('div', { class: 'big', style: 'font-size:40px;letter-spacing:0' }, rows.length + ' / ' + fin),
        el('div', { class: 'lab' }, t('students') + ' / ' + t('sDone'))),
      el('div', {}, el('button', { class: 'btn ghost', id: 'scoretoggle', type: 'button', onclick: toggleScores }, showScores ? t('scoresHide') : t('scoresShow')),
        el('div', { class: 'lab', style: 'margin-top:6px;max-width:260px' }, t('scoresNote')))));
    var a = data.alerts || {};
    var warn = [];
    if (a.room_guesses > 0) warn.push(t('aRoom')(a.room_guesses));
    if (a.unknown_emails > 0) warn.push(t('aEmail')(a.unknown_emails));
    if (a.lecturer_code_fails > 0) warn.push(t('aLect')(a.lecturer_code_fails));
    if (warn.length) page.appendChild(el('div', { class: 'band err', id: 'alerts' }, warn.join('   |   ') + '  ',
      el('button', { class: 'btn ghost small', id: 'clearblocks', type: 'button', onclick: clearBlocks }, t('clear'))));
    if (notice) page.appendChild(el('div', { class: 'band ok' }, notice));
    var bar = el('div', { style: 'margin:10px 0' });
    if (pend) bar.appendChild(el('button', { class: 'btn', id: 'approveall', type: 'button', onclick: function () { approve(null); } }, t('approveAll') + ' (' + pend + ')'));
    if (!warn.length) bar.appendChild(el('button', { class: 'btn ghost small', id: 'clearblocks', type: 'button', style: 'margin-left:8px', onclick: clearBlocks }, t('clear')));
    page.appendChild(bar);
    page.appendChild(el('div', { class: 'legend' }, el('span', { class: 'r' }, t('legR')), el('span', { class: 'a' }, t('legA')), el('span', { class: 'g' }, t('legG'))));
    var cols = [el('th', {}, t('student')), el('th', {}, t('section')), el('th', {}, t('progress'))];
    if (scores) cols.push(el('th', { class: 'num' }, t('correct')));
    cols.push(el('th', {}, t('status')), el('th', {}, t('action')));
    var head = el('tr', {}); cols.forEach(function (c) { head.appendChild(c); });
    var tb = el('tbody');
    rows.forEach(function (s) {
      var cls = s.left > 0 ? 'red' : (s.dup > 0 || s.reset_pending || s.pending ? 'amber' : '');
      var tags = [];
      if (s.left > 0) tags.push(el('span', { class: 'tag r' }, t('sLeft')(s.left)));
      if (s.pending) tags.push(el('span', { class: 'tag a' }, t('sPend')));
      if (s.reset_pending) tags.push(el('span', { class: 'tag a' }, t('sReset')));
      else if (s.dup > 0) tags.push(el('span', { class: 'tag a' }, t('sDup')));
      if (s.timeouts > 0) tags.push(el('span', { class: 'tag a' }, t('sTime')(s.timeouts)));
      if (s.finished) tags.push(el('span', { class: 'tag g' }, t('sDone')));
      else if (!tags.length) tags.push(document.createTextNode(t('sRun')));
      var pct = s.n ? Math.round(100 * s.answered / s.n) : 0;
      var tr = el('tr', { class: cls },
        el('td', {}, s.name), el('td', {}, s.section || ''),
        el('td', {}, el('span', { class: 'prog' }, el('i', { style: 'width:' + pct + '%' })), s.answered + '/' + s.n));
      if (scores) tr.appendChild(el('td', { class: 'num' }, String(s.correct)));
      tr.appendChild(el('td', {}, tags.reduce(function (acc, n) { acc.appendChild(n); acc.appendChild(document.createTextNode(' ')); return acc; }, document.createElement('span'))));
      var acts = el('td', {});
      if (s.pending) acts.appendChild(el('button', { class: 'btn small', type: 'button', onclick: function () { approve(s); } }, t('approve')));
      acts.appendChild(el('button', { class: 'btn ghost small', type: 'button', onclick: function () { resetDev(s); } }, t('reset')));
      tr.appendChild(acts);
      tb.appendChild(tr);
    });
    page.appendChild(el('table', { class: 'board' }, el('thead', {}, head), tb));
    if (!rows.length) page.appendChild(el('p', { class: 'lead', style: 'margin-top:14px' }, t('none')));
    main.appendChild(page);
  }

  langButtons();
  if (code) boot(); else login();
})();

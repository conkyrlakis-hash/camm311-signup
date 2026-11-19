/* CAMM 311 quiz - lecturer board. The lecturer code is typed here, kept only in this tab (sessionStorage), checked on the server. */
(function () {
  'use strict';
  var CFG = window.QUIZ_CFG;
  var T = {
    en: {
      code: 'Lecturer code', open: 'Open board', bad: 'Wrong code or too many tries.', noServer: 'No connection.',
      room: 'Room code (show on the projector)', newRoom: 'New room code', roomHint: 'Press "New room code" to create one. The old code stops working for new starts.',
      legR: 'Left the app', legA: 'Duplicate start or device reset', legG: 'Finished',
      student: 'Student', section: 'Section', progress: 'Progress', correct: 'Correct', status: 'Status', action: 'Action',
      sLeft: function (n) { return 'Left app x' + n; }, sDup: 'Second start blocked', sReset: 'Reset waiting', sDone: 'Finished', sRun: 'In progress', sTime: function (n) { return 'Timeouts ' + n; },
      reset: 'Reset device', confirm: 'Reset the device for ', students: 'students', started: 'started', out: 'Close board', seen: 'last seen', none: 'No one has started yet.'
    },
    gr: {
      code: 'Κωδικός διδάσκοντα', open: 'Άνοιγμα πίνακα', bad: 'Λάθος κωδικός ή πολλές προσπάθειες.', noServer: 'Δεν υπάρχει σύνδεση.',
      room: 'Κωδικός αίθουσας (προβολή στην οθόνη)', newRoom: 'Νέος κωδικός αίθουσας', roomHint: 'Πατήστε "Νέος κωδικός αίθουσας" για δημιουργία. Ο παλιός δεν ισχύει πια για νέες εκκινήσεις.',
      legR: 'Έφυγε από την εφαρμογή', legA: 'Διπλή εκκίνηση ή επαναφορά συσκευής', legG: 'Ολοκληρώθηκε',
      student: 'Φοιτητής', section: 'Τμήμα', progress: 'Πρόοδος', correct: 'Σωστές', status: 'Κατάσταση', action: 'Ενέργεια',
      sLeft: function (n) { return 'Έφυγε από εφαρμογή x' + n; }, sDup: 'Αποκλείστηκε δεύτερη εκκίνηση', sReset: 'Αναμονή επαναφοράς', sDone: 'Ολοκληρώθηκε', sRun: 'Σε εξέλιξη', sTime: function (n) { return 'Εκπρόθεσμες ' + n; },
      reset: 'Επαναφορά συσκευής', confirm: 'Επαναφορά συσκευής για ', students: 'φοιτητές', started: 'ξεκίνησαν', out: 'Κλείσιμο πίνακα', seen: 'τελευταία δραστηριότητα', none: 'Κανείς δεν έχει ξεκινήσει ακόμη.'
    }
  };
  var lang = 'en';
  try { lang = localStorage.getItem('camm311_quiz_lang') || 'en'; } catch (e) {}
  var code = '', room = '', quizId = null, timer = 0, data = null;
  try { code = sessionStorage.getItem('camm311_quiz_lect') || ''; room = sessionStorage.getItem('camm311_quiz_room') || ''; } catch (e) {}
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

  function boot() {
    rpc('cut_camm311_quiz_info', {}).then(function (i) { quizId = i.quiz_id; return poll(); })
      .then(function () { clearInterval(timer); timer = setInterval(poll, 3000); })
      .catch(function () { /* poll handles messages */ });
  }
  function poll() {
    return rpc('cut_camm311_quiz_board', { p_quiz: quizId, p_code: code }).then(function (d) { data = d; draw(); })
      .catch(function (e) { if (e.status === 403 || e.status === 401 || e.status === 400) { code = ''; try { sessionStorage.removeItem('camm311_quiz_lect'); } catch (x) {} login(t('bad')); } });
  }

  function newRoom() {
    rpc('cut_camm311_quiz_room_regen', { p_quiz: quizId, p_code: code }).then(function (c) {
      room = c; try { sessionStorage.setItem('camm311_quiz_room', room); } catch (x) {} draw();
    }).catch(function () {});
  }
  function resetDev(s) {
    if (!window.confirm(t('confirm') + s.name + '?')) return;
    rpc('cut_camm311_quiz_reset_device', { p_quiz: quizId, p_code: code, p_attempt: s.attempt }).then(poll).catch(function () {});
  }

  function draw() {
    if (!data) return;
    var rows = data.students || [];
    var fin = rows.filter(function (s) { return s.finished; }).length;
    main.textContent = '';
    var page = el('div', { class: 'page' });
    page.appendChild(el('h1', {}, data.title));
    page.appendChild(el('div', { class: 'room' },
      el('div', {}, el('div', { class: 'lab' }, t('room')), el('div', { class: 'big', id: 'roomcode' }, room || '------')),
      el('div', {}, el('button', { class: 'btn', type: 'button', onclick: newRoom }, t('newRoom')),
        el('div', { class: 'lab', style: 'margin-top:6px;max-width:360px' }, data.room_set || room ? t('roomHint') : t('roomHint'))),
      el('div', {}, el('div', { class: 'big', style: 'font-size:40px;letter-spacing:0' }, rows.length + ' / ' + fin),
        el('div', { class: 'lab' }, t('students') + ' / ' + t('sDone')))));
    page.appendChild(el('div', { class: 'legend' }, el('span', { class: 'r' }, t('legR')), el('span', { class: 'a' }, t('legA')), el('span', { class: 'g' }, t('legG'))));
    var head = el('tr', {}, el('th', {}, t('student')), el('th', {}, t('section')), el('th', {}, t('progress')),
      el('th', { class: 'num' }, t('correct')), el('th', {}, t('status')), el('th', {}, t('action')));
    var tb = el('tbody');
    rows.forEach(function (s) {
      var cls = s.left > 0 ? 'red' : (s.dup > 0 || s.reset_pending ? 'amber' : '');
      var tags = [];
      if (s.left > 0) tags.push(el('span', { class: 'tag r' }, t('sLeft')(s.left)));
      if (s.reset_pending) tags.push(el('span', { class: 'tag a' }, t('sReset')));
      else if (s.dup > 0) tags.push(el('span', { class: 'tag a' }, t('sDup')));
      if (s.timeouts > 0) tags.push(el('span', { class: 'tag a' }, t('sTime')(s.timeouts)));
      if (s.finished) tags.push(el('span', { class: 'tag g' }, t('sDone')));
      else if (!tags.length) tags.push(document.createTextNode(t('sRun')));
      var pct = s.n ? Math.round(100 * s.answered / s.n) : 0;
      tb.appendChild(el('tr', { class: cls },
        el('td', {}, s.name), el('td', {}, s.section || ''),
        el('td', {}, el('span', { class: 'prog' }, el('i', { style: 'width:' + pct + '%' })), s.answered + '/' + s.n),
        el('td', { class: 'num' }, String(s.correct)),
        el('td', {}, tags.reduce(function (a, n) { a.appendChild(n); a.appendChild(document.createTextNode(' ')); return a; }, document.createElement('span'))),
        el('td', {}, el('button', { class: 'btn ghost small', type: 'button', onclick: function () { resetDev(s); } }, t('reset')))));
    });
    page.appendChild(el('table', { class: 'board' }, el('thead', {}, head), tb));
    if (!rows.length) page.appendChild(el('p', { class: 'lead', style: 'margin-top:14px' }, t('none')));
    main.appendChild(page);
  }

  langButtons();
  if (code) boot(); else login();
})();

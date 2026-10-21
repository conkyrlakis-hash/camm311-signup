/* CAMM 311 Study - flip cards and multiple-choice practice for the midterm.
   Plain JS, no dependencies. Progress: localStorage first, synced to Supabase in the background. */
(() => {
  'use strict';

  /* ---------- config ---------- */
  const SUPABASE_URL = 'https://cgiibcoeezlmehzowidg.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_kpJdz2KQoJU0t8vAYCE_4w_qr4HB0R1';
  const MIDTERM_UTC = Date.UTC(2026, 10, 4); // 4 November 2026
  const SAVE_DELAY = 3000;
  const PULL_EVERY = 60000;
  const K = {
    session: 'camm311.session',
    lang: 'camm311.lang',
    prefs: 'camm311.prefs',
    prog: 'camm311.progress.',
    ios: 'camm311.iosHintHidden'
  };
  const ROUTES = ['home', 'study', 'study/run', 'quiz', 'quiz/run'];
  const PARENT = { 'study': 'home', 'study/run': 'study', 'quiz': 'home', 'quiz/run': 'quiz' };

  /* ---------- strings ---------- */
  const STR = {
    en: {
      appName: 'CAMM 311 Study',
      codeLine: 'CAMM 311.2 · Kitchen Management',
      instructor: 'Constantinos Kyrlakis',
      programme: 'Culinary Arts · Year 3',
      university: 'Cyprus University of Technology',
      footer: 'CAMM 311.2 · Kitchen Management · Cyprus University of Technology',
      privacy: 'Your email is used only to keep your study progress. Data deleted at the end of the semester.',
      midterm: 'Midterm: Wednesday 4 November 2026, Lectures 1-6',
      daysLeft: '{n} days left',
      dayLeft: '1 day left',
      midtermToday: 'Midterm is today',
      midtermPassed: 'Midterm has passed',
      langLabel: 'Language',
      menu: 'Menu',
      back: 'Back',
      signedInAs: 'Signed in as',
      signOut: 'Sign out',
      syncOk: 'Progress saved',
      syncSaving: 'Saving…',
      syncPending: 'Saved on this device. Will sync when online.',
      signInTitle: 'Sign in',
      signInIntro: 'Use the email you gave on the course sign-up form to open your study cards and quiz.',
      email: 'Email',
      signInBtn: 'Sign in',
      checking: 'Checking…',
      badEmail: 'Please enter a valid email address.',
      notListed: 'This email is not on the CAMM 311 sign-up list. Use the email you gave in class, or sign up first.',
      signUpLink: 'Go to the sign-up form',
      noServer: 'Could not reach the server. Check your connection and try again.',
      notYet: 'Not on the list yet?',
      loading: 'Loading…',
      loadFail: 'Could not load the study material. Check your connection and try again.',
      retry: 'Try again',
      studyCards: 'Study cards',
      practiceQuiz: 'Practice quiz',
      studySub: 'Flip cards and mark what you know',
      quizSub: 'Multiple choice with instant feedback',
      progress: 'Your progress',
      allLectures: 'All lectures',
      all: 'All',
      lectureAbbr: 'L',
      lecture: 'Lecture',
      lectures: 'Lectures',
      cardsMeta: '{k}/{n} cards',
      quizMeta: 'Quiz {p}%',
      quizNone: 'Quiz –',
      nCards: '{n} cards',
      nKnown: '{k} known',
      nQuestions: '{n} questions',
      pctCorrect: '{p}% correct',
      optUnknown: 'Only cards I don’t know yet',
      optShuffle: 'Shuffle',
      start: 'Start',
      startCards: 'Start · {n} cards',
      startQuiz: 'Start · {n} questions',
      flipHint: 'Tap to flip',
      answer: 'Answer',
      prev: 'Previous',
      notYetBtn: 'Not yet',
      knowIt: 'I know it',
      emptyAll: 'You already know every card in this selection.',
      emptyNone: 'There are no cards in this selection.',
      roundDone: 'Round complete',
      knowCount: 'You know {k} of {n} cards in this set.',
      allKnown: 'You know every card in this set. Well done.',
      studyUnknown: 'Study the ones I don’t know',
      anotherSet: 'Choose another set',
      home: 'Home',
      numQuestions: 'Number of questions',
      lenAll: 'All',
      correct: 'Correct',
      notQuite: 'Not quite',
      correctAnswer: 'Correct answer',
      yourAnswer: 'Your answer',
      next: 'Next',
      seeScore: 'See score',
      score: 'Score',
      wrongHeading: 'Questions to review',
      retryWrong: 'Retry the wrong ones',
      newQuiz: 'New quiz',
      perfect: 'No mistakes. Perfect score.',
      great: 'Great work.',
      okScore: 'Good progress. Review the ones you missed.',
      low: 'Keep going. Review the ones you missed and try again.',
      noQuestions: 'There are no questions in this selection.',
      install: 'Install app',
      iosHint: 'Tap Share, then Add to Home Screen.',
      hide: 'Hide'
    },
    gr: {
      appName: 'CAMM 311 Μελέτη',
      codeLine: 'CAMM 311.1 · Διοίκηση Κουζίνας',
      instructor: 'Κωνσταντίνος Κυρλάκης',
      programme: 'Μαγειρικές Τέχνες · Έτος 3',
      university: 'Τεχνολογικό Πανεπιστήμιο Κύπρου',
      footer: 'CAMM 311.1 · Διοίκηση Κουζίνας · Τεχνολογικό Πανεπιστήμιο Κύπρου',
      privacy: 'Το email σας χρησιμοποιείται μόνο για την αποθήκευση της προόδου σας. Τα δεδομένα διαγράφονται στο τέλος του εξαμήνου.',
      midterm: 'Ενδιάμεση εξέταση: Τετάρτη 4 Νοεμβρίου 2026, Διαλέξεις 1-6',
      daysLeft: '{n} ημέρες ακόμα',
      dayLeft: '1 ημέρα ακόμα',
      midtermToday: 'Η εξέταση είναι σήμερα',
      midtermPassed: 'Η εξέταση πραγματοποιήθηκε',
      langLabel: 'Γλώσσα',
      menu: 'Μενού',
      back: 'Πίσω',
      signedInAs: 'Σύνδεση ως',
      signOut: 'Αποσύνδεση',
      syncOk: 'Η πρόοδος αποθηκεύτηκε',
      syncSaving: 'Αποθήκευση…',
      syncPending: 'Αποθηκευμένη σε αυτή τη συσκευή. Θα συγχρονιστεί όταν συνδεθείτε στο διαδίκτυο.',
      signInTitle: 'Σύνδεση',
      signInIntro: 'Χρησιμοποιήστε το email που δηλώσατε στη φόρμα εγγραφής του μαθήματος για να ανοίξετε τις κάρτες μελέτης και τις ερωτήσεις.',
      email: 'Email',
      signInBtn: 'Σύνδεση',
      checking: 'Έλεγχος…',
      badEmail: 'Εισαγάγετε μια έγκυρη διεύθυνση email.',
      notListed: 'Αυτό το email δεν υπάρχει στη λίστα εγγραφών του CAMM 311. Χρησιμοποιήστε το email που δώσατε στο μάθημα ή κάντε πρώτα εγγραφή.',
      signUpLink: 'Μετάβαση στη φόρμα εγγραφής',
      noServer: 'Δεν ήταν δυνατή η επικοινωνία με τον διακομιστή. Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά.',
      notYet: 'Δεν έχετε εγγραφεί ακόμα;',
      loading: 'Φόρτωση…',
      loadFail: 'Δεν ήταν δυνατή η φόρτωση του υλικού. Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά.',
      retry: 'Δοκιμή ξανά',
      studyCards: 'Κάρτες μελέτης',
      practiceQuiz: 'Εξάσκηση με ερωτήσεις',
      studySub: 'Γυρίστε τις κάρτες και σημειώστε όσες ξέρετε',
      quizSub: 'Πολλαπλής επιλογής, με άμεση ανατροφοδότηση',
      progress: 'Η πρόοδός σας',
      allLectures: 'Όλες οι διαλέξεις',
      all: 'Όλες',
      lectureAbbr: 'Δ',
      lecture: 'Διάλεξη',
      lectures: 'Διαλέξεις',
      cardsMeta: '{k}/{n} κάρτες',
      quizMeta: 'Κουίζ {p}%',
      quizNone: 'Κουίζ –',
      nCards: '{n} κάρτες',
      nKnown: '{k} γνωστές',
      nQuestions: '{n} ερωτήσεις',
      pctCorrect: '{p}% σωστές',
      optUnknown: 'Μόνο κάρτες που δεν ξέρω ακόμα',
      optShuffle: 'Ανακάτεμα',
      start: 'Έναρξη',
      startCards: 'Έναρξη · {n} κάρτες',
      startQuiz: 'Έναρξη · {n} ερωτήσεις',
      flipHint: 'Πατήστε για να γυρίσει',
      answer: 'Απάντηση',
      prev: 'Προηγούμενη',
      notYetBtn: 'Όχι ακόμα',
      knowIt: 'Το ξέρω',
      emptyAll: 'Ξέρετε ήδη όλες τις κάρτες αυτής της επιλογής.',
      emptyNone: 'Δεν υπάρχουν κάρτες σε αυτή την επιλογή.',
      roundDone: 'Ολοκληρώθηκε ο γύρος',
      knowCount: 'Ξέρετε {k} από {n} κάρτες αυτού του σετ.',
      allKnown: 'Ξέρετε όλες τις κάρτες αυτού του σετ. Μπράβο.',
      studyUnknown: 'Μελέτη όσων δεν ξέρω',
      anotherSet: 'Επιλογή άλλου σετ',
      home: 'Αρχική',
      numQuestions: 'Αριθμός ερωτήσεων',
      lenAll: 'Όλες',
      correct: 'Σωστό',
      notQuite: 'Όχι ακριβώς',
      correctAnswer: 'Σωστή απάντηση',
      yourAnswer: 'Η απάντησή σας',
      next: 'Επόμενη',
      seeScore: 'Δείτε τη βαθμολογία',
      score: 'Βαθμολογία',
      wrongHeading: 'Ερωτήσεις προς επανάληψη',
      retryWrong: 'Επανάληψη λανθασμένων',
      newQuiz: 'Νέα εξάσκηση',
      perfect: 'Κανένα λάθος. Άριστα.',
      great: 'Πολύ καλά.',
      okScore: 'Καλή πρόοδος. Επαναλάβετε όσες χάσατε.',
      low: 'Συνεχίστε. Επαναλάβετε όσες χάσατε και δοκιμάστε ξανά.',
      noQuestions: 'Δεν υπάρχουν ερωτήσεις σε αυτή την επιλογή.',
      install: 'Εγκατάσταση εφαρμογής',
      iosHint: 'Πατήστε Κοινοποίηση και μετά «Προσθήκη στην οθόνη Αφετηρίας».',
      hide: 'Απόκρυψη'
    }
  };

  /* ---------- state ---------- */
  const S = {
    session: null,       // {email, lang}
    lang: 'en',          // UI + content language
    content: {},         // lang -> indexed content
    loading: {},         // lang -> promise
    progress: blank(),
    dirty: false,
    saving: false,
    saveFailed: false,
    version: 0,          // bumped on every local change
    saveTimer: 0,
    lastPull: 0,
    prefs: { sLec: 0, sOnly: false, sShuffle: true, qLec: 0, qLen: 10 },
    study: null,
    quiz: null,
    hooks: null,         // keyboard hooks of the current run screen
    navLec: 0,
    deferred: null,      // beforeinstallprompt event
    depth: 0,
    wantHome: false
  };

  function t(key, vars) {
    const dict = STR[S.lang] || STR.en;
    let s = dict[key];
    if (s == null) s = STR.en[key];
    if (s == null) return key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
    return s;
  }

  /* ---------- small helpers ---------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const SVGNS = 'http://www.w3.org/2000/svg';

  function add(el, kids) {
    for (const k of kids) {
      if (k == null || k === false) continue;
      if (Array.isArray(k)) add(el, k);
      else if (k.nodeType) el.appendChild(k);
      else el.appendChild(document.createTextNode(String(k)));
    }
    return el;
  }
  // h('div', {class: 'x', onclick: fn}, child, 'text') - all text goes through text nodes, never innerHTML
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    return add(el, kids);
  }
  function svgEl(tag, attrs) {
    const el = document.createElementNS(SVGNS, tag);
    for (const k of Object.keys(attrs)) el.setAttribute(k, attrs[k]);
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  const ICONS = {
    menu: 'M4 6h16M4 12h16M4 18h16',
    back: 'M15 5l-7 7 7 7',
    chev: 'M9 5l7 7-7 7',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    x: 'M6 6l12 12M18 6L6 18',
    download: 'M12 4v11M7 11l5 5 5-5M5 20h14'
  };
  function icon(name) {
    const s = svgEl('svg', { class: 'ic', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' });
    s.appendChild(svgEl('path', { d: ICONS[name] }));
    return s;
  }

  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const x = a[i]; a[i] = a[j]; a[j] = x;
    }
    return a;
  }
  const reducedMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  // screen-reader announcements (a persistent live region)
  function say(text) {
    const live = $('#live');
    if (!live) return;
    live.textContent = '';
    setTimeout(() => { live.textContent = text; }, 40);
  }

  /* ---------- storage (localStorage with an in-memory fallback) ---------- */
  const mem = {};
  function lsGet(k) {
    let v = null;
    try { v = localStorage.getItem(k); } catch (e) { /* blocked */ }
    return v == null && k in mem ? mem[k] : v;
  }
  function lsSet(k, v) { mem[k] = v; try { localStorage.setItem(k, v); } catch (e) { /* full or blocked */ } }
  function lsDel(k) { delete mem[k]; try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  function lsJSON(k, fallback) {
    const s = lsGet(k);
    if (!s) return fallback;
    try { return JSON.parse(s); } catch (e) { return fallback; }
  }

  /* ---------- progress model and merge ---------- */
  function blank() { return { v: 1, cards: {}, mcq: {} }; }

  function validEntry(e) {
    return Array.isArray(e) && e.length >= 2 && (e[0] === 0 || e[0] === 1) && typeof e[1] === 'number' && isFinite(e[1])
      ? [e[0], e[1]] : null;
  }
  const sameEntry = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];

  // newest timestamp wins per id. diffLocal: local changed; diffRemote: server is behind
  function mergeProgress(local, remote) {
    const out = blank();
    let diffLocal = false;
    let diffRemote = false;
    ['cards', 'mcq'].forEach((sec) => {
      const a = (local && typeof local[sec] === 'object' && local[sec]) || {};
      const b = (remote && typeof remote[sec] === 'object' && remote[sec]) || {};
      const ids = {};
      Object.keys(a).forEach((id) => { ids[id] = 1; });
      Object.keys(b).forEach((id) => { ids[id] = 1; });
      Object.keys(ids).forEach((id) => {
        const x = validEntry(a[id]);
        const y = validEntry(b[id]);
        let win = x || y;
        if (x && y && y[1] > x[1]) win = y;
        if (!win) return;
        out[sec][id] = win;
        if (!sameEntry(win, x)) diffLocal = true;
        if (!sameEntry(win, y)) diffRemote = true;
      });
    });
    return { data: out, diffLocal, diffRemote };
  }

  function loadLocalProgress(email) {
    return mergeProgress(lsJSON(K.prog + email, null), null).data;
  }
  function persistProgress() {
    if (S.session) lsSet(K.prog + S.session.email, JSON.stringify(S.progress));
  }
  const isKnown = (id) => { const p = S.progress.cards[id]; return !!p && p[0] === 1; };

  function touched() {
    S.version++;
    S.dirty = true;
    persistProgress();
    scheduleSave();
    updateSync();
  }

  /* ---------- network ---------- */
  async function rpc(fn, body, opts) {
    opts = opts || {};
    const ctrl = !opts.keepalive && typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 12000) : 0;
    try {
      const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: !!opts.keepalive,
        signal: ctrl ? ctrl.signal : undefined
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const txt = await res.text();
      return txt ? JSON.parse(txt) : null;
    } finally {
      clearTimeout(timer);
    }
  }

  function scheduleSave() {
    clearTimeout(S.saveTimer);
    S.saveTimer = setTimeout(() => pushSave(false), SAVE_DELAY);
  }

  async function pushSave(keepalive) {
    if (!S.session || !S.dirty) return;
    if (S.saving && !keepalive) return;
    const email = S.session.email;
    const ver = S.version;
    const body = { p_email: email, p_data: S.progress };
    S.saving = true;
    updateSync();
    try {
      const small = JSON.stringify(body).length < 60000; // keepalive bodies are limited to 64 KB
      const ok = await rpc('cut_camm311_study_save', body, { keepalive: keepalive && small });
      if (ok === false) throw new Error('rejected');
      if (S.version === ver) S.dirty = false; else scheduleSave();
      S.saveFailed = false;
    } catch (e) {
      S.saveFailed = true;
    } finally {
      S.saving = false;
      updateSync();
    }
  }

  async function pullProgress() {
    if (!S.session) return;
    const email = S.session.email;
    try {
      const remote = await rpc('cut_camm311_study_get', { p_email: email });
      if (!S.session || S.session.email !== email) return;
      S.lastPull = Date.now();
      if (!remote || typeof remote !== 'object') {
        if (Object.keys(S.progress.cards).length || Object.keys(S.progress.mcq).length) { S.dirty = true; scheduleSave(); }
        return;
      }
      const m = mergeProgress(S.progress, remote);
      if (m.diffLocal) {
        S.progress = m.data;
        persistProgress();
        const r = routeOf();
        if (r === 'home' || r === 'study' || r === 'quiz') renderMain(r);
      }
      if (m.diffRemote) { S.dirty = true; scheduleSave(); }
      updateSync();
    } catch (e) { /* offline: studying continues on local data */ }
  }

  function syncText() {
    if (S.dirty && (S.saveFailed || !navigator.onLine)) return t('syncPending');
    if (S.dirty || S.saving) return t('syncSaving');
    return t('syncOk');
  }
  function updateSync() {
    const el = $('#sync');
    if (el) el.textContent = syncText();
  }

  /* ---------- content ---------- */
  function indexContent(raw) {
    const c = { cards: [], mcq: [], lectures: [], cardById: {}, qById: {}, lecTitle: {} };
    (Array.isArray(raw.cards) ? raw.cards : []).forEach((x) => {
      if (!x || !x.id || x.f == null || x.b == null) return;
      x.l = Number(x.l);
      c.cards.push(x);
      c.cardById[x.id] = x;
    });
    (Array.isArray(raw.mcq) ? raw.mcq : []).forEach((x) => {
      if (!x || !x.id || !x.q || !Array.isArray(x.o) || x.o.length < 2) return;
      x.l = Number(x.l);
      x.a = Number(x.a);
      c.mcq.push(x);
      c.qById[x.id] = x;
    });
    const seen = {};
    (Array.isArray(raw.lectures) ? raw.lectures : []).forEach((l) => {
      if (!l || l.n == null) return;
      c.lecTitle[Number(l.n)] = String(l.title || '');
      seen[Number(l.n)] = 1;
    });
    c.cards.concat(c.mcq).forEach((x) => { seen[x.l] = 1; });
    c.lectures = Object.keys(seen).map(Number).filter((n) => n > 0).sort((a, b) => a - b);
    return c;
  }

  function loadContent(lang) {
    if (S.content[lang]) return Promise.resolve(S.content[lang]);
    if (S.loading[lang]) return S.loading[lang];
    const p = fetch('content_' + lang + '.json')
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((raw) => { S.content[lang] = indexContent(raw); return S.content[lang]; })
      .finally(() => { delete S.loading[lang]; });
    S.loading[lang] = p;
    return p;
  }

  const lecAbbr = (n) => t('lectureAbbr') + n;
  const lecTitle = (c, n) => c.lecTitle[n] || (t('lecture') + ' ' + n);

  function lecStats(c, n) {
    let cards = 0, known = 0, qs = 0, tried = 0, right = 0;
    c.cards.forEach((x) => { if (n && x.l !== n) return; cards++; if (isKnown(x.id)) known++; });
    c.mcq.forEach((q) => {
      if (n && q.l !== n) return;
      qs++;
      const r = S.progress.mcq[q.id];
      if (r) { tried++; if (r[0] === 1) right++; }
    });
    return { cards, known, qs, tried, right, pct: tried ? Math.round(100 * right / tried) : 0 };
  }
  const cardPool = (c, lec, only) => c.cards.filter((x) => (!lec || x.l === lec) && (!only || !isKnown(x.id)));
  const quizPool = (c, lec) => c.mcq.filter((q) => !lec || q.l === lec);

  function daysToMidterm() {
    const n = new Date();
    return Math.round((MIDTERM_UTC - Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())) / 86400000);
  }

  // options like "All of the above" stay last when they were last in the source
  const PINNED_LAST = /(all|none|both|neither).*(above|these)|(όλα|κανένα|καμία|και τα δύο).*(παραπάνω|προηγούμεν|ανωτέρω)/i;
  function optionOrder(q) {
    const n = q.o.length;
    const idx = [];
    for (let i = 0; i < n; i++) idx.push(i);
    if (n > 2 && PINNED_LAST.test(String(q.o[n - 1]))) return shuffle(idx.slice(0, n - 1)).concat(n - 1);
    return shuffle(idx);
  }

  /* ---------- routing ---------- */
  function routeOf() {
    if (!S.session) return 'login';
    const raw = (location.hash || '').replace(/^#\/?/, '');
    let r = ROUTES.indexOf(raw) >= 0 ? raw : 'home';
    if (r === 'study/run' && !S.study) r = 'study';
    if (r === 'quiz/run' && !S.quiz) r = 'quiz';
    return r;
  }
  function normaliseHash(route) {
    if (route === 'login') return;
    const raw = (location.hash || '').replace(/^#\/?/, '');
    const want = route === 'home' ? '' : route;
    if (raw !== want) history.replaceState(history.state, '', want ? '#' + want : location.pathname + location.search);
  }
  function navigate(route, replace) {
    const url = route === 'home' ? location.pathname + location.search : '#' + route;
    if (replace) {
      history.replaceState({ d: S.depth }, '', url);
    } else {
      S.depth += 1;
      history.pushState({ d: S.depth }, '', url);
    }
    render();
  }
  function goBack(fallback) {
    if (S.depth > 0) history.back(); else navigate(fallback, true);
  }
  function goHome() {
    if (S.depth > 0) { S.wantHome = true; history.go(-S.depth); } else navigate('home', true);
  }

  /* ---------- rendering: chrome ---------- */
  function render(opts) {
    const keep = !!(opts && opts.keep);
    document.documentElement.lang = S.lang === 'gr' ? 'el' : 'en';
    document.title = t('appName');
    const route = routeOf();
    normaliseHash(route);
    renderHeader(route);
    renderFooter();
    renderMain(route);
    if (!keep) {
      window.scrollTo(0, 0);
      $('#main').focus({ preventScroll: true });
    }
  }

  function mulberry32(a) {
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let x = Math.imul(a ^ (a >>> 15), 1 | a);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  // the deck's pixel mosaic: small square tiles, denser towards the right edge, one rare red tile
  function mosaic() {
    const COLS = 9, ROWS = 17, PITCH = 10, TILE = 8;
    const svg = svgEl('svg', {
      class: 'mosaic', viewBox: '0 0 ' + (COLS * PITCH - 2) + ' ' + (ROWS * PITCH - 2),
      preserveAspectRatio: 'xMaxYMid slice', 'aria-hidden': 'true', focusable: 'false'
    });
    const rnd = mulberry32(311);
    const pal = [['n2', 50], ['n3', 14], ['b', 24], ['lb', 8]];
    const total = pal.reduce((s, p) => s + p[1], 0);
    const pick = () => {
      let x = rnd() * total;
      for (const p of pal) { x -= p[1]; if (x < 0) return p[0]; }
      return 'n2';
    };
    const cells = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ramp = (c + 1) / COLS;
        cells.push(rnd() < 0.62 * (0.25 + 0.95 * ramp) ? pick() : null);
      }
    }
    cells[12 * COLS + (COLS - 2)] = 'r';
    cells.forEach((cls, i) => {
      if (!cls) return;
      svg.appendChild(svgEl('rect', {
        class: cls, x: (i % COLS) * PITCH, y: Math.floor(i / COLS) * PITCH, width: TILE, height: TILE
      }));
    });
    return svg;
  }

  function langSwitch() {
    const mk = (code, label, htmlLang) => h('button', {
      type: 'button', lang: htmlLang, 'aria-pressed': String(S.lang === code),
      onclick: () => setLang(code)
    }, label);
    return h('div', { class: 'lang', role: 'group', 'aria-label': t('langLabel') }, mk('en', 'EN', 'en'), mk('gr', 'ΕΛ', 'el'));
  }

  function setLang(code) {
    if (code === S.lang) return;
    S.lang = code;
    lsSet(K.lang, code);
    render({ keep: true });
  }

  function menuEl() {
    const btn = h('button', {
      class: 'iconbtn', type: 'button', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-label': t('menu')
    }, icon('menu'));
    const panel = h('div', { class: 'menu', hidden: true },
      h('p', { class: 'm-label' }, t('signedInAs')),
      h('p', { class: 'm-email' }, S.session.email),
      h('p', { class: 'm-sync', id: 'sync' }, syncText()),
      h('button', { class: 'btn ghost block small', type: 'button', onclick: signOut }, t('signOut')));
    btn.addEventListener('click', () => {
      const open = panel.hidden;
      panel.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      if (open) updateSync();
    });
    return h('div', { class: 'menuwrap' }, btn, panel);
  }
  function closeMenu(refocus) {
    const panel = $('.menu');
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    const btn = $('.menuwrap .iconbtn');
    if (btn) { btn.setAttribute('aria-expanded', 'false'); if (refocus) btn.focus(); }
  }

  function countLine() {
    const d = daysToMidterm();
    const txt = d > 1 ? t('daysLeft', { n: d }) : d === 1 ? t('dayLeft') : d === 0 ? t('midtermToday') : t('midtermPassed');
    return h('p', { class: 'h-count' }, h('i'), txt);
  }

  function hero() {
    return h('div', { class: 'hero' },
      mosaic(),
      h('div', { class: 'wrap hero-text' },
        h('p', { class: 'h-sub' }, t('codeLine')),
        h('p', { class: 'h-label' }, t('midterm')),
        h('h1', { class: 'h-title' }, t('appName')),
        countLine(),
        h('p', { class: 'h-who' }, t('instructor')),
        h('p', { class: 'h-prog' }, t('programme'))));
  }

  function renderHeader(route) {
    const top = clear($('#top'));
    const front = route === 'home' || route === 'login';
    top.className = 'top' + (front ? ' home' : '');
    const bar = h('div', { class: 'wrap bar' });
    if (!front) {
      add(bar, [h('button', {
        class: 'iconbtn', type: 'button', 'aria-label': t('back'), onclick: () => goBack(PARENT[route] || 'home')
      }, icon('back'))]);
    }
    add(bar, [
      h('img', { class: 'logo', src: 'img/cut_logo_white.png', alt: t('university'), width: '90', height: '28' }),
      h('span', { class: 'grow' }),
      langSwitch(),
      S.session ? menuEl() : null
    ]);
    add(top, [bar, front ? hero() : null]);
  }

  function navNums() {
    const c = S.content[S.lang];
    return c && c.lectures.length ? c.lectures : [1, 2, 3, 4, 5, 6];
  }
  function setNav(n) {
    S.navLec = n || 0;
    document.querySelectorAll('.lecnav span').forEach((el) => {
      el.classList.toggle('on', Number(el.getAttribute('data-l')) === S.navLec);
    });
  }
  function renderFooter() {
    const f = clear($('#foot'));
    add(f, [
      h('div', { class: 'foot-main' },
        h('span', { class: 'px', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i')),
        h('span', null, t('footer'))),
      h('div', { class: 'lecnav', 'aria-hidden': 'true' }, navNums().map((n) => h('span', { 'data-l': String(n) }, lecAbbr(n)))),
      h('p', { class: 'priv' }, t('privacy'))
    ]);
    setNav(S.navLec);
  }

  /* ---------- rendering: screens ---------- */
  function mount(node) { clear($('#main')).appendChild(node); }

  function renderMain(route) {
    S.hooks = null;
    if (route === 'login') { setNav(0); return mount(viewLogin()); }
    const c = S.content[S.lang];
    if (!c) {
      mount(h('p', { class: 'status' }, t('loading')));
      const lang = S.lang;
      loadContent(lang).then(
        () => { if (S.lang === lang && S.session) render({ keep: true }); },
        () => { if (S.lang === lang && S.session) mount(viewLoadError(lang)); }
      );
      return;
    }
    if (route === 'home' || route === 'study' || route === 'quiz') setNav(route === 'study' ? S.prefs.sLec : route === 'quiz' ? S.prefs.qLec : 0);
    const views = { 'home': viewHome, 'study': viewStudySetup, 'study/run': viewStudyRun, 'quiz': viewQuizSetup, 'quiz/run': viewQuizRun };
    mount(views[route](c));
  }
  const rerender = () => renderMain(routeOf());
  function rerun() { rerender(); window.scrollTo(0, 0); }

  function viewLoadError(lang) {
    return h('div', { class: 'page' },
      h('div', { class: 'band err' }, t('loadFail')),
      h('div', { class: 'stack' }, h('button', {
        class: 'btn primary block', type: 'button',
        onclick: () => { mount(h('p', { class: 'status' }, t('loading'))); loadContent(lang).then(() => render({ keep: true }), () => mount(viewLoadError(lang))); }
      }, t('retry'))));
  }

  /* --- install (Chrome/Android prompt, iOS hint) --- */
  const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function fillInstall(box) {
    clear(box);
    if (isStandalone()) return;
    if (S.deferred) {
      add(box, [h('button', { class: 'btn ghost block', type: 'button', onclick: doInstall }, icon('download'), t('install'))]);
    } else if (isIOS() && lsGet(K.ios) !== '1') {
      add(box, [h('div', { class: 'ioshint' },
        h('span', null, t('iosHint')),
        h('button', {
          class: 'iconbtn', type: 'button', 'aria-label': t('hide'),
          onclick: () => { lsSet(K.ios, '1'); refreshInstall(); }
        }, icon('x')))]);
    }
  }
  function refreshInstall() { document.querySelectorAll('[data-install]').forEach(fillInstall); }
  async function doInstall() {
    const p = S.deferred;
    if (!p) return;
    S.deferred = null;
    refreshInstall();
    try { p.prompt(); await p.userChoice; } catch (e) { /* ignore */ }
  }

  /* --- sign in --- */
  function normLang(v) {
    const s = String(v).toLowerCase();
    return s === 'gr' || s === 'el' ? 'gr' : 'en';
  }

  function viewLogin() {
    const input = h('input', {
      id: 'email', name: 'email', type: 'email', autocomplete: 'email', inputmode: 'email',
      autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', maxlength: '200', required: true
    });
    const msg = h('div', { class: 'msg', role: 'alert' });
    const btn = h('button', { class: 'btn primary block', type: 'submit' }, t('signInBtn'));
    const showMsg = (text, withLink) => {
      clear(msg);
      const box = h('div', { class: 'band err' }, text);
      if (withLink) add(box, [' ', h('a', { class: 'link', href: '../' }, t('signUpLink'))]);
      msg.appendChild(box);
    };
    const form = h('form', {
      class: 'panel', novalidate: true,
      onsubmit: async (e) => {
        e.preventDefault();
        const email = input.value.trim().toLowerCase();
        clear(msg);
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { showMsg(t('badEmail')); input.focus(); return; }
        btn.disabled = true;
        btn.textContent = t('checking');
        try {
          const res = await rpc('cut_camm311_study_login', { p_email: email });
          if (res == null || res === false) showMsg(t('notListed'), true);
          else startSession(email, normLang(res));
        } catch (err) {
          showMsg(t('noServer'));
        } finally {
          btn.disabled = false;
          btn.textContent = t('signInBtn');
        }
      }
    },
      h('h2', { class: 'label', style: 'margin-top:0' }, t('signInTitle')),
      h('p', { class: 'lead' }, t('signInIntro')),
      h('div', { class: 'field' }, h('label', { for: 'email' }, t('email')), input),
      btn,
      msg);
    return h('div', { class: 'page' },
      form,
      h('p', { class: 'after' }, t('notYet') + ' ', h('a', { class: 'link', href: '../' }, t('signUpLink'))),
      h('div', { 'data-install': '' }));
  }

  function startSession(email, lang) {
    S.session = { email, lang };
    lsSet(K.session, JSON.stringify(S.session));
    S.lang = lang;
    lsSet(K.lang, lang);
    S.progress = loadLocalProgress(email);
    S.study = null;
    S.quiz = null;
    S.depth = 0;
    history.replaceState({ d: 0 }, '', location.pathname + location.search);
    render();
    pullProgress();
  }

  async function signOut() {
    if (S.dirty) {
      try { await Promise.race([pushSave(false), new Promise((res) => setTimeout(res, 4000))]); } catch (e) { /* ignore */ }
    }
    const email = S.session ? S.session.email : '';
    if (email && !S.dirty) lsDel(K.prog + email); // keep the local copy only if it never reached the server
    lsDel(K.session);
    clearTimeout(S.saveTimer);
    S.session = null;
    S.progress = blank();
    S.dirty = false;
    S.study = null;
    S.quiz = null;
    S.depth = 0;
    history.replaceState({ d: 0 }, '', location.pathname + location.search);
    render();
  }

  /* --- home --- */
  function bigBtn(kind, title, sub, onclick) {
    return h('button', { class: 'bigbtn ' + kind, type: 'button', onclick },
      h('span', { class: 'bb-text' }, h('span', { class: 't' }, title), h('span', { class: 's' }, sub)),
      icon('chev'));
  }
  function bar(pct) {
    const fill = h('span');
    fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
    return h('div', { class: 'bar-track', 'aria-hidden': 'true' }, fill);
  }
  function progressRow(c, n) {
    const st = lecStats(c, n);
    return h('div', { class: 'prow' },
      h('div', { class: 'phead' },
        n ? h('span', { class: 'badge' }, lecAbbr(n)) : null,
        h('span', { class: 'ptitle' }, n ? lecTitle(c, n) : t('allLectures'))),
      h('div', { class: 'pmeta' },
        bar(st.cards ? Math.round(100 * st.known / st.cards) : 0),
        h('span', null, t('cardsMeta', { k: st.known, n: st.cards })),
        h('span', null, st.tried ? t('quizMeta', { p: st.pct }) : t('quizNone'))));
  }

  function viewHome(c) {
    const install = h('div', { 'data-install': '' });
    fillInstall(install);
    return h('div', { class: 'page' },
      h('div', { class: 'bigbtns' },
        bigBtn('primary', t('studyCards'), t('studySub'), () => navigate('study')),
        bigBtn('accent', t('practiceQuiz'), t('quizSub'), () => navigate('quiz'))),
      install,
      h('h2', { class: 'label' }, t('progress')),
      h('div', { class: 'plist' }, progressRow(c, 0), c.lectures.map((n) => progressRow(c, n))));
  }

  /* --- shared setup controls --- */
  function savePrefs() { lsSet(K.prefs, JSON.stringify(S.prefs)); }

  function choiceRow(name, value, checked, badge, title, meta, onchange) {
    const input = h('input', { type: 'radio', name, value: String(value), checked, onchange });
    return h('label', { class: 'choice' }, input,
      h('span', { class: 'box' },
        h('span', { class: 'badge' }, badge),
        h('span', null, h('span', { class: 'ct' }, title), h('span', { class: 'cm' }, meta)),
        h('span', { class: 'tick' }, icon('check'))));
  }
  function toggleRow(label, checked, onchange) {
    return h('label', { class: 'toggle' },
      h('span', { class: 'tl' }, label),
      h('input', { type: 'checkbox', role: 'switch', checked, onchange }),
      h('span', { class: 'track', 'aria-hidden': 'true' }, h('span', { class: 'knob' })));
  }

  /* --- study: setup --- */
  function viewStudySetup(c) {
    const P = S.prefs;
    if (P.sLec && c.lectures.indexOf(P.sLec) < 0) P.sLec = 0;
    const startBtn = h('button', { class: 'btn primary block', type: 'submit' });
    const note = h('div', { class: 'note', 'aria-live': 'polite' });
    const refresh = () => {
      const n = cardPool(c, P.sLec, P.sOnly).length;
      startBtn.disabled = n === 0;
      startBtn.textContent = n ? t('startCards', { n }) : t('start');
      clear(note);
      if (!n) note.appendChild(h('div', { class: 'band' }, cardPool(c, P.sLec, false).length ? t('emptyAll') : t('emptyNone')));
      setNav(P.sLec);
    };
    const rows = [0].concat(c.lectures).map((n) => {
      const st = lecStats(c, n);
      return choiceRow('slec', n, P.sLec === n, n ? lecAbbr(n) : t('all'), n ? lecTitle(c, n) : t('allLectures'),
        t('nCards', { n: st.cards }) + ' · ' + t('nKnown', { k: st.known }),
        () => { P.sLec = n; savePrefs(); refresh(); });
    });
    const form = h('form', {
      class: 'setup',
      onsubmit: (e) => {
        e.preventDefault();
        let ids = cardPool(c, P.sLec, P.sOnly);
        if (!ids.length) return;
        if (P.sShuffle) ids = shuffle(ids);
        S.study = { ids: ids.map((x) => x.id), i: 0, flipped: false, busy: false, lec: P.sLec, only: P.sOnly, shuf: P.sShuffle };
        navigate('study/run');
      }
    },
      h('fieldset', null, h('legend', null, t('lecture')), h('div', { class: 'choices' }, rows)),
      toggleRow(t('optUnknown'), P.sOnly, (e) => { P.sOnly = e.target.checked; savePrefs(); refresh(); }),
      toggleRow(t('optShuffle'), P.sShuffle, (e) => { P.sShuffle = e.target.checked; savePrefs(); }),
      note,
      startBtn);
    refresh();
    return h('div', { class: 'page' }, h('h1', { class: 'title' }, t('studyCards')), form);
  }

  /* --- study: run --- */
  function bindCard(el, onFlip, onSwipe) {
    let sx = 0, sy = 0, dx = 0, drag = false, active = false, pid = null, swallow = false;
    const reset = () => { el.classList.remove('dragging', 'swipe-know', 'swipe-not'); el.style.transform = ''; };
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      active = true; drag = false; sx = e.clientX; sy = e.clientY; dx = 0; pid = e.pointerId;
    });
    el.addEventListener('pointermove', (e) => {
      if (!active || e.pointerId !== pid) return;
      dx = e.clientX - sx;
      const dy = e.clientY - sy;
      if (!drag && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
        drag = true;
        el.classList.add('dragging');
        try { el.setPointerCapture(pid); } catch (err) { /* ignore */ }
      }
      if (drag) {
        el.style.transform = 'translateX(' + dx + 'px) rotate(' + (dx / 28) + 'deg)';
        el.classList.toggle('swipe-know', dx > 40);
        el.classList.toggle('swipe-not', dx < -40);
      }
    });
    el.addEventListener('pointerup', (e) => {
      if (!active || e.pointerId !== pid) return;
      active = false;
      if (!drag) return;
      drag = false;
      swallow = true; // the click that follows a drag must not flip the card
      setTimeout(() => { swallow = false; }, 60);
      el.classList.remove('dragging');
      if (Math.abs(dx) > 90) onSwipe(dx > 0); else reset();
    });
    el.addEventListener('pointercancel', () => { if (active) { active = false; drag = false; reset(); } });
    el.addEventListener('click', () => { if (!swallow) onFlip(); });
    el.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onFlip(); }
    });
  }

  function viewStudyRun(c) {
    const st = S.study;
    const ids = st.ids.filter((id) => c.cardById[id]); // the other language may lack an id
    if (ids.length !== st.ids.length) { st.ids = ids; st.i = Math.min(st.i, ids.length); }
    if (st.i >= st.ids.length) return viewStudyEnd(c, st);

    const card = c.cardById[st.ids[st.i]];
    setNav(card.l);
    const n = st.ids.length;
    const front = h('div', { class: 'face front', 'aria-hidden': String(st.flipped) },
      h('span', { class: 'tag' }, lecAbbr(card.l)),
      h('div', { class: 'txt' }, card.f),
      h('span', { class: 'hint' }, t('flipHint')));
    const back = h('div', { class: 'face back', 'aria-hidden': String(!st.flipped) },
      h('span', { class: 'tag' }, t('answer')),
      h('div', { class: 'txt' }, card.b));
    const el = h('div', { class: 'card' + (st.flipped ? ' flipped' : ''), role: 'button', tabindex: '0' },
      h('div', { class: 'inner' }, front, back));

    const flip = () => {
      if (st.busy) return;
      st.flipped = !st.flipped;
      el.classList.toggle('flipped', st.flipped);
      front.setAttribute('aria-hidden', String(st.flipped));
      back.setAttribute('aria-hidden', String(!st.flipped));
      say(st.flipped ? t('answer') + ': ' + card.b : card.f);
    };
    const mark = (known, fromSwipe) => {
      if (st.busy) return;
      st.busy = true;
      S.progress.cards[card.id] = [known ? 1 : 0, Date.now()];
      touched();
      const next = () => { st.busy = false; st.i += 1; st.flipped = false; rerun(); };
      if (reducedMotion()) return next();
      el.classList.remove('dragging', 'swipe-know', 'swipe-not');
      el.style.transform = 'translateX(' + (known ? 1 : -1) * Math.max(window.innerWidth, 400) + 'px) rotate(' + (known ? 12 : -12) + 'deg)';
      el.style.opacity = '0';
      setTimeout(next, fromSwipe ? 200 : 220);
    };
    bindCard(el, flip, (right) => mark(right, true));
    S.hooks = { flip, mark };

    return h('div', { class: 'run' },
      h('div', { class: 'runbar' },
        h('span', { class: 'counter' }, (st.i + 1) + ' / ' + n),
        h('button', {
          class: 'btn ghost small', type: 'button', disabled: st.i === 0,
          onclick: () => { st.i = Math.max(0, st.i - 1); st.flipped = false; rerun(); }
        }, t('prev'))),
      h('div', { class: 'runprog' }, bar(Math.round(100 * st.i / n))),
      h('div', { class: 'stage' }, el),
      h('div', { class: 'actions' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => mark(false) }, icon('x'), t('notYetBtn')),
        h('button', { class: 'btn accent', type: 'button', onclick: () => mark(true) }, icon('check'), t('knowIt'))));
  }

  function viewStudyEnd(c, st) {
    setNav(0);
    const cards = st.ids.map((id) => c.cardById[id]).filter(Boolean);
    const unknown = cards.filter((x) => !isKnown(x.id));
    const known = cards.length - unknown.length;
    const restart = () => {
      const ids = st.shuf ? shuffle(unknown.map((x) => x.id)) : unknown.map((x) => x.id);
      S.study = { ids, i: 0, flipped: false, busy: false, lec: st.lec, only: st.only, shuf: st.shuf };
      rerun();
    };
    return h('div', { class: 'page' },
      h('h1', { class: 'title' }, t('roundDone')),
      h('div', { class: 'score' }, h('b', null, known + '/' + cards.length)),
      bar(cards.length ? Math.round(100 * known / cards.length) : 0),
      h('p', { class: 'lead', style: 'margin-top:12px' }, unknown.length ? t('knowCount', { k: known, n: cards.length }) : t('allKnown')),
      h('div', { class: 'stack' },
        unknown.length ? h('button', { class: 'btn primary block', type: 'button', onclick: restart }, t('studyUnknown')) : null,
        h('button', { class: 'btn ghost block', type: 'button', onclick: () => goBack('study') }, t('anotherSet')),
        h('button', { class: 'btn ghost block', type: 'button', onclick: goHome }, t('home'))));
  }

  /* --- quiz: setup --- */
  function viewQuizSetup(c) {
    const P = S.prefs;
    if (P.qLec && c.lectures.indexOf(P.qLec) < 0) P.qLec = 0;
    if ([0, 10, 20].indexOf(P.qLen) < 0) P.qLen = 10;
    const startBtn = h('button', { class: 'btn primary block', type: 'submit' });
    const note = h('div', { class: 'note' });
    const count = () => { const n = quizPool(c, P.qLec).length; return P.qLen ? Math.min(P.qLen, n) : n; };
    const refresh = () => {
      const n = count();
      startBtn.disabled = n === 0;
      startBtn.textContent = n ? t('startQuiz', { n }) : t('start');
      clear(note);
      if (!n) note.appendChild(h('div', { class: 'band' }, t('noQuestions')));
      setNav(P.qLec);
    };
    const rows = [0].concat(c.lectures).map((n) => {
      const st = lecStats(c, n);
      return choiceRow('qlec', n, P.qLec === n, n ? lecAbbr(n) : t('all'), n ? lecTitle(c, n) : t('allLectures'),
        t('nQuestions', { n: st.qs }) + (st.tried ? ' · ' + t('pctCorrect', { p: st.pct }) : ''),
        () => { P.qLec = n; savePrefs(); refresh(); });
    });
    const seg = [10, 20, 0].map((v) => h('label', null,
      h('input', { type: 'radio', name: 'qlen', value: String(v), checked: P.qLen === v, onchange: () => { P.qLen = v; savePrefs(); refresh(); } }),
      h('span', null, v ? String(v) : t('lenAll'))));
    const form = h('form', {
      class: 'setup',
      onsubmit: (e) => {
        e.preventDefault();
        let ids = shuffle(quizPool(c, P.qLec).map((q) => q.id));
        if (P.qLen) ids = ids.slice(0, P.qLen);
        if (!ids.length) return;
        S.quiz = { ids, i: 0, per: {}, lec: P.qLec, len: P.qLen };
        navigate('quiz/run');
      }
    },
      h('fieldset', null, h('legend', null, t('lecture')), h('div', { class: 'choices' }, rows)),
      h('fieldset', { class: 'seg' }, h('legend', null, t('numQuestions')), h('div', null, seg)),
      note,
      startBtn);
    refresh();
    return h('div', { class: 'page' }, h('h1', { class: 'title' }, t('practiceQuiz')), form);
  }

  /* --- quiz: run --- */
  function viewQuizRun(c) {
    const st = S.quiz;
    const ids = st.ids.filter((id) => c.qById[id]);
    if (ids.length !== st.ids.length) { st.ids = ids; st.i = Math.min(st.i, ids.length); }
    if (st.i >= st.ids.length) return viewQuizEnd(c, st);

    const q = c.qById[st.ids[st.i]];
    setNav(q.l);
    let rec = st.per[q.id];
    if (!rec || rec.perm.length !== q.o.length) rec = st.per[q.id] = { perm: optionOrder(q), choice: null, correct: false };
    const n = st.ids.length;
    const last = st.i === n - 1;

    const opts = rec.perm.map((oi, j) => {
      const b = h('button', { type: 'button', class: 'opt' },
        h('span', { class: 'letter' }, String.fromCharCode(65 + j)),
        h('span', { class: 'otxt' }, q.o[oi]),
        h('span', { class: 'omark' }));
      b.addEventListener('click', () => pick(j));
      return b;
    });
    const fb = h('div', { class: 'feedback', 'aria-live': 'polite' });
    const nextBtn = h('button', {
      class: 'btn primary', type: 'button',
      onclick: () => { st.i += 1; rerun(); }
    }, last ? t('seeScore') : t('next'));
    const actions = h('div', { class: 'actions one', hidden: true }, nextBtn);

    function paint() {
      const ci = rec.perm.indexOf(q.a);
      opts.forEach((b, j) => {
        const mark = b.querySelector('.omark');
        clear(mark);
        b.classList.remove('correct', 'wrong', 'dim');
        b.setAttribute('aria-disabled', 'true');
        if (j === ci) { b.classList.add('correct'); mark.appendChild(icon('check')); }
        else if (j === rec.choice) { b.classList.add('wrong'); mark.appendChild(icon('x')); }
        else b.classList.add('dim');
      });
      clear(fb);
      fb.className = 'feedback' + (rec.correct ? '' : ' bad');
      add(fb, [
        h('p', { class: 'fb-head' }, icon(rec.correct ? 'check' : 'x'), rec.correct ? t('correct') : t('notQuite')),
        !rec.correct && ci >= 0
          ? h('p', { class: 'fb-ans' }, h('strong', null, t('correctAnswer') + ': '), String.fromCharCode(65 + ci) + '. ' + q.o[q.a])
          : null,
        q.e ? h('p', { class: 'fb-exp' }, q.e) : null
      ]);
      actions.hidden = false;
    }
    function pick(j) {
      if (rec.choice != null || j < 0 || j >= opts.length) return;
      rec.choice = j;
      rec.correct = rec.perm[j] === q.a;
      S.progress.mcq[q.id] = [rec.correct ? 1 : 0, Date.now()];
      touched();
      paint();
      nextBtn.focus({ preventScroll: true });
      fb.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
    if (rec.choice != null) paint();
    S.hooks = { pick };

    return h('div', { class: 'run' },
      h('div', { class: 'runbar' }, h('span', { class: 'counter' }, (st.i + 1) + ' / ' + n)),
      h('div', { class: 'runprog' }, bar(Math.round(100 * st.i / n))),
      h('p', { class: 'qtag' }, lecAbbr(q.l) + (c.lecTitle[q.l] ? ' · ' + c.lecTitle[q.l] : '')),
      h('h2', { class: 'stem', id: 'stem' }, q.q),
      h('div', { class: 'options', role: 'group', 'aria-labelledby': 'stem' }, opts),
      fb,
      actions);
  }

  function viewQuizEnd(c, st) {
    setNav(0);
    const items = st.ids.map((id) => ({ q: c.qById[id], rec: st.per[id] })).filter((x) => x.q && x.rec);
    const total = items.length;
    const wrong = items.filter((x) => !x.rec.correct);
    const right = total - wrong.length;
    const pct = total ? Math.round(100 * right / total) : 0;
    const msg = !wrong.length ? t('perfect') : pct >= 80 ? t('great') : pct >= 50 ? t('okScore') : t('low');
    const retry = () => {
      S.quiz = { ids: shuffle(wrong.map((x) => x.q.id)), i: 0, per: {}, lec: st.lec, len: st.len };
      rerun();
    };
    return h('div', { class: 'page' },
      h('h1', { class: 'title' }, t('score')),
      h('div', { class: 'score' }, h('b', null, right + '/' + total), h('span', null, pct + '%')),
      bar(pct),
      h('p', { class: 'lead', style: 'margin-top:12px' }, msg),
      h('div', { class: 'stack' },
        wrong.length ? h('button', { class: 'btn primary block', type: 'button', onclick: retry }, t('retryWrong')) : null,
        h('button', { class: 'btn ghost block', type: 'button', onclick: () => goBack('quiz') }, t('newQuiz')),
        h('button', { class: 'btn ghost block', type: 'button', onclick: goHome }, t('home'))),
      wrong.length ? h('h2', { class: 'label' }, t('wrongHeading')) : null,
      wrong.map((x) => {
        const ci = x.rec.perm.indexOf(x.q.a);
        const mine = x.rec.choice != null ? x.q.o[x.rec.perm[x.rec.choice]] : null;
        return h('div', { class: 'wrongitem' },
          h('p', { class: 'wq' }, x.q.q),
          mine != null ? h('p', { class: 'wa wmine' }, h('strong', null, t('yourAnswer') + ': '), mine) : null,
          ci >= 0 ? h('p', { class: 'wa' }, h('strong', null, t('correctAnswer') + ': '), x.q.o[x.q.a]) : null,
          x.q.e ? h('p', { class: 'wexp' }, x.q.e) : null);
      }));
  }

  /* ---------- events ---------- */
  function onKey(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'Escape') { closeMenu(true); return; }
    const hk = S.hooks;
    if (!hk) return;
    if (hk.flip) {
      if (e.key === ' ' && tag !== 'BUTTON' && tag !== 'A') { e.preventDefault(); hk.flip(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); hk.mark(true); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); hk.mark(false); }
    } else if (hk.pick && /^[1-9]$/.test(e.key)) {
      hk.pick(Number(e.key) - 1);
    }
  }

  function registerWorker() {
    if (!('serviceWorker' in navigator)) return;
    const go = () => navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => { /* offline mode unavailable */ });
    if (document.readyState === 'complete') go(); else window.addEventListener('load', go);
  }

  function init() {
    Object.assign(S.prefs, lsJSON(K.prefs, {}));
    try {
      const s = JSON.parse(lsGet(K.session) || 'null');
      if (s && typeof s.email === 'string' && s.email) S.session = { email: s.email, lang: normLang(s.lang) };
    } catch (e) { /* ignore a corrupt session */ }
    const browserGr = /^el\b/i.test(navigator.language || '');
    S.lang = normLang(lsGet(K.lang) || (S.session && S.session.lang) || (browserGr ? 'gr' : 'en'));
    if (S.session) S.progress = loadLocalProgress(S.session.email);
    if (!history.state) history.replaceState({ d: 0 }, '');
    S.depth = (history.state && history.state.d) || 0;

    window.addEventListener('popstate', () => {
      S.depth = (history.state && history.state.d) || 0;
      if (S.wantHome) {
        S.wantHome = false;
        if (routeOf() !== 'home') history.replaceState({ d: S.depth }, '', location.pathname + location.search);
      }
      render();
    });
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', (e) => { if (!e.target.closest('.menuwrap')) closeMenu(); });
    window.addEventListener('online', () => { if (S.dirty) pushSave(false); pullProgress(); });
    const flush = () => { clearTimeout(S.saveTimer); pushSave(true); };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
      else if (S.session && Date.now() - S.lastPull > PULL_EVERY) pullProgress();
    });
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.deferred = e; refreshInstall(); });
    window.addEventListener('appinstalled', () => { S.deferred = null; refreshInstall(); });

    registerWorker();
    render({ keep: true });
    refreshInstall();
    loadContent(S.lang).catch(() => { /* shown when a screen needs it */ });
    if (S.session) pullProgress();
  }

  init();
})();

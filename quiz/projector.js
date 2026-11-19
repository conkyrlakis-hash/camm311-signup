/* CAMM 311 quiz - projector view. Shows ONLY the room code and how many students have started. No names, no scores.
   The room code comes from the lecturer tab (localStorage); the count comes from the public info() RPC. */
(function () {
  'use strict';
  var CFG = window.QUIZ_CFG;
  var RKEY = 'camm311_quiz_room';
  var T = { en: { l1: 'Room code', l2: 'students started', none: '------' }, gr: { l1: 'Κωδικός αίθουσας', l2: 'φοιτητές ξεκίνησαν', none: '------' } };
  var lang = 'en';
  try { lang = localStorage.getItem('camm311_quiz_lang') || 'en'; } catch (e) {}
  function room() { try { return localStorage.getItem(RKEY) || ''; } catch (e) { return ''; } }
  function draw(count) {
    document.getElementById('l1').textContent = T[lang].l1;
    document.getElementById('l2').textContent = T[lang].l2;
    document.getElementById('code').textContent = room() || T[lang].none;
    if (count != null) document.getElementById('count').textContent = String(count);
    document.documentElement.lang = lang === 'gr' ? 'el' : 'en';
    Array.prototype.forEach.call(document.querySelectorAll('.lang button'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-l') === lang));
      b.onclick = function () { lang = b.getAttribute('data-l'); try { localStorage.setItem('camm311_quiz_lang', lang); } catch (e) {} draw(); };
    });
  }
  var last = 0;
  function poll() {
    fetch(CFG.url + '/rest/v1/rpc/cut_camm311_quiz_info', { method: 'POST',
      headers: { apikey: CFG.key, Authorization: 'Bearer ' + CFG.key, 'Content-Type': 'application/json' }, body: '{}' })
      .then(function (r) { return r.json(); }).then(function (i) { last = i && i.started || 0; draw(last); }).catch(function () {});
  }
  window.addEventListener('storage', function () { draw(); });
  setInterval(function () { draw(); }, 1000);
  setInterval(poll, 3000);
  draw(0); poll();
})();

"""Browser check against a LOCAL MOCK of the RPCs (no network, no Supabase).
Run from the repo root:  python quiz/tests/ui_mock.py <shots_dir>
Needs: pip install playwright && playwright install chromium"""
import json, sys, threading, http.server, socketserver, functools, os
from playwright.sync_api import sync_playwright

SHOTS = sys.argv[1] if len(sys.argv) > 1 else 'shots'
os.makedirs(SHOTS, exist_ok=True)
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
H = functools.partial(Q, directory=ROOT)
srv = socketserver.TCPServer(('127.0.0.1', 0), H); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{PORT}/quiz/'

QS = [
    {'idx': 0, 'n': 5, 'stem_en': 'DEMO 1: Which colour is the demo answer?', 'stem_gr': 'DEMO 1: Ποιο χρώμα είναι η απάντηση του demo;',
     'options': [{'en': 'Grey', 'gr': 'Γκρι'}, {'en': 'Blue', 'gr': 'Μπλε'}, {'en': 'Red', 'gr': 'Κόκκινο'}, {'en': 'Green', 'gr': 'Πράσινο'}], 'remaining_ms': 30000, 'done': False},
    {'idx': 1, 'n': 5, 'stem_en': 'DEMO 2: Pick the second option.', 'stem_gr': 'DEMO 2: Επιλέξτε τη δεύτερη επιλογή.',
     'options': [{'en': 'Third', 'gr': 'Τρίτη'}, {'en': 'First', 'gr': 'Πρώτη'}, {'en': 'Second', 'gr': 'Δεύτερη'}], 'remaining_ms': 30000, 'done': False},
]
state = {'i': 0, 'log': [], 'bodies': [], 'pending': False, 'approved': False, 'running': True}

def reply(route, obj, status=200):
    route.fulfill(status=status, content_type='application/json', body=json.dumps(obj),
                  headers={'access-control-allow-origin': '*'})

def handler(route, req):
    fn = req.url.split('/rpc/')[1]
    body = req.post_data_json or {}
    state['log'].append(fn); state['bodies'].append(body)
    if req.method == 'OPTIONS': return route.fulfill(status=204, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': '*'})
    if fn == 'cut_camm311_quiz_info': return reply(route, {'quiz_id': 1, 'title': 'DEMO quiz', 'seconds': 30, 'n': 5, 'open': True, 'started': 7, 'running': state['running']})
    if fn == 'cut_camm311_quiz_start':
        if body['p_room'] != 'K7M2QX': return reply(route, {'error': 'cannot_start'})
        return reply(route, {'attempt': 'a-1', 'token': 't-1', 'name': 'Anna Demo', 'section': 'CAMM 311.2 (EN)', 'n': 5, 'seconds': 30, 'pending': state['pending'], 'quiz': 1, 'running': state['running']})
    if fn == 'cut_camm311_quiz_next':
        if state['pending'] and not state['approved']: return reply(route, {'pending': True})
        if not state['running']: return reply(route, {'lobby': True})
        if state['i'] >= len(QS): return reply(route, {'done': True, 'n': 5})
        return reply(route, QS[state['i']])
    if fn == 'cut_camm311_quiz_submit': state['i'] += 1; return reply(route, {'ok': True})
    if fn == 'cut_camm311_quiz_leave': state['i'] += 1; return reply(route, {'ok': True, 'locked': True})
    if fn == 'cut_camm311_quiz_board':
        if body.get('p_code') != 'LECT': return reply(route, {'error': 'forbidden'})
        scores = bool(body.get('p_scores'))
        def r(n, sec, ans, cor, left=0, dup=0, rp=False, fin=False, to=0, pend=False):
            d = {'attempt': 'x' + n, 'name': n, 'section': sec, 'answered': ans, 'served': ans, 'n': 10, 'correct': cor, 'left': left,
                    'timeouts': to, 'dup': dup, 'reset_pending': rp, 'finished': fin, 'seen_s_ago': 2, 'pending': pend}
            if not scores: d.pop('correct')
            return d
        return reply(route, {'title': 'DEMO quiz - not an exam', 'n': 10, 'room_set': True, 'scores_visible': scores, 'running': state['running'], 'run_at': '2026-11-27T10:00:00Z' if state['running'] else None, 'signed_up': 9,
            'missing': [{'name': 'Late Comer', 'section': 'CAMM 311.1 (GR)'}, {'name': 'Zoe Demo', 'section': 'CAMM 311.2 (EN)'}], 'alerts': {'room_guesses': 12, 'unknown_emails': 0, 'lecturer_code_fails': 0}, 'students': [
            r('Anna Demo', 'CAMM 311.2 (EN)', 4, 3), r('Elena Demo', 'CAMM 311.1 (GR)', 6, 4, left=2),
            r('Marios Demo', 'CAMM 311.1 (GR)', 10, 8, fin=True), r('Nikos Demo', 'CAMM 311.2 (EN)', 3, 2, dup=1),
            r('Sofia Demo', 'CAMM 311.2 (EN)', 5, 3, rp=True), r('Petros Demo', 'CAMM 311.1 (GR)', 7, 5, to=1), r('Vera Demo', 'CAMM 311.2 (EN)', 0, 0, pend=True)]})
    if fn == 'cut_camm311_quiz_begin':
        if body.get('p_code') != 'LECT': return reply(route, {'error': 'forbidden'})
        state['running'] = True; return reply(route, {'ok': True, 'run_at': '2026-11-27T10:00:00Z'})
    if fn == 'cut_camm311_quiz_room_regen': return reply(route, {'room': 'K7M2QX'})
    if fn in ('cut_camm311_quiz_approve', 'cut_camm311_quiz_clear_blocks'): return reply(route, {'ok': True, 'approved': 1, 'cleared': 12})
    if fn == 'cut_camm311_quiz_reset_device': return reply(route, {'ok': True})
    return reply(route, None)

ok = True
def check(c, m):
    global ok
    print('PASS' if c else 'FAIL', m)
    ok = ok and c

HIDE = "Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'));"

with sync_playwright() as p:
    b = p.chromium.launch()
    # ---------- student at 360 ----------
    ctx = b.new_context(viewport={'width': 360, 'height': 740}, device_scale_factor=2, locale='en')
    ctx.route('**/rest/v1/rpc/**', handler)
    pg = ctx.new_page(); pg.goto(BASE + 'index.html'); pg.wait_for_selector('#email')
    check(pg.evaluate('document.documentElement.scrollWidth <= 360'), 'login: no horizontal scroll at 360')
    pg.screenshot(path=f'{SHOTS}/1_student_login_360_en.png')
    pg.fill('#email', 'anna@test.example'); pg.fill('#room', 'WRONG1'); pg.click('button[type=submit]')
    pg.wait_for_selector('.band.err')
    check('Cannot start' in pg.inner_text('.band.err'), 'wrong room code: generic message')
    pg.fill('#room', 'k7m2qx'); pg.click('button[type=submit]'); pg.wait_for_selector('.opt')
    check(pg.locator('.opt').count() == 4, 'question 1 shows 4 options')
    check(pg.is_visible('#wm') and 'Anna' in pg.evaluate("decodeURIComponent(document.getElementById('wm').style.backgroundImage)"), 'watermark carries the student name')
    check(pg.evaluate('document.documentElement.scrollWidth <= 360'), 'question: no horizontal scroll at 360')
    check('correct' not in json.dumps(QS).lower(), 'mock question payload has no answer field')
    pg.wait_for_timeout(1200)
    pg.screenshot(path=f'{SHOTS}/2_student_question_360_en.png')
    pg.locator('.opt').nth(1).click(); pg.wait_for_selector('#qstatus:has-text("saved")'); pg.wait_for_selector('.stem:has-text("DEMO 2")')
    check(state['log'].count('cut_camm311_quiz_submit') == 1 and state['bodies'][state['log'].index('cut_camm311_quiz_submit')]['p_pos'] == 1, 'tap sends position only')
    # blur only logs: no lock, no leave call
    pg.evaluate("window.dispatchEvent(new Event('blur'))"); pg.wait_for_timeout(300)
    check(pg.locator('.locked').count() == 0 and 'cut_camm311_quiz_leave' not in state['log'], 'blur does not lock and sends no leave')
    # leave on question 2
    pg.evaluate(HIDE); pg.wait_for_selector('.locked')
    check('cut_camm311_quiz_leave' in state['log'], 'leaving the app reports leave to the server')
    pg.screenshot(path=f'{SHOTS}/3_student_locked_360_gr.png') if False else None
    pg.click('.lang button[data-l=gr]'); pg.wait_for_selector('.locked h1:has-text("κλειδώθηκε")')
    pg.screenshot(path=f'{SHOTS}/3_student_locked_360_gr.png')
    pg.click('button.btn.block'); pg.wait_for_selector('h1:has-text("ολοκληρώθηκε")')
    check(True, 'finished screen in Greek')
    ctx.close()
    # ---------- lecturer board at 1280 ----------
    ctx = b.new_context(viewport={'width': 1280, 'height': 760}, locale='en')
    ctx.route('**/rest/v1/rpc/**', handler)
    pg = ctx.new_page(); pg.goto(BASE + 'board.html'); pg.fill('#lc', 'bad'); pg.click('button[type=submit]'); pg.wait_for_selector('.band.err')
    check(True, 'board: wrong lecturer code shows error')
    pg.fill('#lc', 'LECT'); pg.click('button[type=submit]'); pg.wait_for_selector('table.board')
    check(pg.locator('#roomcode').count() == 0 and 'K7M2QX' not in pg.inner_text('main'), 'board: room code is NOT on the main board')
    pg.click('#newroom'); pg.wait_for_function("localStorage.getItem('camm311_quiz_room')==='K7M2QX'")
    check(pg.locator('th:has-text("Correct")').count() == 0 and pg.locator('td.num').count() == 0, 'board: scores hidden by default')
    check(pg.locator('tr.red').count() == 1 and pg.locator('tr.amber').count() == 3, 'board: 1 red row (left app), 3 amber rows (duplicate, reset waiting, pending)')
    check('Wrong room codes tried: 12' in pg.inner_text('#alerts') and pg.locator('#clearblocks').count() == 1, 'board: alert banner and clear blocks')
    check(pg.locator('#approveall').count() == 1, 'board: approve all button while someone is pending')
    pg.click('#approveall'); pg.wait_for_timeout(300)
    check('cut_camm311_quiz_approve' in state['log'], 'board: approve calls the server')
    pg.click('#clearblocks'); pg.wait_for_selector('.band.ok:has-text("12")')
    pg.click('#scoretoggle'); pg.wait_for_selector('th:has-text("Correct")')
    check(pg.locator('td.num').count() == 7, 'board: scores shown after the toggle')
    pg.click('#scoretoggle'); pg.wait_for_function("document.querySelectorAll('td.num').length===0")
    check(pg.evaluate('document.documentElement.scrollWidth <= 1280'), 'board: fits 1280')
    pg.screenshot(path=f'{SHOTS}/4_lecturer_board_1280.png')
    # ---------- projector: only code + count ----------
    pj = ctx.new_page(); pj.goto(BASE + 'projector.html')
    pj.evaluate("localStorage.setItem('camm311_quiz_room','K7M2QX')")
    pj.wait_for_function("document.getElementById('code').textContent==='K7M2QX'")
    txt = pj.inner_text('main')
    check('K7M2QX' in txt and pj.inner_text('#count') == '7', 'projector: room code and started count')
    check('Demo' not in txt and 'orrect' not in txt, 'projector: no names, no scores')
    pj.set_viewport_size({'width': 1280, 'height': 720})
    pj.screenshot(path=f'{SHOTS}/5_projector_1280.png')
    pg.screenshot(path=f'{SHOTS}/4_lecturer_board_1280.png') if False else None
    # ---------- student pending screen ----------
    ctx2 = b.new_context(viewport={'width': 360, 'height': 740}, locale='en')
    ctx2.route('**/rest/v1/rpc/**', handler)
    state['pending'] = True; state['approved'] = False; state['i'] = 0
    sp = ctx2.new_page(); sp.goto(BASE + 'index.html'); sp.wait_for_selector('#email')
    sp.fill('#email', 'anna@test.example'); sp.fill('#room', 'K7M2QX'); sp.click('button[type=submit]')
    sp.wait_for_selector('h1:has-text("Waiting for the lecturer")')
    check(True, 'student: pending screen while not approved')
    state['approved'] = True
    sp.wait_for_selector('.opt', timeout=6000)
    check(True, 'student: question appears by itself after approval')
    # ---------- lobby: student waits, board roll-call and Start ----------
    state['pending'] = False; state['running'] = False; state['i'] = 0
    ctx3 = b.new_context(viewport={'width': 360, 'height': 740}, locale='en')
    ctx3.route('**/rest/v1/rpc/**', handler)
    lp = ctx3.new_page(); lp.goto(BASE + 'index.html'); lp.wait_for_selector('#email')
    lp.fill('#email', 'anna@test.example'); lp.fill('#room', 'K7M2QX'); lp.click('button[type=submit]')
    lp.wait_for_selector('h1:has-text("You are signed in")')
    check('Anna Demo' in lp.inner_text('main') and lp.locator('.opt').count() == 0, 'student: lobby screen with the name, no question before Start')
    lp.screenshot(path=f'{SHOTS}/6_student_lobby_360.png')
    lp.reload(); lp.wait_for_selector('h1:has-text("You are signed in")')
    check(True, 'student: a reload during the lobby stays in the lobby (same session)')
    state['running'] = True
    lp.wait_for_selector('.opt', timeout=6000)
    check(True, 'student: the first question appears by itself once the lecturer starts')
    # a session left over from another quiz is thrown away: fresh sign-in
    lp.evaluate("localStorage.setItem('camm311_quiz_session', JSON.stringify({attempt:'old', token:'old', name:'Old', n:5, quiz:99}))")
    lp.reload(); lp.wait_for_selector('#email')
    check(True, 'student: a saved session from an earlier quiz is dropped, the login form is shown')
    lp.evaluate("localStorage.setItem('camm311_quiz_session', JSON.stringify({attempt:'old', token:'old', name:'Old', n:5}))")
    lp.reload(); lp.wait_for_selector('#email')
    check(True, 'student: a saved session with no quiz tag is dropped too')
    ctx3.close()
    state['running'] = False
    ctx4 = b.new_context(viewport={'width': 1280, 'height': 900}, locale='en')
    ctx4.route('**/rest/v1/rpc/**', handler)
    bp = ctx4.new_page(); bp.on('dialog', lambda d: d.accept()); bp.goto(BASE + 'board.html')
    bp.fill('#lc', 'LECT'); bp.click('button[type=submit]'); bp.wait_for_selector('#rollcount')
    check('Signed in: 7 of 9 signed up' in bp.inner_text('#rollcount'), 'board: roll-call counter signed in / signed up')
    check(bp.locator('#missing li').count() == 2 and 'Late Comer' in bp.inner_text('#missing'), 'board: list of students who have not signed in')
    check(bp.locator('#startquiz').count() == 1 and bp.locator('#runbanner').count() == 0, 'board: Start button in the lobby')
    bp.screenshot(path=f'{SHOTS}/7_lecturer_lobby_1280.png')
    bp.click('#startquiz'); bp.wait_for_selector('#runbanner')
    check('cut_camm311_quiz_begin' in state['log'] and bp.locator('#startquiz').count() == 0 and bp.locator('#missing').count() == 0, 'board: after Start the banner shows, button and missing list go')
    check(pj.locator('#qr').count() == 1 and pj.evaluate("document.getElementById('qr').naturalWidth > 100"), 'projector: QR image loads')
    pj.screenshot(path=f'{SHOTS}/5_projector_1280.png')
    b.close()
srv.shutdown()
print('ALL OK' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)

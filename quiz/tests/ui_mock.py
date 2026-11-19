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
state = {'i': 0, 'log': [], 'bodies': []}

def reply(route, obj, status=200):
    route.fulfill(status=status, content_type='application/json', body=json.dumps(obj),
                  headers={'access-control-allow-origin': '*'})

def handler(route, req):
    fn = req.url.split('/rpc/')[1]
    body = req.post_data_json or {}
    state['log'].append(fn); state['bodies'].append(body)
    if req.method == 'OPTIONS': return route.fulfill(status=204, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': '*'})
    if fn == 'cut_camm311_quiz_info': return reply(route, {'quiz_id': 1, 'title': 'DEMO quiz', 'seconds': 30, 'n': 5, 'open': True})
    if fn == 'cut_camm311_quiz_start':
        if body['p_room'] != 'K7M2QX': return reply(route, {'error': 'cannot_start'})
        return reply(route, {'attempt': 'a-1', 'token': 't-1', 'name': 'Anna Demo', 'section': 'CAMM 311.2 (EN)', 'n': 5, 'seconds': 30})
    if fn == 'cut_camm311_quiz_next':
        if state['i'] >= len(QS): return reply(route, {'done': True, 'n': 5})
        return reply(route, QS[state['i']])
    if fn == 'cut_camm311_quiz_submit': state['i'] += 1; return reply(route, {'ok': True})
    if fn == 'cut_camm311_quiz_leave': state['i'] += 1; return reply(route, {'ok': True, 'locked': True})
    if fn == 'cut_camm311_quiz_board':
        if body.get('p_code') != 'LECT': return reply(route, {'message': 'forbidden'}, 403)
        def r(n, sec, ans, cor, left=0, dup=0, rp=False, fin=False, to=0):
            return {'attempt': 'x' + n, 'name': n, 'section': sec, 'answered': ans, 'served': ans, 'n': 10, 'correct': cor, 'left': left,
                    'timeouts': to, 'dup': dup, 'reset_pending': rp, 'finished': fin, 'seen_s_ago': 2}
        return reply(route, {'title': 'DEMO quiz - not an exam', 'n': 10, 'room_set': True, 'students': [
            r('Anna Demo', 'CAMM 311.2 (EN)', 4, 3), r('Elena Demo', 'CAMM 311.1 (GR)', 6, 4, left=2),
            r('Marios Demo', 'CAMM 311.1 (GR)', 10, 8, fin=True), r('Nikos Demo', 'CAMM 311.2 (EN)', 3, 2, dup=1),
            r('Sofia Demo', 'CAMM 311.2 (EN)', 5, 3, rp=True), r('Petros Demo', 'CAMM 311.1 (GR)', 7, 5, to=1)]})
    if fn == 'cut_camm311_quiz_room_regen': return reply(route, 'K7M2QX')
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
    pg.click('text=New room code'); pg.wait_for_function("document.getElementById('roomcode').textContent==='K7M2QX'")
    check(pg.locator('tr.red').count() == 1 and pg.locator('tr.amber').count() == 2, 'board: 1 red row (left app), 2 amber rows (duplicate, reset waiting)')
    check(pg.evaluate('document.documentElement.scrollWidth <= 1280'), 'board: fits 1280')
    pg.screenshot(path=f'{SHOTS}/4_lecturer_board_1280.png')
    b.close()
srv.shutdown()
print('ALL OK' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)

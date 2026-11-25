"""Owner button: publish the Menu Engineering sign-up (CUT, CAMM 311).

  python release_menu.py            # all steps
  python release_menu.py --check    # checks only, changes nothing

Steps: 1 create the table, 2 store the Resend key as a function secret, 3 deploy the function,
4 send ONE test e-mail to info@proinsights.com.cy, 5 publish the page (git push).
Nothing goes to a student. Keys are read in-process and never printed.
"""
import json, os, subprocess, sys, time, urllib.request, urllib.error
sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
REF = 'cgiibcoeezlmehzowidg'
OWNER = 'info@proinsights.com.cy'
LOG = 'C:/t/att-demo-out/menu-release.log'
CHECK = '--check' in sys.argv
os.makedirs(os.path.dirname(LOG), exist_ok=True)
sys.path.insert(0, 'C:/t/deploy-edge')
import mgmt_sql  # noqa: E402


def say(m):
    line = time.strftime('%d/%m/%Y %H:%M:%S') + ' ' + m
    print(line)
    open(LOG, 'a', encoding='utf-8').write(line + '\n')


def stop(m):
    say('STOP: ' + m)
    sys.exit(1)


def sh(cmd, env=None, cwd=None):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True, stdin=subprocess.DEVNULL,
                          encoding='utf-8', errors='replace', env=env, cwd=cwd)


say(f'=== release_menu.py {"--check" if CHECK else "full"} ({time.strftime("%d/%m/%Y %H:%M")}) ===')
tok = mgmt_sql.find_token(json.load(open(os.path.expanduser('~/.claude.json'), encoding='utf-8')))
if not tok:
    stop('no Supabase access token on this computer. Nothing changed.')
env = dict(os.environ, SUPABASE_ACCESS_TOKEN=tok)

say('STEP 1 of 5: create the sign-up table')
sql = open(os.path.join(HERE, 'sql', 'menu_signups.sql'), encoding='utf-8').read()
mgmt_sql.REF = REF
if CHECK:
    st, tx = mgmt_sql.run('select 1', read_only=True)
else:
    st, tx = mgmt_sql.run(sql)
if not 200 <= st < 300:
    stop(f'SQL failed ({st}): {tx[:300]}')
say('CHECK PASSED: table ready ' + tx[:80])

say('STEP 2 of 5: store the Resend key as a function secret')
r = sh('powershell -NoProfile -ExecutionPolicy Bypass -File "%s/.claude/scripts/op-run.ps1" item get "ProInsights Offers - Resend" --vault "ProOps Automation" --fields password --reveal' % os.path.expanduser('~').replace('\\', '/'))
key = (r.stdout or '').strip()
if r.returncode != 0 or not key.startswith('re_'):
    stop('could not read the Resend key from 1Password.')
if CHECK:
    say('CHECK PASSED: key readable (not stored in check mode)')
else:
    e2 = dict(env)
    r = subprocess.run(['npx', '--yes', 'supabase', 'secrets', 'set', 'RESEND_API_KEY=' + key, '--project-ref', REF],
                       capture_output=True, text=True, stdin=subprocess.DEVNULL, encoding='utf-8', errors='replace', env=e2, shell=True)
    if r.returncode != 0:
        stop('secret not stored: ' + r.stderr[-300:].replace(key, '***'))
    say('CHECK PASSED: secret stored')

say('STEP 3 of 5: deploy the function')
if CHECK:
    say('CHECK PASSED: skipped in check mode')
else:
    r = sh(f'npx --yes supabase functions deploy menu-send --project-ref {REF} --no-verify-jwt --use-api', env=env, cwd=HERE)
    if r.returncode != 0:
        stop('deploy failed: ' + (r.stderr or r.stdout)[-400:])
    say('CHECK PASSED: function deployed')

say('STEP 4 of 5: one test e-mail to ' + OWNER)
if CHECK:
    say('CHECK PASSED: skipped in check mode')
else:
    body = json.dumps({'name': 'Constantinos (test)', 'email': OWNER, 'lang': 'gr', 'consent': True}).encode()
    req = urllib.request.Request(f'https://{REF}.supabase.co/functions/v1/menu-send', data=body,
                                 headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            out = resp.read().decode()
    except urllib.error.HTTPError as e:
        stop(f'function answered {e.code}: {e.read().decode()[:200]}')
    if '"ok":true' not in out.replace(' ', ''):
        stop('function did not confirm: ' + out[:200])
    say('CHECK PASSED: test e-mail accepted by Resend. Open the inbox and check the attachment.')

say('STEP 5 of 5: publish the page')
if CHECK:
    say('CHECK PASSED: skipped in check mode')
else:
    r = sh('git add menu && git commit -m "Menu Engineering sign-up page" && git push origin HEAD:main', cwd=HERE)
    if r.returncode != 0 and 'nothing to commit' not in (r.stdout + r.stderr):
        stop('push failed: ' + r.stderr[-300:])
    say('CHECK PASSED: page pushed. Live in about 1 minute: https://conkyrlakis-hash.github.io/camm311-signup/menu/')
say('DONE')

import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'fs';

const db = new PGlite({ extensions: { pgcrypto } });
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
const q = async (sql, params) => (await db.query(sql, params)).rows;
const j = async (sql, params) => (await q(sql, params))[0].r;

await db.exec(`create role anon nologin; create role authenticated nologin; create schema extensions;
  create extension pgcrypto with schema extensions;
  create table public.cut_camm311_signups (id bigserial primary key, first_name text, surname text, email text, section text);
  insert into public.cut_camm311_signups(first_name,surname,email,section) values
   ('Anna','Demo','anna@test.example','CAMM 311.2 (EN)'),('Nikos','Demo','nikos@test.example','CAMM 311.1 (GR)');
  grant usage on schema public, extensions to anon;`);
await db.exec(fs.readFileSync('C:/t/camm311-quiz/quiz/sql/2026-11-19_camm311_quiz.sql', 'utf8'));
ok(true, 'SQL file loads');

const LECT = 'DEMO-CODE-CHANGE-ME';
await db.exec(`update cut_camm311_quiz set active=true, opens_at=now()-interval '1 hour', closes_at=now()+interval '1 hour'`);
await db.exec('set role anon');

// RLS: no table access
for (const t of ['cut_camm311_quiz','cut_camm311_quiz_questions','cut_camm311_quiz_attempts','cut_camm311_quiz_answers','cut_camm311_quiz_fails','cut_camm311_quiz_reset_log']) {
  let denied = false; try { await q(`select * from public.${t}`); } catch (e) { denied = true; }
  ok(denied, 'anon cannot read ' + t);
}
let hid = false; try { await q(`select public.cut_camm311_quiz_auth(gen_random_uuid(), gen_random_uuid())`); } catch (e) { hid = true; }
ok(hid, 'helper auth() not callable by anon');

const info = await j(`select public.cut_camm311_quiz_info() r`);
ok(info.quiz_id === 1 && info.open === true, 'quiz_info open');
const QID = info.quiz_id;

// ---- point 1: room code
const early = await j(`select public.cut_camm311_quiz_start('anna@test.example',$1,'ABC123') r`, [QID]);
ok(early.error === 'cannot_start', 'no room code set yet: cannot start');
let bad = false; try { await q(`select public.cut_camm311_quiz_room_regen($1,'wrong') r`, [QID]); } catch (e) { bad = true; }
ok(bad, 'room_regen refuses wrong lecturer code');
const ROOM = await j(`select public.cut_camm311_quiz_room_regen($1,$2) r`, [QID, LECT]);
ok(/^[A-Z2-9]{6}$/.test(ROOM), 'room code generated: 6 chars');
await db.exec('reset role');
const stored = (await q(`select room_hash from cut_camm311_quiz`))[0].room_hash;
ok(stored && !stored.includes(ROOM) && stored.startsWith('$2'), 'room code stored as bcrypt hash only');
await db.exec('set role anon');
const wrongRoom = await j(`select public.cut_camm311_quiz_start('anna@test.example',$1,'ZZZZZZ') r`, [QID]);
ok(wrongRoom.error === 'cannot_start', 'wrong room code refused');

// ---- point 3: generic errors
const unknown = await j(`select public.cut_camm311_quiz_start('ghost@test.example',$1,$2) r`, [QID, ROOM]);
ok(unknown.error === 'cannot_start' && JSON.stringify(unknown) === JSON.stringify(wrongRoom), 'unknown email = identical error to wrong room');
await db.exec('reset role');
await db.exec(`update cut_camm311_quiz set closes_at = now() - interval '1 minute'`);
await db.exec('set role anon');
const closed = await j(`select public.cut_camm311_quiz_start('nikos@test.example',$1,$2) r`, [QID, ROOM]);
ok(JSON.stringify(closed) === JSON.stringify(wrongRoom), 'closed quiz = identical error');
await db.exec('reset role');
await db.exec(`update cut_camm311_quiz set closes_at = now() + interval '1 hour'`);
await db.exec('set role anon');

// ---- point 4: rate limit (5 per 10 min per email)
let last;
for (let i = 0; i < 6; i++) last = await j(`select public.cut_camm311_quiz_start('victim@test.example',$1,'BADBAD') r`, [QID]);
ok(last.error === 'rate_limited', 'rate limit after 5 failed starts per email');
const nikosOk = await j(`select public.cut_camm311_quiz_start('nikos@test.example',$1,$2) r`, [QID, ROOM]);
ok(nikosOk.token, 'other email unaffected; correct start works');

// ---- point 2: device binding
const anna = await j(`select public.cut_camm311_quiz_start('Anna@Test.example',$1,$2) r`, [QID, ROOM]);
ok(anna.token && anna.name === 'Anna Demo' && anna.n === 5, 'first start returns token + name + 5 questions');
const again = await j(`select public.cut_camm311_quiz_start('anna@test.example',$1,$2) r`, [QID, ROOM]);
ok(again.error === 'already_started' && !again.token && !again.attempt, 'second start: no token, "already started"');
const stillWorks = await j(`select public.cut_camm311_quiz_next($1,$2) r`, [anna.attempt, anna.token]);
ok(stillWorks.done === false, 'original device token still valid after second start');

// ---- no answer leak
const txt = JSON.stringify(stillWorks);
ok(!/correct/i.test(txt) && Object.keys(stillWorks).sort().join() === 'done,idx,n,options,remaining_ms,stem_en,stem_gr', 'next() exposes only stem + options + time');
ok(stillWorks.remaining_ms > 29000 && stillWorks.remaining_ms <= 30000, 'clock ~30 s');
const w = await j(`select public.cut_camm311_quiz_next($1,$2) r`, [anna.attempt, anna.token]);
ok(w.idx === 0 && w.stem_en === stillWorks.stem_en, 'reload re-serves the same open question');
let badTok = false; try { await q(`select public.cut_camm311_quiz_next($1,gen_random_uuid()) r`, [anna.attempt]); } catch (e) { badTok = true; }
ok(badTok, 'wrong token refused');

// find the correct option position (as superuser) to test scoring, and shuffle variance
await db.exec('reset role');
const corr = async (att, idx) => (await q(`select array_position(w.opt_order, qq.correct_idx)-1 as pos, w.opt_order from cut_camm311_quiz_answers w join cut_camm311_quiz_questions qq on qq.id=w.question_id where w.attempt_id=$1 and w.idx=$2`, [att, idx]))[0];
await db.exec('set role anon');

// Q1: correct answer
let c0 = await (async () => { await db.exec('reset role'); const r = await corr(anna.attempt, 0); await db.exec('set role anon'); return r; })();
const sub1 = await j(`select public.cut_camm311_quiz_submit($1,$2,0,$3) r`, [anna.attempt, anna.token, c0.pos]);
ok(sub1.ok === true && Object.keys(sub1).join() === 'ok', 'submit ok, no correct/wrong feedback');
const dbl = await j(`select public.cut_camm311_quiz_submit($1,$2,0,0) r`, [anna.attempt, anna.token]);
ok(dbl.ok === false && dbl.reason === 'answered', 'double submit refused');
const back = await j(`select public.cut_camm311_quiz_submit($1,$2,0,1) r`, [anna.attempt, anna.token]);
ok(back.ok === false, 'cannot change an earlier answer (no going back)');
const skip = await j(`select public.cut_camm311_quiz_submit($1,$2,3,0) r`, [anna.attempt, anna.token]);
ok(skip.ok === false && skip.reason === 'not_served', 'cannot answer a question not yet served');

// Q2: 30 s limit
const n2 = await j(`select public.cut_camm311_quiz_next($1,$2) r`, [anna.attempt, anna.token]);
ok(n2.idx === 1, 'next question served');
await db.exec('reset role');
await db.exec(`update cut_camm311_quiz_answers set served_at = now() - interval '31 seconds' where attempt_id='${anna.attempt}' and idx=1`);
await db.exec('set role anon');
const late1 = await j(`select public.cut_camm311_quiz_submit($1,$2,1,0) r`, [anna.attempt, anna.token]);
ok(late1.ok === true, 'submit at 31 s accepted inside the 3 s grace');
// Q3: beyond grace
const n3 = await j(`select public.cut_camm311_quiz_next($1,$2) r`, [anna.attempt, anna.token]);
await db.exec('reset role');
await db.exec(`update cut_camm311_quiz_answers set served_at = now() - interval '34 seconds' where attempt_id='${anna.attempt}' and idx=2`);
await db.exec('set role anon');
const late2 = await j(`select public.cut_camm311_quiz_submit($1,$2,2,0) r`, [anna.attempt, anna.token]);
ok(late2.ok === false && late2.reason === 'timeout', 'submit after 30 s + grace refused (timeout)');
// Q4: leave locks
const n4 = await j(`select public.cut_camm311_quiz_next($1,$2) r`, [anna.attempt, anna.token]);
ok(n4.idx === 3, 'q4 served after timeout');
const lv = await j(`select public.cut_camm311_quiz_leave($1,$2,3) r`, [anna.attempt, anna.token]);
ok(lv.locked === true, 'leave locks the question');
const afterLeave = await j(`select public.cut_camm311_quiz_submit($1,$2,3,0) r`, [anna.attempt, anna.token]);
ok(afterLeave.ok === false && afterLeave.reason === 'left', 'submit after leave refused');
// expiry via next(): Q5 served, then timed out only by sweep
const n5 = await j(`select public.cut_camm311_quiz_next($1,$2) r`, [anna.attempt, anna.token]);
ok(n5.idx === 4, 'q5 served');
// ---- board
const bd = await j(`select public.cut_camm311_quiz_board($1,$2) r`, [QID, LECT]);
const row = bd.students.find(s => s.name === 'Anna Demo');
ok(row.left === 1 && row.timeouts === 1 && row.dup === 1 && row.correct <= 2, 'board: left=1 (red), timeouts=1, dup=1 (amber)');
let boardBad = false; try { await q(`select public.cut_camm311_quiz_board($1,'nope') r`, [QID]); } catch (e) { boardBad = true; }
ok(boardBad, 'board refuses wrong lecturer code');
await db.exec('reset role');
ok(!(await q(`select lecturer_hash from cut_camm311_quiz`))[0].lecturer_hash.includes(LECT), 'lecturer code stored hashed');
await db.exec('set role anon');

// ---- point 2 reset device (logged, amber)
const rs = await j(`select public.cut_camm311_quiz_reset_device($1,$2,$3) r`, [QID, LECT, anna.attempt]);
ok(rs.ok === true, 'lecturer reset device');
let oldDead = false; try { await q(`select public.cut_camm311_quiz_next($1,$2) r`, [anna.attempt, anna.token]); } catch (e) { oldDead = true; }
ok(oldDead, 'old device token dead after reset');
const bd2 = await j(`select public.cut_camm311_quiz_board($1,$2) r`, [QID, LECT]);
ok(bd2.students.find(s => s.name === 'Anna Demo').reset_pending === true, 'board: reset pending (amber)');
const restart = await j(`select public.cut_camm311_quiz_start('anna@test.example',$1,$2) r`, [QID, ROOM]);
ok(restart.token && restart.token !== anna.token && restart.attempt === anna.attempt, 'student restarts once, same attempt, new token');
const restart2 = await j(`select public.cut_camm311_quiz_start('anna@test.example',$1,$2) r`, [QID, ROOM]);
ok(restart2.error === 'already_started', 'bound again: a further start is refused');
const resumed = await j(`select public.cut_camm311_quiz_next($1,$2) r`, [restart.attempt, restart.token]);
ok(resumed.idx === 4, 'progress kept after reset (resumes at q5)');
await db.exec('reset role');
const log = await q(`select action from cut_camm311_quiz_reset_log order by id`);
ok(log.map(x => x.action).join() === 'room_code_regenerated,device_reset', 'room regen and device reset are logged');
await db.exec('set role anon');

// ---- shuffle: per-student order differs across many students (stat) and options shuffled
await db.exec('reset role');
await db.exec(`insert into cut_camm311_signups(first_name,surname,email,section) select 'S'||g,'T','s'||g||'@test.example','x' from generate_series(1,12) g`);
await db.exec('set role anon');
const orders = new Set(), optorders = new Set();
for (let g = 1; g <= 12; g++) {
  const s = await j(`select public.cut_camm311_quiz_start('s'||$1||'@test.example',$2,$3) r`, [g, QID, ROOM]);
  const f = await j(`select public.cut_camm311_quiz_next($1,$2) r`, [s.attempt, s.token]);
  orders.add(f.stem_en); optorders.add(f.options.map(o => o.en).join('|'));
}
ok(orders.size > 1, 'first question differs between students: ' + orders.size + ' variants of 5');
ok(optorders.size > 3, 'option order varies between students: ' + optorders.size + ' variants');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

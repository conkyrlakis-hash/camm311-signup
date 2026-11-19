// PGlite tests for quiz/sql/2026-11-19_camm311_quiz.sql. Run: npm i @electric-sql/pglite && node quiz/tests/rpc.test.mjs
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const SQL = fs.readFileSync(path.join(dir, '../sql/2026-11-19_camm311_quiz.sql'), 'utf8');
const RB = fs.readFileSync(path.join(dir, '../sql/2026-11-19_camm311_quiz_rollback.sql'), 'utf8');

const db = new PGlite({ extensions: { pgcrypto } });
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
const q = async (sql, params) => (await db.query(sql, params)).rows;
const j = async (sql, params) => (await q(sql, params))[0].r;
const su = async (sql, params) => { await db.exec('reset role'); const r = await q(sql, params); await db.exec('set role anon'); return r; };
const sux = async (sql) => { await db.exec('reset role'); await db.exec(sql); await db.exec('set role anon'); };
const throws = async (sql, params) => { try { await q(sql, params); return false; } catch (e) { return true; } };

await db.exec(`create role anon nologin; create role authenticated nologin; create schema extensions;
  create extension pgcrypto with schema extensions;
  create table public.cut_camm311_signups (id bigserial primary key, first_name text, surname text, email text, section text);
  insert into public.cut_camm311_signups(first_name,surname,email,section) values
   ('Anna','Demo','anna@test.example','CAMM 311.2 (EN)'),('Nikos','Demo','nikos@test.example','CAMM 311.1 (GR)'),
   ('Vera','Demo','vera@test.example','CAMM 311.2 (EN)'),('Zoe','Demo','zoe@test.example','CAMM 311.2 (EN)');
  grant usage on schema public, extensions to anon;`);
await db.exec(SQL);
ok(true, 'SQL file loads (one transaction)');
await db.exec(SQL);
const cnt = (await q(`select (select count(*) from cut_camm311_quiz) a, (select count(*) from cut_camm311_quiz_questions) b`))[0];
ok(Number(cnt.a) === 1 && Number(cnt.b) === 5, 'seed is idempotent: applying the file twice leaves 1 quiz, 5 questions');

const LECT = 'lecturer-secret-9';
await db.exec(`update cut_camm311_quiz set active=true, opens_at=now()-interval '1 hour', closes_at=now()+interval '1 hour', approve_devices=false`);
await db.exec('set role anon');

// ---- #5 no usable default lecturer code
for (const guess of ['DEMO-CODE-CHANGE-ME', 'demo', '']) {
  const r = await j(`select public.cut_camm311_quiz_board(1,$1) r`, [guess]);
  ok(r.error === 'not_set', `lecturer code "${guess}" refused while not set (not_set)`);
}
ok(await throws(`select public.cut_camm311_quiz_admin_set_lecturer(1,'abcdefghij')`), 'admin_set_lecturer not callable by anon');
await db.exec('reset role');
ok(await throws(`select public.cut_camm311_quiz_admin_set_lecturer(1,'elevenchars')`), 'set code under 12 characters refused');
await q(`select public.cut_camm311_quiz_admin_set_lecturer(1,$1)`, [LECT]);
await db.exec('set role anon');
ok((await j(`select public.cut_camm311_quiz_board(1,$1) r`, [LECT])).students !== undefined, 'owner-set lecturer code works');
ok((await j(`select public.cut_camm311_quiz_board(1,'DEMO-CODE-CHANGE-ME') r`)).error === 'forbidden', 'old demo code still refused');
const hash = (await su(`select lecturer_hash h from cut_camm311_quiz`))[0].h;
ok(!hash.includes(LECT) && hash.startsWith('$2'), 'lecturer code stored hashed');
ok((await j(`select public.cut_camm311_quiz_lecturer_code_change(1,'wrong','newcode-12345') r`)).error === 'forbidden', 'code change needs the old code');
ok((await j(`select public.cut_camm311_quiz_lecturer_code_change(1,$1,'tiny') r`, [LECT])).error === 'too_short', 'code change refuses short code');
ok((await j(`select public.cut_camm311_quiz_lecturer_code_change(1,$1,'newcode-12345') r`, [LECT])).ok === true, 'code change works');
ok((await j(`select public.cut_camm311_quiz_lecturer_code_change(1,'newcode-12345',$1) r`, [LECT])).ok === true, 'code changed back');
await sux(`delete from cut_camm311_quiz_fails`);

// ---- RLS
for (const t of ['cut_camm311_quiz','cut_camm311_quiz_questions','cut_camm311_quiz_attempts','cut_camm311_quiz_answers','cut_camm311_quiz_fails','cut_camm311_quiz_reset_log'])
  ok(await throws(`select * from public.${t}`), 'anon cannot read ' + t);
ok(await throws(`select public.cut_camm311_quiz_auth(gen_random_uuid(), gen_random_uuid())`), 'helper auth() not callable by anon');
ok(await throws(`select public.cut_camm311_quiz_lect_ok(1,'x')`), 'helper lect_ok() not callable by anon');

// ---- #1 failed lecturer codes are COUNTED (row survives) and every lecturer RPC returns an error, never raises
const calls = [
  `select public.cut_camm311_quiz_board(1,'bad') r`, `select public.cut_camm311_quiz_room_regen(1,'bad') r`,
  `select public.cut_camm311_quiz_reset_device(1,'bad',gen_random_uuid()) r`, `select public.cut_camm311_quiz_approve(1,'bad',null) r`,
  `select public.cut_camm311_quiz_clear_blocks(1,'bad') r`];
let allErr = true;
for (const c of calls) { const r = await j(c); if (r.error !== 'forbidden') allErr = false; }
ok(allErr, 'board, room_regen, reset_device, approve, clear_blocks: wrong code returns {error:forbidden}, no exception');
ok(Number((await su(`select count(*) c from cut_camm311_quiz_fails where key='lect'`))[0].c) === 5, 'five wrong lecturer codes left 5 committed rows');
await sux(`insert into cut_camm311_quiz_fails(key,quiz_id) select 'lect',1 from generate_series(1,15)`);
ok((await j(`select public.cut_camm311_quiz_board(1,'bad') r`)).error === 'rate_limited', 'cap of 20 wrong codes per quiz: a wrong code now gets rate_limited');
const bl = await j(`select public.cut_camm311_quiz_board(1,$1) r`, [LECT]);
ok(bl.students !== undefined && bl.alerts.lecturer_code_fails >= 20, 'the RIGHT code still passes during the block (no lock-out) and the board shows the wrong-code alert');
const clr = await j(`select public.cut_camm311_quiz_clear_blocks(1,$1) r`, [LECT]);
ok(clr.ok === true && clr.cleared >= 20, 'clear blocks is not circular: the right code clears it during the block');
ok((await j(`select public.cut_camm311_quiz_board(1,'bad') r`)).error === 'forbidden', 'after clearing, a wrong code is forbidden again (not rate_limited)');
await sux(`delete from cut_camm311_quiz_fails; insert into cut_camm311_quiz_fails(key,quiz_id,at) values ('lect',1,now()-interval '2 hours'),('room',1,now()-interval '2 hours'),('lect',1,now()-interval '30 minutes')`);
await j(`select public.cut_camm311_quiz_board(1,'bad') r`);
ok(Number((await su(`select count(*) c from cut_camm311_quiz_fails where key='lect' and at < now()-interval '1 hour'`))[0].c) === 0, 'old (>1 h) lect fail rows are purged in the lect path');
const t0 = Date.now();
const unk = await j(`select public.cut_camm311_quiz_board(999,'bad') r`);
ok(unk.error === 'forbidden' && Date.now() - t0 >= 900, 'unknown quiz id: forbidden and slowed by the 1 s sleep');
await sux(`delete from cut_camm311_quiz_fails`);

// ---- room code, generic errors
ok((await j(`select public.cut_camm311_quiz_start('anna@test.example',1,'ABC123') r`)).error === 'cannot_start', 'no room code set yet: cannot start');
const ROOM = (await j(`select public.cut_camm311_quiz_room_regen(1,$1) r`, [LECT])).room;
ok(/^[A-Z2-9]{6}$/.test(ROOM), 'room code generated: 6 chars');
const stored = (await su(`select room_hash h from cut_camm311_quiz`))[0].h;
ok(stored.startsWith('$2') && !stored.includes(ROOM), 'room code stored as bcrypt hash only');
const wrongRoom = await j(`select public.cut_camm311_quiz_start('anna@test.example',1,'ZZZZZZ') r`);
const unknown = await j(`select public.cut_camm311_quiz_start('ghost@test.example',1,$1) r`, [ROOM]);
ok(wrongRoom.error === 'cannot_start' && JSON.stringify(unknown) === JSON.stringify(wrongRoom), 'wrong room code and unknown email give the identical error');
await sux(`update cut_camm311_quiz set closes_at = now() - interval '1 minute'`);
const closedStart = await j(`select public.cut_camm311_quiz_start('nikos@test.example',1,$1) r`, [ROOM]);
ok(JSON.stringify(closedStart) === JSON.stringify(wrongRoom), 'closed quiz gives the identical error');
await sux(`update cut_camm311_quiz set closes_at = now() + interval '1 hour'`);
await sux(`delete from cut_camm311_quiz_fails`);

// ---- #4 limits: room code first, per quiz; no lock-out of a classmate
for (let i = 0; i < 30; i++) await q(`select public.cut_camm311_quiz_start($1,1,'BADBAD') r`, [i < 10 ? 'vera@test.example' : `x${i}@test.example`]);
const rows = await su(`select key, count(*) c from cut_camm311_quiz_fails group by key`);
ok(rows.length === 1 && rows[0].key === 'room' && Number(rows[0].c) === 30, 'wrong room codes counted per quiz (30), none counted per email');
const vera = await j(`select public.cut_camm311_quiz_start('vera@test.example',1,$1) r`, [ROOM]);
ok(vera.token, 'a real email with the right room code is NOT blocked after someone hammered that email with wrong codes');
let lastE; for (let i = 0; i < 6; i++) lastE = await j(`select public.cut_camm311_quiz_start('ghost2@test.example',1,$1) r`, [ROOM]);
ok(lastE.error === 'rate_limited', 'unknown email with the RIGHT room code: limited after 5 tries');
ok(Number((await su(`select count(*) c from cut_camm311_quiz_fails where key like 'em:%'`))[0].c) === 5, 'email failures counted only when the room code was right');
const b0 = await j(`select public.cut_camm311_quiz_board(1,$1) r`, [LECT]);
ok(b0.alerts.room_guesses === 30 && b0.alerts.unknown_emails === 5, 'board alerts show room guesses and unknown emails');
const cb = await j(`select public.cut_camm311_quiz_clear_blocks(1,$1) r`, [LECT]);
ok(cb.ok && cb.cleared === 35 && Number((await su(`select count(*) c from cut_camm311_quiz_fails`))[0].c) === 0, 'clear blocks empties the counters');
const ROOMX = (await j(`select public.cut_camm311_quiz_room_regen(1,$1) r`, [LECT])).room;
ok((await j(`select public.cut_camm311_quiz_start('nikos@test.example',1,$1) r`, [ROOM])).error === 'cannot_start', 'old room code stops working after regenerate');

// ---- device binding
const anna = await j(`select public.cut_camm311_quiz_start('Anna@Test.example',1,$1) r`, [ROOMX]);
ok(anna.token && anna.name === 'Anna Demo' && anna.n === 5 && anna.pending === false, 'first start: token, name, 5 questions, not pending (approve_devices off)');
const again = await j(`select public.cut_camm311_quiz_start('anna@test.example',1,$1) r`, [ROOMX]);
ok(again.error === 'already_started' && !again.token && !again.attempt, 'second start: no token, already started');
const nx = await j(`select public.cut_camm311_quiz_next($1,$2) r`, [anna.attempt, anna.token]);
ok(nx.done === false, 'original device still works');
ok(!/correct/i.test(JSON.stringify(nx)) && Object.keys(nx).sort().join() === 'done,idx,n,options,remaining_ms,stem_en,stem_gr', 'next() exposes only stem + options + time (no answer)');
ok(nx.remaining_ms > 29000 && nx.remaining_ms <= 30000, 'clock ~30 s');
ok((await j(`select public.cut_camm311_quiz_next($1,$2) r`, [anna.attempt, anna.token])).stem_en === nx.stem_en, 'reload re-serves the open question');
ok(await throws(`select public.cut_camm311_quiz_next($1,gen_random_uuid()) r`, [anna.attempt]), 'wrong token refused');

const pos = async (att, idx) => (await su(`select array_position(w.opt_order, qq.correct_idx)-1 as p from cut_camm311_quiz_answers w join cut_camm311_quiz_questions qq on qq.id=w.question_id where w.attempt_id=$1 and w.idx=$2`, [att, idx]))[0].p;
const s1 = await j(`select public.cut_camm311_quiz_submit($1,$2,0,$3) r`, [anna.attempt, anna.token, await pos(anna.attempt, 0)]);
ok(s1.ok === true && Object.keys(s1).join() === 'ok', 'submit ok, no feedback');
ok((await j(`select public.cut_camm311_quiz_submit($1,$2,0,0) r`, [anna.attempt, anna.token])).reason === 'answered', 'double submit refused');
ok((await j(`select public.cut_camm311_quiz_submit($1,$2,3,0) r`, [anna.attempt, anna.token])).reason === 'not_served', 'cannot answer a question not served');
await j(`select public.cut_camm311_quiz_next($1,$2) r`, [anna.attempt, anna.token]);
await sux(`update cut_camm311_quiz_answers set served_at = now() - interval '31 seconds' where attempt_id='${anna.attempt}' and idx=1`);
ok((await j(`select public.cut_camm311_quiz_submit($1,$2,1,0) r`, [anna.attempt, anna.token])).ok === true, '31 s accepted inside grace');
await j(`select public.cut_camm311_quiz_next($1,$2) r`, [anna.attempt, anna.token]);
await sux(`update cut_camm311_quiz_answers set served_at = now() - interval '34 seconds' where attempt_id='${anna.attempt}' and idx=2`);
ok((await j(`select public.cut_camm311_quiz_submit($1,$2,2,0) r`, [anna.attempt, anna.token])).reason === 'timeout', 'after 30 s + grace: timeout');
ok((await j(`select public.cut_camm311_quiz_next($1,$2) r`, [anna.attempt, anna.token])).idx === 3, 'q4 served');
ok((await j(`select public.cut_camm311_quiz_leave($1,$2,3) r`, [anna.attempt, anna.token])).locked === true, 'leave locks');
ok((await j(`select public.cut_camm311_quiz_submit($1,$2,3,0) r`, [anna.attempt, anna.token])).reason === 'left', 'submit after leave refused');

// ---- #3 board hides scores until closed or toggled
const hidden = await j(`select public.cut_camm311_quiz_board(1,$1) r`, [LECT]);
const annaRow = hidden.students.find(s => s.name === 'Anna Demo');
ok(!('correct' in annaRow) && hidden.scores_visible === false, 'board: no score field by default');
ok(annaRow.left === 1 && annaRow.timeouts === 1 && annaRow.dup === 1, 'board: left=1 (red), timeouts=1, dup=1 (amber)');
const shown = await j(`select public.cut_camm311_quiz_board(1,$1,true) r`, [LECT]);
ok(shown.students.find(s => s.name === 'Anna Demo').correct >= 0 && shown.scores_visible === true, 'board with the toggle shows scores');
const inf = await j(`select public.cut_camm311_quiz_info() r`);
ok(inf.started === 2 && !JSON.stringify(inf).includes('correct'), 'public info gives only the started count (projector view): no names, no scores');

// ---- #2 active, closes_at and whole-attempt deadline
await sux(`update cut_camm311_quiz set active=false`);
ok((await j(`select public.cut_camm311_quiz_next($1,$2) r`, [anna.attempt, anna.token])).error === 'closed', 'next refused when quiz not active');
ok((await j(`select public.cut_camm311_quiz_submit($1,$2,4,0) r`, [anna.attempt, anna.token])).reason === 'closed', 'submit refused when quiz not active');
await sux(`update cut_camm311_quiz set active=true, closes_at = now() - interval '1 second'`);
const afterClose = await j(`select public.cut_camm311_quiz_next($1,$2) r`, [anna.attempt, anna.token]);
ok(afterClose.done === true && afterClose.closed === true, 'next after closes_at: done, closed');
const ans = await su(`select state, is_correct from cut_camm311_quiz_answers where attempt_id=$1 order by idx`, [anna.attempt]);
ok(ans.length === 5 && ans[4].state === 'timeout' && ans[4].is_correct === false, 'unanswered questions become timeout = wrong, all 5 rows present');
const closedBoard = await j(`select public.cut_camm311_quiz_board(1,$1) r`, [LECT]);
ok(closedBoard.scores_visible === true && 'correct' in closedBoard.students[0], 'scores appear automatically once the quiz has closed');
await sux(`update cut_camm311_quiz set closes_at = now() + interval '1 hour'`);
await sux(`update cut_camm311_quiz_attempts set started_at = now() - interval '200 seconds', approved_at = now() - interval '200 seconds' where id='${vera.attempt}'`);
const v1 = await j(`select public.cut_camm311_quiz_next($1,$2) r`, [vera.attempt, vera.token]);
ok(v1.done === true && v1.closed === true, 'attempt past n x (30+grace) + slack: closed even though the quiz window is open');
ok((await j(`select public.cut_camm311_quiz_submit($1,$2,0,0) r`, [vera.attempt, vera.token])).reason === 'closed', 'submit past the attempt deadline refused');
ok(Number((await su(`select count(*) c from cut_camm311_quiz_answers where attempt_id=$1 and state='timeout'`, [vera.attempt]))[0].c) === 5, 'all 5 counted as wrong');
const bd = await j(`select public.cut_camm311_quiz_board(1,$1) r`, [LECT]);
ok(bd.students.find(s => s.name === 'Vera Demo').finished === true, 'board shows the timed-out attempt as finished');

// ---- reset device, #6 single new token
ok((await j(`select public.cut_camm311_quiz_reset_device(1,$1,$2) r`, [LECT, anna.attempt])).ok === true, 'lecturer reset device');
ok(await throws(`select public.cut_camm311_quiz_next($1,$2) r`, [anna.attempt, anna.token]), 'old token dead');
const bd2 = await j(`select public.cut_camm311_quiz_board(1,$1) r`, [LECT]);
ok(bd2.students.find(s => s.name === 'Anna Demo').reset_pending === true, 'board: reset pending (amber)');
const re1 = await j(`select public.cut_camm311_quiz_start('anna@test.example',1,$1) r`, [ROOMX]);
const re2 = await j(`select public.cut_camm311_quiz_start('anna@test.example',1,$1) r`, [ROOMX]);
ok(re1.token && re1.token !== anna.token && re2.error === 'already_started', 'after reset exactly one new token; the next start is refused');
const def = (await su(`select pg_get_functiondef('public.cut_camm311_quiz_start(text,int,text)'::regprocedure) d`))[0].d;
ok(/token IS NULL RETURNING/i.test(def) && /n <> 1/.test(def), 'reset update is guarded by "token is null" and requires exactly one row');
ok((await su(`select string_agg(action, ',') a from cut_camm311_quiz_reset_log`))[0].a.includes('device_reset'), 'device reset logged');

// ---- #7 approve devices
await sux(`update cut_camm311_quiz set approve_devices=true`);
const nik = await j(`select public.cut_camm311_quiz_start('nikos@test.example',1,$1) r`, [ROOMX]);
const zoe = await j(`select public.cut_camm311_quiz_start('zoe@test.example',1,$1) r`, [ROOMX]);
ok(nik.token && nik.pending === true && zoe.pending === true, 'new start is pending when approve_devices is on');
ok((await j(`select public.cut_camm311_quiz_next($1,$2) r`, [nik.attempt, nik.token])).pending === true, 'token does not serve questions before approval');
ok((await j(`select public.cut_camm311_quiz_submit($1,$2,0,0) r`, [nik.attempt, nik.token])).reason === 'pending', 'submit refused while pending');
const bd3 = await j(`select public.cut_camm311_quiz_board(1,$1) r`, [LECT]);
ok(bd3.students.filter(s => s.pending).length === 2, 'board shows both as pending');
ok((await j(`select public.cut_camm311_quiz_approve(1,'bad',null) r`)).error === 'forbidden', 'approve needs the lecturer code');
await sux(`update cut_camm311_quiz_attempts set started_at = now() - interval '500 seconds' where id in ('${nik.attempt}','${zoe.attempt}')`);
ok((await j(`select public.cut_camm311_quiz_board(1,$1) r`, [LECT])).students.filter(s => s.pending).length === 2, 'board sweep leaves unapproved attempts pending past the deadline');
ok((await su(`select count(*) c from cut_camm311_quiz_answers where attempt_id in ('${nik.attempt}','${zoe.attempt}')`))[0].c == 0, 'unapproved attempts get no timeout rows');
ok((await j(`select public.cut_camm311_quiz_approve(1,$1,$2) r`, [LECT, nik.attempt])).approved === 1, 'approve one student');
ok((await j(`select public.cut_camm311_quiz_next($1,$2) r`, [nik.attempt, nik.token])).done === false, 'after waiting past the deadline unapproved, approval serves question 1 (clock starts at approval)');
ok((await j(`select public.cut_camm311_quiz_next($1,$2) r`, [zoe.attempt, zoe.token])).pending === true, 'the other stays pending');
const ap2 = await j(`select public.cut_camm311_quiz_approve(1,$1,null) r`, [LECT]);
ok(ap2.approved === 1 && (await j(`select public.cut_camm311_quiz_next($1,$2) r`, [zoe.attempt, zoe.token])).done === false, 'approve all');
ok((await su(`select string_agg(action, ',') a from cut_camm311_quiz_reset_log`))[0].a.includes('approve_all'), 'approvals logged');

// ---- shuffle
await sux(`insert into cut_camm311_signups(first_name,surname,email,section) select 'S'||g,'T','s'||g||'@test.example','x' from generate_series(1,12) g; update cut_camm311_quiz set approve_devices=false`);
const orders = new Set(), optorders = new Set();
for (let g = 1; g <= 12; g++) {
  const s = await j(`select public.cut_camm311_quiz_start('s'||$1||'@test.example',1,$2) r`, [g, ROOMX]);
  const f = await j(`select public.cut_camm311_quiz_next($1,$2) r`, [s.attempt, s.token]);
  orders.add(f.stem_en); optorders.add(f.options.map(o => o.en).join('|'));
}
ok(orders.size > 1 && optorders.size > 3, `shuffles differ per student (${orders.size} first-question variants, ${optorders.size} option orders)`);

// ---- question bank loader, 30-of-50 draw, per-attempt shuffles (synthetic bank, not exam content)
const BANK = Array.from({ length: 50 }, (_, i) => {
  const ci = i % 4, opts = [];
  for (let k = 0; k < 4; k++) opts.push(k === ci ? { en: `Q${i} right`, gr: `Ε${i} σωστό` } : { en: `Q${i} wrong${k}`, gr: `Ε${i} λάθος${k}` });
  return { stem_en: `Question ${i}`, stem_gr: `Ερώτηση ${i}`, options: opts, correct_idx: ci, lecture: 8 + (i % 3) };
});
const BJ = JSON.stringify(BANK);
await db.exec('set role anon');
ok(await throws(`select public.cut_camm311_quiz_admin_load_bank(1, $1::jsonb)`, [BJ]), 'loader not callable by anon');
await db.exec('reset role');
ok(await throws(`select public.cut_camm311_quiz_admin_load_bank(1, $1::jsonb)`, [BJ]), 'loader refuses while attempts exist (no force)');
ok(Number((await q(`select count(*) c from cut_camm311_quiz_questions`))[0].c) === 5, 'refused load changed nothing (5 demo questions still there)');
ok(await throws(`select public.cut_camm311_quiz_admin_load_bank(1, '[{"stem_en":"a","stem_gr":"b","options":[{"en":"x","gr":"x"}],"correct_idx":0}]'::jsonb, 30, true)`), 'loader refuses a question without 4 options');
const ld = (await q(`select public.cut_camm311_quiz_admin_load_bank(1, $1::jsonb, 30, true) r`, [BJ]))[0].r;
ok(ld.loaded === 50 && ld.n_questions === 30 && ld.attempts_deleted > 0, 'forced load: 50 questions, n_questions 30, old attempts removed');
const ld2 = (await q(`select public.cut_camm311_quiz_admin_load_bank(1, $1::jsonb) r`, [BJ]))[0].r;
ok(ld2.loaded === 50 && ld2.attempts_deleted === 0 && Number((await q(`select count(*) c from cut_camm311_quiz_questions`))[0].c) === 50, 'loader is idempotent: second run leaves exactly 50, no demo left');
ok(Number((await q(`select count(distinct lecture) c from cut_camm311_quiz_questions`))[0].c) === 3, 'lecture tag stored');
ok(Number((await q(`select count(*) c from cut_camm311_quiz_questions where is_demo`))[0].c) === 0, 'loaded questions are not demo');
await db.exec(`update cut_camm311_quiz set active=true, opens_at=now()-interval '1 hour', closes_at=now()+interval '1 hour', approve_devices=false`);
await db.exec('set role anon');
const defN = (await su(`select column_default d from information_schema.columns where table_name='cut_camm311_quiz' and column_name='n_questions'`))[0].d;
ok(String(defN) === '30', 'n_questions default is 30');
ok((await j(`select public.cut_camm311_quiz_info() r`)).n === 30, 'info reports 30 per quiz');
const sets = [], ords = [], firsts = new Set(), att = [];
for (let g = 1; g <= 8; g++) {
  const s = await j(`select public.cut_camm311_quiz_start('s'||$1||'@test.example',1,$2) r`, [g, ROOMX]);
  ok(s.n === 30, `student ${g}: 30 questions`);
  att.push(s);
  const qo = (await su(`select q_order o from cut_camm311_quiz_attempts where id=$1`, [s.attempt]))[0].o;
  sets.push(qo.slice().sort((a, b) => a - b).join()); ords.push(qo.join()); firsts.add(qo[0]);
  ok(new Set(qo).size === 30 && qo.every(x => x >= 1), `student ${g}: no duplicate question inside the attempt`);
}
ok(new Set(ords).size === 8, 'different question order for every attempt');
ok(new Set(sets).size > 1, 'different 30-of-50 sets across attempts');
ok(firsts.size >= 4, `first question differs between neighbours (${firsts.size} distinct of 8)`);
// choice shuffle scored right, and the client never sees the answer
const a1 = att[0];
let rightCount = 0, textsSeen = new Set(), leak = false, scoreOk = true;
for (let i = 0; i < 30; i++) {
  const n1 = await j(`select public.cut_camm311_quiz_next($1,$2) r`, [a1.attempt, a1.token]);
  if (/correct/i.test(JSON.stringify(n1))) leak = true;
  const rp = n1.options.findIndex(o => o.en.endsWith(' right'));
  textsSeen.add(n1.options.map(o => o.en.replace(/^Q[0-9]+ /, '')).join());
  const wrongPos = (rp + 1) % 4;
  const want = i % 5 === 0 ? wrongPos : rp;       // every 5th answer deliberately wrong
  const r = await j(`select public.cut_camm311_quiz_submit($1,$2,$3,$4) r`, [a1.attempt, a1.token, n1.idx, want]);
  if (!r.ok) scoreOk = false;
  if (i % 5 !== 0) rightCount++;
}
ok(!leak, 'no answer index in any served question');
ok(scoreOk, 'all 30 submissions accepted');
ok(textsSeen.size > 4, `choices shuffled per question (${textsSeen.size} different orders)`);
const fin = await j(`select public.cut_camm311_quiz_next($1,$2) r`, [a1.attempt, a1.token]);
ok(fin.done === true && fin.n === 30, 'after 30 answers: done, out of 30');
const sc = (await j(`select public.cut_camm311_quiz_board(1,$1,true) r`, [LECT])).students.find(s => s.attempt === a1.attempt);
ok(sc.correct === rightCount && sc.n === 30 && sc.finished === true, `choice shuffle mapped back correctly: ${sc.correct} / 30 (expected ${rightCount})`);
// reset keeps the same set and order
const ordBefore = (await su(`select q_order o from cut_camm311_quiz_attempts where id=$1`, [att[1].attempt]))[0].o.join();
const firstBefore = (await j(`select public.cut_camm311_quiz_next($1,$2) r`, [att[1].attempt, att[1].token])).stem_en;
await j(`select public.cut_camm311_quiz_reset_device(1,$1,$2) r`, [LECT, att[1].attempt]);
const rs = await j(`select public.cut_camm311_quiz_start('s2@test.example',1,$1) r`, [ROOMX]);
const ordAfter = (await su(`select q_order o from cut_camm311_quiz_attempts where id=$1`, [att[1].attempt]))[0].o.join();
ok(rs.token && rs.attempt === att[1].attempt && ordBefore === ordAfter, 'device reset keeps the same attempt and the same 30 questions in the same order');
ok((await j(`select public.cut_camm311_quiz_next($1,$2) r`, [rs.attempt, rs.token])).stem_en === firstBefore, 'after reset the open question is the same one');
// count setting respected, deadline = n x 33 + 10
await sux(`update cut_camm311_quiz set n_questions = 7`);
const s7 = await j(`select public.cut_camm311_quiz_start('s9@test.example',1,$1) r`, [ROOMX]);
ok(s7.n === 7 && (await su(`select array_length(q_order,1) l from cut_camm311_quiz_attempts where id=$1`, [s7.attempt]))[0].l === 7, 'n_questions = 7 gives a 7-question attempt');
ok((await j(`select public.cut_camm311_quiz_info() r`)).n === 7, 'info follows the setting');
await sux(`update cut_camm311_quiz_attempts set started_at = now() - interval '236 seconds', approved_at = now() - interval '236 seconds' where id='${s7.attempt}'`);
ok((await j(`select public.cut_camm311_quiz_next($1,$2) r`, [s7.attempt, s7.token])).done === false, 'at 236 s (< 7 x 33 + 10 = 241) the attempt is still open');
await sux(`update cut_camm311_quiz_attempts set started_at = now() - interval '246 seconds', approved_at = now() - interval '246 seconds' where id='${s7.attempt}'`);
ok((await j(`select public.cut_camm311_quiz_next($1,$2) r`, [s7.attempt, s7.token])).closed === true, 'at 246 s (> 241) the attempt is closed: deadline follows n');
await sux(`update cut_camm311_quiz set n_questions = 80`);
const s80 = await j(`select public.cut_camm311_quiz_start('s10@test.example',1,$1) r`, [ROOMX]);
ok(s80.n === 50, 'count above the pool size is capped at the pool (50)');
await sux(`update cut_camm311_quiz set n_questions = 30`);

// ---- #8 rollback guard
await db.exec('reset role');
ok(await throws(RB), 'rollback refuses while attempts exist');
ok(Number((await q(`select count(*) c from cut_camm311_quiz_attempts`))[0].c) > 0, 'nothing was dropped by the refused rollback');
await db.exec(`set camm311.force_rollback = 'YES_DELETE_ALL_QUIZ_ATTEMPTS'`);
await db.exec(RB);
ok((await q(`select to_regclass('public.cut_camm311_quiz') t`))[0].t === null, 'rollback with the force flag removes everything');
await db.exec(`reset camm311.force_rollback`);
await db.exec(SQL); await db.exec(RB);
ok((await q(`select to_regclass('public.cut_camm311_quiz') t`))[0].t === null, 'rollback without attempts runs without the flag');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

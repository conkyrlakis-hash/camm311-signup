-- CAMM 311 in-class quiz (30 s per question, 5% of the total).
-- FOR REVIEW. NOT APPLIED. Target: pa DEV Supabase project only.
-- Uses: cut_camm311_signups (id, first_name, surname, email, section), same email sign-in idea as cut_camm311_study_login.
-- Correct answers live only in cut_camm311_quiz_questions; no RPC returns them to a student.
-- Seed = 5 DEMO questions. Real questions are loaded later by the owner's word.
--
-- ONE-TIME OWNER STEPS after applying (SQL editor, service role):
--   1. Set the lecturer code (min 12 characters). Until this runs, every lecturer RPC answers "not_set":
--        select public.cut_camm311_quiz_admin_set_lecturer(1, '<your lecturer code>');
--      The seed holds a random hash nobody knows, so there is no usable default code.
--      Later change from the board side: cut_camm311_quiz_lecturer_code_change(quiz, old, new).
--   2. Set the quiz settings (date window, number of questions) and switch it on:
--        update public.cut_camm311_quiz set opens_at = '...', closes_at = '...', n_questions = N, active = true where id = 1;
--      approve_devices (default true): a new start shows as pending; the token works only after the lecturer taps Approve.
--   2b. Load the question bank: python quiz/tools/make_load_sql.py <bank.json> > load.sql, then run load.sql in the SQL editor.
--       The bank text never goes into the repo.
--   3. Open the board, press "New room code", open the projector view.
-- Everything is one transaction: a failure leaves nothing behind.

begin;

create extension if not exists pgcrypto with schema extensions;

-- ---------- tables (RLS on, no policies = no anon/authenticated access) ----------
create table if not exists public.cut_camm311_quiz (
  id            serial primary key,
  title         text        not null,
  active        boolean     not null default false,      -- owner switches on
  opens_at      timestamptz,                             -- quiz date/window: NOT GIVEN YET (null = never open)
  closes_at     timestamptz,
  n_questions   int         not null default 30 check (n_questions > 0),  -- questions per attempt, drawn at random from the pool; the deadline follows it
  seconds       int         not null default 30 check (seconds between 5 and 600),
  grace_seconds int         not null default 3  check (grace_seconds between 0 and 15),
  slack_seconds int         not null default 10 check (slack_seconds between 0 and 120),  -- added to the whole-attempt deadline
  approve_devices boolean   not null default true,        -- lecturer must approve each new device
  lecturer_hash text        not null,                     -- crypt() hash, never the code itself
  lecturer_set  boolean     not null default false,       -- false until the owner runs admin_set_lecturer
  room_hash     text,                                     -- crypt() hash of the room code; null = nobody can start
  room_set_at   timestamptz
);

create table if not exists public.cut_camm311_quiz_questions (
  id          serial primary key,
  quiz_id     int  not null references public.cut_camm311_quiz(id) on delete cascade,
  is_demo     boolean not null default false,
  stem_en     text not null,
  stem_gr     text not null,
  options     jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6),
  correct_idx int  not null check (correct_idx >= 0),    -- index into options; server only
  lecture     smallint                                   -- lecture tag (reporting only, never sent to a student)
);
alter table public.cut_camm311_quiz_questions add column if not exists lecture smallint;
alter table public.cut_camm311_quiz alter column n_questions set default 30;

create table if not exists public.cut_camm311_quiz_attempts (
  id          uuid primary key default gen_random_uuid(),
  quiz_id     int  not null references public.cut_camm311_quiz(id) on delete cascade,
  signup_id   bigint not null,
  token       uuid default gen_random_uuid(),            -- bound to the FIRST device; null only after a lecturer device reset
  approved    boolean not null default true,             -- false = pending lecturer approval
  approved_at timestamptz,
  dup_count   int  not null default 0,
  reset_pending boolean not null default false,
  q_order     int[] not null,
  started_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  unique (quiz_id, signup_id)
);

create table if not exists public.cut_camm311_quiz_answers (
  attempt_id  uuid not null references public.cut_camm311_quiz_attempts(id) on delete cascade,
  idx         int  not null,
  question_id int  not null references public.cut_camm311_quiz_questions(id),
  opt_order   int[] not null,
  served_at   timestamptz not null default now(),
  state       text not null default 'open' check (state in ('open','answered','timeout','left')),
  chosen_idx  int,
  is_correct  boolean not null default false,
  closed_at   timestamptz,
  primary key (attempt_id, idx),
  unique (attempt_id, question_id)
);

create table if not exists public.cut_camm311_quiz_fails (   -- failures for rate limiting and board alerts
  key     text not null,       -- 'room' (wrong room code), 'em:<email>' (unknown email, room code right), 'lect' (wrong lecturer code)
  quiz_id int  not null,
  at      timestamptz not null default now()
);
create index if not exists cut_camm311_quiz_fails_k on public.cut_camm311_quiz_fails(quiz_id, key, at);

create table if not exists public.cut_camm311_quiz_reset_log (
  id         bigserial primary key,
  quiz_id    int  not null,
  attempt_id uuid,
  action     text not null,
  at         timestamptz not null default now()
);

alter table public.cut_camm311_quiz           enable row level security;
alter table public.cut_camm311_quiz_questions enable row level security;
alter table public.cut_camm311_quiz_attempts  enable row level security;
alter table public.cut_camm311_quiz_answers   enable row level security;
alter table public.cut_camm311_quiz_fails     enable row level security;
alter table public.cut_camm311_quiz_reset_log enable row level security;
revoke all on public.cut_camm311_quiz, public.cut_camm311_quiz_questions, public.cut_camm311_quiz_attempts,
              public.cut_camm311_quiz_answers, public.cut_camm311_quiz_fails, public.cut_camm311_quiz_reset_log from anon, authenticated;

-- ---------- helpers (not callable from the API) ----------
create or replace function public.cut_camm311_quiz_auth(p_attempt uuid, p_token uuid)
returns public.cut_camm311_quiz_attempts
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare a public.cut_camm311_quiz_attempts;
begin
  select * into a from public.cut_camm311_quiz_attempts where id = p_attempt and token is not null and token = p_token;
  if not found then raise exception 'bad_session' using errcode = 'P0001'; end if;
  update public.cut_camm311_quiz_attempts set last_seen = now() where id = a.id;
  return a;
end $$;

-- Closes what is overdue: per-question timeouts, and past the attempt deadline everything unanswered becomes 'timeout' (wrong).
-- Deadline = least(closes_at, approval-or-start + n x (seconds + grace) + slack). Returns true when past the deadline.
create or replace function public.cut_camm311_quiz_sweep(p_attempt uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.cut_camm311_quiz_attempts; qz public.cut_camm311_quiz; total int; cutoff timestamptz;
begin
  select * into a from public.cut_camm311_quiz_attempts where id = p_attempt;
  if not found then return false; end if;
  if not a.approved then return false; end if;     -- a device waiting for approval is never swept; its clock starts at approval
  select * into qz from public.cut_camm311_quiz where id = a.quiz_id;
  total := array_length(a.q_order, 1);
  update public.cut_camm311_quiz_answers
     set state = 'timeout', closed_at = now()
   where attempt_id = a.id and state = 'open' and now() > served_at + make_interval(secs => qz.seconds + qz.grace_seconds);
  cutoff := least(coalesce(qz.closes_at, '-infinity'),
                  coalesce(a.approved_at, a.started_at) + make_interval(secs => total * (qz.seconds + qz.grace_seconds) + qz.slack_seconds));
  if now() > cutoff then
    update public.cut_camm311_quiz_answers set state = 'timeout', closed_at = now() where attempt_id = a.id and state = 'open';
    insert into public.cut_camm311_quiz_answers(attempt_id, idx, question_id, opt_order, state, closed_at)
    select a.id, g - 1, a.q_order[g], '{}', 'timeout', now()
      from generate_series(1, total) g
     where not exists (select 1 from public.cut_camm311_quiz_answers w where w.attempt_id = a.id and w.idx = g - 1);
    return true;
  end if;
  return false;
end $$;

-- lecturer code check. Returns 'ok' | 'forbidden' | 'rate_limited' | 'not_set'. Never raises, so the failure row COMMITS.
-- The hash is checked FIRST: a right code always passes (no cap, no sleep), so guessers can never lock the lecturer out.
-- Only wrong codes are counted, slowed (1 s) and, past 20 in 10 minutes per quiz, answered 'rate_limited' (board alert).
-- The count-then-insert is not locked: two parallel wrong guesses may both slip under the cap. Accepted (the 1 s sleep and bcrypt dominate).
create or replace function public.cut_camm311_quiz_lect_ok(p_quiz int, p_code text)
returns text language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare qz public.cut_camm311_quiz;
begin
  select * into qz from public.cut_camm311_quiz where id = p_quiz;
  if found and qz.lecturer_set and p_code is not null and qz.lecturer_hash = crypt(p_code, qz.lecturer_hash) then
    return 'ok';
  end if;
  if found and not qz.lecturer_set then return 'not_set'; end if;
  delete from public.cut_camm311_quiz_fails where key = 'lect' and at < now() - interval '1 hour';
  if (select count(*) from public.cut_camm311_quiz_fails where quiz_id = p_quiz and key = 'lect' and at > now() - interval '10 minutes') >= 20 then
    perform pg_sleep(1);
    return 'rate_limited';
  end if;
  insert into public.cut_camm311_quiz_fails(key, quiz_id) values ('lect', p_quiz);
  perform pg_sleep(1);
  return 'forbidden';
end $$;

-- ---------- owner-only (SQL editor): first lecturer code ----------
create or replace function public.cut_camm311_quiz_admin_set_lecturer(p_quiz int, p_new text)
returns void language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if p_new is null or length(p_new) < 12 then raise exception 'code too short (min 12)'; end if;
  update public.cut_camm311_quiz set lecturer_hash = crypt(p_new, gen_salt('bf')), lecturer_set = true where id = p_quiz;
  if not found then raise exception 'no such quiz'; end if;
end $$;


-- ---------- owner-only (SQL editor): load the question bank ----------
-- p_bank = jsonb array of {"stem_en","stem_gr","options":[{"en","gr"} x4],"correct_idx":0..3,"lecture":8}.
-- Idempotent: replaces ALL questions of the quiz (demo included) with exactly this bank; running it twice gives the same pool.
-- Refuses (raises) if any attempt exists for the quiz, unless p_force is true (then attempts and their answers are deleted first).
-- Sets n_questions = least(p_n, bank size). Not callable by anon/authenticated.
create or replace function public.cut_camm311_quiz_admin_load_bank(p_quiz int, p_bank jsonb, p_n int default 30, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare e jsonb; n int := 0; na int; nq int;
begin
  if not exists (select 1 from public.cut_camm311_quiz where id = p_quiz) then raise exception 'no such quiz'; end if;
  if p_bank is null or jsonb_typeof(p_bank) <> 'array' or jsonb_array_length(p_bank) < 1 then raise exception 'bank must be a non-empty json array'; end if;
  for e in select * from jsonb_array_elements(p_bank) loop
    n := n + 1;
    if coalesce(e ->> 'stem_en', '') = '' or coalesce(e ->> 'stem_gr', '') = '' then raise exception 'question % has no stem', n; end if;
    if jsonb_typeof(e -> 'options') <> 'array' or jsonb_array_length(e -> 'options') <> 4 then raise exception 'question % needs exactly 4 options', n; end if;
    if (e ->> 'correct_idx') is null or (e ->> 'correct_idx')::int not between 0 and 3 then raise exception 'question % has a bad correct_idx', n; end if;
  end loop;
  select count(*) into na from public.cut_camm311_quiz_attempts where quiz_id = p_quiz;
  if na > 0 and not coalesce(p_force, false) then raise exception 'refused: % attempts exist for this quiz (pass p_force = true to delete them)', na; end if;
  delete from public.cut_camm311_quiz_attempts where quiz_id = p_quiz;      -- cascades to answers
  delete from public.cut_camm311_quiz_questions where quiz_id = p_quiz;
  insert into public.cut_camm311_quiz_questions(quiz_id, is_demo, stem_en, stem_gr, options, correct_idx, lecture)
  select p_quiz, false, x ->> 'stem_en', x ->> 'stem_gr', x -> 'options', (x ->> 'correct_idx')::int, nullif(x ->> 'lecture', '')::smallint
    from jsonb_array_elements(p_bank) x;
  nq := least(greatest(coalesce(p_n, 30), 1), n);
  update public.cut_camm311_quiz set n_questions = nq where id = p_quiz;
  return jsonb_build_object('loaded', n, 'n_questions', nq, 'attempts_deleted', na);
end $$;

-- ---------- public RPCs ----------
-- 0. which quiz is on (no questions, no answers). 'started' feeds the projector view.
create or replace function public.cut_camm311_quiz_info()
returns jsonb language sql security definer set search_path = public, pg_temp as $$
  select coalesce((select jsonb_build_object(
           'quiz_id', q.id, 'title', q.title, 'seconds', q.seconds,
           'n', least(q.n_questions, (select count(*) from public.cut_camm311_quiz_questions x where x.quiz_id = q.id)),
           'open', (q.active and now() >= coalesce(q.opens_at, 'infinity') and now() <= coalesce(q.closes_at, '-infinity')),
           'closed', (now() > coalesce(q.closes_at, '-infinity') or not q.active),
           'started', (select count(*) from public.cut_camm311_quiz_attempts a where a.quiz_id = q.id),
           'opens_at', q.opens_at, 'closes_at', q.closes_at)
         from public.cut_camm311_quiz q where q.active order by q.id desc limit 1), jsonb_build_object('quiz_id', null));
$$;

-- 1. start. Each NEW attempt gets n_questions drawn at random from the pool, in its own random order, stored in q_order
--    (a lecturer device reset keeps the row, so the same set continues: q_order is never redrawn). Options are shuffled per question at serve time.
--    Order: quiz open? -> ROOM CODE -> email. Room-code guesses are counted per quiz (not per email), email failures only
--    when the room code was right, so nobody can lock a classmate out and a right code + real email is never blocked.
--    One generic error for unknown email, wrong room code and closed quiz.
create or replace function public.cut_camm311_quiz_start(p_email text, p_quiz int, p_room text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare qz public.cut_camm311_quiz; s record; a public.cut_camm311_quiz_attempts; ids int[]; n int;
        em text := lower(trim(coalesce(p_email, ''))); ok boolean;
begin
  select * into qz from public.cut_camm311_quiz
   where id = p_quiz and active and room_hash is not null
     and now() >= coalesce(opens_at, 'infinity') and now() <= coalesce(closes_at, '-infinity');
  if not found then return jsonb_build_object('error', 'cannot_start'); end if;     -- closed: nothing to guess, nothing counted

  ok := crypt(upper(trim(coalesce(p_room, ''))), qz.room_hash) = qz.room_hash;
  if not ok then
    insert into public.cut_camm311_quiz_fails(key, quiz_id) values ('room', qz.id);
    delete from public.cut_camm311_quiz_fails where at < now() - interval '1 day';
    perform pg_sleep(0.3);
    return jsonb_build_object('error', 'cannot_start');
  end if;

  select id, first_name, surname, section into s
    from public.cut_camm311_signups where lower(email) = em order by id limit 1;
  if not found then
    if (select count(*) from public.cut_camm311_quiz_fails where quiz_id = qz.id and key = 'em:' || em and at > now() - interval '10 minutes') >= 5 then
      return jsonb_build_object('error', 'rate_limited');
    end if;
    insert into public.cut_camm311_quiz_fails(key, quiz_id) values ('em:' || em, qz.id);
    perform pg_sleep(0.3);
    return jsonb_build_object('error', 'cannot_start');
  end if;

  select * into a from public.cut_camm311_quiz_attempts where quiz_id = qz.id and signup_id = s.id;
  if not found then
    select array_agg(id order by random()) into ids from (
      select id from public.cut_camm311_quiz_questions where quiz_id = qz.id order by random() limit qz.n_questions) t;
    if ids is null then return jsonb_build_object('error', 'cannot_start'); end if;
    insert into public.cut_camm311_quiz_attempts(quiz_id, signup_id, q_order, approved, approved_at)
      values (qz.id, s.id, ids, not qz.approve_devices, case when not qz.approve_devices then now() end)
      returning * into a;
  elsif a.token is null then       -- lecturer reset this device: exactly ONE new binding, even with parallel starts
    update public.cut_camm311_quiz_attempts
       set token = gen_random_uuid(), reset_pending = false, last_seen = now(),
           approved = not qz.approve_devices,
           approved_at = case when not qz.approve_devices then coalesce(approved_at, now()) else approved_at end
     where id = a.id and token is null returning * into a;
    get diagnostics n = row_count;
    if n <> 1 then
      update public.cut_camm311_quiz_attempts set dup_count = dup_count + 1 where id = a.id;
      return jsonb_build_object('error', 'already_started');
    end if;
  else                              -- already bound to a device: never hand out the token again
    update public.cut_camm311_quiz_attempts set dup_count = dup_count + 1 where id = a.id;
    return jsonb_build_object('error', 'already_started');
  end if;
  return jsonb_build_object('attempt', a.id, 'token', a.token, 'pending', not a.approved,
    'name', s.first_name || ' ' || s.surname, 'section', s.section,
    'n', array_length(a.q_order, 1), 'seconds', qz.seconds);
end $$;

-- 2. next question: stem + shuffled options only. Needs: quiz active, before closes_at, before the attempt deadline, approved.
create or replace function public.cut_camm311_quiz_next(p_attempt uuid, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare a public.cut_camm311_quiz_attempts; qz public.cut_camm311_quiz; w public.cut_camm311_quiz_answers;
        qq public.cut_camm311_quiz_questions; k int; total int; oo int[]; opts jsonb; rem numeric; past boolean;
begin
  a := public.cut_camm311_quiz_auth(p_attempt, p_token);
  select * into qz from public.cut_camm311_quiz where id = a.quiz_id;
  if not qz.active then return jsonb_build_object('error', 'closed'); end if;
  if not a.approved then return jsonb_build_object('pending', true); end if;
  past := public.cut_camm311_quiz_sweep(a.id);
  total := array_length(a.q_order, 1);
  if past then return jsonb_build_object('done', true, 'closed', true, 'n', total); end if;

  select * into w from public.cut_camm311_quiz_answers where attempt_id = a.id and state = 'open';
  if not found then
    select count(*) into k from public.cut_camm311_quiz_answers where attempt_id = a.id;
    if k >= total then return jsonb_build_object('done', true, 'n', total); end if;
    select * into qq from public.cut_camm311_quiz_questions where id = a.q_order[k + 1];
    select array_agg(i order by random()) into oo from generate_series(0, jsonb_array_length(qq.options) - 1) i;
    insert into public.cut_camm311_quiz_answers(attempt_id, idx, question_id, opt_order)
      values (a.id, k, qq.id, oo) returning * into w;
  end if;

  select * into qq from public.cut_camm311_quiz_questions where id = w.question_id;
  select jsonb_agg(jsonb_build_object('en', qq.options -> o ->> 'en', 'gr', qq.options -> o ->> 'gr') order by ord)
    into opts from unnest(w.opt_order) with ordinality as u(o, ord);
  rem := qz.seconds - extract(epoch from (now() - w.served_at));
  return jsonb_build_object('done', false, 'idx', w.idx, 'n', total,
    'stem_en', qq.stem_en, 'stem_gr', qq.stem_gr, 'options', opts,
    'remaining_ms', greatest(0, round(rem * 1000)));
end $$;

-- 3. submit: p_pos = position of the option as shown (0-based). One submission per question, no going back.
create or replace function public.cut_camm311_quiz_submit(p_attempt uuid, p_token uuid, p_idx int, p_pos int)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare a public.cut_camm311_quiz_attempts; qz public.cut_camm311_quiz; w public.cut_camm311_quiz_answers;
        qq public.cut_camm311_quiz_questions; ch int;
begin
  a := public.cut_camm311_quiz_auth(p_attempt, p_token);
  select * into qz from public.cut_camm311_quiz where id = a.quiz_id;
  if not qz.active then return jsonb_build_object('ok', false, 'reason', 'closed'); end if;
  if not a.approved then return jsonb_build_object('ok', false, 'reason', 'pending'); end if;
  if public.cut_camm311_quiz_sweep(a.id) then return jsonb_build_object('ok', false, 'reason', 'closed'); end if;
  select * into w from public.cut_camm311_quiz_answers where attempt_id = a.id and idx = p_idx for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_served'); end if;
  if w.state <> 'open' then return jsonb_build_object('ok', false, 'reason', w.state); end if;
  if now() > w.served_at + make_interval(secs => qz.seconds + qz.grace_seconds) then
    update public.cut_camm311_quiz_answers set state = 'timeout', closed_at = now() where attempt_id = a.id and idx = p_idx;
    return jsonb_build_object('ok', false, 'reason', 'timeout');
  end if;
  if p_pos is null or p_pos < 0 or p_pos >= array_length(w.opt_order, 1) then
    return jsonb_build_object('ok', false, 'reason', 'bad_option');
  end if;
  ch := w.opt_order[p_pos + 1];
  select * into qq from public.cut_camm311_quiz_questions where id = w.question_id;
  update public.cut_camm311_quiz_answers
     set state = 'answered', chosen_idx = ch, is_correct = (ch = qq.correct_idx), closed_at = now()
   where attempt_id = a.id and idx = p_idx;
  return jsonb_build_object('ok', true);
end $$;

-- 4. leave: locks the open question (counts as wrong); board shows red.
create or replace function public.cut_camm311_quiz_leave(p_attempt uuid, p_token uuid, p_idx int)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare a public.cut_camm311_quiz_attempts; n int;
begin
  a := public.cut_camm311_quiz_auth(p_attempt, p_token);
  update public.cut_camm311_quiz_answers set state = 'left', closed_at = now()
   where attempt_id = a.id and idx = p_idx and state = 'open';
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'locked', n > 0);
end $$;

-- ---------- lecturer RPCs. All return jsonb; a failed code returns {"error": ...} (never raises) ----------
-- 5. board. Scores (correct) are withheld unless p_scores is true or the quiz has closed.
create or replace function public.cut_camm311_quiz_board(p_quiz int, p_code text, p_scores boolean default false)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare qz public.cut_camm311_quiz; res jsonb; chk text; closed boolean;
begin
  chk := public.cut_camm311_quiz_lect_ok(p_quiz, p_code);
  if chk <> 'ok' then return jsonb_build_object('error', chk); end if;
  select * into qz from public.cut_camm311_quiz where id = p_quiz;
  closed := now() > coalesce(qz.closes_at, '-infinity') or not qz.active;
  perform public.cut_camm311_quiz_sweep(a.id) from public.cut_camm311_quiz_attempts a where a.quiz_id = qz.id;
  select coalesce(jsonb_agg(r order by r ->> 'name'), '[]'::jsonb) into res from (
    select jsonb_strip_nulls(jsonb_build_object(
      'attempt', a.id,
      'name', s.first_name || ' ' || s.surname, 'section', s.section,
      'answered', count(w.*) filter (where w.state in ('answered','timeout','left')),
      'served', count(w.*),
      'n', array_length(a.q_order, 1),
      'correct', case when p_scores or closed then count(w.*) filter (where w.is_correct) end,
      'left', count(w.*) filter (where w.state = 'left'),
      'timeouts', count(w.*) filter (where w.state = 'timeout'),
      'dup', a.dup_count,
      'pending', not a.approved,
      'reset_pending', a.reset_pending,
      'finished', count(w.*) filter (where w.state <> 'open') = array_length(a.q_order, 1),
      'seen_s_ago', round(extract(epoch from now() - a.last_seen)))) as r
    from public.cut_camm311_quiz_attempts a
    join public.cut_camm311_signups s on s.id = a.signup_id
    left join public.cut_camm311_quiz_answers w on w.attempt_id = a.id
    where a.quiz_id = qz.id group by a.id, s.id) t;
  return jsonb_build_object('title', qz.title, 'n', qz.n_questions, 'room_set', qz.room_hash is not null,
    'closed', closed, 'scores_visible', (p_scores or closed), 'students', res,
    'alerts', jsonb_build_object(
      'room_guesses', (select count(*) from public.cut_camm311_quiz_fails f where f.quiz_id = qz.id and f.key = 'room' and f.at > now() - interval '10 minutes'),
      'unknown_emails', (select count(*) from public.cut_camm311_quiz_fails f where f.quiz_id = qz.id and f.key like 'em:%' and f.at > now() - interval '10 minutes'),
      'lecturer_code_fails', (select count(*) from public.cut_camm311_quiz_fails f where f.quiz_id = qz.id and f.key = 'lect' and f.at > now() - interval '10 minutes')));
end $$;

-- 6. new room code. Returns the plain code ONCE; only its hash is stored. Clears the room-guess counter.
create or replace function public.cut_camm311_quiz_room_regen(p_quiz int, p_code text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare alpha text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; b bytea := gen_random_bytes(6); c text := ''; i int; chk text;
begin
  chk := public.cut_camm311_quiz_lect_ok(p_quiz, p_code);
  if chk <> 'ok' then return jsonb_build_object('error', chk); end if;
  for i in 0..5 loop c := c || substr(alpha, (get_byte(b, i) % length(alpha)) + 1, 1); end loop;
  update public.cut_camm311_quiz set room_hash = crypt(c, gen_salt('bf')), room_set_at = now() where id = p_quiz;
  delete from public.cut_camm311_quiz_fails where quiz_id = p_quiz and key = 'room';
  insert into public.cut_camm311_quiz_reset_log(quiz_id, action) values (p_quiz, 'room_code_regenerated');
  return jsonb_build_object('room', c);
end $$;

-- 7. reset one student's device. Logged. The student starts again once and shows amber until then.
create or replace function public.cut_camm311_quiz_reset_device(p_quiz int, p_code text, p_attempt uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare n int; chk text;
begin
  chk := public.cut_camm311_quiz_lect_ok(p_quiz, p_code);
  if chk <> 'ok' then return jsonb_build_object('error', chk); end if;
  update public.cut_camm311_quiz_attempts set token = null, reset_pending = true where id = p_attempt and quiz_id = p_quiz;
  get diagnostics n = row_count;
  if n > 0 then
    insert into public.cut_camm311_quiz_reset_log(quiz_id, attempt_id, action) values (p_quiz, p_attempt, 'device_reset');
  end if;
  return jsonb_build_object('ok', n > 0);
end $$;

-- 8. approve a device: one student (p_attempt) or every pending one (p_attempt null = "approve all"). Logged.
create or replace function public.cut_camm311_quiz_approve(p_quiz int, p_code text, p_attempt uuid default null)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare n int; chk text;
begin
  chk := public.cut_camm311_quiz_lect_ok(p_quiz, p_code);
  if chk <> 'ok' then return jsonb_build_object('error', chk); end if;
  update public.cut_camm311_quiz_attempts set approved = true, approved_at = coalesce(approved_at, now())
   where quiz_id = p_quiz and not approved and (p_attempt is null or id = p_attempt);
  get diagnostics n = row_count;
  insert into public.cut_camm311_quiz_reset_log(quiz_id, attempt_id, action)
    values (p_quiz, p_attempt, case when p_attempt is null then 'approve_all' else 'approve' end);
  return jsonb_build_object('ok', true, 'approved', n);
end $$;

-- 9. clear blocks: removes the failure counters of this quiz (room guesses, unknown emails, wrong lecturer codes). Logged.
create or replace function public.cut_camm311_quiz_clear_blocks(p_quiz int, p_code text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare n int; chk text;
begin
  chk := public.cut_camm311_quiz_lect_ok(p_quiz, p_code);
  if chk <> 'ok' then return jsonb_build_object('error', chk); end if;
  delete from public.cut_camm311_quiz_fails where quiz_id = p_quiz;
  get diagnostics n = row_count;
  insert into public.cut_camm311_quiz_reset_log(quiz_id, action) values (p_quiz, 'clear_blocks');
  return jsonb_build_object('ok', true, 'cleared', n);
end $$;

-- 10. change the lecturer code (needs the current one)
create or replace function public.cut_camm311_quiz_lecturer_code_change(p_quiz int, p_old text, p_new text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare chk text;
begin
  chk := public.cut_camm311_quiz_lect_ok(p_quiz, p_old);
  if chk <> 'ok' then return jsonb_build_object('error', chk); end if;
  if p_new is null or length(p_new) < 12 then return jsonb_build_object('error', 'too_short'); end if;
  update public.cut_camm311_quiz set lecturer_hash = crypt(p_new, gen_salt('bf')) where id = p_quiz;
  insert into public.cut_camm311_quiz_reset_log(quiz_id, action) values (p_quiz, 'lecturer_code_changed');
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.cut_camm311_quiz_auth(uuid, uuid), public.cut_camm311_quiz_sweep(uuid),
  public.cut_camm311_quiz_lect_ok(int, text), public.cut_camm311_quiz_admin_set_lecturer(int, text),
  public.cut_camm311_quiz_admin_load_bank(int, jsonb, int, boolean) from public, anon, authenticated;
revoke all on function public.cut_camm311_quiz_info(), public.cut_camm311_quiz_start(text, int, text),
  public.cut_camm311_quiz_next(uuid, uuid), public.cut_camm311_quiz_submit(uuid, uuid, int, int),
  public.cut_camm311_quiz_leave(uuid, uuid, int), public.cut_camm311_quiz_board(int, text, boolean),
  public.cut_camm311_quiz_room_regen(int, text), public.cut_camm311_quiz_reset_device(int, text, uuid),
  public.cut_camm311_quiz_approve(int, text, uuid), public.cut_camm311_quiz_clear_blocks(int, text),
  public.cut_camm311_quiz_lecturer_code_change(int, text, text) from public;
grant execute on function public.cut_camm311_quiz_info(), public.cut_camm311_quiz_start(text, int, text),
  public.cut_camm311_quiz_next(uuid, uuid), public.cut_camm311_quiz_submit(uuid, uuid, int, int),
  public.cut_camm311_quiz_leave(uuid, uuid, int), public.cut_camm311_quiz_board(int, text, boolean),
  public.cut_camm311_quiz_room_regen(int, text), public.cut_camm311_quiz_reset_device(int, text, uuid),
  public.cut_camm311_quiz_approve(int, text, uuid), public.cut_camm311_quiz_clear_blocks(int, text),
  public.cut_camm311_quiz_lecturer_code_change(int, text, text) to anon, authenticated;

-- ---------- DEMO seed (idempotent; inactive; no real exam content) ----------
-- The lecturer hash is a RANDOM value nobody knows (lecturer_set = false): no usable default code exists.
do $seed$
declare qid int;
begin
  if exists (select 1 from public.cut_camm311_quiz where title = 'DEMO quiz - not an exam') then return; end if;
  insert into public.cut_camm311_quiz(title, active, n_questions, lecturer_hash, lecturer_set)
  values ('DEMO quiz - not an exam', false, 5, extensions.crypt(encode(extensions.gen_random_bytes(24), 'hex'), extensions.gen_salt('bf')), false)
  returning id into qid;
  insert into public.cut_camm311_quiz_questions(quiz_id, is_demo, stem_en, stem_gr, options, correct_idx)
  select qid, true, v.se, v.sg, v.o::jsonb, v.c from (values
   ('DEMO 1: Which colour is the demo answer?', 'DEMO 1: Ποιο χρώμα είναι η απάντηση του demo;',
    '[{"en":"Red","gr":"Κόκκινο"},{"en":"Blue","gr":"Μπλε"},{"en":"Green","gr":"Πράσινο"},{"en":"Grey","gr":"Γκρι"}]', 1),
   ('DEMO 2: Pick the second option.', 'DEMO 2: Επιλέξτε τη δεύτερη επιλογή.',
    '[{"en":"First","gr":"Πρώτη"},{"en":"Second","gr":"Δεύτερη"},{"en":"Third","gr":"Τρίτη"}]', 1),
   ('DEMO 3: 2 + 2 = ?', 'DEMO 3: 2 + 2 = ;',
    '[{"en":"3","gr":"3"},{"en":"4","gr":"4"},{"en":"5","gr":"5"},{"en":"22","gr":"22"}]', 1),
   ('DEMO 4: Which word is a DEMO word?', 'DEMO 4: Ποια λέξη είναι λέξη DEMO;',
    '[{"en":"Alpha","gr":"Άλφα"},{"en":"Demo","gr":"Δοκιμή"},{"en":"Omega","gr":"Ωμέγα"}]', 1),
   ('DEMO 5: This is the last demo question. Choose Last.', 'DEMO 5: Τελευταία ερώτηση demo. Επιλέξτε Τελευταία.',
    '[{"en":"Last","gr":"Τελευταία"},{"en":"First","gr":"Πρώτη"},{"en":"None","gr":"Καμία"}]', 0)
  ) as v(se, sg, o, c);
end $seed$;

commit;

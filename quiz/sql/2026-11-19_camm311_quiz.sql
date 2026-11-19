-- CAMM 311 in-class quiz (30 s per question, 5% of the total).
-- FOR REVIEW. NOT APPLIED. Target: pa DEV Supabase project only.
-- Uses: cut_camm311_signups (id, first_name, surname, email, section), same email sign-in idea as cut_camm311_study_login.
-- Correct answers live only in cut_camm311_quiz_questions; no RPC returns them to a student.
-- Seed = 5 DEMO questions. Real questions are loaded later by the owner's word.

create extension if not exists pgcrypto with schema extensions;

-- ---------- tables (RLS on, no policies = no anon/authenticated access) ----------
create table if not exists public.cut_camm311_quiz (
  id            serial primary key,
  title         text        not null,
  active        boolean     not null default false,      -- owner switches on
  opens_at      timestamptz,                             -- quiz date/window: NOT GIVEN YET (null = never open)
  closes_at     timestamptz,
  n_questions   int         not null default 10 check (n_questions > 0),  -- NOT GIVEN YET
  seconds       int         not null default 30 check (seconds between 5 and 600),
  grace_seconds int         not null default 3  check (grace_seconds between 0 and 15),
  lecturer_hash text        not null,                     -- crypt() hash, never the code itself
  room_hash     text,                                     -- crypt() hash of the room code shown on the projector; null = nobody can start
  room_set_at   timestamptz
);

create table if not exists public.cut_camm311_quiz_questions (
  id          serial primary key,
  quiz_id     int  not null references public.cut_camm311_quiz(id) on delete cascade,
  is_demo     boolean not null default false,
  stem_en     text not null,
  stem_gr     text not null,
  options     jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6), -- [{"en":..,"gr":..}, ...]
  correct_idx int  not null check (correct_idx >= 0)     -- index into options; server only
);

create table if not exists public.cut_camm311_quiz_attempts (
  id          uuid primary key default gen_random_uuid(),
  quiz_id     int  not null references public.cut_camm311_quiz(id) on delete cascade,
  signup_id   bigint not null,
  token       uuid default gen_random_uuid(),            -- bound to the FIRST device; null only after a lecturer device reset
  dup_count   int  not null default 0,                   -- blocked second starts (amber on the board)
  reset_pending boolean not null default false,          -- lecturer reset the device; waiting for the student to start again
  q_order     int[] not null,                            -- shuffled question ids for this student
  started_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  unique (quiz_id, signup_id)
);

create table if not exists public.cut_camm311_quiz_answers (
  attempt_id  uuid not null references public.cut_camm311_quiz_attempts(id) on delete cascade,
  idx         int  not null,                             -- position in q_order
  question_id int  not null references public.cut_camm311_quiz_questions(id),
  opt_order   int[] not null,                            -- shuffled option indexes shown to this student
  served_at   timestamptz not null default now(),
  state       text not null default 'open' check (state in ('open','answered','timeout','left')),
  chosen_idx  int,
  is_correct  boolean not null default false,
  closed_at   timestamptz,
  primary key (attempt_id, idx),
  unique (attempt_id, question_id)
);

create table if not exists public.cut_camm311_quiz_fails (   -- failed starts / lecturer-code tries, for rate limiting
  key text not null,
  at  timestamptz not null default now()
);
create index if not exists cut_camm311_quiz_fails_key_at on public.cut_camm311_quiz_fails(key, at);

create table if not exists public.cut_camm311_quiz_reset_log (  -- every lecturer action on a device or room code
  id         bigserial primary key,
  quiz_id    int  not null,
  attempt_id uuid,
  action     text not null,
  at         timestamptz not null default now()
);

alter table public.cut_camm311_quiz_fails     enable row level security;
alter table public.cut_camm311_quiz_reset_log enable row level security;
revoke all on public.cut_camm311_quiz_fails, public.cut_camm311_quiz_reset_log from anon, authenticated;
alter table public.cut_camm311_quiz           enable row level security;
alter table public.cut_camm311_quiz_questions enable row level security;
alter table public.cut_camm311_quiz_attempts  enable row level security;
alter table public.cut_camm311_quiz_answers   enable row level security;
revoke all on public.cut_camm311_quiz, public.cut_camm311_quiz_questions,
              public.cut_camm311_quiz_attempts, public.cut_camm311_quiz_answers from anon, authenticated;

-- ---------- helpers (not callable from the API) ----------
create or replace function public.cut_camm311_quiz_auth(p_attempt uuid, p_token uuid)
returns public.cut_camm311_quiz_attempts
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare a public.cut_camm311_quiz_attempts;
begin
  select * into a from public.cut_camm311_quiz_attempts where id = p_attempt and token = p_token;
  if not found then raise exception 'bad_session' using errcode = 'P0001'; end if;
  update public.cut_camm311_quiz_attempts set last_seen = now() where id = a.id;
  return a;
end $$;

-- close every open question that ran past its time (+grace) as 'timeout'
create or replace function public.cut_camm311_quiz_sweep(p_attempt uuid)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.cut_camm311_quiz_answers w
     set state = 'timeout', closed_at = now()
    from public.cut_camm311_quiz_attempts a, public.cut_camm311_quiz q
   where w.attempt_id = p_attempt and a.id = w.attempt_id and q.id = a.quiz_id
     and w.state = 'open'
     and now() > w.served_at + make_interval(secs => q.seconds + q.grace_seconds);
$$;

-- ---------- public RPCs ----------
-- 0. which quiz is on (no questions, no answers)
create or replace function public.cut_camm311_quiz_info()
returns jsonb language sql security definer set search_path = public, pg_temp as $$
  select coalesce((select jsonb_build_object(
           'quiz_id', q.id, 'title', q.title, 'seconds', q.seconds,
           'n', least(q.n_questions, (select count(*) from public.cut_camm311_quiz_questions x where x.quiz_id = q.id)),
           'open', (q.active and now() >= coalesce(q.opens_at, 'infinity') and now() <= coalesce(q.closes_at, '-infinity')),
           'opens_at', q.opens_at, 'closes_at', q.closes_at)
         from public.cut_camm311_quiz q where q.active order by q.id desc limit 1), jsonb_build_object('quiz_id', null));
$$;

-- 1. start attempt. Needs email + room code. ONE generic error for unknown email, wrong room code, closed quiz.
--    First start binds the attempt to that device (token). A second start never returns or rotates the token.
create or replace function public.cut_camm311_quiz_start(p_email text, p_quiz int, p_room text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare qz public.cut_camm311_quiz; s record; a public.cut_camm311_quiz_attempts; ids int[];
        em text := lower(trim(coalesce(p_email, ''))); ok boolean;
begin
  if (select count(*) from public.cut_camm311_quiz_fails where key = em and at > now() - interval '10 minutes') >= 5 then
    return jsonb_build_object('error', 'rate_limited');
  end if;

  select * into qz from public.cut_camm311_quiz
   where id = p_quiz and active and room_hash is not null
     and now() >= coalesce(opens_at, 'infinity') and now() <= coalesce(closes_at, '-infinity');
  ok := found and crypt(upper(trim(coalesce(p_room, ''))), qz.room_hash) = qz.room_hash;
  if ok then
    select id, first_name, surname, section into s
      from public.cut_camm311_signups where lower(email) = em order by id limit 1;
    ok := found;
  end if;
  if not ok then
    insert into public.cut_camm311_quiz_fails(key) values (em);
    delete from public.cut_camm311_quiz_fails where at < now() - interval '1 day';
    perform pg_sleep(0.3);
    return jsonb_build_object('error', 'cannot_start');
  end if;

  select * into a from public.cut_camm311_quiz_attempts where quiz_id = qz.id and signup_id = s.id;
  if not found then
    select array_agg(id order by random()) into ids from (
      select id from public.cut_camm311_quiz_questions where quiz_id = qz.id order by random() limit qz.n_questions) t;
    if ids is null then return jsonb_build_object('error', 'cannot_start'); end if;
    insert into public.cut_camm311_quiz_attempts(quiz_id, signup_id, q_order) values (qz.id, s.id, ids) returning * into a;
  elsif a.token is null then       -- lecturer reset this student's device: one new binding
    update public.cut_camm311_quiz_attempts set token = gen_random_uuid(), reset_pending = false, last_seen = now()
     where id = a.id returning * into a;
  else                              -- already bound to a device: never hand out the token again
    update public.cut_camm311_quiz_attempts set dup_count = dup_count + 1 where id = a.id;
    return jsonb_build_object('error', 'already_started');
  end if;
  return jsonb_build_object('attempt', a.id, 'token', a.token,
    'name', s.first_name || ' ' || s.surname, 'section', s.section,
    'n', array_length(a.q_order, 1), 'seconds', qz.seconds);
end $$;

-- 2. next question: stem + shuffled options only. Re-serving the open one keeps the original clock.
create or replace function public.cut_camm311_quiz_next(p_attempt uuid, p_token uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare a public.cut_camm311_quiz_attempts; qz public.cut_camm311_quiz; w public.cut_camm311_quiz_answers;
        qq public.cut_camm311_quiz_questions; k int; total int; oo int[]; opts jsonb; rem numeric;
begin
  a := public.cut_camm311_quiz_auth(p_attempt, p_token);
  select * into qz from public.cut_camm311_quiz where id = a.quiz_id;
  perform public.cut_camm311_quiz_sweep(a.id);
  total := array_length(a.q_order, 1);

  select * into w from public.cut_camm311_quiz_answers where attempt_id = a.id and state = 'open';
  if not found then
    select count(*) into k from public.cut_camm311_quiz_answers where attempt_id = a.id;   -- next idx (0-based)
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

-- 3. submit: p_idx = question position, p_pos = position of the option as shown (0-based).
--    Server enforces seconds + grace, one submission per question, no going back.
create or replace function public.cut_camm311_quiz_submit(p_attempt uuid, p_token uuid, p_idx int, p_pos int)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare a public.cut_camm311_quiz_attempts; qz public.cut_camm311_quiz; w public.cut_camm311_quiz_answers;
        qq public.cut_camm311_quiz_questions; ch int;
begin
  a := public.cut_camm311_quiz_auth(p_attempt, p_token);
  select * into qz from public.cut_camm311_quiz where id = a.quiz_id;
  select * into w from public.cut_camm311_quiz_answers where attempt_id = a.id and idx = p_idx for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_served'); end if;
  if w.state <> 'open' then return jsonb_build_object('ok', false, 'reason', w.state); end if;   -- double submit / locked / timed out
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
  return jsonb_build_object('ok', true);        -- deliberately no correct/wrong feedback
end $$;

-- 4. leave: the student left the app on this question. Locks it (counts as wrong); board shows red.
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

-- lecturer code check (rate limited, hashed). Used by board, reset and room-code RPCs.
create or replace function public.cut_camm311_quiz_lect_ok(p_quiz int, p_code text)
returns void language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare qz public.cut_camm311_quiz; k text := 'lect:' || p_quiz;
begin
  if (select count(*) from public.cut_camm311_quiz_fails where key = k and at > now() - interval '10 minutes') >= 20 then
    raise exception 'rate_limited' using errcode = '42501';
  end if;
  select * into qz from public.cut_camm311_quiz where id = p_quiz;
  if not found or p_code is null or qz.lecturer_hash <> crypt(p_code, qz.lecturer_hash) then
    insert into public.cut_camm311_quiz_fails(key) values (k);
    perform pg_sleep(1);
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

-- 5. lecturer board. Wrong code = error, no data. Amber = duplicate start or device reset waiting; red = left the app.
create or replace function public.cut_camm311_quiz_board(p_quiz int, p_code text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare qz public.cut_camm311_quiz; res jsonb;
begin
  perform public.cut_camm311_quiz_lect_ok(p_quiz, p_code);
  select * into qz from public.cut_camm311_quiz where id = p_quiz;
  perform public.cut_camm311_quiz_sweep(a.id) from public.cut_camm311_quiz_attempts a where a.quiz_id = qz.id;
  select coalesce(jsonb_agg(r order by r ->> 'name'), '[]'::jsonb) into res from (
    select jsonb_build_object(
      'attempt', a.id,
      'name', s.first_name || ' ' || s.surname, 'section', s.section,
      'answered', count(w.*) filter (where w.state in ('answered','timeout','left')),
      'served', count(w.*),
      'n', array_length(a.q_order, 1),
      'correct', count(w.*) filter (where w.is_correct),
      'left', count(w.*) filter (where w.state = 'left'),
      'timeouts', count(w.*) filter (where w.state = 'timeout'),
      'dup', a.dup_count,
      'reset_pending', a.reset_pending,
      'finished', count(w.*) filter (where w.state <> 'open') = array_length(a.q_order, 1),
      'seen_s_ago', round(extract(epoch from now() - a.last_seen))) as r
    from public.cut_camm311_quiz_attempts a
    join public.cut_camm311_signups s on s.id = a.signup_id
    left join public.cut_camm311_quiz_answers w on w.attempt_id = a.id
    where a.quiz_id = qz.id group by a.id, s.id) t;
  return jsonb_build_object('title', qz.title, 'n', qz.n_questions, 'room_set', qz.room_hash is not null, 'students', res);
end $$;

-- 6. lecturer: new room code. Returns the plain code ONCE (for the projector); only its hash is stored.
create or replace function public.cut_camm311_quiz_room_regen(p_quiz int, p_code text)
returns text language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare alpha text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; b bytea := gen_random_bytes(6); c text := ''; i int;
begin
  perform public.cut_camm311_quiz_lect_ok(p_quiz, p_code);
  for i in 0..5 loop c := c || substr(alpha, (get_byte(b, i) % length(alpha)) + 1, 1); end loop;
  update public.cut_camm311_quiz set room_hash = crypt(c, gen_salt('bf')), room_set_at = now() where id = p_quiz;
  insert into public.cut_camm311_quiz_reset_log(quiz_id, action) values (p_quiz, 'room_code_regenerated');
  return c;
end $$;

-- 7. lecturer: reset one student's device. Logged. The student then starts again once (email + room code) and shows amber until then.
create or replace function public.cut_camm311_quiz_reset_device(p_quiz int, p_code text, p_attempt uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare n int;
begin
  perform public.cut_camm311_quiz_lect_ok(p_quiz, p_code);
  update public.cut_camm311_quiz_attempts set token = null, reset_pending = true
   where id = p_attempt and quiz_id = p_quiz;
  get diagnostics n = row_count;
  if n > 0 then
    insert into public.cut_camm311_quiz_reset_log(quiz_id, attempt_id, action) values (p_quiz, p_attempt, 'device_reset');
  end if;
  return jsonb_build_object('ok', n > 0);
end $$;

revoke all on function public.cut_camm311_quiz_auth(uuid, uuid), public.cut_camm311_quiz_sweep(uuid), public.cut_camm311_quiz_lect_ok(int, text) from public, anon, authenticated;
revoke all on function public.cut_camm311_quiz_info(), public.cut_camm311_quiz_start(text, int, text),
  public.cut_camm311_quiz_next(uuid, uuid), public.cut_camm311_quiz_submit(uuid, uuid, int, int),
  public.cut_camm311_quiz_leave(uuid, uuid, int), public.cut_camm311_quiz_board(int, text),
  public.cut_camm311_quiz_room_regen(int, text), public.cut_camm311_quiz_reset_device(int, text, uuid) from public;
grant execute on function public.cut_camm311_quiz_info(), public.cut_camm311_quiz_start(text, int, text),
  public.cut_camm311_quiz_next(uuid, uuid), public.cut_camm311_quiz_submit(uuid, uuid, int, int),
  public.cut_camm311_quiz_leave(uuid, uuid, int), public.cut_camm311_quiz_board(int, text),
  public.cut_camm311_quiz_room_regen(int, text), public.cut_camm311_quiz_reset_device(int, text, uuid) to anon, authenticated;

-- ---------- DEMO seed (inactive; no real exam content) ----------
-- Lecturer code below is a DEMO placeholder. Before any real use the owner replaces it:
--   update public.cut_camm311_quiz set lecturer_hash = extensions.crypt('<new code>', extensions.gen_salt('bf')) where id = <id>;
-- Then set opens_at, closes_at, n_questions and active = true. The room code is made by the board (room_regen); until then nobody can start.
with q as (
  insert into public.cut_camm311_quiz(title, active, n_questions, lecturer_hash)
  values ('DEMO quiz - not an exam', false, 5, extensions.crypt('DEMO-CODE-CHANGE-ME', extensions.gen_salt('bf')))
  returning id)
insert into public.cut_camm311_quiz_questions(quiz_id, is_demo, stem_en, stem_gr, options, correct_idx)
select q.id, true, v.se, v.sg, v.o::jsonb, v.c from q, (values
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

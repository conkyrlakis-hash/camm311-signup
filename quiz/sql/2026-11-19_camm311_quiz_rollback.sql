-- Rollback for 2026-11-19_camm311_quiz.sql. Removes ONLY the quiz objects. FOR REVIEW, NOT APPLIED.
-- Does not touch cut_camm311_signups or any study-app object.
-- REFUSES to run while any attempt exists (it would destroy students' answers). To delete anyway, run first in the same session:
--     set camm311.force_rollback = 'YES_DELETE_ALL_QUIZ_ATTEMPTS';
begin;

do $guard$
begin
  if to_regclass('public.cut_camm311_quiz_attempts') is not null
     and exists (select 1 from public.cut_camm311_quiz_attempts)
     and coalesce(current_setting('camm311.force_rollback', true), '') <> 'YES_DELETE_ALL_QUIZ_ATTEMPTS' then
    raise exception 'Quiz attempts exist. Rollback refused. Set camm311.force_rollback to YES_DELETE_ALL_QUIZ_ATTEMPTS to delete them.';
  end if;
end $guard$;

drop function if exists public.cut_camm311_quiz_lecturer_code_change(int, text, text);
drop function if exists public.cut_camm311_quiz_clear_blocks(int, text);
drop function if exists public.cut_camm311_quiz_approve(int, text, uuid);
drop function if exists public.cut_camm311_quiz_reset_device(int, text, uuid);
drop function if exists public.cut_camm311_quiz_room_regen(int, text);
drop function if exists public.cut_camm311_quiz_board(int, text, boolean);
drop function if exists public.cut_camm311_quiz_admin_set_lecturer(int, text);
drop function if exists public.cut_camm311_quiz_nq_guard() cascade;
drop function if exists public.cut_camm311_quiz_admin_load_bank(int, jsonb, int, boolean);
drop function if exists public.cut_camm311_quiz_lect_ok(int, text);
drop function if exists public.cut_camm311_quiz_leave(uuid, uuid, int);
drop function if exists public.cut_camm311_quiz_submit(uuid, uuid, int, int);
drop function if exists public.cut_camm311_quiz_next(uuid, uuid);
drop function if exists public.cut_camm311_quiz_start(text, int, text);
drop function if exists public.cut_camm311_quiz_info();
drop function if exists public.cut_camm311_quiz_sweep(uuid);
drop function if exists public.cut_camm311_quiz_auth(uuid, uuid);
drop table if exists public.cut_camm311_quiz_reset_log;
drop table if exists public.cut_camm311_quiz_fails;
drop table if exists public.cut_camm311_quiz_answers;
drop table if exists public.cut_camm311_quiz_attempts;
drop table if exists public.cut_camm311_quiz_questions;
drop table if exists public.cut_camm311_quiz;

commit;

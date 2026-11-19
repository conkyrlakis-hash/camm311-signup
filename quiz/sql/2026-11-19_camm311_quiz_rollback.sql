-- Rollback for 2026-11-19_camm311_quiz.sql. Removes ONLY the quiz objects. FOR REVIEW, NOT APPLIED.
-- Does not touch cut_camm311_signups or any study-app object.
drop function if exists public.cut_camm311_quiz_reset_device(int, text, uuid);
drop function if exists public.cut_camm311_quiz_room_regen(int, text);
drop function if exists public.cut_camm311_quiz_board(int, text);
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

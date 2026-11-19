#!/usr/bin/env python3
"""Turn a quiz-bank JSON (kept in OneDrive, never in this repo) into ONE SQL statement for the SQL editor of pa DEV.
Usage: python make_load_sql.py <bank.json> [quiz_id=1] [--n 30] [--force] > load.sql
Does not connect to any database. The statement is idempotent and refuses if attempts exist (unless --force)."""
import json, sys

def main(argv):
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('bank'); ap.add_argument('quiz', nargs='?', type=int, default=1)
    ap.add_argument('--n', type=int, default=30); ap.add_argument('--force', action='store_true')
    o = ap.parse_args(argv)
    path, quiz, force, n = o.bank, o.quiz, o.force, o.n
    bank = json.load(open(path, encoding='utf-8'))
    qs = bank['questions'] if isinstance(bank, dict) else bank
    out = []
    for q in qs:
        out.append({'stem_en': q['stem_en'], 'stem_gr': q['stem_gr'],
                    'options': [{'en': o['en'], 'gr': o['gr']} for o in q['options']],
                    'correct_idx': q['correct_idx'], 'lecture': q.get('lecture')})
    tag = 'bankq'
    print("-- Quiz bank load for pa DEV. Review, then run in the SQL editor. %d questions." % len(out))
    print("select public.cut_camm311_quiz_admin_load_bank(%d, $%s$%s$%s$::jsonb, %d, %s);" % (
        quiz, tag, json.dumps(out, ensure_ascii=False), tag, n, 'true' if force else 'false'))

if __name__ == '__main__':
    main(sys.argv[1:])

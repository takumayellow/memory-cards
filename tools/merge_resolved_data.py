"""After re-running parse_anime_list.py (which drops resolution columns),
merge back the aniwatch_url / mal_id / mal_url / watch_url / watch_provider
from the previous version, joining on (title_en, title_jp).

Also renames images/anime/<old_id>.jpg to <new_id>.jpg based on the title match.

Usage:
  python3 tools/merge_resolved_data.py PREV_TSV
"""
import csv
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TSV = ROOT / 'data' / 'anime.tsv'
IMG = ROOT / 'images' / 'anime'

EXTRA = ['aniwatch_url', 'mal_id', 'mal_url', 'watch_url', 'watch_provider']


def key(r):
    return (r.get('title_en', '').strip(), r.get('title_jp', '').strip())


def main():
    prev_path = Path(sys.argv[1])
    prev_rows = list(csv.DictReader(prev_path.open(encoding='utf-8'), delimiter='\t'))
    prev_map = {key(r): r for r in prev_rows}

    cur_rows = list(csv.DictReader(TSV.open(encoding='utf-8'), delimiter='\t'))
    headers = list(cur_rows[0].keys()) if cur_rows else []
    for c in EXTRA:
        if c not in headers:
            headers.append(c)

    renames = []  # (old_id, new_id)
    for r in cur_rows:
        prev = prev_map.get(key(r))
        if not prev:
            for c in EXTRA:
                r[c] = ''
            continue
        for c in EXTRA:
            r[c] = prev.get(c, '')
        if prev['id'] != r['id']:
            renames.append((prev['id'], r['id']))

    # rename images (do via two-step staging to avoid collisions)
    stage = IMG / '_stage'
    stage.mkdir(exist_ok=True)
    for old, new in renames:
        src = IMG / f'{old}.jpg'
        if src.exists():
            shutil.move(str(src), str(stage / f'{new}.jpg'))
    for f in stage.iterdir():
        shutil.move(str(f), str(IMG / f.name))
    stage.rmdir()

    with TSV.open('w', encoding='utf-8', newline='\n') as f:
        f.write('\t'.join(headers) + '\n')
        for r in cur_rows:
            f.write('\t'.join(r.get(h, '') for h in headers) + '\n')

    print(f'merged {len(cur_rows)} rows, {len(renames)} image renames')


if __name__ == '__main__':
    main()

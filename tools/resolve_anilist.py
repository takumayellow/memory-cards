"""Resolve each anime to its AniList ID via the AniList GraphQL API.

Populates the anilist_id column in data/anime.tsv. Skips rows that already
have an ID. Used to drive the Miruro watch link (https://www.miruro.tv/info?id=<anilist_id>).

Run:  PYTHONIOENCODING=utf-8 python3 tools/resolve_anilist.py
"""
import csv
import json
import time
import urllib.request
from pathlib import Path

TSV = Path(__file__).resolve().parent.parent / 'data' / 'anime.tsv'

GQL = '''
query ($q: String) {
  Media(search: $q, type: ANIME) {
    id
    title { romaji english native }
  }
}
'''

UA = 'Mozilla/5.0 (compatible; anime-cards/1.0; +https://github.com/local)'


def search(title: str, max_retries: int = 4):
    if not title:
        return None
    body = json.dumps({'query': GQL, 'variables': {'q': title}}).encode()
    for attempt in range(max_retries):
        req = urllib.request.Request(
            'https://graphql.anilist.co',
            data=body,
            headers={'Content-Type': 'application/json', 'Accept': 'application/json',
                     'User-Agent': UA},
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read()).get('data', {}).get('Media')
        except Exception as e:
            wait = 2 ** attempt * 2
            print(f'  ! search failed ({e}); retry in {wait}s')
            time.sleep(wait)
    return None


def main():
    rows = list(csv.DictReader(TSV.open(encoding='utf-8'), delimiter='\t'))
    headers = list(rows[0].keys()) if rows else []
    if 'anilist_id' not in headers:
        headers.append('anilist_id')

    found = 0
    for i, r in enumerate(rows, 1):
        if r.get('anilist_id'):
            found += 1
            continue
        query = r.get('title_en') or r.get('title_jp')
        m = search(query)
        if not m and r.get('title_jp') and r.get('title_jp') != query:
            time.sleep(1.5)
            m = search(r['title_jp'])
        if m and m.get('id'):
            r['anilist_id'] = str(m['id'])
            found += 1
            titles = m.get('title', {})
            label = titles.get('english') or titles.get('romaji') or ''
            print(f'[{i}/{len(rows)}] OK  {r["id"]} -> {m["id"]} {label[:45]}')
        else:
            r['anilist_id'] = ''
            print(f'[{i}/{len(rows)}] --  {r["id"]} no match  {(query or "")[:45]}')
        time.sleep(1.5)

    with TSV.open('w', encoding='utf-8', newline='\n') as f:
        f.write('\t'.join(headers) + '\n')
        for r in rows:
            f.write('\t'.join(r.get(h, '') for h in headers) + '\n')

    print(f'\nAniList: {found}/{len(rows)}')


if __name__ == '__main__':
    main()

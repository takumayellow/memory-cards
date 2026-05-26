"""Fetch anime cover thumbnails using AniList's public GraphQL API.

Reads data/anime.tsv, looks up each title on AniList (free, no auth),
downloads the coverImage.large to images/anime/<id>.jpg.

Run:  PYTHONIOENCODING=utf-8 python3 tools/fetch_anime_thumbs.py
"""
import csv
import json
import os
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TSV = ROOT / 'data' / 'anime.tsv'
OUT = ROOT / 'images' / 'anime'
OUT.mkdir(parents=True, exist_ok=True)

GQL = '''
query ($q: String) {
  Media(search: $q, type: ANIME) {
    id
    title { romaji english native }
    coverImage { large }
  }
}
'''


UA = 'Mozilla/5.0 (compatible; anime-cards/1.0; +https://github.com/local)'


def search(title: str, max_retries: int = 4):
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


def download(url: str, dest: Path):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=20) as r:
        dest.write_bytes(r.read())


def main():
    rows = list(csv.DictReader(TSV.open(encoding='utf-8'), delimiter='\t'))
    print(f'{len(rows)} entries')
    for i, row in enumerate(rows, 1):
        aid = row['id']
        dest = OUT / f'{aid}.jpg'
        if dest.exists():
            continue
        query = row['title_en'] or row['title_jp']
        if not query:
            continue
        print(f'[{i}/{len(rows)}] {aid} {query[:50]}')
        m = search(query)
        if not m:
            # retry with JP title if EN failed
            if row['title_jp'] and row['title_jp'] != query:
                m = search(row['title_jp'])
        if not m:
            print('  no match')
            time.sleep(0.7)
            continue
        url = (m.get('coverImage') or {}).get('large')
        if not url:
            print('  no image')
            continue
        try:
            download(url, dest)
            print(f'  saved {dest.name}')
        except Exception as e:
            print(f'  ! download failed: {e}')
        time.sleep(1.5)  # AniList rate limit: 30 req/min (conservative)


if __name__ == '__main__':
    main()

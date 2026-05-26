"""Resolve each anime to (MAL page, streaming provider URL) via Jikan API.

Jikan is a free, unauthenticated mirror of MyAnimeList. We use:
  - /v4/anime?q=...        to find the canonical MAL ID
  - /v4/anime/<id>/streaming  to get curated "where to watch" links

Populates 4 new columns in data/anime.tsv:
  - mal_id
  - mal_url
  - watch_url       (best legal stream — prefers Crunchyroll over Netflix)
  - watch_provider  (e.g., "Crunchyroll", "Netflix")

Run:  PYTHONIOENCODING=utf-8 python3 tools/resolve_mal_streaming.py
"""
import csv
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

TSV = Path(__file__).resolve().parent.parent / 'data' / 'anime.tsv'
BASE = 'https://api.jikan.moe/v4'
UA = 'Mozilla/5.0 anime-cards/1.0'

# Order of preference when multiple providers exist.
PROVIDER_RANK = [
    'Crunchyroll', 'Netflix', 'Hulu', 'HIDIVE', 'Disney Plus',
    'Amazon Prime Video', 'Tubi TV', 'YouTube', 'VRV', 'Funimation',
]


def http(url: str):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        return {'_error': str(e)}


def search(query: str):
    """Return (mal_id, mal_url) of first hit, or (None, None)."""
    if not query:
        return None, None
    q = urllib.parse.quote(query)
    d = http(f'{BASE}/anime?q={q}&limit=1')
    if d.get('_error'):
        return None, None
    results = d.get('data', [])
    if not results:
        return None, None
    a = results[0]
    return a.get('mal_id'), a.get('url')


def streaming(mal_id: int):
    """Return (watch_url, provider_name) or (None, None)."""
    d = http(f'{BASE}/anime/{mal_id}/streaming')
    if d.get('_error'):
        return None, None
    options = d.get('data', [])
    if not options:
        return None, None
    # rank by preference
    def score(opt):
        name = opt.get('name', '')
        try:
            return PROVIDER_RANK.index(name)
        except ValueError:
            return len(PROVIDER_RANK)
    options.sort(key=score)
    pick = options[0]
    return pick.get('url'), pick.get('name')


def main():
    rows = list(csv.DictReader(TSV.open(encoding='utf-8'), delimiter='\t'))
    headers = list(rows[0].keys()) if rows else []
    for col in ('mal_id', 'mal_url', 'watch_url', 'watch_provider'):
        if col not in headers:
            headers.append(col)

    found_mal = 0
    found_watch = 0
    for i, r in enumerate(rows, 1):
        if r.get('mal_id'):
            print(f'[{i}/{len(rows)}] (skip) {r["id"]} mal={r["mal_id"]}')
            found_mal += 1
            if r.get('watch_url'):
                found_watch += 1
            continue
        query = r.get('title_en') or r.get('title_jp')
        mid, murl = search(query)
        if not mid and r.get('title_jp') and r.get('title_jp') != query:
            time.sleep(1.1)
            mid, murl = search(r['title_jp'])
        if mid:
            r['mal_id'] = str(mid)
            r['mal_url'] = murl or ''
            found_mal += 1
            time.sleep(1.1)
            wurl, prov = streaming(mid)
            r['watch_url'] = wurl or ''
            r['watch_provider'] = prov or ''
            if wurl:
                found_watch += 1
            tag = f'OK  {prov or "(no stream)"} '
        else:
            tag = '--  no MAL '
        print(f'[{i}/{len(rows)}] {tag:30s} {r["id"]} {(r.get("title_en") or "")[:45]}')
        time.sleep(1.1)

    with TSV.open('w', encoding='utf-8', newline='\n') as f:
        f.write('\t'.join(headers) + '\n')
        for r in rows:
            f.write('\t'.join(r.get(h, '') for h in headers) + '\n')
    print(f'\nMAL: {found_mal}/{len(rows)}   Streaming: {found_watch}/{len(rows)}')


if __name__ == '__main__':
    main()

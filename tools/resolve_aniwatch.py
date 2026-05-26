"""Resolve each anime entry to a direct aniwatch.co.at URL via sitemap match.

For each row in data/anime.tsv, search the aniwatch anime-sitemap for the
best-matching slug. If a confident match exists, store the URL in a new
column `aniwatch_url`; otherwise leave it blank (front-end falls back to
MAL search).

Run:  PYTHONIOENCODING=utf-8 python3 tools/resolve_aniwatch.py
"""
import csv
import re
import sys
import urllib.request
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TSV = ROOT / 'data' / 'anime.tsv'
SITEMAP = 'https://aniwatch.co.at/anime-sitemap.xml'
UA = 'Mozilla/5.0 (compatible; anime-cards/1.0)'


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode('utf-8', errors='replace')


def slug(s: str) -> str:
    s = s.lower()
    s = re.sub(r'[^a-z0-9]+', '-', s)
    return s.strip('-')


def load_index():
    xml = fetch(SITEMAP)
    urls = re.findall(r'<loc>(https://aniwatch\.co\.at/anime/[^<]+?)/?</loc>', xml)
    out = []
    for u in urls:
        s = u.rstrip('/').rsplit('/', 1)[-1]
        out.append((u + '/' if not u.endswith('/') else u, s))
    return out


STOPWORDS = {
    'the', 'a', 'an', 'of', 'in', 'and', 'to', 'is', 'i', 'my', 'on', 'at',
    'with', 'for', 'no', 'wa', 'ga', 'wo', 'ni', 'de', 'season', 'part',
    'movie', 'series', 'tv', 'special', 'final', 'sequel',
    '2', '3', '4', '5', 'ii', 'iii', 'iv',
}


def tokens(s: str) -> set:
    return {t for t in slug(s).split('-') if len(t) >= 3 and t not in STOPWORDS}


def find_best(en: str, jp: str, index):
    """Return (url, score, slug). Uses Jaccard on content tokens + char ratio."""
    queries = [c for c in (en, jp) if c]
    if not queries:
        return (None, 0.0, '')
    best = (None, 0.0, '')
    for q in queries:
        qt = tokens(q)
        qs = slug(q)
        if not qt:
            continue
        for url, sl in index:
            st = tokens(sl)
            if not st:
                continue
            inter = qt & st
            union = qt | st
            jac = len(inter) / len(union) if union else 0
            # require at least one shared "significant" token (>=5 chars)
            if not any(len(t) >= 5 for t in inter):
                continue
            char_sim = SequenceMatcher(None, qs, sl).ratio()
            score = 0.7 * jac + 0.3 * char_sim
            if score > best[1]:
                best = (url, score, sl)
    return best


def main():
    print('fetching sitemap…')
    index = load_index()
    print(f'{len(index)} anime entries in aniwatch sitemap')

    rows = list(csv.DictReader(TSV.open(encoding='utf-8'), delimiter='\t'))
    headers = list(rows[0].keys()) if rows else []
    if 'aniwatch_url' not in headers:
        headers.append('aniwatch_url')

    hits = 0
    for r in rows:
        url, score, sl = find_best(r.get('title_en', ''), r.get('title_jp', ''), index)
        if score >= 0.78:
            r['aniwatch_url'] = url
            hits += 1
            status = 'OK '
        else:
            r['aniwatch_url'] = ''
            status = '-- '
        title = (r.get('title_en') or r.get('title_jp'))[:50]
        print(f'{status} {r["id"]} {score:.2f} {title:50s} -> {sl[:60]}')

    out = TSV
    with out.open('w', encoding='utf-8', newline='\n') as f:
        f.write('\t'.join(headers) + '\n')
        for r in rows:
            f.write('\t'.join(r.get(h, '') for h in headers) + '\n')
    print(f'\n{hits}/{len(rows)} resolved; wrote {out}')


if __name__ == '__main__':
    main()

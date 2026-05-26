"""Resolve each anime to a direct aniwatch.co.at URL.

Strategy (in order, per entry):
  1. Query the site's own search-suggestions API with the English title,
     parse out the first /anime/ link.
  2. Same with Japanese title.
  3. Try direct slug guessing (multiple slug variants), accepting 200 or
     following 301 to a canonical /anime/ page.

If nothing matches, leave aniwatch_url blank (front-end falls back to MAL).

Run:  PYTHONIOENCODING=utf-8 python3 tools/resolve_aniwatch.py
"""
import csv
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TSV = ROOT / 'data' / 'anime.tsv'
BASE = 'https://aniwatch.co.at'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120'


def http(url: str, follow: bool = True, timeout: int = 12):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    opener = urllib.request.build_opener()
    if not follow:
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *a, **k): return None
        opener = urllib.request.build_opener(NoRedirect)
    try:
        with opener.open(req, timeout=timeout) as r:
            return r.status, r.headers, r.read().decode('utf-8', errors='replace')
    except urllib.error.HTTPError as e:
        return e.code, e.headers, ''
    except Exception:
        return 0, {}, ''


def search_api(keyword: str):
    """Return list of anime URLs from the site's autocomplete API."""
    if not keyword:
        return []
    q = urllib.parse.quote(keyword)
    url = f'{BASE}/wp-json/hianime/v1/search/suggestions?keyword={q}'
    code, _, body = http(url)
    if code != 200:
        return []
    try:
        d = json.loads(body)
    except Exception:
        return []
    html = d.get('html', '') if d.get('success') else ''
    return list(dict.fromkeys(
        re.findall(r'href="(https://aniwatch\.co\.at/anime/[^"#]+?)/?"', html)
    ))


def slug_variants(en: str, jp: str):
    candidates = []
    seeds = [s for s in (en, jp) if s]
    for s in seeds:
        s_low = s.lower()
        base = re.sub(r"[^a-z0-9]+", '-', s_low).strip('-')
        if base:
            candidates.append(base)
        # without leading articles
        m = re.match(r'^the[-\s]+(.+)$', s_low)
        if m:
            candidates.append(re.sub(r"[^a-z0-9]+", '-', m.group(1)).strip('-'))
        # first significant word
        words = re.findall(r'[a-z0-9]{4,}', s_low)
        if words:
            candidates.append(words[0])
    return list(dict.fromkeys(candidates))


def try_slug(slug: str):
    """Return canonical /anime/<slug>/ URL if exists (handles 301)."""
    if not slug:
        return None
    url = f'{BASE}/anime/{slug}/'
    # Don't follow at first - we want to see 200 vs 301 vs 404
    code, headers, _ = http(url, follow=False)
    if code == 200:
        return url
    if code in (301, 302):
        loc = headers.get('Location') or headers.get('location')
        if loc and '/anime/' in loc:
            # validate that target is 200
            c2, _, _ = http(loc, follow=False)
            if c2 == 200:
                return loc
    return None


def resolve(en: str, jp: str):
    # Use the site's search-suggestions API only — slug guessing on bare
    # words like "love" / "fate" / "miss" triggers misleading redirects.
    for q in (en, jp):
        if not q:
            continue
        hits = search_api(q)
        for h in hits:
            if not h.endswith('/'):
                h += '/'
            return h
    return ''


def main():
    rows = list(csv.DictReader(TSV.open(encoding='utf-8'), delimiter='\t'))
    headers = list(rows[0].keys()) if rows else []
    if 'aniwatch_url' not in headers:
        headers.append('aniwatch_url')

    hits = 0
    for i, r in enumerate(rows, 1):
        prev = r.get('aniwatch_url', '')
        if prev:  # keep already-resolved ones (sub-agent fills may go here)
            print(f'[{i}/{len(rows)}] {r["id"]} (keep) {prev}')
            hits += 1
            continue
        url = resolve(r.get('title_en', ''), r.get('title_jp', ''))
        r['aniwatch_url'] = url
        status = 'OK ' if url else '-- '
        print(f'[{i}/{len(rows)}] {status} {r["id"]} {r.get("title_en","")[:45]:45s} -> {url or "no match"}')
        if url:
            hits += 1
        time.sleep(0.4)

    with TSV.open('w', encoding='utf-8', newline='\n') as f:
        f.write('\t'.join(headers) + '\n')
        for r in rows:
            f.write('\t'.join(r.get(h, '') for h in headers) + '\n')
    print(f'\n{hits}/{len(rows)} resolved')


if __name__ == '__main__':
    main()

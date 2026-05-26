"""list.md (Notion export) -> data/anime.tsv

Reads the anime list markdown (categorized H3 sections + bullet items) and
emits a TSV with: id\ttitle_en\ttitle_jp\tcategory
"""
import re
import os
import sys
from pathlib import Path

SRC = Path(os.path.expanduser('~/Box/private/personal-data/anime/list.md'))
OUT = Path(__file__).resolve().parent.parent / 'data' / 'anime.tsv'


def parse(text: str):
    rows = []
    cat = ''
    seq = 0
    for line in text.splitlines():
        s = line.strip()
        if s.startswith('### '):
            cat = s[4:].strip()
            continue
        if not s.startswith('- '):
            continue
        item = s[2:].strip()
        m = re.match(r'^(.+?)\s*[（(]([^（）()]+)[)）]\s*(?:※.*)?$', item)
        if m:
            en = m.group(1).strip()
            jp = m.group(2).strip()
        else:
            en = item
            jp = ''
        seq += 1
        rows.append((f'A{seq:04d}', en, jp, cat))
    return rows


def main():
    text = SRC.read_text(encoding='utf-8')
    rows = parse(text)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open('w', encoding='utf-8', newline='\n') as f:
        f.write('id\ttitle_en\ttitle_jp\tcategory\n')
        for r in rows:
            f.write('\t'.join(r) + '\n')
    print(f'wrote {OUT} ({len(rows)} entries)')


if __name__ == '__main__':
    main()

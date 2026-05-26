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
        item = re.sub(r'\s*※.*$', '', item)  # drop trailing annotations
        # find first opening paren and last closing paren (handles nested parens)
        open_idx = -1
        for i, ch in enumerate(item):
            if ch in '（(':
                open_idx = i; break
        close_idx = -1
        for i in range(len(item) - 1, -1, -1):
            if item[i] in '）)':
                close_idx = i; break
        if open_idx >= 0 and close_idx > open_idx:
            en = item[:open_idx].strip()
            jp = item[open_idx + 1:close_idx].strip()
        else:
            en = item.strip(); jp = ''
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

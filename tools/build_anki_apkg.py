"""jp-celebs-cards から Anki .apkg を生成する.

入力:
  data/cards.tsv   ... id\tname\tyomi\tcategory (BOM 付き)
  data/attr_map.json (任意) ... { id: "ファイル名" } のマッピング
  images/<id>.{jpg,png} ... 顔画像

出力:
  out/jp-celebs.apkg

カード設計:
  - Front: 顔画像のみ
  - Back : 名前 + 読み + カテゴリ
  - Deck : 芸能人::<カテゴリ>

実行:
  PYTHONIOENCODING=utf-8 python tools/build_anki_apkg.py
"""

from __future__ import annotations

import csv
import hashlib
import json
import sys
from pathlib import Path

import genanki  # type: ignore[import-untyped]

ROOT = Path(__file__).resolve().parent.parent
TSV = ROOT / "data" / "cards.tsv"
MAP = ROOT / "data" / "attr_map.json"
IMAGES = ROOT / "images"
OUT = ROOT / "out" / "jp-celebs.apkg"


def stable_id(name: str) -> int:
    return int.from_bytes(hashlib.sha256(name.encode("utf-8")).digest()[:4], "big") & 0x7FFFFFFF


CARD_CSS = """
.card {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI',
               'Hiragino Sans', 'Yu Gothic UI', 'Noto Sans JP', sans-serif;
  font-size: 24px;
  line-height: 1.7;
  color: #1a1a1a;
  background: #fafafa;
  padding: 32px 16px;
  text-align: center;
}
.nightMode.card, .night_mode .card {
  color: #eaeaea;
  background: #1f2125;
}
.wrap { max-width: 720px; margin: 0 auto; }
.face img {
  max-width: 360px;
  max-height: 420px;
  width: auto;
  height: auto;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.18);
}
.name { font-size: 32px; font-weight: 700; margin-top: 8px; }
.yomi { font-size: 18px; color: #666; margin-top: 4px; }
.nightMode.card .yomi, .night_mode .card .yomi { color: #aaa; }
.category {
  margin-top: 14px;
  font-size: 13px;
  color: #888;
  letter-spacing: 0.05em;
}
.nightMode.card .category, .night_mode .card .category { color: #888; }
hr#answer {
  margin: 22px auto;
  max-width: 720px;
  border: none;
  border-top: 1px solid #ccc;
}
.nightMode.card hr#answer, .night_mode .card hr#answer { border-color: #444; }
""".strip()


MODEL = genanki.Model(
    stable_id("jp-celebs::face-to-name"),
    "JP Celebs (Face → Name)",
    fields=[
        {"name": "ID"},
        {"name": "Image"},
        {"name": "Name"},
        {"name": "Yomi"},
        {"name": "Category"},
    ],
    templates=[
        {
            "name": "Face → Name",
            "qfmt": '<div class="wrap"><div class="face">{{Image}}</div></div>',
            "afmt": (
                '<div class="wrap"><div class="face">{{Image}}</div></div>'
                "<hr id=\"answer\">"
                '<div class="wrap">'
                '<div class="name">{{Name}}</div>'
                '<div class="yomi">{{Yomi}}</div>'
                '<div class="category">{{Category}}</div>'
                "</div>"
            ),
        },
    ],
    css=CARD_CSS,
)


def load_attr_map() -> dict[str, str]:
    if not MAP.exists():
        return {}
    text = MAP.read_text(encoding="utf-8-sig")
    return json.loads(text)


def resolve_image(cid: str, attr_map: dict[str, str]) -> Path | None:
    if cid in attr_map:
        p = IMAGES / attr_map[cid]
        if p.exists():
            return p
    for ext in ("jpg", "jpeg", "png", "webp"):
        p = IMAGES / f"{cid}.{ext}"
        if p.exists():
            return p
    return None


def main() -> int:
    if not TSV.exists():
        print(f"!! cards.tsv not found: {TSV}", file=sys.stderr)
        return 1

    attr_map = load_attr_map()

    # 1 deck per category
    decks: dict[str, genanki.Deck] = {}
    media: list[str] = []
    missing: list[str] = []
    n_cards = 0

    with TSV.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            cid = (row.get("id") or "").strip()
            name = (row.get("name") or "").strip()
            yomi = (row.get("yomi") or "").strip()
            category = (row.get("category") or "未分類").strip()
            if not cid or not name:
                continue
            img = resolve_image(cid, attr_map)
            if img is None:
                missing.append(f"{cid} {name}")
                continue

            media.append(str(img))

            deck_name = f"芸能人::{category}"
            deck = decks.get(deck_name)
            if deck is None:
                deck = genanki.Deck(stable_id(deck_name), deck_name)
                decks[deck_name] = deck

            img_tag = f'<img src="{img.name}">'
            note = genanki.Note(
                model=MODEL,
                fields=[cid, img_tag, name, yomi, category],
                guid=genanki.guid_for("jp-celebs", cid),
            )
            deck.add_note(note)
            n_cards += 1

    if not decks:
        print("カードが 1 枚も作れませんでした.", file=sys.stderr)
        return 1

    OUT.parent.mkdir(parents=True, exist_ok=True)
    pkg = genanki.Package(list(decks.values()))
    pkg.media_files = media
    pkg.write_to_file(str(OUT))

    print(f"OK  wrote {OUT.relative_to(ROOT)}")
    print(f"    decks  : {len(decks)}")
    print(f"    cards  : {n_cards}")
    print(f"    media  : {len(media)}")
    if missing:
        print(f"    missing: {len(missing)} (画像なし — skip)")
        for m in missing[:5]:
            print(f"             - {m}")
        if len(missing) > 5:
            print(f"             ... and {len(missing)-5} more")
    print()
    print("Deck breakdown:")
    for name in sorted(decks):
        print(f"  [{len(decks[name].notes):3d}] {name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

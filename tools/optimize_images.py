#!/usr/bin/env python3
"""画像を長辺 MAX_EDGE px に縮小して再エンコードする（in-place）。

- JPEG: quality=82, optimize, progressive
- PNG : 写真は JPEG 相当には縮まないが、リサイズだけで大幅減
拡張子・ファイル名は変えない（app.js の state.map が壊れるため）。
EXIF の向きは焼き込み、JPEG 保存時は RGB に変換する。
"""
import io
import sys
from pathlib import Path
from PIL import Image, ImageOps

MAX_EDGE = 800
JPEG_QUALITY = 82
IMG_DIR = Path(__file__).resolve().parent.parent / "images"


def optimize(path: Path) -> tuple[int, int]:
    before = path.stat().st_size
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im)
        im.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)
        ext = path.suffix.lower()
        buf = io.BytesIO()
        if ext in (".jpg", ".jpeg"):
            if im.mode not in ("RGB", "L"):
                im = im.convert("RGB")
            im.save(buf, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
        elif ext == ".png":
            im.save(buf, "PNG", optimize=True)
        else:
            return before, before
    data = buf.getvalue()
    # 縮小できた時だけ書き戻す
    if len(data) < before:
        path.write_bytes(data)
        return before, len(data)
    return before, before


def main() -> int:
    files = sorted(p for p in IMG_DIR.iterdir()
                   if p.suffix.lower() in (".jpg", ".jpeg", ".png"))
    total_before = total_after = 0
    for p in files:
        b, a = optimize(p)
        total_before += b
        total_after += a
        print(f"{p.name:14} {b/1024:8.0f}KB -> {a/1024:7.0f}KB")
    mb = 1024 * 1024
    print(f"\nTOTAL {total_before/mb:.1f}MB -> {total_after/mb:.1f}MB "
          f"({total_after/total_before*100:.1f}%)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

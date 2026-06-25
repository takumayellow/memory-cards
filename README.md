# jp-celebs-cards

日本の芸能人を暗記するためのローカル学習ツール。
フラッシュカード形式で顔と名前を照合しながら覚えられます。

- `index.html`: 単一ファイルのフロントエンド
- `data/cards.tsv`: 名簿（タブ区切り）
- `tools/*.ps1`: ビルド・画像取得・公開スクリプト（**Windows 限定**）

> 画像は既定ではリポジトリに含めません（`images/` は .gitignore）。
> 必要なら Git LFS で追跡してください（`tools/publish_github.ps1 -IncludeImages`）。

---

## 公開サイト

**[→ サイトを開く](https://takumayellow.github.io/memory-cards/)**

---

## セットアップ

### 起動方法

```bash
# ブラウザで直接開く
open index.html

# またはローカルサーバーで開く
python -m http.server 8080
# → http://localhost:8080 にアクセス
```

### 画像の準備

1. `images/` ディレクトリに `.jpg` または `.png` 形式で画像を配置します。
2. `tools/` のスクリプトを実行して `data/attr_map.json` を自動生成します。
3. `index.html` に画像ローダのインラインパッチが自動挿入されます。

---

## カスタムデッキ（インポート機能）

### 概要

自分で用意したデータをもとにオリジナルデッキを作れます。ブラウザ内で完結するため、サーバーのセットアップは不要です。

### 対応フォーマット

TSV・CSV・JSON の 3 種類をサポートしています。

### 列定義

| 列名 | 必須 | 説明 |
|------|------|------|
| `name` | ○ | カード表面に表示する名前 |
| `yomi` | — | よみがな（任意） |
| `category` | — | カテゴリ（フィルタに使用、任意） |
| `imageUrl` | — | 画像の URL（`https://...`、任意） |

### インポート手順

1. ヘッダーの「デッキ」ドロップダウン横の「＋ インポート」ボタンをクリック
2. TSV / CSV / JSON ファイルを選択
3. インポート完了後、デッキが自動切り替わる
4. ページをリロードしてもデッキは保持される（localStorage）

### テンプレート

`templates/` ディレクトリにサンプルファイルが用意されています。

- `templates/sample.tsv`
- `templates/sample.csv`
- `templates/sample.json`

アプリ内の「↓ テンプレ」ボタンからも直接ダウンロードできます。

### 注意事項

- インポートデータはブラウザの localStorage に保存されます（他のデバイスとは共有されません）
- 画像は外部 URL 参照のみ対応しています（ローカルファイルの埋め込みは非対応）
- 1 デッキあたりのカード数に上限はありませんが、localStorage の容量制限（通常 5MB）に注意してください

---

## tools/*.ps1 スクリプト一覧

| スクリプト | 説明 |
|---|---|
| `tools/build.ps1` | `data/cards.tsv` を読み込み `data/data.js` を生成 |
| `tools/fetch_images.ps1` | TSV の名前をもとに画像を取得し `images/` に保存 |
| `tools/fetch_images_v3.ps1` | 画像取得の改良版（Wikidata 経由でQIDを解決） |
| `tools/publish_github.ps1` | GitHub リポジトリ作成・push・GitHub Pages 公開 |

---

## 画像が表示されない問題の解決策（inline loader + filename map）

このサイトでは「カードの id と実ファイル名（拡張子違い・ゼロ埋め差など）」が一致しないことで
`画像なし` になるケースがあります。
**対策**として、次の2点を導入しています。

1. `images/` をスキャンして `data/attr_map.json` を自動生成（`{ id: "ファイル名" }` の辞書）
2. `index.html` に **画像ローダのインラインパッチ** を自動挿入
   - まず `data/attr_map.json` を読み込む
   - 表示したい **id** が来たら `map[id]` でファイル名を取得して `#face` に表示
   - map に無ければ `id.jpg → id.png` の順で HEAD で存在確認（フォールバック）
   - `#noimg` の表示/非表示を自動切替
   - 強制キャッシュバスト `?v=<timestamp>`

> パッチは `<!-- images patch: loader + map -->` というマーカー付きで注入され、
> 二重挿入されないようになっています（idempotent）。

---

## ターミナル一発実行

Windows の場合、`tools/publish_github.ps1` を使って GitHub Pages への公開まで一括で行えます。

```powershell
cd tools
.\publish_github.ps1 -RepoOwner "<your-github-username>"
```

---

### 使い方（フロー）

1. **スクリプトを実行**（上の「ターミナル一発実行」を参照）
   - `images/` から `data/attr_map.json` を再生成
   - `index.html` にローダを注入（未挿入のときだけ）
   - 変更があれば `commit & push`
   - 公開サイトでランダムサンプルを HEAD=200 で検証
2. ページ側の **「現在のカード id」をローダへ伝える** ために、どちらかを呼ぶ
   - 方式A（イベント）：
     `document.dispatchEvent(new CustomEvent('cards:show', { detail:{ id } }))`
   - 方式B（属性監視）：
     `document.body.setAttribute('data-id', id)`
3. 以降はカード切替のたびにローダが自動で画像を解決して表示します。

### 前提/前置き

- 画像は `images/` に置く（`.jpg` / `.png` 対応）
- GitHub Pages は `https://<user>.github.io/jp-celebs-cards/` で公開
- 画像を LFS 管理にしていない（LFS のままでも動くが HEAD 200 の検証で注意）

### 動作確認のしかた

```js
// コンソールで任意のカードをテスト
document.dispatchEvent(new CustomEvent('cards:show', { detail: { id: '0001' } }))
// または
document.body.setAttribute('data-id', '0001')
```

### ロールバック

`index.html` はバックアップ `index.html.bak-YYYYMMDDhhmmss` を作ってから上書きします。
何かあればそのバックアップで戻せます。

---

## 関連ゲームリポジトリ

takumayellow が公開しているブラウザゲーム・インタラクティブコンテンツのリンク集です。

| リポジトリ | 説明 | デモ |
|---|---|---|
| [slot-game](https://github.com/takumayellow/slot-game) | ネオン路地テーマの3リールスロット。招き猫ディーラー「ミケ」付き。VOICEVOX（春日部つむぎ）連携対応 | [Play](https://takumayellow.github.io/slot-game/) |
| [memory-cards](https://github.com/takumayellow/memory-cards) | 日本の芸能人フラッシュカード学習ツール（このリポジトリ） | [Play](https://takumayellow.github.io/memory-cards/) |
| [syncadence-rhythm](https://github.com/takumayellow/syncadence-rhythm) | プロセカ風リズムゲーム。MusicXML / MIDI を読み込んで斜め4レーンでプレイ | [Play](https://takumayellow.github.io/syncadence-rhythm/) |

### 各ゲームの特徴比較

| | slot-game | memory-cards | syncadence-rhythm |
|---|---|---|---|
| 技術スタック | Vanilla JS | Vanilla JS / HTML | React + TypeScript + Vite |
| 音声 | VOICEVOX（つむぎ）| なし | MusicXML / MIDI / MP3 |
| 入力 | マウス / タップ | マウス / タップ | キーボード（D/F/J/K） |
| ファイル読込 | なし | TSV | MusicXML / MXL / MIDI |
| GitHub Pages | 公開済み | 公開済み | 公開済み |
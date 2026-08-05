# かな — Kana Practice

A Japanese kana recognition drill for hiragana and katakana. Open it, pick a deck, answer until
the deck is done. It runs entirely in the browser — no backend, no build step, no dependencies,
no accounts, nothing leaves the device.

## Running it

It has to be served over HTTP. Browsers block `fetch()` on `file://` pages, so double-clicking
`index.html` shows a load error instead of the app.

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>. Any static file server works, and the folder can be dropped
straight onto GitHub Pages, Netlify or similar.

You need a CJK-capable font installed for the kana to render at all — every desktop and mobile OS
ships one by default.

## The drill

Six decks, 214 cards, in three tiers per script:

| Deck | Cards | What's in it |
|---|---|---|
| Base | 46 | the gojūon — あ か さ た な は ま や ら わ ん |
| Dakuten | 25 | voiced and semi-voiced — が ざ だ ば ぱ |
| Combination | 36 | yōon, the contracted sounds — きゃ しゅ ちょ |

Obsolete kana (ゐ ゑ ヰ ヱ and the archaic forms) are left out on purpose — you will not meet them
in modern Japanese.

**Three ways to answer**, switchable on the menu:

- **Typing** — the character is shown, you type its sound. Alternate romanisations are accepted,
  so `si`, `shi`, `hu`, `fu`, `sya`, `sha` and `nn` all count.
- **Choosing** — the character is shown, you pick its sound from four options. The default on
  phones, where typing is slow.
- **Writing** — the *sound* is shown and you type the character. This is the one that builds
  familiarity with a Japanese keyboard, so it needs an IME: switch to the Japanese keyboard on a
  phone, or a Japanese input method on a desktop. Both readings of an ambiguous sound are
  accepted — `ji` takes じ or ぢ, `zu` takes ず or づ.

**Flick keyboard drills — phones and tablets only.** Below the decks, on a touch device, are two
drills for the Japanese phone keyboard itself, which has ten keys — one per gojūon row — where the
vowel comes from the direction you swipe: middle **a**, left **i**, up **u**, right **e**, down
**o**. Each drill is 20 prompts and needs the Japanese keyboard. They don't appear on a desktop:
there's no flicking to practise with a physical keyboard.

- **Flick directions** shows a vowel — A, I, U, E or O — and takes *any* character with that
  vowel. Prompted with O, everything from お to こ そ と の ほ も よ ろ counts; つ counts for U and
  め for E. Only the ending matters, so you're practising the swipe, not recalling a character.
- **Flick keys** is the reverse: it shows a key — A, K, S, T, N, H, M, Y, R, W — and takes any
  character from that row, so K takes か き く け こ. Voiced characters live on their base key, so
  が also counts for K, and ぱ for H. The keys are named for the row, not for how the characters
  are spelt in romaji, which is the point: ふ is on **H** even though it's written "fu", し is on
  **S** despite "shi", and ち and つ are on **T**.

Each drill keeps its own best score and time, separate from the decks and from each other. ん
isn't drilled: it has no vowel, and which key it sits on varies between keyboards.

In the two typing modes the answer box takes focus on every card, so you can type straight through
a deck without tapping it again each time. On a phone the keyboard stays up for the whole run —
tapping Check, Reveal or the character to continue won't dismiss it. If you close it yourself it
stays closed until you tap the box again. Reveal is always available and counts as a miss — on a
phone it sits above the character, clear of the on-screen keyboard, and under the answer box
everywhere else. Anything you got wrong is listed at the end and can be drilled on its own.

**Records are kept separately for each mode.** Recognising a character, picking it from four
options, and writing it from its sound are three different skills, so each deck keeps a separate
best score and best time per mode — a Choosing run can't set the bar for your Writing runs. The
figures on the menu are for whichever mode is selected, and they're labelled with it; switching
mode switches the numbers.

A time is only recorded for a run with no mistakes at all, so a rushed or revealed-answer run
can't set a record that's impossible to beat honestly. The run is timed the whole way through and
the clock is deliberately never shown while you're practising; a ticking counter turns practice
into a race. Missed drills don't count towards records.

**Reference chart.** "All characters & romaji" opens the full gojūon tables, laid out the standard
way, including the extended katakana (ファ ティ ヴァ …) that are reference-only.

**Character font.** Kana look quite different across faces, and recognising あ in only one of them
isn't recognising あ. The font picker offers the Japanese faces actually installed on your device —
it renders each candidate to a canvas and compares the pixels, so anything missing, or identical
to an option already listed, is not offered. How many you get therefore varies by platform;
Windows ships no Japanese serif or textbook face unless the *Japanese Supplemental Fonts* optional
feature is installed.

Everything is stored in one localStorage entry on your own device. Clearing site data resets it.

## Layout

```
index.html    four screens and two dialogs
styles.css    the whole stylesheet, mobile-first
kana.json     all content — decks, cards, chart layout, font options
app.js        all logic, one IIFE
```

That's the whole app — four files, no dependencies to install and nothing to build. `kana.json` is
the only place content lives; `app.js` renders whatever deck it's handed. Adding a deck, accepting
another romanisation, or changing the chart is a JSON edit, not a code change.

Design notes and the invariants worth knowing before changing anything are in
[CLAUDE.md](CLAUDE.md).

---

# ニホンゴ (カタカナ ダケ)

カナ — カナ レンシュウ

ヒラガナ ト カタカナ ノ ニンシキ ドリル デス。ヒライテ、デッキ ヲ エランデ、デッキ ガ オワル マデ
コタエマス。スベテ ブラウザ ノ ナカ ダケ デ ウゴキマス。バックエンド モ ビルド モ イゾン ライブラリ
モ アカウント モ アリマセン。データ ハ タンマツ カラ デマセン。

*(カナ ノ レイ ハ アプリ ガ ジッサイ ニ ツカウ モジ ナ ノデ、ソノママ ノコシテ アリマス。)*

## ジッコウ ホウホウ

HTTP ケイユ デ ハイシン スル ヒツヨウ ガ アリマス。ブラウザ ハ `file://` ページ デノ `fetch()` ヲ
ブロック スル ノデ、`index.html` ヲ ダブルクリック スル ト アプリ デハ ナク エラー ガ デマス。

```bash
python -m http.server 8000
```

ソノ アト <http://localhost:8000> ヲ ヒライテ クダサイ。セイテキ ファイル サーバー ナラ ナン デモ
ウゴキ、フォルダ ヲ ソノママ GitHub Pages ヤ Netlify ニ オケマス。

カナ ヲ ヒョウジ スル ニハ CJK タイオウ ノ フォント ガ ヒツヨウ デス ガ、イマ ノ デスクトップ ト
モバイル ノ OS ニハ ヒョウジュン デ ハイッテ イマス。

## ドリル ノ ナイヨウ

デッキ ハ 6ツ、カード ハ ゼンブ デ 214マイ。モジ シュルイ ゴト ニ 3ダンカイ アリマス。

| デッキ | カード | ナイヨウ |
|---|---|---|
| キホン | 46 | ゴジュウオン — あ か さ た な は ま や ら わ ん |
| ダクテン | 25 | ダクオン ト ハンダクオン — が ざ だ ば ぱ |
| ヨウオン | 36 | チイサイ カナ ノ クミアワセ — きゃ しゅ ちょ |

ツカワレナク ナッタ カナ (ゐ ゑ ヰ ヱ ナド) ハ ワザト イレテ イマセン。イマ ノ ニホンゴ デハ
デテ キマセン。

**コタエカタ ハ 3シュルイ**、メニュー デ キリカエラレマス。

- **タイピング** — モジ ガ デテ、ソノ ヨミカタ ヲ ローマジ デ ニュウリョク シマス。ベツ ノ ツヅリ
  モ ウケツケル ノデ、`si`、`shi`、`hu`、`fu`、`sya`、`sha`、`nn` ドレ デモ セイカイ デス。
- **センタク** — モジ ガ デテ、4ツ ノ センタクシ カラ ヨミカタ ヲ エラビマス。スマホ デハ
  ニュウリョク ガ オソイ ノデ、コレ ガ キホン ニ ナリマス。
- **ライティング** — ヨミカタ ノ ホウ ガ デテ、モジ ヲ ニュウリョク シマス。ニホンゴ キーボード ニ
  ナレル タメ ノ モード ナ ノデ IME ガ ヒツヨウ デス。ヨミ ガ カサナル トキ ハ リョウホウ
  ウケツケマス。`ji` ハ じ デモ ぢ デモ、`zu` ハ ず デモ づ デモ セイカイ デス。

**フリック キーボード ノ ドリル — スマホ ト タブレット ダケ。** タッチ タンマツ デハ デッキ ノ シタ
ニ フリック ニュウリョク ノ ドリル ガ 2ツ デマス。ニホンゴ ノ ケータイ キーボード ハ ゴジュウオン ノ
ギョウ ゴト ニ 10コ ノ キー ガ アリ、ボイン ハ フリック ノ ホウコウ デ キマリマス。マンナカ ガ **ア**、
ヒダリ ガ **イ**、ウエ ガ **ウ**、ミギ ガ **エ**、シタ ガ **オ** デス。カク ドリル ハ 20モン デ、
ニホンゴ キーボード ガ ヒツヨウ デス。デスクトップ デハ デマセン。ブツリ キーボード デハ フリック
スル モノ ガ ナイ カラ デス。

- **フリック ノ ホウコウ** ハ ボイン (A I U E O) ヲ ミセ、ソノ ボイン デ オワル モジ ナラ ナン デモ
  セイカイ デス。O ナラ お こ そ と の ほ も よ ろ ナド ゼンブ、つ ハ U、め ハ E ニ ナリマス。
  オワリ ダケ ガ ダイジ ナ ノデ、モジ ヲ オモイダス レンシュウ デハ ナク フリック ノ レンシュウ
  ニ ナリマス。
- **フリック ノ キー** ハ ソノ ギャク デ、キー (A K S T N H M Y R W) ヲ ミセ、ソノ ギョウ ノ モジ
  ナラ ナン デモ セイカイ デス。K ナラ か き く け こ。ダクオン ハ モト ノ キー ニ アル ノデ、
  が モ K、ぱ ハ H デス。キー ノ ナマエ ハ ローマジ ノ ツヅリ デハ ナク ギョウ ニ モトヅイテ
  イマス。ソレ ガ ネライ デ、ふ ハ "fu" ト カク ケド **H**、し ハ "shi" デモ **S**、ち ト つ ハ
  **T** デス。

カク ドリル ハ デッキ トモ タガイ トモ ベツ ニ ベスト スコア ト タイム ヲ モチマス。ん ハ ドリル ニ
フクメテ イマセン。ボイン ガ ナク、ドノ キー ニ アル カ ハ キーボード ニ ヨッテ チガウ カラ デス。

ニュウリョク スル 2ツ ノ モード デハ カード ゴト ニ ニュウリョク ラン ヘ フォーカス ガ ウツル ノデ、
マイカイ タップ セズ ニ ソノママ ウチツヅケラレマス。スマホ デハ ラン ノ アイダ キーボード ガ デタ
ママ ニ ナリ、チェック、コタエ ヲ ミル、モジ ヲ タップ シテ ススム — ドレ デモ キーボード ハ
キエマセン。ジブン デ トジタ トキ ハ、モウ イチド ニュウリョク ラン ヲ タップ スル マデ トジタ ママ
デス。「コタエ ヲ ミル」ハ イツ デモ ツカエマス ガ マチガイ アツカイ ニ ナリマス。スマホ デハ モジ ノ
ウエ、ソレ イガイ デハ ニュウリョク ラン ノ シタ ニ デマス。マチガエタ モノ ハ サイゴ ニ イチラン
サレ、ソレ ダケ ヲ レンシュウ デキマス。

**キロク ハ モード ゴト ニ ベツ デス。** モジ ヲ ミテ ヨム、4ツ カラ エラブ、ヨミ カラ カク — コノ
3ツ ハ チガウ スキル ナ ノデ、デッキ ゴト ニ モード ベツ ノ ベスト スコア ト ベスト タイム ヲ
モチマス。センタク ノ キロク ガ ライティング ノ キジュン ニ ナル コト ハ アリマセン。メニュー ノ
スウジ ハ エランデ イル モード ノ モノ デ、ラベル モ ツイテ イマス。モード ヲ カエル ト スウジ モ
カワリマス。

タイム ハ ミス ガ ヒトツ モ ナイ ラン ダケ キロク サレマス。イソイダリ コタエ ヲ ミタリ シタ ラン
ガ、ゼッタイ ニ カテナイ キロク ヲ ノコサナイ タメ デス。ラン ハ ツネ ニ ケイソク サレテ イマス ガ、
レンシュウ チュウ ニ トケイ ハ ワザト ヒョウジ シマセン。ススム カウンター ガ アル ト レンシュウ ガ
キョウソウ ニ ナル カラ デス。マチガイ ダケ ノ レンシュウ ハ キロク ニ ハイリマセン。

**イチラン ヒョウ。** 「All characters & romaji」デ ゴジュウオン ノ ヒョウ ガ ヒラキマス。
ヒョウジュン ノ ナラビ デ、サンショウ ヨウ ノ カクチョウ カタカナ (ファ ティ ヴァ ナド) モ
ハイッテ イマス。

**モジ ノ フォント。** カナ ハ ショタイ ニ ヨッテ カナリ ミエカタ ガ チガイ、ヒトツ ノ ショタイ デ
ダケ あ ガ ワカッテ モ、ワカッタ コト ニハ ナリマセン。フォント センタク デハ タンマツ ニ ジッサイ
ニ ハイッテ イル ニホンゴ ショタイ ダケ ヲ ダシマス。コウホ ヲ キャンバス ニ ビョウガ シテ ピクセル
ヲ ヒカク シ、ナイ モノ ヤ スデ ニ アル モノ ト オナジ ミエカタ ノ モノ ハ ダシマセン。ソノ タメ
カズ ハ カンキョウ ニ ヨリマス。Windows ハ *Japanese Supplemental Fonts* ヲ イレナイ カギリ、
ミンチョウ ヤ キョウカショタイ ガ ハイッテ イマセン。

データ ハ タンマツ ノ localStorage ニ ヒトツ ダケ ホゾン サレマス。サイト データ ヲ ケス ト
リセット サレマス。

## ファイル コウセイ

```
index.html    4ツ ノ ガメン ト 2ツ ノ ダイアログ
styles.css    スタイル ゼンブ、モバイル ファースト
kana.json     ナイヨウ ゼンブ — デッキ、カード、ヒョウ ノ レイアウト、フォント
app.js        ロジック ゼンブ、IIFE ヒトツ
```

コレ ダケ デ アプリ ゼンタイ デス。インストール スル イゾン モ、ビルド モ アリマセン。ナイヨウ ハ
`kana.json` ダケ ニ アリ、`app.js` ハ ワタサレタ デッキ ヲ ソノママ ヒョウジ シマス。デッキ ヲ
フヤス、ベツ ノ ツヅリ ヲ ウケツケル、ヒョウ ヲ カエル — ドレ モ JSON ノ ヘンシュウ デ、コード ノ
ヘンコウ デハ アリマセン。

セッケイ ノ メモ ト、カエル マエ ニ シッテ オク ベキ フヘン ジョウケン ハ [CLAUDE.md](CLAUDE.md)
ニ アリマス。

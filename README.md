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

# 日本語

**かな — Kana Practice**

ひらがなとカタカナの認識ドリルです。開いて、デッキを選び、終わるまで答えるだけ。すべてブラウザ内
で動作します。バックエンドもビルドも依存ライブラリもアカウントもなく、データが端末の外に出ること
はありません。

## 動かし方

HTTP 経由で配信する必要があります。ブラウザは `file://` ページでの `fetch()` をブロックするため、
`index.html` をダブルクリックしても、アプリではなくエラー画面が出ます。

```bash
python -m http.server 8000
```

あとは <http://localhost:8000> を開いてください。静的ファイルサーバーなら何でも動き、フォルダごと
GitHub Pages や Netlify に置けます。

かなを表示するには CJK 対応フォントが必要ですが、いまのデスクトップ・モバイル OS には標準で入って
います。

## ドリルの内容

デッキは 6 つ、カードは全部で 214 枚。文字種ごとに 3 段階あります。

| デッキ | カード | 内容 |
|---|---|---|
| 基本 | 46 | 五十音 — あ か さ た な は ま や ら わ ん |
| 濁点 | 25 | 濁音と半濁音 — が ざ だ ば ぱ |
| 拗音 | 36 | 小さいかなの組み合わせ — きゃ しゅ ちょ |

使われなくなったかな（ゐ ゑ ヰ ヱ や古い字形）は意図的に外してあります。現代の日本語では出てきま
せん。

**答え方は 3 種類**、メニューで切り替えられます。

- **タイピング** — 文字が出るので、その読みをローマ字で入力します。別の綴りも受け付けるので、
  `si`、`shi`、`hu`、`fu`、`sya`、`sha`、`nn` のどれでも正解です。
- **選択** — 文字が出るので、4 つの選択肢から読みを選びます。入力の遅いスマートフォンでは、これが
  既定になります。
- **ライティング** — 読みのほうが出るので、文字を入力します。日本語キーボードに慣れるためのモード
  なので IME が必要です。読みが重なる場合は両方受け付けます。`ji` は じ でも ぢ でも、`zu` は ず
  でも づ でも正解です。

**フリック入力のドリル — スマートフォンとタブレットのみ。** タッチ端末では、デッキの下にフリック
入力のドリルが 2 つ出ます。日本語のケータイキーボードは五十音の行ごとに 10 個のキーがあり、母音は
フリックの方向で決まります。中央が **あ**、左が **い**、上が **う**、右が **え**、下が **お** です。
各ドリルは 20 問で、日本語キーボードが必要です。デスクトップでは表示されません。物理キーボードでは
フリックする対象がないからです。

- **フリックの方向** は母音（A I U E O）を示し、その母音で終わる文字なら何でも正解です。O なら
  お こ そ と の ほ も よ ろ などすべて、つ は U、め は E になります。終わりだけが重要なので、
  文字を思い出す練習ではなくフリックの練習になります。
- **フリックのキー** はその逆で、キー（A K S T N H M Y R W）を示し、その行の文字なら何でも正解
  です。K なら か き く け こ。濁音は元のキーにあるので、が も K、ぱ は H です。キーの名前は
  ローマ字の綴りではなく行に基づいています。それが狙いで、ふ は "fu" と書くのに **H**、し は
  "shi" でも **S**、ち と つ は **T** です。

各ドリルは、デッキとも互いとも別にベストスコアとタイムを持ちます。ん はドリルに含めていません。
母音がなく、どのキーにあるかがキーボードによって違うからです。

入力する 2 つのモードでは、カードごとに入力欄へフォーカスが移るので、毎回タップせずにそのまま打ち
続けられます。スマートフォンでは 1 回のラン中ずっとキーボードが出たままになり、「チェック」「答えを
見る」、文字をタップして進む — どれでもキーボードは消えません。自分で閉じた場合は、もう一度入力欄を
タップするまで閉じたままです。「答えを見る」はいつでも使えますが、間違い扱いになります。スマート
フォンでは文字の上、それ以外では入力欄の下に出ます。間違えたものは最後に一覧され、それだけを練習
できます。

**記録はモードごとに別です。** 文字を見て読む、4 つから選ぶ、読みから書く — この 3 つは違う技能
なので、デッキごとにモード別のベストスコアとベストタイムを持ちます。選択の記録がライティングの
基準になることはありません。メニューの数字は選んでいるモードのもので、ラベルも付いています。
モードを変えれば数字も変わります。

タイムはミスが 1 つもないランだけ記録されます。急いだり答えを見たりしたランが、絶対に破れない記録
を残さないためです。ランは常に計測されていますが、練習中に時計はわざと表示しません。進むカウンター
があると練習が競争になるからです。間違いだけの練習は記録に入りません。

**一覧表。**「All characters & romaji」で五十音表が開きます。標準的な並びで、参照用の拡張カタカナ
（ファ ティ ヴァ など）も入っています。

**文字のフォント。** かなは書体によって見え方がかなり違い、1 つの書体でだけ あ が分かっても、
分かったことにはなりません。フォント選択では、端末に実際に入っている日本語書体だけを出します。
候補をキャンバスに描画してピクセルを比較し、無いものや、すでにあるものと同じ見え方のものは出しま
せん。そのため数は環境によります。Windows は *Japanese Supplemental Fonts* を入れない限り、明朝や
教科書体が入っていません。

データは端末の localStorage に 1 つだけ保存されます。サイトデータを消すとリセットされます。

## ファイル構成

```
index.html    4 つの画面と 2 つのダイアログ
styles.css    スタイル全部、モバイルファースト
kana.json     内容全部 — デッキ、カード、表のレイアウト、フォント
app.js        ロジック全部、IIFE 1 つ
```

これだけでアプリ全体です。インストールする依存も、ビルドもありません。内容は `kana.json` だけに
あり、`app.js` は渡されたデッキをそのまま表示します。デッキを増やす、別の綴りを受け付ける、表を
変える — どれも JSON の編集であって、コードの変更ではありません。

設計のメモと、変更前に知っておくべき不変条件は [CLAUDE.md](CLAUDE.md) にあります。

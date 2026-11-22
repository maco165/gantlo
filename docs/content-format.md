# 問題データの様式

問題は JSON で書き、`src/content/courses/<コース>/<ファイル>.json` に置きます。置けば読み込み (`src/content/index.ts`) に自動でつながります。型の正本は `src/content/types.ts`、検査は `scripts/check-content.mjs` です。

書いたら次を走らせ、`OK` だけが出ることを確かめます。

```bash
npm run check:content                      # 全部
node scripts/check-content.mjs <ファイル>   # 1 つだけ
```

`NG <ファイル> <id>: <理由>` の行が出たら、その id の問題を直します。CI も同じ検査を走らせます。見本は `tests/fixtures/check-content-sample.json` です (5 種類の問題を 1 問ずつ持つ、検査とテストのための見本。本物の問題データとは別のファイル)。

## 置き場所とファイル

| コース | フォルダ | ファイル名 |
|---|---|---|
| 本編 | `courses/main/` | `week<N>.json` (`week1.json` から `week4.json`)。第 N 週の段のレッスンだけを置く |
| Spring Boot の流れ | `courses/spring/` | 自由 (英小文字と `-`) |
| 技術の歴史 | `courses/tech-history/` | 同上 |
| 管理の歴史 | `courses/mgmt-history/` | 同上 |
| セキュリティ | `courses/security/` | 同上 |

コースの id の正本は `src/lib/route.ts` の `COURSES` です。レッスンはコースの順、ファイル名の順、ファイルの中の順に並びます。

ファイルの中身は `{ "lessons": [レッスン, ...] }` です。

## レッスン

| 欄 | 必須 | 意味 |
|---|---|---|
| `id` | 必須 | 英小文字・数字・`-`。サイト全体で重ねない。本編の `week<N>.json` では `main-w<N>-` で始める (`main-w<N>-l<番号>`)。ほかは `<コース>-l<番号>` を勧める |
| `title` | 必須 | 題。画面とページの見出し (h1) に出る |
| `shortTitle` | 題が 26 字を超えるときは必須 | タブと検索の結果に出す短い題 (`<title>` と `og:title`)。「題 \| gantlo」を 35 字に収めるため、26 字までで、`title` より短くする |
| `course` | 必須 | コースの id。置いたフォルダと同じにする |
| `stage` | 本編は必須 | リクエストの旅の段 (`src/content/stages.ts` の id: `uri` `dns` `tcp` `tls` `http` `oauth` `mime` `rest`)。ほかのコースは任意。本編の `week<N>.json` では、`stages.ts` の `week` が N の段にする |
| `intro` | 必須 | 問題の前に読む要点 (下の「要点」)。全レッスンが持つ |
| `questions` | 必須 | 問題の配列 (1 問以上) |

## 要点 (`intro`)

レッスンを開くと、1 問目の前にこの要点が出ます (済みのレッスンと解いている間は畳み、復習と模擬試験では出しません)。そのレッスンの問題を解くのに要る事実だけを、短く書きます。

| 欄 | 必須 | 意味 |
|---|---|---|
| `goals` | 必須 | このレッスンで分かるようになること。ちょうど 3 行で、動詞で終える (最後の字が う段: 「〜できる」「〜を読む」「〜を見分ける」) |
| `body` | 必須 | 短い説明の段落の配列。合わせて 200〜400 字 (空白を除いて数える)。1 文は 40 字以内を目安にする (検査は 60 字を超えると NG) |
| `figure` | どちらか一方 | 図 `{ "kind", "caption", "items" }`。`kind` は `flow` (上から下へ矢印でつなぐ箱) か `table` (名前と意味の 2 列)。`items` は `{ "label", "note"? }` を 2〜8 個 (`table` は `note` が必須)。`caption` に出典の節を添える |
| `figureOmitted` | どちらか一方 | 図が要らないレッスンだけ、`figure` の代わりに理由を書く |
| `tryIt` | 任意 | 手元で試すコマンド `{ "command", "expect" }` を 1〜2 個。`expect` は期待する出力の要点。宛先は自分の手元か、公開の見本として使ってよい `example.com`・`httpbin.org` だけ (下の注意)。書く前に実際に打って確かめる |
| `sources` | 必須 | 出典の URL の配列。1 つ以上で、すべて `https://`。RFC は節まで指す (節が無いと NG) |

書くときの決まり:

- **問題の答えを要点に書かない**。考え方を教え、答えの文字列は書かない。同じレッスンの穴埋めの正解 (別解も) が要点のどこか (`goals`・`body`・図・`tryIt` のコマンドと出力) に出ると NG (英数字の答えは語として出たときだけ数える。ヘッダー名とメディアタイプは大文字と小文字を区別せずに見る)。並べ替えの正しい順をそのまま `flow` の図に描かない、4 択の問いにそのまま答える文を書かない、は検査では見切れないので、書いた人とは別の人が見る
- 書いた事実は出典の本文で確かめる。確かめられなかったことは書かない。問題の答えと解説と食い違わないようにする
- 試すコマンドの宛先の `httpbin.org` は、要求をそのまま返す公開の見本で、応答に送り手の IP アドレス (`origin`) も入る。要点の `expect` は、`httpbin.org` や `example.com` の作りが変わると外れうるので、出力の細かい値より形 (どの欄が出るか) を書く
- セキュリティのコースは、`body` に「試すのは自分で用意したラボの中だけにしてください。」と「他人のシステムへの無断の診断は、不正アクセス禁止法などに触れます。」を入れ (tests/security.test.ts が見る)、`tryIt` は自分の手元の中だけにする

```json
"intro": {
  "goals": ["要求と応答の形を見分けられる", "ヘッダーが何を伝えるかを読む", "curl で要求と応答を手元で見る"],
  "body": ["HTTP のやり取りは、クライアントが送る要求と、サーバーが返す応答の組です。", "…"],
  "figure": {
    "kind": "flow",
    "caption": "1 つのやり取りの流れ (RFC 9110 6)",
    "items": [{ "label": "要求", "note": "メソッド・対象・ヘッダー・本文" }, { "label": "応答", "note": "ステータス・ヘッダー・本文" }]
  },
  "tryIt": [{ "command": "curl -v https://example.com/ -o /dev/null", "expect": "> の行に送った要求、< の行に返ってきた応答が出ます。" }],
  "sources": ["https://www.rfc-editor.org/rfc/rfc9110#section-6", "https://curl.se/docs/manpage.html"]
}
```

## 問題 (5 種類で共通の欄)

| 欄 | 必須 | 意味 |
|---|---|---|
| `id` | 必須 | `<レッスンの id>-q<番号>`。レッスンの id と `-` で始める。サイト全体で重ねない |
| `kind` | 必須 | `command` `http` `order` `choice` `lab` のどれか |
| `prompt` | 必須 | 問題文 |
| (正解) | 必須 | 種類ごとに欄が違う (下の表) |
| `explanation` | 必須 | 解説。なぜその答えか、出典のどこに書いてあるか |
| `sources` | 必須 | 出典の URL の配列。1 つ以上で、すべて `https://`。RFC は `https://www.rfc-editor.org/rfc/rfc9110#section-15.3.2` のように節まで指す |

| 種類 | 正解の欄 |
|---|---|
| `command` `http` | `blanks` (空欄ごとの正解) |
| `order` | `answer` (項目の id を正しい順に並べた配列) |
| `choice` | `answer` (正解の選択肢の id) |
| `lab` | `expected` (手元で観察できること) |

## 種類ごとの欄と例

下の例は、見本 (`tests/fixtures/check-content-sample.json`) の問題を短くしたものです。id (`main-w1-l1-q1`〜`q5`) は見本の中の id で、`src/content/courses/main/week1.json` の同じ id の問題とは中身が違います。

### command: コマンドの穴埋め

curl・dig・openssl のコマンドの 1 か所を埋めます。

| 欄 | 必須 | 意味 |
|---|---|---|
| `tool` | 必須 | `curl` `dig` `openssl` |
| `code` | 必須 | コマンド。空欄は `{{blank}}` で、ちょうど 1 つ |
| `blanks` | 必須 | 空欄 1 つぶんの正解を入れた配列 (要素は 1 つ) |
| `output` | 任意 | 正解のあとに見せる実行結果の例 |

```json
{
  "id": "main-w1-l1-q1",
  "kind": "command",
  "tool": "curl",
  "prompt": "ステータス行とヘッダーだけを見たい。HEAD で送るオプションを埋めてください。",
  "code": "curl {{blank}} https://example.com/",
  "blanks": [{ "answers": ["-I", "--head"] }],
  "explanation": "-I は HEAD で送り、ヘッダーだけを出します。",
  "sources": ["https://curl.se/docs/manpage.html"]
}
```

### http: HTTP と JSON の穴埋め

リクエストやレスポンス、JSON の数行のうち 1〜2 か所を埋めます。

| 欄 | 必須 | 意味 |
|---|---|---|
| `format` | 必須 | `http` (HTTP のやり取り) か `json` |
| `code` | 必須 | 数行の本文。`{{blank}}` は 1〜2 つ |
| `blanks` | 必須 | 空欄ごとの正解。`code` の `{{blank}}` と同じ数・同じ順 |

```json
{
  "id": "main-w1-l1-q2",
  "kind": "http",
  "format": "http",
  "prompt": "本文が JSON であることを伝えるレスポンスです。空欄を埋めてください。",
  "code": "HTTP/1.1 200 OK\n{{blank}}: {{blank}}\n\n{\"ok\": true}",
  "blanks": [
    { "answers": ["Content-Type"], "match": "header-name" },
    { "answers": ["application/json"], "match": "media-type" }
  ],
  "explanation": "本文の形式は Content-Type で伝えます。",
  "sources": ["https://www.rfc-editor.org/rfc/rfc9110#section-8.3"]
}
```

### 空欄 (`blanks` の要素)

| 欄 | 必須 | 意味 |
|---|---|---|
| `answers` | 必須 | 正解の配列。先頭が模範解答、残りは別解。どれか 1 つに一致すれば正解 |
| `match` | 任意 | 採点の仕方。省略すると `text` |
| `wrong` | 下の決まり | よくある誤答 `{ "answer", "why" }` の配列。`why` はなぜ違うかの 1〜2 文。答えが `answer` に当たれば (`match` と同じ比べ方で)、答えたあとに解説の前に出す |

穴埋め (`command`・`http`) の問題は、よくある誤答を空欄を合わせて 2〜4 個持ちます (空欄が 2 つなら空欄ごとに 1〜2 個)。実際に取り違えやすいもの (似たオプション・似たヘッダー・隣の概念) を選び、`why` の事実も出典で確かめます。誤答は正解・別解と同じにしない (`header-name` と `media-type` の空欄は、大文字と小文字の違いだけでは誤答にならない)。4 択の `why` と同じ考え方です。

```json
"blanks": [
  {
    "answers": ["-I", "--head"],
    "wrong": [
      { "answer": "-i", "why": "-i は応答のヘッダーを本文の前に足して出すオプションで、メソッドは GET のままです。本文も出ます。" },
      { "answer": "-v", "why": "-v は送った要求と受け取った応答を詳しく出すオプションです。メソッドは変わらず、本文も受け取ります。" }
    ]
  }
]
```

| `match` | 採点 |
|---|---|
| `text` | 前後の空白を無視し、間の空白の並びを 1 つにして比べる。大文字と小文字は区別する |
| `header-name` | `text` に加え、大文字と小文字を区別しない (HTTP のヘッダー名) |
| `media-type` | `text` に加え、type/subtype・引数の名前・charset の値の大文字と小文字を区別しない。引数の値の引用符 (`"utf-8"`) は外して比べる。`;` の前後の空白は揃える |

### order: 並べ替え

| 欄 | 必須 | 意味 |
|---|---|---|
| `items` | 必須 | 項目 `{ "id", "text" }` の配列 (2 つ以上、id は重ねない)。並びは自由 (出すときに混ぜる) |
| `answer` | 必須 | `items` の id を正しい順に並べた配列。どの id もちょうど 1 回ずつ使う |

```json
{
  "id": "main-w1-l1-q3",
  "kind": "order",
  "prompt": "https:// の URL を開くとき、起きる順に並べてください。",
  "items": [
    { "id": "dns", "text": "名前を引く" },
    { "id": "tcp", "text": "TCP で接続する" },
    { "id": "tls", "text": "TLS のハンドシェイク" }
  ],
  "answer": ["dns", "tcp", "tls"],
  "explanation": "名前が分からないと接続できず、TLS は TCP の上で始まります。",
  "sources": ["https://www.rfc-editor.org/rfc/rfc8446"]
}
```

### choice: 4 択

| 欄 | 必須 | 意味 |
|---|---|---|
| `choices` | 必須 | 選択肢 `{ "id", "text", "why"? }` の配列 (ちょうど 4 つ、id は重ねない)。`why` は違う選択肢の「なぜ違うか」 |
| `answer` | 必須 | 正解の選択肢の id |
| `code` | 任意 | 問題文の下に出す `{ "format", "text" }` (出力を読んで答える問題など) |
| `fixedOrder` | 任意 | `true` なら選択肢を混ぜない (位置に意味があるとき) |

```json
{
  "id": "main-w1-l1-q4",
  "kind": "choice",
  "prompt": "新しい資源を作り終えたことを伝えるステータスコードはどれですか。",
  "choices": [
    { "id": "a", "text": "201 Created" },
    { "id": "b", "text": "200 OK", "why": "新しい資源ができたことまでは伝わりません。" },
    { "id": "c", "text": "202 Accepted", "why": "処理はまだ終わっていません。" },
    { "id": "d", "text": "204 No Content", "why": "返す本文が無いことを表します。" }
  ],
  "answer": "a",
  "explanation": "201 は新しい資源が作られたことを表します。",
  "sources": ["https://www.rfc-editor.org/rfc/rfc9110#section-15.3.2"]
}
```

### lab: 実習

手元で打って観察します。採点はせず、`expected` を見せます。

| 欄 | 必須 | 意味 |
|---|---|---|
| `steps` | 必須 | 手順 `{ "text", "command"? }` の配列 (1 つ以上) |
| `expected` | 必須 | 観察できること |

```json
{
  "id": "main-w1-l1-q5",
  "kind": "lab",
  "prompt": "curl -v で要求と応答を見てください。",
  "steps": [{ "text": "端末で次を打つ", "command": "curl -v https://example.com/ -o /dev/null" }],
  "expected": "> の行に送った要求が、< の行に返ってきた応答が出ます。",
  "explanation": "-v は送ったヘッダーと受け取ったヘッダーを分けて出します。",
  "sources": ["https://curl.se/docs/manpage.html"]
}
```

セキュリティのコースの実習は、自分で用意した環境の中だけで試すことを `prompt` か `steps` に書きます。

## 検査の決まり (scripts/check-content.mjs)

- JSON として読めること。`lessons` が 1 つ以上あること
- どの欄も、この文書の表にあるものだけを使うこと。表に無い欄 (`Match`・`fixedorder` などの打ち間違い) は「知らない欄 (<名前>) です」の NG
- レッスンと問題の id が英小文字・数字・`-` だけで、サイト全体で重ならないこと。問題の id がレッスンの id と `-` で始まること
- レッスンの `course` が `route.ts` のコースのどれかで、置いたフォルダと同じこと
- `stage` が `stages.ts` にあること。本編では `stage` が必須
- 本編のファイル名が `week<N>.json` で、その中のレッスンの段が第 N 週の段 (`stages.ts` の `week`) で、id が `main-w<N>-` で始まること
- どの問題も `prompt`・`explanation`・`sources` を持ち、`sources` の URL がすべて `https://` であること
- `kind` が 5 種類のどれかで、種類ごとの必須の欄があること
- `command` の `{{blank}}` がちょうど 1 つ、`http` は 1〜2 つで、`blanks` の数と合うこと。`blanks` の `answers` が空でない文字列の配列で、`match` が 3 つのどれかであること
- `order` の `answer` が `items` の id をちょうど 1 回ずつ並べたものであること (足りない・知らない id・重なりは NG)
- `choice` の選択肢がちょうど 4 つで、`answer` が選択肢の id にあり、選択肢の id が重ならないこと
- `lab` の `steps` の `text` が空でなく、`expected` があること
- どのレッスンも `intro` を持ち、`goals` がちょうど 3 行で動詞で終わり、`body` が 200〜400 字 (1 文 60 字まで)、`figure` か `figureOmitted` のどちらか一方、`tryIt` が 1〜2 個 (書くなら)、`sources` がすべて https で RFC は節まで指すこと。同じレッスンの穴埋めの正解が要点に出ないこと
- 穴埋めの問題が、よくある誤答 (`blanks[].wrong`) を合わせて 2〜4 個持ち、どれも `answer` と `why` (2 文まで) を持ち、正解と同じでなく、重ならないこと (本当の採点で不正解になることは `tests/grade.test.ts` が見る)

検査は形だけを見ます。中身が正しいか (出典に書いてあるか、並べた順が正しいか) は、書いた人とは別の人が出典と照らして確かめます。

## 用語集 (src/content/glossary.json)

用語集の語は `src/content/glossary.json` の `{ "terms": [語, ...] }` に書きます。型と検査の正本は `src/lib/glossary.ts` (`GlossaryTerm`・`validateGlossary`) で、`npx vitest run tests/glossary.test.ts` が検査します (`npm test` にも入ります)。並びは画面が決めるので (11 の規格は `standard` の順、ほかは読みの順)、ファイルの中の順は自由です。

| 欄 | 必須 | 意味 |
|---|---|---|
| `id` | 必須 | 英小文字・数字・`-`。重ねない。画面では `#term-<id>` になる |
| `term` | 必須 | 見出しの名前 |
| `aliases` | 任意 | 別名・略さない名前・英語の名前の配列。検索で引ける |
| `standard` | 11 の規格だけ | 学ぶ順の番号 (1〜11)。1 から 11 がそろうこと。10 は OAuth 2.0 と JWT の 2 語 |
| `description` | 必須 | 短い説明 (1〜3 文)。出典の文を長く写さず、自分の言葉で書く |
| `sources` | 必須 | 一次情報 (RFC・IANA・W3C / WHATWG・MDN・公式文書) の出典 `{ "label", "url" }` の配列 (1 つ以上、すべて `https://`)。RFC は `https://www.rfc-editor.org/rfc/rfc9110#section-9.3.2` のように節まで指し、`label` は `RFC 9110 9.3.2` の形 |
| `lessons` | 必須 | 語が出てくるレッスンの id の配列。**問題データ (`src/content/courses`) に実在し、問題にその語が出てくるレッスンだけ**を書く (多くても 3 つ)。無ければ `[]` |

```json
{
  "id": "head",
  "term": "HEAD",
  "description": "GET と同じですが、サーバーが応答に本文を入れないメソッドです。",
  "sources": [{ "label": "RFC 9110 9.3.2", "url": "https://www.rfc-editor.org/rfc/rfc9110#section-9.3.2" }],
  "lessons": ["main-w1-l1"]
}
```

検査 (`validateGlossary`) が見ること:

- id の形と重なり。`term` と `aliases` が、ほかの語の名前と重ならないこと。比べるときは検索と同じ形にそろえる (NFKC・大文字小文字・ひらがなとカタカナ・ハイフンと中黒を無視) ので、`ＧＥＴ` と `get` も重なりになる
- `sources` が 1 つ以上で、すべて https。RFC は節まで指すこと
- `lessons` のレッスンが実在し (`src/content/index.ts` の `LESSONS`)、重ならないこと
- 11 の規格 (`standard` の 1〜11) がそろうこと。表に無い欄を使わないこと

書く前に、出典を `curl -sL` で実際に開き、節の番号と用語を本文で確かめます。確かめられなかった語は載せません。

### 問題を足したあとに、レッスンへのリンクを足す

語の `lessons` には、問題データに実在するレッスンしか書けません (無いレッスンを書くと検査が落ちる)。問題の PR がマージされたら、次の順で足します。

1. main を取り込み、入ったレッスンの id を出す: `node -e "for (const f of require('fs').readdirSync('src/content/courses', { recursive: true })) if (f.endsWith('.json')) for (const l of require('./src/content/courses/' + f).lessons) console.log(l.id, l.title)"`
2. 語ごとに、問題文・コード・解説にその語 (か別名) が出るレッスンを探す (例: `grep -l '"PUT' src/content/courses/*/*.json`)
3. その語の `lessons` に id を足す。同じレッスンを 2 度書かない
4. `npx vitest run tests/glossary.test.ts` が通ることを確かめる。このテストは、書いたレッスンの問題 (出典を除く) にその語の名前か別名が出てくることも見る (検索と同じ形にそろえて比べる)。レッスンで別の言い方をしていれば (例: 三者間ハンドシェイク)、その言い方を `aliases` に足す。問題の PR に無い語を見つけたら、上の手順で出典を確かめて語を足す

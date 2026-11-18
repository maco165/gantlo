# 問題データの様式

問題は JSON で書き、`src/content/courses/<コース>/<ファイル>.json` に置きます。置けば読み込み (`src/content/index.ts`) に自動でつながります。型の正本は `src/content/types.ts`、検査は `scripts/check-content.mjs` です。

書いたら次を走らせ、`OK` だけが出ることを確かめます。

```bash
npm run check:content                      # 全部
node scripts/check-content.mjs <ファイル>   # 1 つだけ
```

`NG <ファイル> <id>: <理由>` の行が出たら、その id の問題を直します。CI も同じ検査を走らせます。見本は `src/content/courses/main/week1.json` です。

## 置き場所とファイル

| コース | フォルダ | ファイル名 |
|---|---|---|
| 本編 | `courses/main/` | `week1.json` から `week4.json` (週ごと) |
| Spring Boot の流れ | `courses/spring/` | 自由 (英小文字と `-`) |
| 技術の歴史 | `courses/tech-history/` | 同上 |
| 管理の歴史 | `courses/mgmt-history/` | 同上 |
| セキュリティ | `courses/security/` | 同上 |

コースの id の正本は `src/lib/route.ts` の `COURSES` です。レッスンはコースの順、ファイル名の順、ファイルの中の順に並びます。

ファイルの中身は `{ "lessons": [レッスン, ...] }` です。

## レッスン

| 欄 | 必須 | 意味 |
|---|---|---|
| `id` | 必須 | 英小文字・数字・`-`。サイト全体で重ねない。本編は `main-w<週>-l<番号>`、ほかは `<コース>-l<番号>` を勧める |
| `title` | 必須 | 題 |
| `course` | 必須 | コースの id。置いたフォルダと同じにする |
| `stage` | 本編は必須 | リクエストの旅の段 (`src/content/stages.ts` の id: `uri` `dns` `tcp` `tls` `http` `oauth` `mime` `rest`)。ほかのコースは任意 |
| `questions` | 必須 | 問題の配列 (1 問以上) |

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
| `choices` | 必須 | 選択肢 `{ "id", "text", "why"? }` の配列 (2 つ以上、id は重ねない)。`why` は違う選択肢の「なぜ違うか」 |
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
    { "id": "b", "text": "204 No Content", "why": "返す本文が無いことを表します。" }
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
- レッスンと問題の id が英小文字・数字・`-` だけで、サイト全体で重ならないこと。問題の id がレッスンの id と `-` で始まること
- レッスンの `course` が `route.ts` のコースのどれかで、置いたフォルダと同じこと
- `stage` が `stages.ts` にあること。本編では `stage` が必須
- どの問題も `prompt`・`explanation`・`sources` を持ち、`sources` の URL がすべて `https://` であること
- `kind` が 5 種類のどれかで、種類ごとの必須の欄があること
- `command` の `{{blank}}` がちょうど 1 つ、`http` は 1〜2 つで、`blanks` の数と合うこと。`blanks` の `answers` が空でない文字列の配列で、`match` が 3 つのどれかであること
- `order` の `answer` が `items` の id をちょうど 1 回ずつ並べたものであること (足りない・知らない id・重なりは NG)
- `choice` の `answer` が選択肢の id にあり、選択肢の id が重ならないこと
- `lab` の `steps` の `text` が空でなく、`expected` があること

検査は形だけを見ます。中身が正しいか (出典に書いてあるか、並べた順が正しいか) は、書いた人とは別の人が出典と照らして確かめます。

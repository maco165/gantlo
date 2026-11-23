// 「試す」画面 (/gantlo/try/) の決まりごと。CORS を許している公開の API に、選んだメソッド・道・ヘッダーで fetch を送る。
// 送り先は決めた一覧 (ENDPOINTS) だけで、任意の URL は送らない。Cookie や認証は送らない (credentials: 'omit')。
// 送り先と CORS の応答ヘッダーは 2026-11-23 に curl で確かめた:
//   httpbin.org: Access-Control-Allow-Origin に Origin を返し、Expose-Headers は Retry-After・RateLimit・RateLimit-Policy・WWW-Authenticate。
//                preflight (OPTIONS) は求められたヘッダーとメソッドをそのまま許す
//   api.github.com: Allow-Origin は *、Expose-Headers に ETag・Link・X-RateLimit-* など。preflight の Allow-Headers に
//                独自のヘッダー (X-Gantlo-Try) は無い (送ると preflight で弾かれる)

export type TryHost = 'httpbin' | 'github';
export const HOSTS: Record<TryHost, { origin: string; label: string }> = {
  httpbin: { origin: 'https://httpbin.org', label: 'httpbin.org' },
  github: { origin: 'https://api.github.com', label: 'api.github.com' },
};

export type TryMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type Endpoint = { id: string; host: TryHost; path: string; methods: readonly TryMethod[]; note: string; hasCode?: boolean };

/** 送れる道。hasCode の道は、選んだステータスコードを道の終わりに付ける */
export const ENDPOINTS: readonly Endpoint[] = [
  { id: 'get', host: 'httpbin', path: '/get', methods: ['GET', 'HEAD'], note: '送った要求 (ヘッダー・送り元の IP) を JSON で返す' },
  { id: 'status', host: 'httpbin', path: '/status/', methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], note: '選んだステータスコードをそのまま返す', hasCode: true },
  { id: 'headers', host: 'httpbin', path: '/headers', methods: ['GET'], note: '受け取ったリクエストヘッダーを JSON で返す' },
  { id: 'anything', host: 'httpbin', path: '/anything', methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], note: 'メソッドと本文をそのまま JSON で返す' },
  { id: 'retry-after', host: 'httpbin', path: '/response-headers?Retry-After=120', methods: ['GET'], note: 'Retry-After: 120 を付けて返す (CORS で公開されているので読める)' },
  { id: 'zen', host: 'github', path: '/zen', methods: ['GET'], note: 'GitHub の短い言葉を text/plain で返す' },
  { id: 'repo', host: 'github', path: '/repos/maco165/gantlo', methods: ['GET'], note: 'このサイトのリポジトリの情報を JSON で返す (ETag や X-RateLimit-* が読める)' },
];

/** /status/ に付けられるコード (1xx は応答が終わらず、3xx は fetch が転送先を追うので入れない) */
export const STATUS_CODES = [200, 201, 202, 204, 400, 401, 403, 404, 409, 415, 418, 429, 500, 503] as const;

/** 選べるリクエストヘッダー。custom は CORS の safelist に無く、ブラウザが先に preflight (OPTIONS) を送る */
export const HEADER_CHOICES = [
  { id: 'accept', name: 'Accept', value: 'application/json', custom: false },
  { id: 'custom', name: 'X-Gantlo-Try', value: '1', custom: true },
] as const;
export type HeaderId = (typeof HEADER_CHOICES)[number]['id'];

/** 本文を持つメソッド。本文は JSON の短い見本で、Content-Type: application/json (safelist に無いので preflight になる) */
export const hasBody = (m: TryMethod): boolean => m === 'POST' || m === 'PUT' || m === 'PATCH';
export const SAMPLE_BODY = '{"hello":"gantlo"}';

export type TryRequest = { endpoint: string; method: TryMethod; code?: number; headers: readonly HeaderId[] };

/** URL・送るヘッダー・本文。fetch の init は credentials を必ず omit にする */
export function buildRequest(r: TryRequest): { url: string; init: RequestInit; headers: [string, string][]; body: string | null; preflight: boolean } {
  const ep = ENDPOINTS.find((e) => e.id === r.endpoint);
  if (!ep) throw new Error(`try: 知らない道 (${r.endpoint})`);
  if (!ep.methods.includes(r.method)) throw new Error(`try: ${ep.path} には ${r.method} を送れません`);
  const code = ep.hasCode ? (STATUS_CODES as readonly number[]).includes(r.code ?? 0) ? r.code! : 200 : undefined;
  const url = `${HOSTS[ep.host].origin}${ep.path}${code ?? ''}`;
  const headers: [string, string][] = HEADER_CHOICES.filter((h) => r.headers.includes(h.id)).map((h) => [h.name, h.value]);
  const body = hasBody(r.method) ? SAMPLE_BODY : null;
  if (body !== null) headers.push(['Content-Type', 'application/json']);
  // safelist に無いヘッダー・Content-Type: application/json・GET/HEAD/POST 以外のメソッドは、ブラウザが先に preflight を送る
  const preflight = headers.some(([n]) => n === 'X-Gantlo-Try' || n === 'Content-Type') || !['GET', 'HEAD', 'POST'].includes(r.method);
  const init: RequestInit = {
    method: r.method,
    headers,
    body,
    mode: 'cors',
    // 自分の情報 (Cookie・HTTP 認証) は送らない。どのページから来たか (Referer) も送らない。ブラウザの持つ写しは使わない
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
    redirect: 'follow',
  };
  return { url, init, headers, body, preflight };
}

/** 送る前に見せる要求の形 (例: GET https://httpbin.org/get と、ヘッダー・本文) */
export function requestText(r: TryRequest): string {
  const { url, headers, body } = buildRequest(r);
  return [`${r.method} ${url}`, ...headers.map(([n, v]) => `${n}: ${v}`), ...(body !== null ? ['', body] : [])].join('\n');
}

/** CORS の safelist の応答ヘッダー (公開の指定が無くても JS から読める。Fetch Standard の CORS-safelisted response-header name) */
export const SAFELISTED_RESPONSE_HEADERS = ['cache-control', 'content-language', 'content-length', 'content-type', 'expires', 'last-modified', 'pragma'] as const;

/** 読めたヘッダーを、safelist のものと Access-Control-Expose-Headers で公開されたものに分ける (名前の順) */
export function readableHeaders(h: Headers): { name: string; value: string; why: 'safelist' | 'exposed' }[] {
  const out: { name: string; value: string; why: 'safelist' | 'exposed' }[] = [];
  h.forEach((value, name) => out.push({ name, value, why: (SAFELISTED_RESPONSE_HEADERS as readonly string[]).includes(name) ? 'safelist' : 'exposed' }));
  return out.sort((a, b) => (a.name < b.name ? -1 : 1));
}

/** HTTP/2 は理由句を送らないので、ステータスの名前はこちらで添える (RFC 9110 と RFC 6585・RFC 9110 の 418) */
export const REASONS: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  304: 'Not Modified',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  415: 'Unsupported Media Type',
  418: "I'm a teapot",
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};

/** 本文を見せる形にする (JSON なら整え、8 KB で切る) */
export const MAX_BODY_CHARS = 8 * 1024;
export function bodyText(text: string, contentType: string | null): { text: string; clipped: boolean; json: boolean } {
  let out = text;
  let json = false;
  if (contentType?.includes('json')) {
    try {
      out = JSON.stringify(JSON.parse(text), null, 2);
      json = true;
    } catch {
      // JSON と名乗っても読めなければ、そのまま出す
    }
  }
  return out.length > MAX_BODY_CHARS ? { text: out.slice(0, MAX_BODY_CHARS), clipped: true, json } : { text: out, clipped: false, json };
}

export type Failure = { kind: 'offline' | 'timeout' | 'blocked'; title: string; detail: string[] };

/** 応答を待つ時間 (ミリ秒)。過ぎたら止めて「応答が無い」とする */
export const TIMEOUT_MS = 10_000;

/**
 * fetch が投げたときの説明。ブラウザは CORS で弾いたときも、届かなかったときも同じ TypeError にし、理由を JS に教えない
 * (理由は開発者ツールの Console にだけ出る)。分かるのは、オフラインか (navigator.onLine) と、待つのをやめたか (時間切れ) だけ
 */
export function explainFailure(r: TryRequest, { online, timedOut }: { online: boolean; timedOut: boolean }): Failure {
  if (!online)
    return {
      kind: 'offline',
      title: 'オフラインです',
      detail: ['この端末がネットワークにつながっていないので、要求を送れませんでした。つながってから、もう一度送ってください。'],
    };
  if (timedOut)
    return {
      kind: 'timeout',
      title: `${TIMEOUT_MS / 1000} 秒待っても応答がありません`,
      detail: ['外のサービスが止まっているか、とても遅くなっています。少し待ってから、もう一度送ってください。'],
    };
  const { preflight } = buildRequest(r);
  const ep = ENDPOINTS.find((e) => e.id === r.endpoint)!;
  const detail = [
    'ブラウザが応答を JS に渡しませんでした。CORS で弾かれた (相手の応答に、このサイトからの読み取りを許す Access-Control-Allow-Origin が無い) か、外のサービスに届かなかった (止まっている・名前を引けない・接続が切れた) かのどちらかです。',
    'ブラウザは、どちらの理由かを JS に教えません (失敗の中身から、ほかのサイトの様子を探られないようにするため)。理由は開発者ツールの Console に出ます。',
  ];
  if (preflight) detail.push('この要求は CORS の safelist に無いヘッダーかメソッドを使うので、ブラウザは先に OPTIONS の preflight を送ります。preflight の応答が許さなければ、本番の要求は送られません。');
  if (ep.host === 'github' && r.headers.includes('custom'))
    detail.push('api.github.com の preflight の応答 (Access-Control-Allow-Headers) には X-Gantlo-Try がありません (2026-11-23 に確かめた)。X-Gantlo-Try を外すと読めます。');
  return { kind: 'blocked', title: '応答を読めませんでした', detail };
}

/** 用語集の語から開くときの、始めの選び (?preset=<語の id>) */
export const PRESETS: Record<string, TryRequest> = {
  http: { endpoint: 'get', method: 'GET', headers: [] },
  https: { endpoint: 'get', method: 'GET', headers: [] },
  method: { endpoint: 'anything', method: 'PUT', headers: [] },
  get: { endpoint: 'get', method: 'GET', headers: [] },
  head: { endpoint: 'get', method: 'HEAD', headers: [] },
  post: { endpoint: 'anything', method: 'POST', headers: [] },
  put: { endpoint: 'anything', method: 'PUT', headers: [] },
  delete: { endpoint: 'anything', method: 'DELETE', headers: [] },
  'status-code': { endpoint: 'status', method: 'GET', code: 418, headers: [] },
  'status-line': { endpoint: 'status', method: 'GET', code: 200, headers: [] },
  '200-ok': { endpoint: 'status', method: 'GET', code: 200, headers: [] },
  '201-created': { endpoint: 'status', method: 'POST', code: 201, headers: [] },
  '202-accepted': { endpoint: 'status', method: 'GET', code: 202, headers: [] },
  '204-no-content': { endpoint: 'status', method: 'GET', code: 204, headers: [] },
  '400-bad-request': { endpoint: 'status', method: 'GET', code: 400, headers: [] },
  '404-not-found': { endpoint: 'status', method: 'GET', code: 404, headers: [] },
  '409-conflict': { endpoint: 'status', method: 'PUT', code: 409, headers: [] },
  '415-unsupported-media-type': { endpoint: 'status', method: 'POST', code: 415, headers: [] },
  header: { endpoint: 'headers', method: 'GET', headers: ['accept', 'custom'] },
  'request-line': { endpoint: 'anything', method: 'GET', headers: [] },
  accept: { endpoint: 'headers', method: 'GET', headers: ['accept'] },
  'content-type': { endpoint: 'anything', method: 'POST', headers: [] },
  'content-length': { endpoint: 'repo', method: 'GET', headers: [] },
  'retry-after': { endpoint: 'retry-after', method: 'GET', headers: [] },
  json: { endpoint: 'repo', method: 'GET', headers: ['accept'] },
  rest: { endpoint: 'repo', method: 'GET', headers: ['accept'] },
};

export const DEFAULT_REQUEST: TryRequest = { endpoint: 'get', method: 'GET', headers: [] };

/** URL の ?preset= から始めの選びを決める。知らない値は既定 */
export function initialRequest(search: string): TryRequest {
  const id = new URLSearchParams(search).get('preset');
  // 自分の持つ鍵だけを見る (__proto__ などで Object の中身を引かない)
  return id !== null && Object.hasOwn(PRESETS, id) ? PRESETS[id] : DEFAULT_REQUEST;
}

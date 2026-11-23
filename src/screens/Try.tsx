import { Link } from '@astryxdesign/core/Link';
import { Text } from '@astryxdesign/core/Text';
import { useRef, useState } from 'react';
import StatusLine from '../components/StatusLine';
import { pageHref } from '../lib/route';
import { STORAGE_KEY } from '../lib/progress';
import { TRY_ABOUT, type Status } from '../lib/status';
import {
  ENDPOINTS,
  HEADER_CHOICES,
  HOSTS,
  REASONS,
  SAFELISTED_RESPONSE_HEADERS,
  STATUS_CODES,
  TIMEOUT_MS,
  bodyText,
  buildRequest,
  explainFailure,
  initialRequest,
  readableHeaders,
  requestText,
  type Failure,
  type HeaderId,
  type TryMethod,
  type TryRequest,
} from '../lib/tryApi';

type Result =
  | { ok: true; request: string; status: Status; headers: ReturnType<typeof readableHeaders>; body: ReturnType<typeof bodyText> | null; ms: number }
  | { ok: false; request: string; failure: Failure };

/** 結果の要約の 1 行 (aria-live で読み上げる) */
function resultSummary(r: Result): string {
  return r.ok ? `応答を受け取りました: ${r.status.code} ${r.status.reason}` : `応答を読めませんでした: ${r.failure.title}`;
}

/**
 * 本文が空のときの説明。本文を持たないと決まっているのは、HEAD への応答と 1xx・204・304 だけ (RFC 9110 の 6.4.1)。
 * ほかのコードで空なのは、相手がたまたま本文を返さなかっただけ
 */
export function emptyBodyText(method: string, code: number): string {
  if (method === 'HEAD') return '本文はありません (HEAD への応答は本文を持たない。RFC 9110)。';
  if (code === 204 || code === 304 || (code >= 100 && code < 200)) return `本文はありません (${code} の応答は本文を持たない。RFC 9110)。`;
  return '相手は本文を返しませんでした (空の本文)。';
}

/**
 * 要求と本文を見せる箱。Astryx の CodeBlock と Button はこの画面では使わない (使うと rolldown がそれらを共有の小さなチャンクに切り出し、
 * レッスン・設定・用語集などのページが最初に読む JS の本数が増えるため)。ボタンは自前の .btn
 */
function CodeView({ title, code }: { title: string; code: string }) {
  return (
    <figure className="try__code">
      <figcaption>{title}</figcaption>
      <pre>
        <code>{code}</code>
      </pre>
    </figure>
  );
}

// 試す画面の説明のステータスと、記録の置き場所の名前は、ほかの画面と同じ正本 (status.ts・progress.ts) から読む。
// どちらも読まないと、rolldown がこの画面に合わせて共有のチャンクを切り直し、progress.ts と status.ts を入口の JS へ移して
// 入口が 5 KB 重くなり、レッスンのページの LCP が落ちた (Actions の Lighthouse で 81 → 79)
const ABOUT: Status = TRY_ABOUT;

/**
 * 試す画面 (/gantlo/try/)。CORS を許している公開の API (httpbin.org・api.github.com) に、選んだメソッド・道・ヘッダーで fetch を送り、
 * 本物のステータス・ブラウザが読める応答ヘッダー・本文を、このサイトの応答の形で出す。送り先は決めた一覧だけ (lib/tryApi.ts)。
 * 自動では送らない。Cookie や認証は送らない (credentials: 'omit')。失敗したときは何が起きたかを説明する
 */
export default function Try() {
  const [req, setReq] = useState<TryRequest>(() => initialRequest(window.location.search));
  const [result, setResult] = useState<Result | null>(null);
  const [sending, setSending] = useState(false);
  const busy = useRef(false);
  const ep = ENDPOINTS.find((e) => e.id === req.endpoint)!;
  const built = buildRequest(req);

  const choose = (change: Partial<TryRequest>) => {
    setReq((r) => {
      const next = { ...r, ...change };
      const e = ENDPOINTS.find((x) => x.id === next.endpoint)!;
      // その道で送れないメソッドは、道の最初のメソッドに戻す
      if (!e.methods.includes(next.method)) next.method = e.methods[0];
      if (e.hasCode && next.code === undefined) next.code = 200;
      return next;
    });
    setResult(null);
  };
  const toggleHeader = (id: HeaderId) => choose({ headers: req.headers.includes(id) ? req.headers.filter((h) => h !== id) : [...req.headers, id] });

  const send = async () => {
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    setResult(null);
    const { url, init } = buildRequest(req);
    const line = `${req.method} ${url}`;
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, TIMEOUT_MS);
    const started = performance.now();
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      const text = req.method === 'HEAD' ? '' : await res.text();
      const ms = Math.round(performance.now() - started);
      setResult({
        ok: true,
        request: line,
        status: { code: res.status, reason: REASONS[res.status] ?? res.statusText, ja: `${HOSTS[ep.host].label} が返した本物のステータスです (${ms} ms)` },
        headers: readableHeaders(res.headers),
        body: text === '' ? null : bodyText(text, res.headers.get('content-type')),
        ms,
      });
    } catch {
      setResult({ ok: false, request: line, failure: explainFailure(req, { online: navigator.onLine, timedOut }) });
    } finally {
      window.clearTimeout(timer);
      busy.current = false;
      setSending(false);
    }
  };

  return (
    <div className="page try">
      <h1 className="page__title">試す (本物の API)</h1>
      <StatusLine status={ABOUT} request="GET /try" />
      <div className="try__notice" role="note" data-testid="try-notice">
        <p>
          <strong>この要求は、あなたのブラウザから外のサービス ({HOSTS.httpbin.label} か {HOSTS.github.label}) に送られます。</strong>
          送るのは「送る」を押したときだけです。
        </p>
        <Text type="supporting">
          Cookie や認証の情報は送りません (credentials: omit)。どのページから来たか (Referer) も送りません。送り先には、あなたの IP アドレスと、このサイトから送ったこと (Origin ヘッダー) が見えます。学んだ記録 (このブラウザの {STORAGE_KEY}) は送りません。
        </Text>
      </div>

      <section className="try__form" aria-labelledby="try-form-title">
        <h2 id="try-form-title" className="settings__title">
          送る要求
        </h2>
        <fieldset className="try__group">
          <legend>送り先と道</legend>
          {ENDPOINTS.map((e) => (
            <label key={e.id} className="try__opt try__opt--wide">
              <input type="radio" name="try-endpoint" value={e.id} checked={req.endpoint === e.id} onChange={() => choose({ endpoint: e.id })} />
              <span>
                <code>
                  {HOSTS[e.host].label}
                  {e.hasCode ? `${e.path}{コード}` : e.path}
                </code>
                <Text type="supporting"> {e.note}</Text>
              </span>
            </label>
          ))}
        </fieldset>
        {ep.hasCode && (
          <p className="plan__field">
            <label htmlFor="try-code">ステータスコード</label>
            <select id="try-code" className="try__select" value={req.code ?? 200} onChange={(e) => choose({ code: Number(e.target.value) })}>
              {STATUS_CODES.map((c) => (
                <option key={c} value={c}>
                  {c} {REASONS[c]}
                </option>
              ))}
            </select>
          </p>
        )}
        <fieldset className="try__group try__group--row">
          <legend>メソッド</legend>
          {ep.methods.map((m: TryMethod) => (
            <label key={m} className="try__opt">
              <input type="radio" name="try-method" value={m} checked={req.method === m} onChange={() => choose({ method: m })} />
              <code>{m}</code>
            </label>
          ))}
        </fieldset>
        <fieldset className="try__group">
          <legend>リクエストヘッダー</legend>
          {HEADER_CHOICES.map((h) => (
            <label key={h.id} className="try__opt try__opt--wide">
              <input type="checkbox" checked={req.headers.includes(h.id)} onChange={() => toggleHeader(h.id)} />
              <span>
                <code>
                  {h.name}: {h.value}
                </code>
                <Text type="supporting">{h.custom ? ' CORS の safelist に無いので、ブラウザが先に OPTIONS の preflight を送る' : ' CORS の safelist にあるので、そのまま送る'}</Text>
              </span>
            </label>
          ))}
        </fieldset>
        <CodeView title="送る要求" code={requestText(req)} />
        {built.preflight && (
          <Text type="supporting">
            この要求は CORS の safelist に無いヘッダー (本文の Content-Type: application/json も) か、GET・HEAD・POST 以外のメソッドを使うので、ブラウザは本番の前に OPTIONS の preflight を送り、相手が許すかを確かめます。
          </Text>
        )}
        <p className="settings__row">
          <button type="button" className="btn btn--primary try__send" onClick={send} disabled={sending}>
            送る (外のサービスへ)
          </button>
        </p>
      </section>

      {/* 読み上げるのは短い要約の行だけ (本文やヘッダーの一覧を包むと、長い本文を全部読み上げうる) */}
      <p className="try__summary" aria-live="polite" data-testid="try-summary">
        {sending ? '送っています。' : result ? resultSummary(result) : ''}
      </p>
      <div>
        {result?.ok === true && (
          <section className="try__result" aria-labelledby="try-result-title" data-testid="try-result" data-status={result.status.code}>
            <h2 id="try-result-title" className="settings__title">
              本物の応答
            </h2>
            <StatusLine status={result.status} request={result.request} />
            <h3 className="try__sub">ブラウザが読めた応答ヘッダー ({result.headers.length})</h3>
            <dl className="headers__list">
              {result.headers.map((h) => (
                <div key={h.name} className="headers__row" data-header={h.name} data-why={h.why}>
                  <dt>
                    <code>{h.name}</code>
                  </dt>
                  <dd>
                    {h.value}
                    <Text type="supporting"> ({h.why === 'safelist' ? 'CORS の safelist' : 'Access-Control-Expose-Headers で公開'})</Text>
                  </dd>
                </div>
              ))}
            </dl>
            <Text type="supporting">
              応答には、ほかにも Date・Server などのヘッダーが届いています。ただしブラウザが JS に見せるのは、CORS の safelist の 7 つ ({SAFELISTED_RESPONSE_HEADERS.join('・')}) と、相手が Access-Control-Expose-Headers で公開した名前だけです。ここに無いヘッダーは、届いていても読めません (開発者ツールの Network では見えます)。
            </Text>
            <h3 className="try__sub">本文</h3>
            {result.body ? (
              <>
                <CodeView title={result.body.json ? '本文 (JSON)' : '本文'} code={result.body.text} />
                {result.body.clipped && <Text type="supporting">長いので、頭の 8 KB だけを出しています。</Text>}
              </>
            ) : (
              <Text type="supporting">{emptyBodyText(result.request.split(' ')[0], result.status.code)}</Text>
            )}
          </section>
        )}
        {result?.ok === false && (
          <section className="try__result" aria-labelledby="try-fail-title" data-testid="try-failure" data-kind={result.failure.kind}>
            <h2 id="try-fail-title" className="settings__title">
              {result.failure.title}
            </h2>
            {/* Fetch Standard では、届かない・CORS で弾かれた応答は「network error」(ステータス 0) になる */}
            <StatusLine status={{ code: 0, reason: 'network error', ja: result.failure.title }} request={result.request} tone="error" />
            {result.failure.detail.map((d) => (
              <Text key={d}>{d}</Text>
            ))}
          </section>
        )}
      </div>

      <p className="prog__note tap-links">
        <Text type="supporting">
          ステータスコードやヘッダーの意味は <Link href={pageHref('glossary')}>用語集</Link> にあります。用語集の語の「試す」から、その語に合った要求を選んだ状態で開けます。
        </Text>
      </p>
    </div>
  );
}

import { Link } from '@astryxdesign/core/Link';
import { Text } from '@astryxdesign/core/Text';
import type { ReactNode } from 'react';
import type { Status } from '../lib/status';
import StatusLine from './StatusLine';

/** レスポンスヘッダー 1 行。どのヘッダーにも日本語の説明を添える */
export type ResponseHeader = { name: string; value: ReactNode; ja: string };

/** 出典のリンクの文字。同じサイトの文書が並んでも見分けられるよう、道と節まで出す */
export function sourceLabel(url: string): string {
  const u = new URL(url);
  return `${u.hostname}${u.pathname === '/' ? '' : u.pathname}${u.hash}`;
}

/** X-Source のヘッダー。出典ごとに 1 行 */
export function sourceHeaders(sources: readonly string[]): ResponseHeader[] {
  return sources.map((s) => ({
    name: 'X-Source',
    value: (
      <Link href={s} isExternalLink newTabLabel="(新しいタブで開きます)">
        {sourceLabel(s)}
      </Link>
    ),
    ja: '出典',
  }));
}

/**
 * 答えの結果を HTTP のレスポンスに見立てて出す: ステータス行 (日本語の説明つき)・ヘッダー・本文 (解説)。
 * 開発者ツールの Network タブで 1 つのやり取りを開いたときの形
 */
export default function AnswerResponse({
  status,
  request,
  headers,
  children,
}: {
  status: Status;
  request: string;
  headers: ResponseHeader[];
  children?: ReactNode;
}) {
  return (
    <section className="response" aria-label={`応答 ${status.code} ${status.reason}`} data-status={status.code}>
      <StatusLine status={status} request={request} />
      {headers.length > 0 && (
        <dl className="headers__list">
          {headers.map((h, i) => (
            <div key={`${h.name}-${i}`} className="headers__row">
              <dt>
                <code>{h.name}</code>
              </dt>
              <dd className="response__value">
                <span className="response__code">{h.value}</span>
                <Text type="supporting">{h.ja}</Text>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {children && <div className="response__body">{children}</div>}
    </section>
  );
}

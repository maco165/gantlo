import { Text } from '@astryxdesign/core/Text';
import StatusLine from '../components/StatusLine';
import Waterfall from '../components/Waterfall';
import { STAGES } from '../content/stages';
import { progressStatus } from '../lib/status';
import { COURSES } from '../lib/route';

/** ホーム = GET /me への応答。進み具合はステータス、記録はレスポンスヘッダーの形で読む */
export default function Home() {
  const learned: string[] = [];
  const status = progressStatus(learned.length, STAGES.length);
  const headers: [string, string][] = [
    ['X-Today-XP', '0 / 30'],
    ['X-Streak', '0 日連続'],
    ['Retry-After', '今日の復習 0 問'],
    ['Link', `追加のコース ${COURSES.length - 1} つ (Spring Boot・技術の歴史・管理の歴史・セキュリティ)`],
  ];
  return (
    <div className="page">
      <StatusLine status={status} request="GET /me" />
      <Waterfall learned={learned} />
      <section className="headers" aria-labelledby="headers-title">
        <h2 id="headers-title" className="display">
          Response Headers
        </h2>
        <dl className="headers__list">
          {headers.map(([k, v]) => (
            <div key={k} className="headers__row">
              <dt>
                <code>{k}</code>
              </dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <Text type="supporting">レッスンと記録は次の回から入ります。記録はこのブラウザ (localStorage) にだけ残す予定です。</Text>
      </section>
    </div>
  );
}

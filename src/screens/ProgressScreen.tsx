import { Link } from '@astryxdesign/core/Link';
import { Text } from '@astryxdesign/core/Text';
import StatusLine from '../components/StatusLine';
import Waterfall from '../components/Waterfall';
import { LESSONS } from '../content/index';
import { STAGES } from '../content/stages';
import type { Lesson } from '../content/types';
import { stageStates } from '../lib/journey';
import { currentStreak, type Progress } from '../lib/progress';
import { pageHref } from '../lib/route';
import { accuracy, courseProgress, formatRate, weeklyXp } from '../lib/stats';
import { progressStatus } from '../lib/status';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** YYYY-MM-DD の曜日 (端末の時刻の暦で) */
function weekday(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
}

/** YYYY-MM-DD を「11/23 (月)」の形にする */
function dayLabel(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  return `${m}/${d} (${weekday(day)})`;
}

/**
 * 進捗の画面 (/gantlo/progress/) = GET /me/stats への応答。
 * 正答率・この 7 日の XP・コースごとの進み具合・旅の 8 段の学習状況を、このブラウザの記録 (gantlo.v1) から出す
 */
export default function ProgressScreen({ progress, now = new Date(), lessons = LESSONS }: { progress: Progress; now?: Date; lessons?: readonly Lesson[] }) {
  const acc = accuracy(progress, lessons);
  const days = weeklyXp(progress, now);
  const weekTotal = days.reduce((s, d) => s + d.xp, 0);
  const maxXp = Math.max(1, ...days.map((d) => d.xp));
  const courses = courseProgress(progress, lessons);
  const states = stageStates(progress, lessons);
  const learned = states.filter((s) => s.learned).length;

  return (
    <div className="page">
      <h1 className="page__title">進捗</h1>
      <StatusLine status={progressStatus(learned, STAGES.length)} request="GET /me/stats" />

      <dl className="stats" data-testid="stats">
        <div className="stats__item" data-stat="accuracy">
          <dt>
            <Text type="supporting">正答率</Text>
          </dt>
          <dd>{formatRate(acc)}</dd>
        </div>
        <div className="stats__item" data-stat="week-xp">
          <dt>
            <Text type="supporting">7 日の XP</Text>
          </dt>
          <dd>{weekTotal}</dd>
        </div>
        <div className="stats__item" data-stat="streak">
          <dt>
            <Text type="supporting">連続</Text>
          </dt>
          <dd>{currentStreak(progress, now)} 日</dd>
        </div>
      </dl>
      <Text type="supporting">
        {acc.total > 0
          ? `正答率は、レッスンと復習で答えた ${acc.total} 回のうち、正解した ${acc.right} 回の割合です (実習は採点しないので入りません)。`
          : 'まだ問題に答えていません。レッスンや復習で答えると、正答率が出ます。'}
      </Text>

      <section className="prog" aria-labelledby="prog-xp-title">
        <h2 id="prog-xp-title" className="prog__title">
          この 7 日の XP
        </h2>
        <ol className="xp7" aria-label={days.map((d, i) => `${i === days.length - 1 ? '今日' : dayLabel(d.day)} ${d.xp} XP`).join('、')}>
          {days.map((d, i) => {
            const today = i === days.length - 1;
            return (
              <li key={d.day} className={today ? 'xp7__col xp7__col--today' : 'xp7__col'} data-day={d.day} data-xp={d.xp}>
                <span className="xp7__value">{d.xp}</span>
                <span className="xp7__track" aria-hidden="true">
                  <span className="xp7__bar" style={{ height: `${(d.xp / maxXp) * 100}%` }} />
                </span>
                <span className="xp7__label">{today ? '今日' : weekday(d.day)}</span>
              </li>
            );
          })}
        </ol>
        <Text type="supporting">1 問正解で 3 XP、実習で 10 XP。日付はこの端末の時刻で数えます。</Text>
      </section>

      <section className="prog" aria-labelledby="prog-courses-title">
        <h2 id="prog-courses-title" className="prog__title">
          コースごとの進み具合
        </h2>
        <table className="prog__table">
          <thead>
            <tr>
              <th scope="col">コース</th>
              <th scope="col">済み</th>
              <th scope="col">正答率</th>
              <th scope="col" className="prog__bar-col">
                <span className="visually-hidden">進み具合の帯</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.course} data-course={c.course} data-done={c.done} data-total={c.total}>
                <th scope="row">{c.title}</th>
                <td className="prog__num">{c.total > 0 ? `${c.done} / ${c.total}` : '準備中'}</td>
                <td className="prog__num">{formatRate(c.accuracy)}</td>
                <td className="prog__bar-col">
                  <span className="prog__track" aria-hidden="true">
                    <span className="prog__fill" style={{ width: `${c.total > 0 ? (c.done / c.total) * 100 : 0}%` }} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Text type="supporting">「済み」は終えたレッスンの数とレッスンの数です。「準備中」のコースは、まだレッスンがありません。</Text>
      </section>

      <section className="prog" aria-labelledby="prog-stages-title">
        <h2 id="prog-stages-title" className="prog__title">
          旅の 8 段の学習状況 ({learned} / {STAGES.length} 段)
        </h2>
        <Waterfall states={states} />
      </section>

      <p className="prog__note tap-links">
        <Text type="supporting">
          記録はこのブラウザ (localStorage) にだけ残します。間違えた問題は <Link href={pageHref('review')}>復習</Link> に、書き出しと読み込みは{' '}
          <Link href={pageHref('settings')}>設定</Link> にあります。
        </Text>
      </p>
    </div>
  );
}

import { Link } from '@astryxdesign/core/Link';
import { Text } from '@astryxdesign/core/Text';
import { lazy, Suspense } from 'react';
import StatusLine from '../components/StatusLine';
import Waterfall from '../components/Waterfall';
import { LESSONS } from '../content/index';
import { STAGES } from '../content/stages';
import type { Lesson } from '../content/types';
import { stageStates } from '../lib/journey';
import { CALENDAR_WEEKS, FORECAST_DAYS, LEVEL_MIN, calendarTotals, reviewForecast, studyCalendar } from '../lib/calendar';
import { freezeCountText, freezeText, weeklyTargetText } from '../lib/habits';
import { MASTERY_ORDER, MASTERY_SHORT, courseMastery, share } from '../lib/mastery';
import { currentStreak, type Progress } from '../lib/progress';
import { pageHref } from '../lib/route';
import { accuracy, courseProgress, formatRate, weeklyXp } from '../lib/stats';
import { progressStatus } from '../lib/status';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// まとめのカード (canvas で描く PNG) は、押したときに描くので部品ごと後から読む
const SummaryCard = lazy(() => import('../components/SummaryCard'));

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

/** 「11/23」の形 (予測の軸の字) */
function shortLabel(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  return `${m}/${d}`;
}

/** カレンダーのマスの読み上げと title (例: 11/23 (月) 12 問) */
function cellLabel(c: { day: string; count: number; studied: boolean }): string {
  if (c.count > 0) return `${dayLabel(c.day)} ${c.count} 問`;
  return c.studied ? `${dayLabel(c.day)} 学んだ日 (問題の数の記録なし)` : `${dayLabel(c.day)} 0 問`;
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
  const calendar = studyCalendar(progress, now);
  const totals = calendarTotals(calendar);
  const known = new Set(lessons.flatMap((l) => l.questions.map((q) => q.id)));
  const forecast = reviewForecast(progress, now, (id) => known.has(id));
  const maxDue = Math.max(1, ...forecast.map((d) => d.count));
  const mastery = courseMastery(progress, lessons).filter((c) => c.counts.total > 0);

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

      <dl className="headers__list prog__habits" data-testid="habits">
        <div className="headers__row" data-header="X-Streak-Freeze">
          <dt>
            <code>X-Streak-Freeze</code>
          </dt>
          <dd>{freezeText(progress, now)}</dd>
        </div>
        <div className="headers__row" data-header="X-Weekly-Target">
          <dt>
            <code>X-Weekly-Target</code>
          </dt>
          <dd>{weeklyTargetText(progress, now)}</dd>
        </div>
      </dl>
      <Text type="supporting">
        {freezeCountText(progress)}: 休みの札は、学んだ日が 7 日たまるごとに 1 個 (2 個まで) 増えます。休んだ日があると、次に学んだときにその日数分を使い、連続日数を保ちます (足りなければ切れます)。週の目標は{' '}
        <Link href={pageHref('settings')}>設定</Link> で決めます。
      </Text>

      <section className="prog" aria-labelledby="prog-cal-title">
        <h2 id="prog-cal-title" className="prog__title">
          学んだ日 (過去 {CALENDAR_WEEKS} 週)
        </h2>
        <Text type="supporting">
          {totals.studied} 日学び、{totals.answered} 問に答えました。列が週 (月曜から日曜)、色の濃さが日ごとに答えた問題の数です。
        </Text>
        <ol className="cal" data-testid="calendar" aria-label={`過去 ${CALENDAR_WEEKS} 週の学んだ日 (日ごとに答えた問題の数)`}>
          {calendar.flat().map((c) =>
            c.future ? (
              <li key={c.day} className="cal__cell cal__cell--future" aria-hidden="true" />
            ) : (
              <li key={c.day} className={`cal__cell cal__cell--l${c.level}`} data-day={c.day} data-count={c.count} data-level={c.level} title={cellLabel(c)}>
                <span className="visually-hidden">{cellLabel(c)}</span>
              </li>
            ),
          )}
        </ol>
        <p className="cal__legend">
          <Text type="supporting">少ない</Text>
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className={`cal__cell cal__cell--l${l}`} aria-hidden="true" />
          ))}
          <Text type="supporting">多い</Text>
        </p>
        <Text type="supporting">
          濃さは 0 問 · {LEVEL_MIN[0]}〜{LEVEL_MIN[1] - 1} 問 · {LEVEL_MIN[1]}〜{LEVEL_MIN[2] - 1} 問 · {LEVEL_MIN[2]}〜{LEVEL_MIN[3] - 1} 問 · {LEVEL_MIN[3]} 問以上の 5 つです。問題の数を残す前の学んだ日は、いちばん薄い色にします。
        </Text>
      </section>

      <section className="prog" aria-labelledby="prog-due-title">
        <h2 id="prog-due-title" className="prog__title">
          この先 {FORECAST_DAYS} 日の復習
        </h2>
        <ol className="xp7 xp7--wide" data-testid="forecast" aria-label={forecast.map((d, i) => `${i === 0 ? '今日' : dayLabel(d.day)} ${d.count} 問`).join('、')}>
          {forecast.map((d, i) => (
            <li key={d.day} className={i === 0 ? 'due__col due__col--today' : 'due__col'} data-day={d.day} data-due={d.count}>
              <span className="xp7__value">{d.count}</span>
              <span className="xp7__track" aria-hidden="true">
                <span className="xp7__bar" style={{ height: `${(d.count / maxDue) * 100}%` }} />
              </span>
              <span className="xp7__label">{i === 0 ? '今日' : shortLabel(d.day)}</span>
            </li>
          ))}
        </ol>
        <Text type="supporting">今日の数には、予定の日を過ぎてまだ解いていない問題も入れます。</Text>
      </section>

      <section className="prog" aria-labelledby="prog-mastery-title">
        <h2 id="prog-mastery-title" className="prog__title">
          問題ごとの到達
        </h2>
        <table className="mastery" data-testid="mastery">
          <thead>
            <tr>
              <th scope="col">コース</th>
              {MASTERY_ORDER.map((m) => (
                <th key={m} scope="col" className="prog__num">
                  {MASTERY_SHORT[m]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mastery.map((c) => (
              <tr key={c.course} data-mastery-course={c.course}>
                <th scope="row">{c.title}</th>
                {MASTERY_ORDER.map((m) => (
                  <td key={m} className="prog__num" data-mastery={m} data-count={c.counts[m]}>
                    {c.counts[m]}
                    <span className="mastery__share">{share(c.counts[m], c.counts.total)}%</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <Text type="supporting">
          採点する問題 (実習を除く) を、まだ解いていない・直近で間違えた・1 回正解・2 回続けて正解の 4 つに分けます。「2 回続けて正解」は、間違えずに 2 回以上続けて正解した問題です。割合はコースの問題の数に対する割合です。
        </Text>
      </section>

      <section className="prog" aria-labelledby="prog-card-title">
        <h2 id="prog-card-title" className="prog__title">
          学習のまとめのカード
        </h2>
        <Suspense fallback={<Text type="supporting">読み込んでいます。</Text>}>
          <SummaryCard progress={progress} now={now} lessons={lessons} />
        </Suspense>
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

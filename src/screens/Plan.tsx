import { Text } from '@astryxdesign/core/Text';
import { useEffect, useRef, useState } from 'react';
import PlanGantt from '../components/PlanGantt';
import StatusLine from '../components/StatusLine';
import { lessonsOf } from '../content/index';
import { canSavePlan, moveCourse, planOrder, savePlan, toggleCourse } from '../lib/plan';
import { MAX_COURSE_DAYS, MIN_COURSE_DAYS, isCourseDays, isValidDay, setProfile, type GanttView, type Plan as PlanRecord, type Progress } from '../lib/progress';
import { COURSES, type CourseId } from '../lib/route';
import { courseDays, planStart, setCourseDays } from '../lib/schedule';
import { PLAN_SAVED } from '../lib/status';

type Props = { progress: Progress; updateProgress: (fn: (p: Progress) => Progress) => void; now?: Date };

/**
 * 計画を組む画面 (/gantlo/plan/)。学ぶコースを選び、上下のボタンで順を並べ、開始日とコースごとの目安の日数を直して、PUT で保存する。
 * 直している途中も、下のガントチャートの帯と巻き・遅れはその場で変わる
 */
export default function Plan({ progress, updateProgress, now = new Date() }: Props) {
  // 保存した計画が無ければ、既定の順 (全コース) から組み始める
  const [draft, setDraft] = useState<CourseId[]>(() => planOrder(progress));
  // 開始日は保存したもの、無ければ最初にレッスンを終えた日か今日 (schedule.ts の planStart)
  const [start, setStart] = useState(() => planStart(progress, now));
  // 本人が直した目安の日数 (直していないコースはレッスン数からの既定)。入力の途中の字 (空など) は text に持ち、正しい値になったら days に入れる
  const [days, setDays] = useState<NonNullable<PlanRecord['days']>>(() => ({ ...progress.plan?.days }));
  const [text, setText] = useState<Partial<Record<CourseId, string>>>({});
  const [saved, setSaved] = useState(false);
  // 並べ替えたあと、押したボタンに (端で押せなくなったら反対のボタンに) 手元を戻す。キーボードだけで続けて動かせるように。
  // 上下を押したときだけ走らせる (チェックを切り替えて draft が変わったときに、手元をボタンへ引き戻さない)
  const [focus, setFocus] = useState<{ course: CourseId; dir: 'up' | 'down' } | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    if (!focus) return;
    const other = focus.dir === 'up' ? 'down' : 'up';
    const el = [buttons.current.get(`${focus.course}-${focus.dir}`), buttons.current.get(`${focus.course}-${other}`)].find((b) => b && !b.disabled);
    el?.focus();
  }, [focus]);

  const change = (next: CourseId[]) => {
    setDraft(next);
    setSaved(false);
  };
  const changeStart = (v: string) => {
    if (!isValidDay(v)) return;
    setStart(v);
    setSaved(false);
  };
  // 範囲外 (0・400・2.5・-3・空) は予定に入れず、入力欄に aria-invalid と補助の文を出す (直すまで残す)。
  // 既定と同じ値を打つと直した値から外す (既定に戻る。setCourseDays)
  const changeDays = (course: CourseId, v: string) => {
    setText((t) => ({ ...t, [course]: v }));
    const n = Number(v);
    if (v.trim() === '' || !isCourseDays(n)) return;
    setDays((d) => setCourseDays(d, course, n, lessonsOf(course).length));
    setSaved(false);
  };
  const invalidDays = (course: CourseId) => {
    const t = text[course];
    return t !== undefined && (t.trim() === '' || !isCourseDays(Number(t)));
  };
  // 表示する期間は表示の好みなので、選んだらすぐ設定 (profile) に保存する (計画の PUT を待たない)
  const changeView = (view: GanttView) => updateProgress((p) => setProfile(p, { ganttView: view }));
  const move = (course: CourseId, dir: 'up' | 'down') => {
    change(moveCourse(draft, course, dir === 'up' ? -1 : 1));
    setFocus({ course, dir });
  };
  const save = () => {
    if (!canSavePlan(draft)) return;
    updateProgress((p) => savePlan(p, draft, { start, days }) ?? p);
    setSaved(true);
  };
  // 選んだコース (学ぶ順) のあとに選んでいないコースを続け、1 つの並びにする。チェックを切り替えても同じ行のまま動くので、手元がチェックに残る
  const rows = [...draft, ...COURSES.filter((c) => !draft.includes(c.id)).map((c) => c.id)];
  const titleOf = (id: CourseId) => COURSES.find((c) => c.id === id)?.title ?? id;
  const ref = (key: string) => (el: HTMLButtonElement | null) => {
    if (el) buttons.current.set(key, el);
    else buttons.current.delete(key);
  };

  return (
    <div className="page">
      <h1 className="page__title">計画 (Gantt)</h1>
      <Text type="supporting">
        学ぶコースを選び、学ぶ順に並べます。開始日とコースごとの目安の日数から予定の帯を引き、済んだ量を今日の予定と比べて巻きか遅れかを出します。
        予定は目安で、期限は決めません。済んだ記録は、組み直しても消えません。
      </Text>
      {!progress.plan && <Text type="supporting">まだ計画を保存していません。いまは既定の順 (本編 → 追加のコース) です。</Text>}

      <section className="plan" aria-labelledby="plan-courses-title">
        <h2 id="plan-courses-title" className="display">
          Request Body
        </h2>
        <p className="plan__field">
          <label htmlFor="plan-start">開始日</label>
          <input id="plan-start" type="date" value={start} onChange={(e) => changeStart(e.target.value)} />
        </p>
        <ol className="plan__list" aria-label="コース (選んだものは学ぶ順)">
          {rows.map((id) => {
            const i = draft.indexOf(id);
            const chosen = i >= 0;
            return (
              <li key={id} className={chosen ? 'plan__item' : 'plan__item plan__item--off'} data-course={id}>
                <label className="plan__check">
                  <input type="checkbox" checked={chosen} onChange={() => change(toggleCourse(draft, id))} />
                  {chosen && <span className="plan__no">{i + 1}</span>}
                  <span className="plan__title">{titleOf(id)}</span>
                  <Text type="supporting">{lessonsOf(id).length} レッスン</Text>
                </label>
                {chosen && lessonsOf(id).length > 0 && (
                  <span className="plan__field plan__days">
                    <label htmlFor={`plan-days-${id}`}>目安</label>
                    <input
                      id={`plan-days-${id}`}
                      type="number"
                      inputMode="numeric"
                      min={MIN_COURSE_DAYS}
                      max={MAX_COURSE_DAYS}
                      step={1}
                      value={text[id] ?? String(courseDays(days, id, lessonsOf(id).length))}
                      onChange={(e) => changeDays(id, e.target.value)}
                      aria-label={`${titleOf(id)} の目安の日数`}
                      aria-invalid={invalidDays(id) ? 'true' : undefined}
                      aria-describedby={invalidDays(id) ? `plan-days-${id}-error` : undefined}
                    />
                    <span aria-hidden="true">日</span>
                    {invalidDays(id) && (
                      <span id={`plan-days-${id}-error`} className="plan__error">
                        1〜365 の整数で入れてください。今は {courseDays(days, id, lessonsOf(id).length)} 日で数えています
                      </span>
                    )}
                  </span>
                )}
                {chosen && (
                  <span className="plan__moves">
                    <button type="button" className="btn btn--icon" ref={ref(`${id}-up`)} disabled={i === 0} onClick={() => move(id, 'up')} aria-label={`${titleOf(id)} を上へ`}>
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn btn--icon"
                      ref={ref(`${id}-down`)}
                      disabled={i === draft.length - 1}
                      onClick={() => move(id, 'down')}
                      aria-label={`${titleOf(id)} を下へ`}
                    >
                      ↓
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <PlanGantt plan={{ courses: draft, start, days }} progress={progress} now={now} view={progress.profile?.ganttView ?? { kind: 'all' }} onView={changeView} />

      <section className="plan__save" aria-label="保存">
        <p>
          <button type="button" className="btn btn--primary" onClick={save} disabled={!canSavePlan(draft)}>
            <code>PUT</code> この順で学ぶ
          </button>
        </p>
        {!canSavePlan(draft) && <Text type="supporting">コースを 1 つ以上選ぶと保存できます。</Text>}
        <div aria-live="polite">{saved && <StatusLine status={PLAN_SAVED} request="PUT /plan" />}</div>
      </section>
    </div>
  );
}

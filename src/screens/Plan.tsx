import { Text } from '@astryxdesign/core/Text';
import { useEffect, useRef, useState } from 'react';
import PlanGantt from '../components/PlanGantt';
import StatusLine from '../components/StatusLine';
import { lessonsOf } from '../content/index';
import { canSavePlan, moveCourse, planOrder, savePlan, toggleCourse } from '../lib/plan';
import type { Progress } from '../lib/progress';
import { COURSES, type CourseId } from '../lib/route';
import { PLAN_SAVED } from '../lib/status';

type Props = { progress: Progress; updateProgress: (fn: (p: Progress) => Progress) => void };

/** 計画を組む画面 (/gantlo/plan/)。学ぶコースを選び、上下のボタンで順を並べ、PUT で保存する */
export default function Plan({ progress, updateProgress }: Props) {
  // 保存した計画が無ければ、既定の順 (全コース) から組み始める
  const [draft, setDraft] = useState<CourseId[]>(() => planOrder(progress));
  const [saved, setSaved] = useState(false);
  // 並べ替えたあと、押したボタンに (端で押せなくなったら反対のボタンに) 手元を戻す。キーボードだけで続けて動かせるように
  const [focus, setFocus] = useState<{ course: CourseId; dir: 'up' | 'down' } | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    if (!focus) return;
    const other = focus.dir === 'up' ? 'down' : 'up';
    const el = [buttons.current.get(`${focus.course}-${focus.dir}`), buttons.current.get(`${focus.course}-${other}`)].find((b) => b && !b.disabled);
    el?.focus();
  }, [focus, draft]);

  const change = (next: CourseId[]) => {
    setDraft(next);
    setSaved(false);
  };
  const move = (course: CourseId, dir: 'up' | 'down') => {
    change(moveCourse(draft, course, dir === 'up' ? -1 : 1));
    setFocus({ course, dir });
  };
  const save = () => {
    if (!canSavePlan(draft)) return;
    updateProgress((p) => savePlan(p, draft) ?? p);
    setSaved(true);
  };
  const unchosen = COURSES.filter((c) => !draft.includes(c.id));
  const titleOf = (id: CourseId) => COURSES.find((c) => c.id === id)?.title ?? id;
  const ref = (key: string) => (el: HTMLButtonElement | null) => {
    if (el) buttons.current.set(key, el);
    else buttons.current.delete(key);
  };

  return (
    <div className="page">
      <h1 className="page__title">計画 (Gantt)</h1>
      <Text type="supporting">
        学ぶコースを選び、学ぶ順に並べます。帯の長さはレッスンの数で、期限や期間は決めません。済んだ記録は、組み直しても消えません。
      </Text>
      {!progress.plan && <Text type="supporting">まだ計画を保存していません。いまは既定の順 (本編 → 追加のコース) です。</Text>}

      <section className="plan" aria-labelledby="plan-courses-title">
        <h2 id="plan-courses-title" className="display">
          Request Body
        </h2>
        <ol className="plan__list" aria-label="学ぶ順">
          {draft.map((id, i) => (
            <li key={id} className="plan__item" data-course={id}>
              <label className="plan__check">
                <input type="checkbox" checked onChange={() => change(toggleCourse(draft, id))} />
                <span className="plan__no">{i + 1}</span>
                <span className="plan__title">{titleOf(id)}</span>
                <Text type="supporting">{lessonsOf(id).length} レッスン</Text>
              </label>
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
            </li>
          ))}
        </ol>
        {unchosen.length > 0 && (
          <ul className="plan__list plan__list--off" aria-label="選んでいないコース">
            {unchosen.map((c) => (
              <li key={c.id} className="plan__item" data-course={c.id}>
                <label className="plan__check">
                  <input type="checkbox" checked={false} onChange={() => change(toggleCourse(draft, c.id))} />
                  <span className="plan__title">{c.title}</span>
                  <Text type="supporting">{lessonsOf(c.id).length} レッスン</Text>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <PlanGantt courses={draft} progress={progress} />

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

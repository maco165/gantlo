import { Text } from '@astryxdesign/core/Text';
import { stageBars } from '../content/stages';
import type { StageState } from '../lib/journey';

/**
 * リクエストの旅のウォーターフォール (開発者ツールの Network タブの帯)。
 * 8 段の帯を階段に並べ、段に紐づくレッスンの済んだ割合だけ帯を塗る。
 * 1 つでも済んだ段は「学習済み」で、全部済めば 200、途中なら 206 を出す
 */
export default function Waterfall({ states }: { states: readonly StageState[] }) {
  const bars = stageBars();
  return (
    <section className="wf" aria-labelledby="wf-title">
      <header className="wf__head">
        <h2 id="wf-title" className="display">
          Waterfall
        </h2>
        <Text type="supporting">URL を打ってから画面が出るまで</Text>
      </header>
      <ol className="wf__rows">
        {bars.map((b, i) => {
          const s = states.find((x) => x.id === b.id) ?? { id: b.id, done: 0, total: 0, learned: false };
          const all = s.total > 0 && s.done >= s.total;
          const fill = s.total > 0 ? (s.done / s.total) * 100 : 0;
          return (
            <li key={b.id} className="wf__row" data-stage={b.id} data-learned={s.learned ? 'true' : 'false'}>
              <span className="wf__name">
                <span className="wf__no">{i + 1}</span> {b.name}
              </span>
              <span className="wf__step">
                <Text type="supporting">
                  <span className={s.learned ? 'wf__state wf__state--done' : 'wf__state'}>
                    {s.learned ? `学習済み ${s.done}/${s.total}` : '未学習'}
                  </span>{' '}
                  · {b.step} · 第 {b.week} 週 · {b.spec}
                </Text>
              </span>
              <span className="wf__track" aria-hidden="true">
                <span className="wf__bar" style={{ left: `${b.left}%`, width: `${b.width}%` }}>
                  <span className="wf__fill" style={{ width: `${fill}%` }} />
                </span>
              </span>
              <span className={all ? 'wf__status wf__status--done' : s.learned ? 'wf__status wf__status--partial' : 'wf__status'}>
                {all ? '200' : s.learned ? '206' : '—'}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

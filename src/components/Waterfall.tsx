import { Text } from '@astryxdesign/core/Text';
import { stageBars } from '../content/stages';

/**
 * リクエストの旅のウォーターフォール (開発者ツールの Network タブの帯)。
 * 8 段の帯を階段に並べ、学んだ段を塗る。学習の記録はまだ持たないので、今はすべて未学習。
 */
export default function Waterfall({ learned = [] }: { learned?: readonly string[] }) {
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
          const done = learned.includes(b.id);
          return (
            <li key={b.id} className="wf__row">
              <span className="wf__name">
                <span className="wf__no">{i + 1}</span> {b.name}
              </span>
              <span className="wf__step">
                <Text type="supporting">
                  {b.step} · 第 {b.week} 週 · {b.spec}
                </Text>
              </span>
              <span className="wf__track" aria-hidden="true">
                <span className={done ? 'wf__bar wf__bar--done' : 'wf__bar'} style={{ left: `${b.left}%`, width: `${b.width}%` }} />
              </span>
              <span className={done ? 'wf__status wf__status--done' : 'wf__status'}>{done ? '200' : '—'}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

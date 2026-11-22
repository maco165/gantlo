// レッスンの要点 (intro) を、書き出す HTML の本文にする。画面 (components/LessonIntro.tsx) と同じ見出しと中身。
// 答えにかかわるもの (穴埋めの正解・誤答の説明) は要点に入らない (scripts/check-content.mjs が要点の文に正解が無いことを見る)。
import { INTRO_GOALS_HEADING, INTRO_HEADING, INTRO_SOURCES_HEADING, INTRO_TRY_HEADING } from '../lib/intro';
import type { LessonIntro } from '../content/types';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * 要点の HTML。section で包む (本文の問題の一覧 `main > ol` と並ばないように、目標や図の ol/ul を section の中に置く)。
 * 要点の無いレッスンは空
 */
export function introHtml(intro: LessonIntro | undefined): string[] {
  if (!intro) return [];
  const f = intro.figure;
  const figure = f
    ? `<figure>${
        f.kind === 'flow'
          ? `<ol>${f.items.map((it) => `<li>${esc(it.label)}${it.note ? `: ${esc(it.note)}` : ''}</li>`).join('')}</ol>`
          : `<dl>${f.items.map((it) => `<dt>${esc(it.label)}</dt><dd>${esc(it.note ?? '')}</dd>`).join('')}</dl>`
      }<figcaption>${esc(f.caption)}</figcaption></figure>`
    : '';
  const tryIt = intro.tryIt?.length
    ? `<h3>${esc(INTRO_TRY_HEADING)}</h3>${intro.tryIt.map((t) => `<pre><code>${esc(t.command)}</code></pre><p>${esc(t.expect)}</p>`).join('')}`
    : '';
  return [
    `<section id="intro"><h2>${esc(INTRO_HEADING)}</h2>`,
    `<h3>${esc(INTRO_GOALS_HEADING)}</h3><ul>${intro.goals.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>`,
    ...intro.body.map((p) => `<p>${esc(p)}</p>`),
    figure,
    tryIt,
    `<h3>${esc(INTRO_SOURCES_HEADING)}</h3><ul>${intro.sources.map((u) => `<li><a href="${esc(u)}">${esc(u)}</a></li>`).join('')}</ul>`,
    '</section>',
  ].filter(Boolean);
}

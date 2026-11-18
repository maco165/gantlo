// 問題を Claude や ChatGPT に聞くためのリンク。入力欄に問題文を入れた状態で開く (?q= に渡す)。
// サイトからは何も送らない。開いた先で送るかどうかは使う人が決める。
import type { Question } from '../content/types';

/** 長すぎる URL は開けないことがあるので、文はこの長さで切る */
export const MAX_PROMPT_LENGTH = 1500;

const letter = (i: number) => String.fromCharCode(65 + i);

/** 答えたあとの状態。picked は画面に出した自分の答え (穴埋めは打った文字、4 択は選んだ id) */
export type AnswerState = { picked: string; correct: boolean };

/** 正解を表す文。4 択は画面の並びでの記号と選択肢の文 */
function rightAnswer(q: Question): string {
  switch (q.kind) {
    case 'command':
    case 'http':
      return q.blanks.map((b) => b.answers[0]).join(' / ');
    case 'choice': {
      const i = q.choices.findIndex((c) => c.id === q.answer);
      return `${letter(i)}. ${q.choices[i]?.text ?? ''}`;
    }
    case 'order':
      return q.answer.map((id) => q.items.find((it) => it.id === id)?.text ?? id).join(' → ');
    case 'lab':
      return q.expected;
  }
}

function myAnswer(q: Question, picked: string): string {
  if (q.kind !== 'choice') return picked;
  const i = q.choices.findIndex((c) => c.id === picked);
  return i < 0 ? picked : `${letter(i)}. ${q.choices[i].text}`;
}

/**
 * 問題を、AI にそのまま貼れる文にする。答える前は正解・解説・実行結果の例・実習で見えることを入れない。
 * 答えたあとなら自分の答えと正解も添える
 */
export function questionText(q: Question, answered?: AnswerState): string {
  const lines: string[] = ['API と HTTP の基礎を勉強しています。次の問題について日本語で教えてください。', '', `問題: ${q.prompt}`];

  if (q.kind === 'command' || q.kind === 'http') {
    const lang = q.kind === 'command' ? 'sh' : q.format;
    lines.push('', '```' + lang, q.code.replaceAll('{{blank}}', '____'), '```');
  } else if (q.kind === 'choice') {
    if (q.code) lines.push('', '```' + q.code.format, q.code.text, '```');
    lines.push('', ...q.choices.map((c, i) => `${letter(i)}. ${c.text}`));
  } else if (q.kind === 'order') {
    // 項目は画面に出した並び (混ぜたもの) で書く。渡された並びが正しい順と同じなら、順が漏れないよう 1 つずらす
    const items = [...q.items];
    if (!answered && items.length >= 2 && items.every((it, i) => it.id === q.answer[i])) items.push(items.shift()!);
    lines.push('', ...items.map((it) => `- ${it.text}`));
  } else {
    lines.push('', ...q.steps.map((s, i) => `${i + 1}. ${s.text}${s.command ? `: ${s.command}` : ''}`));
  }

  lines.push('');
  if (answered) {
    if (q.kind === 'lab') lines.push(`手元で試しました。見えるはずのこと: ${q.expected}`, 'なぜそう見えるのか説明してください。');
    else
      lines.push(
        `私の答えは「${myAnswer(q, answered.picked)}」で${answered.correct ? '正解' : '不正解'}でした (正解は「${rightAnswer(q)}」)。`,
        'なぜその答えになるのか、ほかの答えとの違いも含めて説明してください。',
      );
  } else {
    lines.push('すぐに答えを言わず、考え方のヒントから教えてください。');
  }

  const text = lines.join('\n');
  return text.length > MAX_PROMPT_LENGTH ? `${text.slice(0, MAX_PROMPT_LENGTH - 1)}…` : text;
}

export function aiLinks(text: string): { claude: string; chatgpt: string } {
  const q = encodeURIComponent(text);
  return {
    claude: `https://claude.ai/new?q=${q}`,
    chatgpt: `https://chatgpt.com/?q=${q}`,
  };
}

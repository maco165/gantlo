import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { useEffect, useRef, useState } from 'react';
import type { OrderQuestion } from '../content/types';
import { XP_PER_CORRECT } from '../lib/grade';
import { answerIndex, gradeOrder, moveItem, type OrderGrade } from '../lib/order';
import { RETRY_AFTER_SECONDS, orderStatus } from '../lib/status';
import AnswerResponse, { sourceHeaders } from './AnswerResponse';
import AskAi from './AskAi';
import { ActionArea, PrimaryAction, QuestionHead } from './QuestionFrame';

type Dir = 'up' | 'down';

/**
 * 並べ替え。上下のボタンで行を動かす (ドラッグに頼らない)。項目は渡された並びのまま出す (混ぜるのは呼ぶ側)。
 * 確かめると、並べた順の行ごとに、正しい順での位置に帯を描く。正しい順なら帯が階段になり、違う位置の行は誤りの色になる
 */
export default function OrderQuestionView({
  question,
  head,
  request,
  onChecked,
  nextLabel,
  onNext,
}: {
  question: OrderQuestion;
  head: string;
  request: string;
  onChecked: (correct: boolean) => void;
  nextLabel: string;
  onNext: () => void;
}) {
  const [order, setOrder] = useState(() => question.items.map((it) => it.id));
  const [result, setResult] = useState<OrderGrade | null>(null);
  const [moved, setMoved] = useState<{ id: string; dir: Dir } | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement | null>());
  const checked = result !== null;
  const n = order.length;
  const textOf = (id: string) => question.items.find((it) => it.id === id)?.text ?? id;
  const correctAt = answerIndex(question);

  // 動かしたあとも、手元 (focus) を動かした行のボタンに残す。端に着いて押せなくなったら、押せる方のボタンへ
  useEffect(() => {
    if (!moved || checked) return;
    const i = order.indexOf(moved.id);
    const dir: Dir = moved.dir === 'up' && i === 0 ? 'down' : moved.dir === 'down' && i === n - 1 ? 'up' : moved.dir;
    buttons.current.get(`${moved.id}:${dir}`)?.focus();
  }, [order, moved, n, checked]);

  const move = (i: number, dir: Dir) => {
    if (checked) return;
    const to = dir === 'up' ? i - 1 : i + 1;
    if (to < 0 || to >= n) return;
    setOrder((o) => moveItem(o, i, dir === 'up' ? -1 : 1));
    setMoved({ id: order[i], dir });
  };

  const check = () => {
    if (checked) return;
    const g = gradeOrder(question, order);
    setResult(g);
    onChecked(g.correct);
  };

  const announce = moved && !checked ? `「${textOf(moved.id)}」を ${order.indexOf(moved.id) + 1} 行目へ動かしました` : '';
  const picked = order.map(textOf).join(' → ');

  return (
    <VStack gap={5}>
      <QuestionHead kind={`並べ替え · ${head}`} prompt={question.prompt} />

      <section className="order" aria-labelledby="order-caption">
        <span id="order-caption" className="order__caption">
          <Text type="supporting">{checked ? '並べた順の帯。正しい順なら階段になります' : '上下のボタンで、正しい順に並べ替えます'}</Text>
        </span>
        <ol className="order__rows" data-testid="order-rows">
          {order.map((id, i) => {
            const ok = result?.rows[i];
            const rowClass = ['order__row', checked ? 'order__row--checked' : '', checked && !ok ? 'order__row--wrong' : ''].filter(Boolean).join(' ');
            const text = textOf(id);
            return (
              <li key={id} className={rowClass} data-item={id} data-ok={checked ? String(ok) : undefined}>
                <span className="order__no">{i + 1}</span>
                <span className="order__text">
                  <Text>{text}</Text>
                </span>
                {!checked ? (
                  <span className="order__moves">
                    <Button
                      ref={(el) => void buttons.current.set(`${id}:up`, el)}
                      variant="secondary"
                      isIconOnly
                      icon={<ChevronUpIcon width={20} height={20} />}
                      label={`上へ: ${text}`}
                      onClick={() => move(i, 'up')}
                      isDisabled={i === 0}
                    />
                    <Button
                      ref={(el) => void buttons.current.set(`${id}:down`, el)}
                      variant="secondary"
                      isIconOnly
                      icon={<ChevronDownIcon width={20} height={20} />}
                      label={`下へ: ${text}`}
                      onClick={() => move(i, 'down')}
                      isDisabled={i === n - 1}
                    />
                  </span>
                ) : (
                  <>
                    <span className="order__mark">
                      <Text type="supporting">{ok ? '正しい位置' : `違う位置 · 正しくは ${correctAt[id] + 1} 行目`}</Text>
                    </span>
                    <span className="order__track" aria-hidden="true">
                      <span className="order__bar" style={{ left: `${(correctAt[id] / n) * 100}%`, width: `${100 / n}%` }} />
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ol>
        <span className="visually-hidden" aria-live="polite">
          {announce}
        </span>
      </section>

      <ActionArea>
        {!checked ? (
          <>
            <PrimaryAction label="POST 答えを送る" onClick={check} />
            <AskAi question={question} />
          </>
        ) : (
          <>
            <AnswerResponse
              status={orderStatus(result.misplaced)}
              request={request}
              headers={[
                ...(result.correct
                  ? [{ name: 'X-XP', value: `+${XP_PER_CORRECT}`, ja: 'この問題で得た XP' }]
                  : [
                      { name: 'X-Expected', value: question.answer.map(textOf).join(' → '), ja: '正しい順' },
                      { name: 'Retry-After', value: String(RETRY_AFTER_SECONDS), ja: '明日の復習に入ります (1 日 = 86400 秒)' },
                    ]),
                ...sourceHeaders(question.sources),
              ]}
            >
              <Text>{question.explanation}</Text>
            </AnswerResponse>
            <PrimaryAction label={nextLabel} onClick={onNext} />
            <AskAi question={question} answered={{ picked, correct: result.correct }} />
          </>
        )}
      </ActionArea>
    </VStack>
  );
}

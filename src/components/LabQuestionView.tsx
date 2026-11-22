import { CheckboxList, CheckboxListItem } from '@astryxdesign/core/CheckboxList';
import { Code } from '@astryxdesign/core/Code';
import { VStack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { useState } from 'react';
import type { LabQuestion } from '../content/types';
import { XP_PER_LAB } from '../lib/grade';
import { LAB_DONE } from '../lib/status';
import AnswerResponse, { sourceHeaders } from './AnswerResponse';
import AskAi from './AskAi';
import ReportIssue from './ReportIssue';
import { ActionArea, PrimaryAction, QuestionHead } from './QuestionFrame';
import { KIND_LABELS } from '../lib/questionKind';

/** 実習。手元で打って観察する。採点はせず、全部の手順に印を付けたら終えられ、見えるはずのことと解説を出す */
export default function LabQuestionView({
  question,
  head,
  request,
  onDone,
  nextLabel,
  onNext,
}: {
  question: LabQuestion;
  head: string;
  request: string;
  onDone: () => void;
  nextLabel: string;
  onNext: () => void;
}) {
  const [checked, setChecked] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const allChecked = checked.length === question.steps.length;

  const finish = () => {
    if (done || !allChecked) return;
    setDone(true);
    onDone();
  };

  return (
    <VStack gap={5}>
      <QuestionHead kind={`${KIND_LABELS.lab} · 手元の端末で動かす · ${head}`} prompt={question.prompt} />
      <CheckboxList label="手順" description="1 つずつ動かし、できたら印を付けます" value={checked} onChange={setChecked} hasDividers isReadOnly={done}>
        {question.steps.map((s, i) => (
          // 文字列の label は 1 行に切られるので、Text で渡して折り返させ、印を 1 行目にそろえる
          <CheckboxListItem
            key={i}
            value={String(i)}
            align="first-line"
            label={<Text>{`${i + 1}. ${s.text}`}</Text>}
            description={s.command ? <Code>{s.command}</Code> : undefined}
          />
        ))}
      </CheckboxList>

      <ActionArea>
        {!done ? (
          <>
            <PrimaryAction label="POST 実習を終える" onClick={finish} isDisabled={!allChecked} />
            <AskAi question={question} />
          </>
        ) : (
          <>
            <AnswerResponse
              status={LAB_DONE}
              request={request}
              headers={[{ name: 'X-XP', value: `+${XP_PER_LAB}`, ja: '実習で得た XP' }, ...sourceHeaders(question.sources)]}
            >
              <Text>見えるはずのこと: {question.expected}</Text>
              <Text>{question.explanation}</Text>
            </AnswerResponse>
            <PrimaryAction label={nextLabel} onClick={onNext} />
            <AskAi question={question} answered={{ picked: '', correct: true }} />
            <ReportIssue questionId={question.id} />
          </>
        )}
      </ActionArea>
    </VStack>
  );
}

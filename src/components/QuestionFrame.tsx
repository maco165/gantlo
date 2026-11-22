import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { createContext, useContext, type ReactNode } from 'react';
import { WIDE_QUERY, useMediaQuery } from '../lib/useMediaQuery';

/** 模擬試験で答えを送るボタンの文字 (正誤は見せずに次の問題へ進む) */
export const EXAM_SUBMIT_LABEL = 'POST 答えを送って次へ';

/**
 * 問題文の見出しの段。レッスンの画面は上の帯のレッスン名が h1 なので 2 にする (書き出す HTML の h1 = レッスン名と揃える)。
 * 模擬試験の途中の画面は問題文が h1 のまま (既定)
 */
export const QuestionHeadingLevel = createContext<1 | 2>(1);

/** 問題の見出し (種類 · 何問目) と問題文 */
export function QuestionHead({ kind, prompt }: { kind: string; prompt: string }) {
  const Tag = useContext(QuestionHeadingLevel) === 2 ? 'h2' : 'h1';
  return (
    <VStack gap={1.5}>
      <Text type="supporting">{kind}</Text>
      <Tag className="q-title">{prompt}</Tag>
    </VStack>
  );
}

/** 答えを送る・次へのボタン。スマホは全幅、PC は右寄せ */
export function PrimaryAction({ label, onClick, isDisabled }: { label: string; onClick: () => void; isDisabled?: boolean }) {
  const isWide = useMediaQuery(WIDE_QUERY);
  if (!isWide) return <Button variant="primary" size="lg" width="100%" label={label} onClick={onClick} isDisabled={isDisabled} />;
  return (
    <HStack gap={3} justify="end">
      <Button variant="primary" label={label} onClick={onClick} isDisabled={isDisabled} />
    </HStack>
  );
}

/** 問題の下の操作の帯 */
export function ActionArea({ children }: { children: ReactNode }) {
  return (
    <div className="q-actions">
      <VStack gap={3}>{children}</VStack>
    </div>
  );
}

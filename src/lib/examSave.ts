// 模擬試験の解いている途中の回を localStorage に残す・消す。問題データを読まない軽いモジュールにして、
// 設定の画面 (記録を消す) からも、問題データを読まずに消せるようにする。出題との突き合わせは lib/exam.ts の fromSavedExam
import { safeLocalStorage, type KeyValueStorage } from './progress';

/**
 * 解いている途中の回を残す localStorage のキー。進捗 (gantlo.v1) とは別のキーにして、進捗の様式・書き出し・読み込みには入れない
 * (途中の回は記録ではなく、終えるかやめると消す)
 */
export const EXAM_SAVE_KEY = 'gantlo.exam.v1';

/** 途中の回の中身。出題 (問題の id と、混ぜた 4 択の選択肢・並べ替えの項目の並び)・答え・期限 (時刻のミリ秒) */
export type SavedExamItem = { id: string; order?: string[] };
/** runId は回ごとの id。採点した回は記録 (exams の runId) に残し、同じ回の保存を読み直さない・2 回記録しない */
export type SavedExam = { v: 1; runId: string; items: SavedExamItem[]; answers: { correct: boolean; code: number }[]; deadline: number };

export type ExamStorage = KeyValueStorage & Pick<Storage, 'removeItem'>;

/** 回の id を作る (乱数。端末の外へは出さない) */
export function newRunId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 残している途中の回の id。無い・読めないときは null */
export function savedRunId(storage: ExamStorage | undefined = safeLocalStorage()): string | null {
  try {
    const raw = JSON.parse(storage?.getItem(EXAM_SAVE_KEY) ?? 'null') as { runId?: unknown } | null;
    return typeof raw?.runId === 'string' ? raw.runId : null;
  } catch {
    return null;
  }
}

/**
 * 途中の回を残す。残せない環境 (プライベートモードなど) では何もしない (その場限りの回になる)。
 * onlyIfSame なら、残っている回がこの回のときだけ上書きする (別のタブがこの回を採点して消した・新しい回を始めたあとに、
 * 走っている画面が古い回を残し直さないため)
 */
export function saveExamRun(saved: SavedExam, storage: ExamStorage | undefined = safeLocalStorage(), { onlyIfSame = false } = {}): boolean {
  try {
    if (onlyIfSame && savedRunId(storage) !== saved.runId) return false;
    storage?.setItem(EXAM_SAVE_KEY, JSON.stringify(saved));
    return storage !== undefined;
  } catch {
    // 残せなくても解き続けられる
    return false;
  }
}

/** 途中の回を消す (終えた・時間が切れた・やめた・記録を消したとき) */
export function clearExamRun(storage: ExamStorage | undefined = safeLocalStorage()): void {
  try {
    storage?.removeItem(EXAM_SAVE_KEY);
  } catch {
    // 消せない環境では残っていない
  }
}

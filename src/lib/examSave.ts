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
export type SavedExam = { v: 1; items: SavedExamItem[]; answers: { correct: boolean; code: number }[]; deadline: number };

export type ExamStorage = KeyValueStorage & Pick<Storage, 'removeItem'>;

/** 途中の回を残す。残せない環境 (プライベートモードなど) では何もしない (その場限りの回になる) */
export function saveExamRun(saved: SavedExam, storage: ExamStorage | undefined = safeLocalStorage()): void {
  try {
    storage?.setItem(EXAM_SAVE_KEY, JSON.stringify(saved));
  } catch {
    // 残せなくても解き続けられる
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

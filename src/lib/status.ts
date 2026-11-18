/**
 * 進み具合を HTTP のステータスで表す。画面を見るたびにステータスコードに触れるため。
 * どのステータスにも日本語の説明を付け、コードの見た目だけで意味を伝えない。
 */
export type Status = { code: number; reason: string; ja: string };

/** 旅の段 (またはレッスン) を何個済ませたか */
export function progressStatus(done: number, total: number): Status {
  if (total <= 0 || done <= 0) return { code: 202, reason: 'Accepted', ja: '受け付けました。まだ始めていません' };
  if (done >= total) return { code: 200, reason: 'OK', ja: '全部済みました' };
  return { code: 206, reason: 'Partial Content', ja: `まだ途中です。${total} 段のうち ${done} 段を学びました` };
}

/** まだ作っていない画面 */
export const NOT_IMPLEMENTED: Status = { code: 501, reason: 'Not Implemented', ja: 'この画面はまだ作っていません' };

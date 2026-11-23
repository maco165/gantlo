// .ics の書き出しの画面 (設定) が最初から使う小さな値。.ics を作る処理 (lib/ics.ts) は押したときに読む
/** 曜日 (Date#getDay の 0 = 日 … 6 = 土) と RFC 5545 の BYDAY の名前 */
export const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
export const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

export const isTime = (v: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

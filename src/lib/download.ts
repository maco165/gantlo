import { exportFileName, type Progress } from './progress';

/**
 * 進捗を JSON のファイルとして保存させる (書き出し)。画面の中で Blob を作り、a[download] を押してダウンロードを起こす。
 * ブラウザの外には何も送らない
 */
export function downloadProgress(p: Progress, now: Date): void {
  downloadBlob(new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }), exportFileName(now));
}

/** 画面の中で作ったものをファイルとして保存させる (.ics・まとめのカードの PNG も同じ形)。ブラウザの外には何も送らない */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 保存が始まる前に URL を無効にしないよう、少し待ってから片付ける
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

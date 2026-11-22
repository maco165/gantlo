// 画面のチャンクを読めなかったとき (vite:preloadError) に、ページを 1 回だけ読み直す。
// 新しい版を出したあとの開いたままのタブは、読み直せば新しいチャンクの名前を知る。
// 読み直してもまた読めないときは繰り返さず、画面の受け皿 (components/ChunkErrorBoundary.tsx) に任せる
export const RELOAD_KEY = 'gantlo.chunkReloadAt';
/** この時間の中で 2 度目に読めなかったら、読み直さない */
export const RELOAD_WINDOW_MS = 10_000;

/** 読み直すか。読み直すなら時刻を残す。sessionStorage が使えなければ読み直さない (繰り返しを止められないため) */
export function shouldReload(storage: Pick<Storage, 'getItem' | 'setItem'>, now: number): boolean {
  try {
    const last = Number(storage.getItem(RELOAD_KEY));
    if (last && now - last < RELOAD_WINDOW_MS) return false;
    storage.setItem(RELOAD_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

export function installChunkReload(): void {
  window.addEventListener('vite:preloadError', (event) => {
    let storage: Storage;
    try {
      storage = window.sessionStorage;
    } catch {
      return;
    }
    if (!shouldReload(storage, Date.now())) return;
    // 読み直すので、エラーとして投げさせない
    event.preventDefault();
    window.location.reload();
  });
}

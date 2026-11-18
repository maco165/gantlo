import { useEffect, useState } from 'react';

/**
 * スマホのメニューの開閉。移動の操作の回数 (useRoute の close) が変わったら閉じる。
 * 同じ画面の項目を押しても、戻るでも、# だけが変わる戻る・進むでも close は増えるので、どれでも閉じる
 */
export function useMobileNav(close: number): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [close]);
  return [open, setOpen];
}

import { useEffect, useState } from 'react';

/**
 * スマホのメニューの開閉。画面を移る操作の回数 (useRoute の nav) が変わったら閉じる。
 * 同じ画面の項目を押しても、戻るでも nav は増えるので、どちらでも閉じる
 */
export function useMobileNav(nav: number): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [nav]);
  return [open, setOpen];
}

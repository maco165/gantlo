import { useEffect, useState } from 'react';

/** PC の画面にする幅 (Astryx の md と同じ 768px 以上。AppShell が PC の形に切り替わる境目) */
export const WIDE_QUERY = '(min-width: 768px)';

/** matchMedia の無い所 (jsdom の検査など) では狭い画面として扱う */
export function useMediaQuery(query: string): boolean {
  const get = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    onChange();
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

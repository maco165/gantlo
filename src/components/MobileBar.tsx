import { MobileNavToggle } from '@astryxdesign/core/MobileNav';
import { homeHref } from '../lib/route';
import { SITE_NAME } from '../lib/site';
import RepoLink from './RepoLink';

/**
 * 上の帯。右端に GitHub のリポジトリを開くボタンを置く (どの画面でも、PC でもスマホでも)。
 * スマホではメニューを開くボタンを左端に置き、メニューも左から開く (AppMobileNav の side="start")。
 * 幅 768px (Astryx の md。AppShell が PC の形に切り替わる境目) 以上では、左のメニューに名前があるので
 * メニューのボタンとサイト名を CSS で隠し、GitHub のボタンだけを残す
 */
export default function MobileBar() {
  return (
    <header className="mobile-bar">
      <span className="mobile-bar__phone">
        <MobileNavToggle label="メニューを開く" />
        <a className="mobile-bar__name display" href={homeHref}>
          {SITE_NAME}
        </a>
      </span>
      <span className="mobile-bar__end">
        <RepoLink />
      </span>
    </header>
  );
}

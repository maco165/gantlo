import { MobileNavToggle } from '@astryxdesign/core/MobileNav';
import { homeHref } from '../lib/route';
import { SITE_NAME } from '../lib/site';

/**
 * スマホの上の帯。メニューを開くボタンを左端に置き、メニューも左から開く (AppMobileNav の side="start")。
 * 幅 768px (Astryx の md) 以上では CSS で隠す。AppShell が PC の形に切り替わる境目と同じ
 */
export default function MobileBar() {
  return (
    <header className="mobile-bar">
      <MobileNavToggle label="メニューを開く" />
      <a className="mobile-bar__name display" href={homeHref}>
        {SITE_NAME}
      </a>
    </header>
  );
}

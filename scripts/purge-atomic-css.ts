// 組み立てた CSS から、どの JS にも出てこない StyleX の原子クラス (x + 英小文字・数字 5〜9 字。例: xyto64x) だけの決まりを落とす。
// Astryx の astryx.css は全部の部品の原子クラスを持つ (約 290KB) が、このサイトが使う部品は一部なので、描画を止める CSS が重くなる。
// StyleX のクラス名は組み立てた JS に文字列のまま入るので、JS に無い原子クラスは使われない。
// 原子クラスでないクラス (astryx-button・page など。文字列を組み立てて作ることがある) と、クラスを持たない決まりは消さない。
import postcss, { type ChildNode, type Container } from 'postcss';
import type { Plugin } from 'vite';

export const ATOMIC_CLASS = /^x[a-z0-9]{4,9}$/;

/** css から、usedText (組み立てた JS と HTML) に無い原子クラスを含むセレクターを落とした CSS と、落とした決まりの数を返す */
export function purgeAtomicCss(css: string, usedText: string): { css: string; removed: number } {
  const used = new Set(usedText.match(/[A-Za-z_][\w-]*/g) ?? []);
  const root = postcss.parse(css);
  let removed = 0;
  root.walkRules((rule) => {
    if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
    const keep = rule.selectors.filter((sel) => {
      const classes = [...sel.matchAll(/\.((?:\\.|[\w-])+)/g)].map((m) => m[1].replace(/\\/g, ''));
      return classes.filter((c) => ATOMIC_CLASS.test(c)).every((c) => used.has(c));
    });
    if (keep.length === 0) {
      rule.remove();
      removed++;
    } else if (keep.length !== rule.selectors.length) rule.selectors = keep;
  });
  // 中身が空になった @media・@layer などを消す (入れ子の内側から)
  const prune = (node: Container) => {
    node.each((child: ChildNode) => {
      if (child.type === 'atrule' && child.nodes) {
        prune(child);
        if (child.nodes.length === 0) child.remove();
      }
    });
  };
  prune(root);
  return { css: root.toString(), removed };
}

/** vite の plugin。build の最後 (generateBundle) に、全部の JS と HTML を見て CSS を削る */
export function purgeAtomicCssPlugin(): Plugin {
  return {
    name: 'gantlo-purge-atomic-css',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const files = Object.values(bundle);
      const usedText = files
        .map((f) => (f.type === 'chunk' ? f.code : f.fileName.endsWith('.html') ? String(f.source) : ''))
        .join('\n');
      for (const f of files) {
        if (f.type !== 'asset' || !f.fileName.endsWith('.css')) continue;
        const before = String(f.source);
        const { css, removed } = purgeAtomicCss(before, usedText);
        f.source = css;
        this.info(`${f.fileName}: 使われない原子クラスの決まり ${removed} 個を落としました (${before.length} → ${css.length} 字)`);
      }
    },
  };
}

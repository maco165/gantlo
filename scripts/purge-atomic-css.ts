// Astryx の astryx.css (全部の部品の StyleX の原子クラス。約 290KB) から、このサイトが取り込む Astryx の JS のどこにも出てこない
// 原子クラス (x + 英小文字・数字 5〜10 字。例: xyto64x) を含むセレクターを落とす。描画を止める CSS を軽くするため。
// 落とすのは CSS を読む段 (transform) で、出力の名前の hash を決める前。src から取り込む Astryx の JS と、その中の相対の取り込みを
// たどって使いうるクラスを集める (組み立てで tree-shake されるものも含むので、残すのは使うものより多め)。
// JS の出力を見てから CSS を書き換えると、CSS の中身が変わっても名前 (hash) が変わらず、配った直後に古い CSS が使われる (PR #54 R-001)。
// 原子クラスでないクラス (astryx-button・page など。文字列を組み立てて作ることがある) と、クラスを持たない決まりは消さない。
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import postcss, { type ChildNode, type Container } from 'postcss';
import type { Plugin } from 'vite';

export const ATOMIC_CLASS = /^x[a-z0-9]{4,10}$/;

/** css から、usedText (使いうる JS の文字) に無い原子クラスを含むセレクターを落とした CSS と、落とした決まりの数を返す */
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

const ASTRYX_IMPORT = /["'](@astryxdesign\/(?:core|theme-gothic)\/[^"']+)["']/g;
const RELATIVE_IMPORT = /(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g;

async function sourceFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await sourceFiles(p)));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * src から取り込む Astryx の JS (と、その中から相対で取り込む JS) の文字を全部つなげて返す。
 * resolve は vite の this.resolve (パッケージの exports を解く)。解けない書き方 (コメントの中の例など) は飛ばす
 */
export async function astryxSourceText(srcDir: string, resolve: (spec: string, from: string) => Promise<string | undefined>): Promise<string> {
  const seen = new Set<string>();
  const queue: string[] = [];
  const add = (file: string | undefined) => {
    if (file && !seen.has(file) && /\.m?js$/.test(file)) {
      seen.add(file);
      queue.push(file);
    }
  };
  const texts: string[] = [];
  for (const file of await sourceFiles(srcDir)) {
    const text = await readFile(file, 'utf8');
    texts.push(text);
    for (const m of text.matchAll(ASTRYX_IMPORT)) if (!m[1].endsWith('.css')) add(await resolve(m[1], file).catch(() => undefined));
  }
  while (queue.length > 0) {
    const file = queue.pop()!;
    const text = await readFile(file, 'utf8');
    texts.push(text);
    for (const m of text.matchAll(RELATIVE_IMPORT)) add(path.resolve(path.dirname(file), m[1]));
    for (const m of text.matchAll(ASTRYX_IMPORT)) if (!m[1].endsWith('.css')) add(await resolve(m[1], file).catch(() => undefined));
  }
  return texts.join('\n');
}

/** vite の plugin。astryx.css を読む段で削る (出力の名前の hash は削ったあとの中身で決まる) */
export function purgeAtomicCssPlugin(srcDir: string): Plugin {
  return {
    name: 'gantlo-purge-atomic-css',
    apply: 'build',
    async transform(code, id) {
      if (!id.split('?')[0].endsWith('/@astryxdesign/core/dist/astryx.css')) return null;
      const used = await astryxSourceText(srcDir, async (spec, from) => (await this.resolve(spec, from))?.id);
      const { css, removed } = purgeAtomicCss(code, used);
      this.info(`astryx.css: 使われない原子クラスの決まり ${removed} 個を落としました (${code.length} → ${css.length} 字)`);
      return { code: css, map: null };
    },
  };
}

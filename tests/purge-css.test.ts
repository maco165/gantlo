import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { ATOMIC_CLASS, purgeAtomicCss } from '../scripts/purge-atomic-css';

// 使われない StyleX の原子クラスだけを CSS から落とす (vite.config.ts の purgeAtomicCssPlugin)
describe('purgeAtomicCss', () => {
  const css = [
    '@layer astryx-base{.xused1{color:red}.xunused{color:blue}.xunused:hover,.xused1:focus{color:green}}',
    '@media (width>=768px){.xgone12{display:none}}',
    '.astryx-button{padding:0}.page .xunused{margin:0}:root{--a:1}',
    '@keyframes xspin1{from{opacity:0}to{opacity:1}}',
  ].join('\n');
  const js = 'const s={a:"xused1"};const c=`astryx-${"button"}`;';
  const { css: out, removed } = purgeAtomicCss(css, js);

  it('JS に出てくる原子クラス・原子クラスでないクラス・クラスの無い決まり・@keyframes は残す', () => {
    expect(out).toContain('.xused1{color:red}');
    expect(out).toContain('.xused1:focus');
    expect(out).toContain('.astryx-button');
    expect(out).toContain(':root{--a:1}');
    expect(out).toContain('@keyframes xspin1');
  });

  it('JS に無い原子クラスを含むセレクターは落とし、空になった @media も消す', () => {
    expect(out).not.toContain('xunused');
    expect(out).not.toContain('xgone12');
    expect(out).not.toContain('@media');
    expect(removed).toBe(3);
  });

  it('原子クラスの形は x と英小文字・数字 5〜10 字 (astryx- や x-default-marker のような名前は当たらない)', () => {
    for (const c of ['xyto64x', 'x4ncuvb', 'x1a2b3c4d']) expect(ATOMIC_CLASS.test(c), c).toBe(true);
    for (const c of ['x-default-marker', 'astryx-text', 'xY12345', 'page']) expect(ATOMIC_CLASS.test(c), c).toBe(false);
  });

  it('組み立てた dist では、JS に出てくる原子クラスだけでできたセレクターのクラスは、すべて CSS に残っている (npm run build のあと)', () => {
    const dir = join(__dirname, '../dist/assets');
    const files = readdirSync(dir);
    const jsText = files.filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
    const built = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
    const source = readFileSync(join(__dirname, '../node_modules/@astryxdesign/core/dist/astryx.css'), 'utf8');
    const used = new Set(jsText.match(/[A-Za-z_][\w-]*/g) ?? []);
    // 元の CSS のセレクターのうち、原子クラスが全部 JS に出てくるもの (= 画面で当たりうるもの) のクラス
    const needed = new Set<string>();
    postcss.parse(source).walkRules((r) => {
      for (const sel of r.selectors) {
        const atomic = [...sel.matchAll(/\.((?:\\.|[\w-])+)/g)].map((m) => m[1]).filter((c) => ATOMIC_CLASS.test(c));
        if (atomic.length > 0 && atomic.every((c) => used.has(c))) atomic.forEach((c) => needed.add(c));
      }
    });
    expect(needed.size).toBeGreaterThan(100);
    const missing = [...needed].filter((c) => !new RegExp(`\\.${c}(?![\\w-])`).test(built));
    expect(missing).toEqual([]);
    // 使われないものは落ちている (Astryx の全部の部品の CSS をそのまま配っていない)
    expect(built.length).toBeLessThan(source.length);
  });
});

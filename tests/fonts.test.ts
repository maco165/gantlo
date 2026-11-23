import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

// 書体は自前で配る (src/fonts.css と public/fonts/)。Google Fonts を CSS の中で @import すると、
// HTML → CSS → 書体の CSS → 書体の直列になり、描画が止まる (2026-11-23 の Lighthouse で 808ms)
const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const fontsCss = read('src/fonts.css');
const faces = postcss.parse(fontsCss).nodes.filter((n) => n.type === 'atrule' && n.name === 'font-face') as postcss.AtRule[];
const decl = (face: postcss.AtRule, prop: string) => (face.nodes?.find((n) => n.type === 'decl' && n.prop === prop) as postcss.Declaration | undefined)?.value;

describe('書体の読み込み', () => {
  it('main.tsx は theme-gothic の fonts.css (Google Fonts の @import) を読まず、src/fonts.css を読む', () => {
    const main = read('src/main.tsx');
    expect(main).not.toMatch(/['"]@astryxdesign\/theme-gothic\/fonts\.css['"]/);
    expect(main).toMatch(/import '\.\/fonts\.css';/);
  });

  it('画面の CSS と index.html は外の書体の置き場 (fonts.googleapis.com・fonts.gstatic.com) を見ない', () => {
    for (const p of ['src/fonts.css', 'src/styles.css', 'index.html']) expect(read(p), p).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
  });

  it('Gothic テーマが読んでいた 4 つの書体をすべて @font-face で持ち、どれも font-display: swap', () => {
    const imported = read('node_modules/@astryxdesign/theme-gothic/fonts.css');
    const families = [...imported.matchAll(/family=([^:&']+)/g)].map((m) => decodeURIComponent(m[1]).replace(/\+/g, ' '));
    expect(families.length).toBe(4);
    const own = new Set(faces.map((f) => decl(f, 'font-family')?.replace(/'/g, '')));
    for (const f of families) expect(own, f).toContain(f);
    for (const f of faces) expect(decl(f, 'font-display'), decl(f, 'src')).toBe('swap');
  });

  it('@font-face の woff2 と、index.html で preload する書体が public/fonts/ にあり、preload は @font-face の中のもの', () => {
    const urls = faces.map((f) => /url\(\/fonts\/([\w.-]+)\)/.exec(decl(f, 'src') ?? '')?.[1]);
    for (const u of urls) {
      expect(u).toBeDefined();
      expect(existsSync(join(ROOT, 'public/fonts', u!)), u).toBe(true);
    }
    const preloads = [...read('index.html').matchAll(/<link rel="preload" href="\/gantlo\/fonts\/([\w.-]+)" as="font" type="font\/woff2" crossorigin \/>/g)].map((m) => m[1]);
    expect(preloads.length).toBeGreaterThan(0);
    for (const p of preloads) {
      expect(urls, p).toContain(p);
      expect(existsSync(join(ROOT, 'public/fonts', p)), p).toBe(true);
    }
  });
});

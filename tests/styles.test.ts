import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, '../src/styles.css'), 'utf8');

describe('src/styles.css', () => {
  it('CSS として読める (閉じていない括弧などが無い。ブラウザも build も崩れを黙って読み、後ろの決まりが効かなくなるため)', () => {
    expect(() => postcss.parse(css, { from: 'src/styles.css' })).not.toThrow();
  });

  it('パンくずのリンクは下線を持つ (周りの字と色だけでは 3:1 に届かないため。link-in-text-block)', () => {
    const root = postcss.parse(css, { from: 'src/styles.css' });
    const decl: string[] = [];
    root.walkRules('.crumbs a', (r) => r.walkDecls('text-decoration', (d) => void decl.push(d.value)));
    expect(decl.some((v) => v.includes('underline'))).toBe(true);
  });

  it('レッスンの画面の決まりが、@media の中ではなく一番外にある', () => {
    const root = postcss.parse(css, { from: 'src/styles.css' });
    const top = root.nodes.filter((n) => n.type === 'rule').map((n) => (n.type === 'rule' ? n.selector : ''));
    for (const sel of ['.lesson', '.fill-code', '.response', '.order', '.order__bar']) expect(top).toContain(sel);
  });
});

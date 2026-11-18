// 設定の画面を jsdom で描き、読み込みで 1 MB を超えるファイルは中身を読まずに断ることを確かめる。
// 寸法・ダウンロード・確かめの dialog は e2e (scripts/e2e-review-settings.mjs) で見る。
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MAX_IMPORT_BYTES, emptyProgress, type Progress } from '../src/lib/progress';
import Settings from '../src/screens/Settings';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  // jsdom には matchMedia が無い。狭い画面として描く
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }
});

let host: HTMLElement;
let root: Root;
beforeEach(() => {
  localStorage.clear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

function SettingsProbe() {
  const [p, setP] = useState<Progress>(emptyProgress());
  return createElement(Settings, { progress: p, updateProgress: (fn: (q: Progress) => Progress) => setP(fn) });
}

/** size だけを決め、中身を読むと記録して投げる File */
function trapFile(size: number, content: string) {
  const reads: string[] = [];
  const file = new File([content], 'gantlo-progress.json', { type: 'application/json' });
  Object.defineProperty(file, 'size', { value: size });
  Object.defineProperty(file, 'text', {
    value: () => {
      reads.push('text');
      if (size > MAX_IMPORT_BYTES) throw new Error('1 MB を超えるファイルの中身を読んだ');
      return Promise.resolve(content);
    },
  });
  return { file, reads };
}

async function choose(file: File) {
  const input = host.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input).not.toBeNull();
  Object.defineProperty(input!, 'files', { value: [file], configurable: true });
  await act(async () => {
    input!.dispatchEvent(new Event('change', { bubbles: true }));
  });
  // 中身を読むのは非同期なので、落ち着くまで待つ
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const outcome = () => host.querySelector('.settings__outcome');

describe('設定の画面: 読み込み', () => {
  it('1 MB を超えるファイルは中身を読まず (text() を呼ばず)、413 と理由を出して置き換えを出さない', async () => {
    await act(async () => root.render(createElement(SettingsProbe)));
    const { file, reads } = trapFile(MAX_IMPORT_BYTES + 1, JSON.stringify(emptyProgress()));
    await choose(file);
    expect(reads).toEqual([]);
    expect(outcome()?.getAttribute('data-status')).toBe('413');
    expect(outcome()?.textContent).toContain('1 MB');
    expect(host.querySelector('.settings__confirm')).toBeNull();
  });

  it('1 MB までのファイルは中身を読み、形が合えば置き換えの確かめを出す', async () => {
    await act(async () => root.render(createElement(SettingsProbe)));
    const { file, reads } = trapFile(MAX_IMPORT_BYTES, JSON.stringify(emptyProgress()));
    await choose(file);
    expect(reads).toEqual(['text']);
    expect(outcome()).toBeNull();
    expect(host.querySelector('.settings__confirm')).not.toBeNull();
  });
});

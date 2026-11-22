import { Text } from '@astryxdesign/core/Text';
import { Component, type ReactNode } from 'react';

/**
 * 画面の JS (React.lazy のチャンク) を読めなかったときの受け皿。新しい版を出したあと、開いたままのタブが
 * 古いチャンクの名前を読みに行くと 404 になり、受け皿が無いと #root が空 (白紙) になるため。
 * 1 回だけの自動の読み直しは src/lib/chunkReload.ts が持ち、それでも読めないときにここが出る
 */
export default class ChunkErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="page" role="alert">
        <h1 className="page__title">読み込めませんでした</h1>
        <Text>この画面の JavaScript を読み込めませんでした。サイトが新しくなった直後か、通信が切れた可能性があります。</Text>
        <p>
          <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
            読み直す
          </button>
        </p>
      </div>
    );
  }
}

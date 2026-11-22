import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
// 書体は自前で配る (src/fonts.css。theme-gothic の fonts.css は Google Fonts を CSS の中で @import して読み込みが直列になる)
import './fonts.css';
import '@astryxdesign/theme-gothic/theme.css';
import './styles.css';
import App from './App';
import { installChunkReload } from './lib/chunkReload';

installChunkReload();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

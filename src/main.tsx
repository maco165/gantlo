import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-gothic/fonts.css';
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

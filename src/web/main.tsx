import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DesignSystemProvider } from './design-system/DesignSystemProvider.js';
import { App } from './workbench/App.js';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('缺少应用挂载节点');

createRoot(root).render(
  <StrictMode>
    <DesignSystemProvider>
      <App />
    </DesignSystemProvider>
  </StrictMode>,
);

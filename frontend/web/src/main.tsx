import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyColorTokens } from './theme/applyColorTokens';
import './theme/tokens.css';

applyColorTokens();

const container = document.getElementById('root');
if (!container) throw new Error('root element not found');

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

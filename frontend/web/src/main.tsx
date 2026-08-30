import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyDesignTokens } from './theme/applyDesignTokens';
import './theme/tokens.css';
// גיליון ההדפסה הוא מנגנון ה-PDF של המוצר, ולכן הוא גלובלי ולא
// שייך למסך אחד. ראה styles/print.css.
import './styles/print.css';

applyDesignTokens();

const container = document.getElementById('root');
if (!container) throw new Error('root element not found');

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

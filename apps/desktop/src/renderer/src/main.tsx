import React from 'react';
import { createRoot } from 'react-dom/client';
import { ApiProvider } from './api';
import { App } from './App';
import { I18nProvider } from './lib/i18n';
import { applyTheme, getStoredTheme } from './lib/theme';
import './index.css';

applyTheme(getStoredTheme());

const container = document.getElementById('root');
if (!container) throw new Error('missing #root');

createRoot(container).render(
  <React.StrictMode>
    <I18nProvider>
      <ApiProvider api={window.skillcat}>
        <App />
      </ApiProvider>
    </I18nProvider>
  </React.StrictMode>,
);

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { initTheme } from './store/themeStore';
import { initMonitoring } from './services/monitoring/sentry';
import './styles/index.css';
import { initNativeShell } from './app/capacitor';

initTheme();
initMonitoring();
initNativeShell();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

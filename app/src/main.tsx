import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { startPersistence } from './app/autosave';
import * as store from './app/store';
import './styles.css';

declare global {
  interface Window {
    /** read access for end-to-end tests and debugging in the console */
    __ffp?: typeof store;
  }
}
window.__ffp = store;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void startPersistence().then(() => document.body.setAttribute('data-ready', 'true'));

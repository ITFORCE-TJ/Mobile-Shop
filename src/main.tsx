import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initNativeStatusBar } from './services/nativeStatusBar';
import { initViewport } from './services/viewport';
import { revokeLeftoverSession } from './services/sessionLock';

void initNativeStatusBar();
// A session kept by an earlier launch or abandoned for 10+ minutes is never reused: end it on the server.
revokeLeftoverSession();
const disposeViewport = initViewport();
if (import.meta.hot) import.meta.hot.dispose(disposeViewport);

// Prevent text/content extraction through the browser UI. This covers keyboard
// shortcuts, the context menu, dragging, and long-press selection on touch devices.
const preventContentCopy = (event: Event) => {
  const target = event.target instanceof Element ? event.target : document.activeElement;
  if (target?.closest('input, textarea, [contenteditable="true"]')) return;
  event.preventDefault();
};

for (const eventName of ['copy', 'cut', 'contextmenu', 'selectstart', 'dragstart']) {
  document.addEventListener(eventName, preventContentCopy);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

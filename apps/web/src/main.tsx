import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ToastProvider } from '@ui/index';
import { App } from './App';

// Restore the real path GitHub Pages' 404.html handed off (see public/404.html).
const params = new URLSearchParams(location.search);
const redirect = params.get('redirect');
if (redirect) {
  history.replaceState(null, '', '/housegames/' + redirect);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/housegames">
      <ToastProvider>
        <App />
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);

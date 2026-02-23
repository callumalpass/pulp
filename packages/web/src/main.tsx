import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ToastProvider } from './contexts/ToastContext';
import { ConnectionProvider } from './contexts/ConnectionContext';
import App from './App';
import './index.css';

// Initialize appearance settings from localStorage before React renders to prevent flash
function initializeAppearance() {
  let theme: 'light' | 'dark' = 'dark';
  let einkMode = false;

  try {
    const stored = localStorage.getItem('pulp-preferences');
    if (stored) {
      const { state } = JSON.parse(stored);
      if (state?.theme === 'light' || state?.theme === 'dark') theme = state.theme;
      if (state?.einkMode === true) einkMode = true;
    }
  } catch {
    // Ignore parse errors
  }

  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-eink-mode', einkMode ? 'true' : 'false');
  document.documentElement.classList.toggle('eink-mode', einkMode);
}

initializeAppearance();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ConnectionProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </ConnectionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);

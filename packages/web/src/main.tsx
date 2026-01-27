import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ToastProvider } from './contexts/ToastContext';
import { ConnectionProvider } from './contexts/ConnectionContext';
import App from './App';
import './index.css';

// Initialize theme from localStorage before React renders to prevent flash
function initializeTheme() {
  try {
    const stored = localStorage.getItem('pulp-preferences');
    if (stored) {
      const { state } = JSON.parse(stored);
      if (state?.theme) {
        document.documentElement.setAttribute('data-theme', state.theme);
        return;
      }
    }
  } catch {
    // Ignore parse errors
  }
  // Default to dark theme if no preference saved
  document.documentElement.setAttribute('data-theme', 'dark');
}

initializeTheme();

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

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import App from './App.jsx';
import { I18nProvider } from './i18n/index.js';
import SessionProvider from './session/SessionProvider.jsx';
import './styles/base.css';

/**
 * Query client tuned for a shared terminal.
 *
 * gcTime: 0 means a cache entry is dropped the moment nothing renders it, so a
 * citizen's data does not survive in memory after they navigate away. Retries
 * are off because a retry after a session expiry would fire a second doomed
 * request and delay the purge.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 0,
      staleTime: 0,
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
    mutations: { retry: false },
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <BrowserRouter>
          <SessionProvider>
            <App />
          </SessionProvider>
        </BrowserRouter>
      </I18nProvider>
    </QueryClientProvider>
  </StrictMode>,
);

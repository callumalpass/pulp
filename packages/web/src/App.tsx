import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { LibraryPage } from './pages/LibraryPage';

// Lazy load the reader page - this defers loading PDF.js and EPUB.js
// until the user actually opens a document
const ReaderPage = lazy(() => import('./pages/ReaderPage').then(m => ({ default: m.ReaderPage })));

function ReaderPageLoader() {
  return (
    <Suspense fallback={<ReaderLoadingFallback />}>
      <ReaderPage />
    </Suspense>
  );
}

function ReaderLoadingFallback() {
  return (
    <div className="flex items-center justify-center h-full" role="status" aria-label="Loading reader">
      <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" aria-hidden="true" />
      <span className="sr-only">Loading reader...</span>
    </div>
  );
}

function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/read/:id" element={<ReaderPageLoader />} />
      </Routes>
    </AppShell>
  );
}

export default App;

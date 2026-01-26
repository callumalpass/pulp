import { Component, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: string | null;
}

/**
 * Error boundary component for catching and displaying React errors gracefully.
 * Provides a user-friendly error UI with options to retry or navigate away.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log the error for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      errorInfo: errorInfo.componentStack || null,
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div
          className="flex-1 flex flex-col items-center justify-center gap-6 p-8 bg-bg-surface"
          role="alert"
          aria-live="assertive"
        >
          <div className="text-center max-w-md">
            <svg
              className="w-16 h-16 mx-auto mb-4 text-red-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <h1 className="text-xl font-semibold text-text-primary mb-2">
              Something went wrong
            </h1>
            <p className="text-text-secondary mb-6">
              An unexpected error occurred. You can try again or return to the library.
            </p>
            {this.state.error && (
              <details className="text-left mb-6 text-sm">
                <summary className="cursor-pointer text-text-secondary hover:text-text-primary">
                  Technical details
                </summary>
                <pre className="mt-2 p-3 bg-bg-deep rounded-lg overflow-auto text-xs text-red-400">
                  {this.state.error.message}
                  {this.state.errorInfo && (
                    <>
                      {'\n\nComponent Stack:'}
                      {this.state.errorInfo}
                    </>
                  )}
                </pre>
              </details>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={this.handleRetry}
              className="px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 focus:ring-offset-bg-surface transition-colors"
            >
              Try again
            </button>
            <Link
              to="/"
              className="px-4 py-2 border border-text-secondary/20 text-text-primary rounded-lg hover:bg-bg-deep focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 focus:ring-offset-bg-surface transition-colors"
            >
              Back to library
            </Link>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * A simpler error boundary specifically for reader components.
 * Shows a compact error message with reload option.
 */
export class ReaderErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ReaderErrorBoundary caught an error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          className="flex-1 flex flex-col items-center justify-center gap-4 p-8"
          role="alert"
          aria-live="assertive"
        >
          <div className="text-red-500 text-lg" role="heading" aria-level={1}>
            Failed to load document
          </div>
          <p className="text-text-secondary text-sm text-center max-w-sm">
            {this.state.error?.message || 'An error occurred while loading the document.'}
          </p>
          <div className="flex gap-3 mt-2">
            <button
              onClick={this.handleReload}
              className="px-3 py-1.5 text-sm bg-accent-primary text-white rounded hover:bg-accent-primary/90 focus:outline-none focus:ring-2 focus:ring-accent-primary"
            >
              Reload page
            </button>
            <Link
              to="/"
              className="px-3 py-1.5 text-sm text-accent-primary hover:underline focus:outline-none focus:ring-2 focus:ring-accent-primary"
            >
              Back to library
            </Link>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

import { Component, type ReactNode } from 'react';
import { captureExceptionSentry } from '@/lib/analytics/sentry';
import ErrorState from '@/components/ui/ErrorState';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** Extra data attached to the Sentry report (e.g. which tab crashed). */
  context?: Record<string, unknown>;
  /** Optional escape hatch rendered under the retry button of the default fallback. */
  action?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    captureExceptionSentry(error, {
      componentStack: errorInfo.componentStack,
      ...this.props.context,
    });
    this.props.onError?.(error, errorInfo);
  }

  override render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <ErrorState
          error={this.state.error.message || 'An unexpected error occurred'}
          onRetry={() => this.setState({ hasError: false, error: null })}
          action={this.props.action}
        />
      );
    }

    return this.props.children;
  }
}

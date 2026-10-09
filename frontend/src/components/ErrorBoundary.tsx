import Button from '@/components/ui/Button';
import { t } from '@/lib/i18n';
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
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

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-primary flex min-h-screen items-center justify-center">
          <div className="bg-secondary mx-4 w-full max-w-md rounded-lg p-8 text-center">
            <h1 className="text-primary mb-2 text-xl font-bold">
              {t('Something went wrong')}
            </h1>
            <p className="text-muted mb-4">
              {this.state.error?.message || t('An unexpected error occurred.')}
            </p>
            <Button variant="primary" onClick={() => window.location.reload()}>
              {t('Reload Page')}
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

import { Component } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/**
 * Keeps a render fault inside one panel instead of blanking the whole app.
 *
 * React has no hook equivalent for this — `componentDidCatch` only exists on
 * class components — so this stays a class.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // A real deployment forwards this to Sentry or CloudWatch.
    console.error('Render error:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center px-4 text-center">
        <div className="mb-4 rounded-full bg-red-100 p-3.5 text-red-600">
          <AlertTriangle size={24} />
        </div>
        <h1 className="text-xl font-bold text-navy-900">This screen hit an error</h1>
        <p className="muted mt-2">
          The rest of the app is still working. Reloading this panel usually clears it.
        </p>
        <p className="mt-3 max-w-full break-words rounded-lg bg-navy-50 px-3 py-2 font-mono text-xs text-navy-600">
          {error.message}
        </p>
        <div className="mt-5 flex gap-2">
          <button onClick={() => this.setState({ error: null })} className="btn-primary">
            <RotateCcw size={15} /> Try again
          </button>
          <button onClick={() => window.location.reload()} className="btn-outline">
            Reload page
          </button>
        </div>
      </div>
    );
  }
}

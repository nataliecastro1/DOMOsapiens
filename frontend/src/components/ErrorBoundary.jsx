import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="card error-boundary">
          <div className="card-title">
            <i className="ti ti-alert-triangle" aria-hidden="true" style={{ color: 'var(--red-500)' }} />
            Something went wrong
          </div>
          <p>An unexpected error occurred while rendering this step. You can try resetting to the beginning of the extraction flow.</p>
          {this.state.error && (
            <pre className="error-details" style={{
              background: 'var(--surface-50)', 
              padding: '12px', 
              borderRadius: '6px', 
              fontSize: '12px', 
              color: 'var(--red-600)',
              overflowX: 'auto'
            }}>
              {this.state.error.toString()}
            </pre>
          )}
          <div className="btn-row" style={{ marginTop: '24px' }}>
            <button className="btn primary" onClick={this.handleReset}>
              Reset Flow <i className="ti ti-refresh" aria-hidden="true" />
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;

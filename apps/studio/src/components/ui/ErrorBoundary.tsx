import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from './Button'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[studio]', error, info.componentStack)
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="p-8">
          <h1 className="text-xl font-medium mb-2">页面出错了</h1>
          <p className="text-sm text-muted-foreground mb-4">{this.state.error.message}</p>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            重新加载
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}

'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react'
import { removeAiKey } from '../server/key-actions'
import { useCopy } from '../hooks/useCopy'

interface Props {
  children: ReactNode
  fallbackTitle?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

type Copy = ReturnType<typeof useCopy>['t']

class ErrorBoundaryInner extends Component<Props & { t: Copy }, State> {
  constructor(props: Props & { t: Copy }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  resetKey = async () => {
    try {
      const { error } = await removeAiKey()
      if (error) throw new Error(error)
    } catch (e) {
      console.error('Failed to reset key:', e)
    }
    window.location.reload()
  }

  render() {
    const { t } = this.props
    if (this.state.hasError) {
      return (
        <div className="flex h-full min-h-[400px] items-center justify-center p-6">
          <div className="card w-full max-w-lg p-6 text-center space-y-4 border-red-200 shadow-lift">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600">
              <AlertTriangle size={28} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink-900">
                {this.props.fallbackTitle || t('somethingWentWrong')}
              </h2>
              <p className="mt-1 text-xs text-ink-500">
                {this.state.error?.message || t('unexpectedViewError')}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2 justify-center">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="btn-primary text-xs py-2 px-4 gap-2"
              >
                <RefreshCw size={14} />
                {t('reloadPage')}
              </button>
              <button
                type="button"
                onClick={this.resetKey}
                className="btn-danger text-xs py-2 px-4 gap-2"
              >
                <Trash2 size={14} />
                {t('resetAiKey')}
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default function ErrorBoundary(props: Props) {
  const { t } = useCopy()
  return <ErrorBoundaryInner {...props} t={t} />
}
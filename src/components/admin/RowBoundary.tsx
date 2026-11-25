'use client'

import { Component, type ReactNode } from 'react'

/**
 * One table row that fails to draw shows a short notice instead; the rest of the table (and the
 * page) keeps working.
 */
export class RowBoundary extends Component<
  { cols: number; message?: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('[row] could not be shown:', (error as Error)?.message)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <tr data-testid="row-unavailable">
        <td colSpan={this.props.cols} className="px-3 py-2 text-sm text-amber-900">
          {this.props.message ?? 'Quote details unavailable'}
        </td>
      </tr>
    )
  }
}

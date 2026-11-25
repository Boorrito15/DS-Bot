// A boundary for the pieces drawn into someone else's tree. A throw inside one of them must
// cost its own row, not the whole page: without this the shell unmounts and the chat falls
// back to plain DeepSeek Harness, which looks like the Bot UI vanished.
import { Component, createElement as h } from 'react'
import { noteClientError } from './diagnostics.js'

export class Safe extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() { return { failed: true } }

  componentDidCatch(error, info) {
    noteClientError(this.props.name ?? 'row', error, info?.componentStack)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

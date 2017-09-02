'use babel'

import { ScrollView } from 'atom-space-pen-views'

export default class LogView extends ScrollView {
  static content(params) {
    return this.div(
      {
        class: 'ensime-log-view scroll-view native-key-bindings',
        tabIndex: -1
      },
      () => {
        // @h1 class: 'panel-heading', params.title
        return this.ul({ class: 'list-group padded', outlet: 'list' })
      }
    )
  }
  initialize(params) {
    this.title = params.title
  }

  addRow(row) {
    return this.list.append(`<li>${row}</li>`)
  }
  getTitle() {
    return this.title
  }

  getURI() {
    return this.constructor.URI
  }
}

'use babel'

import LogView from './log-view'

class EnsimeServerUpdateLogView extends LogView {
  static initClass() {
    this.URI = 'atom://ensime/server-update-log'
  }

  constructor() {
    super({ title: 'Ensime server update:' })
  }
}

EnsimeServerUpdateLogView.initClass()

export default EnsimeServerUpdateLogView

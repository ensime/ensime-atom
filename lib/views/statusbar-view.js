'use babel'

import { View } from 'space-pen'

// View for the little status messages down there where messages from Ensime server can be shown
export default class StatusbarView extends View {
  constructor(...args) {
    // {
    //   // Hack: trick Babel/TypeScript into allowing this before super.
    //   if (false) { super() }
    //   let thisFn = (() => { this }).toString()
    //   let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim()
    //   eval(`${thisName} = this;`)
    // }
    // this.attach = this.attach.bind(this)
    // this.setText = this.setText.bind(this)
    super(...args)
  }

  static content() {
    return this.div({ class: 'ensime-status inline-block' })
  }

  initialize() {}

  serialize() {}

  init() {
    return this.attach()
  }

  attach() {
    // statusbar = atom.workspaceView.statusBar # This is deprecated. Depend on status-bar package for injection
    // In the future, this problem will be solved by an inter-package communication
    // API available on atom.services. For now, you can get a reference to the status-bar element via document.querySelector('status-bar')."
    const statusbar = document.querySelector('status-bar')
    return statusbar != null ? statusbar.addLeftTile({ item: this }) : undefined
  }

  setText(text) {
    return this.text(`Ensime: ${text}`).show()
  }

  destroy() {
    return this.detach()
  }
}

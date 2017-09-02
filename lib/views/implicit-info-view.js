'use babel'

import { CompositeDisposable } from 'atom'
import _ from 'lodash'
const { formatImplicitInfo } = require('ensime-client').formatting

const ListTemplate = `\
<div class="list-scroller">
  <ol class="list-group"></ol>
</div>\
`

const ItemTemplate = `\
<span class="info"></span>\
`

class ImplicitInfoView extends HTMLElement {
  createdCallback() {
    this.renderList()
    this.subscriptions = new CompositeDisposable()
    return this.classList.add('popover-list', 'select-list')
  }

  attachedCallback() {
    return this.addActiveClassToEditor()
  }

  renderList() {
    this.innerHTML = ListTemplate
    return (this.ol = this.querySelector('.list-group'))
  }

  initialize(model) {
    this.model = model
    if (this.model == null) {
      return
    }
    this.subscriptions.add(this.model.onDidDispose(this.dispose.bind(this)))
    for (let index = 0; index < this.model.infos.length; index++) {
      const info = this.model.infos[index]
      this.renderItem(info, index)
    }
    return this
  }

  renderItem(info, index) {
    let li = this.ol.childNodes[index]
    if (!li) {
      li = document.createElement('li')
      li.innerHTML = ItemTemplate
      li.dataset.index = index
      this.ol.appendChild(li)
    }
    const wordSpan = li.querySelector('.info')
    return (wordSpan.innerHTML = `<span>${this.renderInnerText(info)}</span>`)
  }

  renderInnerText(info) {
    return formatImplicitInfo(info)
  }

  addActiveClassToEditor() {
    const editorElement = atom.views.getView(
      atom.workspace.getActiveTextEditor()
    )
    return __guard__(
      editorElement != null ? editorElement.classList : undefined,
      x => x.add('ensime-implicits-active')
    )
  }

  removeActiveClassFromEditor() {
    const editorElement = atom.views.getView(
      atom.workspace.getActiveTextEditor()
    )
    return __guard__(
      editorElement != null ? editorElement.classList : undefined,
      x => x.remove('ensime-implicits-active')
    )
  }

  dispose() {
    this.subscriptions.dispose()
    return this.parentNode != null
      ? this.parentNode.removeChild(this)
      : undefined
  }
}
const x = document.registerElement('implicit-info', {
  prototype: ImplicitInfoView.prototype
})
export default x

function __guard__(value, transform) {
  return typeof value !== 'undefined' && value !== null
    ? transform(value)
    : undefined
}

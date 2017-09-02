'use babel'

const Template = `\
<div class="ensime-tooltip">
  <div class="ensime-tooltip-inner"></div>
</div>\
`

// Used for hover for type
class TypeHoverElement extends HTMLElement {
  initialize(html) {
    this.innerHTML = Template
    this.container = this.querySelector('.ensime-tooltip-inner')
    this.container.innerHTML = html
    return this
  }
}

const x = document.registerElement('ensime-type-hover-view', {
  prototype: TypeHoverElement.prototype
})
export default x

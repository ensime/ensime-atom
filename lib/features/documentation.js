'use babel'

// Helper for looking up ScalaDoc.
import loglevel from 'loglevel'

const log = loglevel.getLogger('documentation')

class Documentation {
  constructor(editor) {
    this.editor = editor
    this.textBuffer = this.editor.getBuffer()
  }

  // If there's selected text, what's the to/from point?
  selectedPoint() {
    const range = this.editor.getSelectedBufferRange()
    return {
      from: this.textBuffer.characterIndexForPosition(range.start),
      to: this.textBuffer.characterIndexForPosition(range.end)
    }
  }

  // If there's no selected text, just send the offset.
  // ENSIME appears to figure out what we want just from this!
  cursorPoint() {
    const bufferPosition = this.editor.getCursorBufferPosition()
    const offset = this.textBuffer.characterIndexForPosition(bufferPosition)
    return {
      from: offset,
      to: offset
    }
  }

  getPoint() {
    const hasSelectedText = this.editor.getSelectedText() !== ''
    if (hasSelectedText) {
      return this.selectedPoint()
    } else {
      return this.cursorPoint()
    }
  }

  static formUrl(host, port, path) {
    const alreadyUrl = path.indexOf('//') !== -1
    if (alreadyUrl) {
      return path
    } else {
      return `http://${host}:${port}/${path}`
    }
  }

  static openDoc(url) {
    log.trace('openDoc')
    const split = atom.config.get('Ensime.documentationSplit')
    switch (split) {
      case 'external-browser':
        if (!this.shell) {
          this.shell = require('shell')
        }
        return this.shell.openExternal(url)
      default:
        return atom.workspace.open(url, { split })
    }
  }
}

const goToDocAtPoint = function(instance, editor) {
  if (instance) {
    const point = new Documentation(editor).getPoint()

    return instance.api
      .getDocUriAtPoint(editor.getBuffer().getPath(), point)
      .then(function(msg) {
        switch (msg.typehint) {
          case 'FalseResponse':
            return atom.notifications.addError('No documentation found')
          default:
            return Documentation.openDoc(
              Documentation.formUrl('localhost', instance.httpPort, msg.text)
            )
        }
      })
  }
}

const goToDocIndex = instance =>
  Documentation.openDoc(`http://localhost:${instance.httpPort}/docs`)

export default {
  goToDocAtPoint,
  goToDocIndex
}

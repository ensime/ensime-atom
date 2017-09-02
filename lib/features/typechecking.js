'use babel'

import { MessagePanelView, LineMessageView } from 'atom-message-panel'
import _ from 'lodash'
import loglevel from 'loglevel'

import { isScalaSource } from '../utils'

const log = loglevel.getLogger('ensime.typechecking')

export default function(indieLinter) {
  let lints = []
  let timeout

  // API
  const noteToLint = note => ({
    severity: (() => {
      switch (note.severity.typehint) {
        case 'NoteError':
          return 'error'
        case 'NoteWarn':
          return 'warning'
        default:
          return ''
      }
    })(),
    location: {
      file: note.file,
      // TODO: This is only true if error doesn't span two lines. Since we don't have buffer here it might be
      // good enough? Or not?
      position: [
        [note.line - 1, note.col - 1],
        [note.line - 1, note.col - 1 + (note.end - note.beg)]
      ]
    },
    excerpt: note.msg
  })

  const addLints = notes =>
    (() => {
      const result = []
      for (let note of Array.from(notes)) {
        if (!note.file.includes('dep-src')) {
          result.push(lints.push(noteToLint(note)))
        } else {
          result.push(undefined)
        }
      }
      return result
    })()

  return {
    addScalaNotes(msg) {
      const { notes } = msg
      addLints(notes)
      log.trace(['lints: ', lints])

      const doit = () => indieLinter.setAllMessages(lints)

      if (timeout) {
        clearTimeout(timeout)
      }
      return (timeout = setTimeout(doit, 100))
    },

    clearScalaNotes() {
      lints = []
      return indieLinter.clearMessages()
    },

    destroy() {
      return indieLinter.dispose()
    }
  }
}

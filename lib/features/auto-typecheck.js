'use babel'

import SubAtom from 'sub-atom'

export default class AutoTypecheck {
  constructor(editor, clientLookup) {
    this.editor = editor
    this.clientLookup = clientLookup
    this.disposables = new SubAtom()

    const buffer = this.editor.getBuffer()
    this.disposables.add(
      buffer.onDidSave(() => {
        // typecheck file on save
        let needle
        if (
          ((needle = atom.config.get('Ensime.typecheckWhen')),
          ['save', 'typing'].includes(needle))
        ) {
          return __guard__(this.clientLookup(), x =>
            x.typecheckFile(this.editor.getPath())
          )
        }
      })
    )

    // Typecheck buffer while typing
    this.disposables.add(
      atom.config.observe('Ensime.typecheckWhen', value => {
        if (value === 'typing') {
          this.typecheckWhileTypingDisposable = this.editor.onDidStopChanging(
            () => {
              const b = this.editor.getBuffer()
              const p = b.getPath()
              // Don't typecheck deps
              if (!p.includes('dep-src')) {
                return __guard__(this.clientLookup(), x =>
                  x.typecheckBuffer(p, b.getText())
                )
              }
            }
          )
          return this.disposables.add(this.typecheckWhileTypingDisposable)
        } else {
          this.disposables.remove(this.typecheckWhileTypingDisposable)
          return this.typecheckWhileTypingDisposable != null
            ? this.typecheckWhileTypingDisposable.dispose()
            : undefined
        }
      })
    )
  }

  deactivate() {
    return this.disposables.dispose()
  }
}

function __guard__(value, transform) {
  return typeof value !== 'undefined' && value !== null
    ? transform(value)
    : undefined
}

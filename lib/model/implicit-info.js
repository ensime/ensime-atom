'use babel'

import { Emitter, CompositeDisposable } from 'atom'

export default class ImplicitInfo {
  constructor(infos, editor, pos) {
    this.cancel = this.cancel.bind(this)
    this.confirmSelection = this.confirmSelection.bind(this)
    this.onDidConfirmSelection = this.onDidConfirmSelection.bind(this)
    this.dispose = this.dispose.bind(this)
    this.infos = infos
    this.editor = editor
    this.active = false

    this.emitter = new Emitter()
    this.subscriptions = new CompositeDisposable()
    this.subscriptions.add(
      atom.commands.add('atom-text-editor.ensime-implicits-active', {
        'ensime:applyImplicit': this.confirmSelection,
        'core:cancel': this.cancel
      })
    )

    this.overlayMarker = this.editor.markBufferPosition(pos)
    const overlayDecoration = this.editor.decorateMarker(this.overlayMarker, {
      type: 'overlay',
      item: this,
      position: 'head'
    })
  }

  bindToMovementCommands() {
    const commandNamespace = 'core' // This was an option in autocomplete-plus

    const commands = {}
    commands[`${commandNamespace}:move-up`] = event => {
      if (
        this.isActive() &&
        (this.items != null ? this.items.length : undefined) > 1
      ) {
        this.selectPrevious()
        return event.stopImmediatePropagation()
      }
    }
    commands[`${commandNamespace}:move-down`] = event => {
      if (
        this.isActive() &&
        (this.items != null ? this.items.length : undefined) > 1
      ) {
        this.selectNext()
        return event.stopImmediatePropagation()
      }
    }
    commands[`${commandNamespace}:page-up`] = event => {
      if (
        this.isActive() &&
        (this.items != null ? this.items.length : undefined) > 1
      ) {
        this.selectPageUp()
        return event.stopImmediatePropagation()
      }
    }
    commands[`${commandNamespace}:page-down`] = event => {
      if (
        this.isActive() &&
        (this.items != null ? this.items.length : undefined) > 1
      ) {
        this.selectPageDown()
        return event.stopImmediatePropagation()
      }
    }
    commands[`${commandNamespace}:move-to-top`] = event => {
      if (
        this.isActive() &&
        (this.items != null ? this.items.length : undefined) > 1
      ) {
        this.selectTop()
        return event.stopImmediatePropagation()
      }
    }
    commands[`${commandNamespace}:move-to-bottom`] = event => {
      if (
        this.isActive() &&
        (this.items != null ? this.items.length : undefined) > 1
      ) {
        this.selectBottom()
        return event.stopImmediatePropagation()
      }
    }

    if (this.movementCommandSubscriptions != null) {
      this.movementCommandSubscriptions.dispose()
    }
    this.movementCommandSubscriptions = new CompositeDisposable()
    return this.movementCommandSubscriptions.add(
      atom.commands.add('atom-text-editor.ensime-implicits-active', commands)
    )
  }

  activate() {
    this.addKeyboardInteraction()
    return (this.active = true)
  }

  cancel() {
    this.emitter.emit('did-cancel')
    return this.dispose()
  }

  onDidCancel(fn) {
    return this.emitter.on('did-cancel', fn)
  }

  onDidDispose(fn) {
    return this.emitter.on('did-dispose', fn)
  }

  confirmSelection() {
    return this.emitter.emit('did-confirm')
  }

  onDidConfirmSelection() {
    return this.emitter.on('did-confirm', fn)
  }

  dispose() {
    this.subscriptions.dispose()
    if (this.movementCommandSubscriptions != null) {
      this.movementCommandSubscriptions.dispose()
    }
    this.emitter.emit('did-dispose')
    this.emitter.dispose()
    return this.overlayMarker.destroy()
  }
}

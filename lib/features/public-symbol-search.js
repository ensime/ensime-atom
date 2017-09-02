'use babel'

import SymbolSearchVue from '../views/public-symbol-search-vue'
import { addModalPanel } from '../utils'
import { goToPosition } from './go-to'
import SubAtom from 'sub-atom'

export default function() {
  const vue = new SymbolSearchVue()
  const modalPanel = addModalPanel(vue, false)
  const disposables = new SubAtom()
  let maxSymbols

  disposables.add(
    atom.config.observe(
      'Ensime.maxSymbolsInSearch',
      value => (maxSymbols = value)
    )
  )

  let api

  const toggle = function(newApi) {
    if (modalPanel.isVisible()) {
      return modalPanel.hide()
    } else {
      api = newApi
      modalPanel.show()
      return vue.focusSearchField()
    }
  }

  const cancel = () => modalPanel.hide()

  vue.onSearchTextUpdated(
    (newText, oldText) =>
      api != null
        ? api
            .searchPublicSymbols(newText.split(' '), maxSymbols)
            .then(function(msg) {
              vue.results = msg.syms
              return (vue.selected = 0)
            })
        : undefined
  )

  atom.commands.add(vue.$el, {
    'core:move-up': event => {
      if (vue.selected > 0) {
        vue.selected -= 1
      }
      return event.stopPropagation()
    },

    'core:move-down': event => {
      if (vue.selected < maxSymbols - 1) {
        vue.selected += 1
      }
      return event.stopPropagation()
    },

    'core:confirm': event => {
      const selected = vue.getSelected()
      if (selected) {
        if (selected.pos) {
          goToPosition(selected.pos)
        } else {
          atom.notifications.addError('Got no position from Ensime server :(', {
            dismissable: true,
            detail:
              'There was no .pos property of the the symbol from Ensime server. Maybe no source attached? Check .ensime!'
          })
        }
        toggle()
        return event.stopPropagation()
      } else {
      }
    },
    // Do nothing

    'core:cancel': event => {
      cancel()
      return event.stopPropagation()
    }
  })

  return {
    toggle,
    cancel,
    dispose() {
      return disposable.dispose()
    }
  }
}

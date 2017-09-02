'use babel'

import SubAtom from 'sub-atom'
import loglevel from 'loglevel'
import DOMListener from 'dom-listener'

import {
  bufferPositionFromMouseEvent,
  pixelPositionFromMouseEvent
} from '../utils'
import {
  formatTypeAsString,
  formatTypeAsHtml,
  typeConstructorFromName
} from '../atom-formatting'
import TypeHoverElement from '../views/type-hover-element'
import { goToPosition } from './go-to'

const log = loglevel.getLogger('ensime.show-types')

// This one lives as one per file for all instances with an instanceLookup.
class ShowTypes {
  constructor(editor, clientLookup) {
    this.editor = editor
    this.clientLookup = clientLookup
    this.disposables = new SubAtom()
    this.locked = false

    this.editorView = atom.views.getView(this.editor)
    this.editorElement = this.editorView

    atom.config.observe('Ensime.enableTypeTooltip', enabled => {
      if (enabled) {
        this.disposables.add(
          this.editorElement,
          'mousemove',
          '.scroll-view',
          e => {
            this.clearExprTypeTimeout()
            return (this.exprTypeTimeout = setTimeout(() => {
              return this.showExpressionType(e)
            }, 100))
          }
        )

        this.disposables.add(
          this.editorElement,
          'mouseout',
          '.scroll-view',
          e => {
            return this.clearExprTypeTimeout()
          }
        )

        this.disposables.add(
          this.editor.onDidDestroy(() => {
            return this.deactivate()
          })
        )

        return this.disposables.add(
          atom.config.observe('Ensime.richTypeTooltip', richTypeTooltip => {
            this.richTypeTooltip = richTypeTooltip
          })
        )
      } else {
        return this.deactivate()
      }
    })
  }
  // @disposables.dispose()

  // get expression type under mouse cursor and show it
  showExpressionType(e) {
    if (this.marker != null || this.locked) {
      return
    }

    const pixelPt = pixelPositionFromMouseEvent(this.editor, e)
    const bufferPt = bufferPositionFromMouseEvent(this.editor, e)

    const offset = this.editor.getBuffer().characterIndexForPosition(bufferPt)

    const client = this.clientLookup()
    return client != null
      ? client
          .getSymbolAtPoint(this.editor.getPath(), offset)
          .then(msg => {
            if (this.marker != null) {
              this.marker.destroy()
            }

            if (msg.type.fullName === '<none>') {
              return
            }

            this.marker = this.editor.markBufferPosition(bufferPt)
            if (this.marker) {
              const typeFormatter = this.richTypeTooltip
                ? formatTypeAsHtml
                : formatTypeAsString

              const element = new TypeHoverElement().initialize(
                typeFormatter(msg.type)
              )

              if (this.domListener != null) {
                this.domListener.destroy()
              }

              this.domListener = new DOMListener(element)
              this.domListener.add('a', 'click', event => {
                const a = event.target
                const qualifiedName = decodeURIComponent(
                  a.dataset.qualifiedName
                )
                log.debug('asking for symbol by name: ', qualifiedName)
                return client.symbolByName(qualifiedName).then(response => {
                  if (response.declPos) {
                    goToPosition(response.declPos)
                    return this.unstickAndHide()
                  }
                })
              })

              this.overlayDecoration = this.editor.decorateMarker(this.marker, {
                type: 'overlay',
                item: element,
                class: 'ensime'
              })

              if (this.stickCommand != null) {
                this.stickCommand.dispose()
              }
              return (this.stickCommand = atom.commands.add(
                'atom-workspace',
                'ensime:lock-type-hover',
                () => {
                  this.locked = true
                  this.stickCommand.dispose()
                  if (this.unstickCommand != null) {
                    this.unstickCommand.dispose()
                  }
                  return (this.unstickCommand = atom.commands.add(
                    'atom-workspace',
                    'core:cancel',
                    () => {
                      return this.unstickAndHide()
                    }
                  ))
                }
              ))
            }
          })
          .catch(function(err) {})
      : undefined
  }
  // Do nothing, this happens when hovering on "stuff"

  unstickAndHide() {
    this.unstickCommand.dispose()
    this.locked = false
    return this.hideExpressionType()
  }

  deactivate() {
    this.clearExprTypeTimeout()
    this.disposables.dispose()
    if (this.stickCommand != null) {
      this.stickCommand.dispose()
    }
    if (this.unstickCommand != null) {
      this.unstickCommand.dispose()
    }
    return this.domListener != null ? this.domListener.destroy() : undefined
  }

  // helper function to hide tooltip and stop timeout
  clearExprTypeTimeout() {
    if (this.exprTypeTimeout != null) {
      clearTimeout(this.exprTypeTimeout)
      this.exprTypeTimeout = null
    }
    return this.hideExpressionType()
  }

  hideExpressionType() {
    if (this.locked || !this.marker) {
      return
    }
    if (this.marker != null) {
      this.marker.destroy()
    }
    this.marker = null
    return this.openerDisposable != null
      ? this.openerDisposable.dispose()
      : undefined
  }
}

export default ShowTypes

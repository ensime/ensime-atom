{MessagePanelView, LineMessageView} = require 'atom-message-panel'
_ = require 'lodash'
{log, isScalaSource} = require '../utils'
{CompositeDisposable} = require 'atom'

# TODO: Add a map from file -> array[messages] and editor subs
module.exports =
class TypeChecking

  constructor: ->
    @messages = new MessagePanelView
        title: 'Ensime'
    @messages.attach()


    @disposables = new CompositeDisposable

    @editors = new Map

    @markersOfFile = new Map

    @disposables.add atom.workspace.observeTextEditors (editor) =>
      if isScalaSource(editor) # TODO: check that the source is also in an ensime-activated project.  ensime:start should log which directories are ensime-enabled
        @editors.set(editor.getPath(), editor)
        @disposables.add editor.onDidDestroy () =>
          @editors.delete(editor.getPath())


  addScalaNotes: (msg) ->
    notes = msg.notes

    # Nah? We might already have stuff
    @notesByFile = _.groupBy(notes, (note) -> note.file)

    addNoteToMessageView = (note) =>
      file = note.file
      @messages.add new LineMessageView
          file: file
          line: note.line
          character: note.col
          message: note.msg
          className: switch note.severity.typehint
            when "NoteError" then "highlight-error"
            when "NoteWarning" then "highlight-warning"
            else ""

    for file, notes of @notesByFile
      if(not file.includes('dep-src')) # TODO: put under flag
        addNoteToMessageView note for note in notes

        # TODO: add markers if editor open
        if(@editors.has(file))
          editor = @editors.get(file)
          # for note in notes
          #   editor.markRegio


  clearScalaNotes: ->
    @messages.clear()

  # cleanup
  destroy: ->
    @messages.clear()
    @messages?.close()
    @messages = null

    @markersOfFile = null
    @editors = null

    @disposables.dispose()

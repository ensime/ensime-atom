{CompositeDisposable} = require 'atom'

# Just a cache slot, maybe not needed if require caches well anyways,
# but feels useful if we don't know when it's used first.
c = (resolve) ->
  x = undefined
  ->
    x ?= resolve()
    x

lodash = c -> require 'lodash'
ensimeClient = c -> require 'ensime-client'
ensimeStartup = c -> require './ensime-startup'
utils = c -> require './utils'

AutocompletePlusProvider = require './features/autocomplete-plus'
Refactorings = require './features/refactorings'
ShowTypes = require './features/show-types'
Implicits = require './features/implicits'
AutoTypecheck = require './features/auto-typecheck'

GoTo = c -> require './features/go-to'
documentation = c -> require './features/documentation'

dotEnsimeUtils = c -> ensimeClient().dotEnsimeUtils

log = undefined


scalaSourceSelector = """atom-text-editor[data-grammar="source scala"]"""
javaSourceSelector = """atom-text-editor[data-grammar="source java"]"""
module.exports = Ensime =

  config: require './config'

  addCommandsForStoppedState: ->
    @stoppedCommands = new CompositeDisposable
    @stoppedCommands.add atom.commands.add 'atom-workspace', "ensime:start", => @selectAndBootAnEnsime()
    @stoppedCommands.add atom.commands.add 'atom-workspace', "ensime:update-server", => @selectAndUpdateAnEnsime()

  addCommandsForStartedState: ->
    @startedCommands = new CompositeDisposable
    @startedCommands.add atom.commands.add 'atom-workspace', "ensime:stop", => @selectAndStopAnEnsime()
    @startedCommands.add atom.commands.add 'atom-workspace', "ensime:start", => @selectAndBootAnEnsime()
    @startedCommands.add atom.commands.add 'atom-workspace', "ensime:update-server", => @selectAndUpdateAnEnsime()


    @startedCommands.add atom.commands.add scalaSourceSelector, "ensime:mark-implicits", => @markImplicits()
    @startedCommands.add atom.commands.add scalaSourceSelector, "ensime:unmark-implicits", => @unmarkImplicits()
    @startedCommands.add atom.commands.add scalaSourceSelector, "ensime:show-implicits", => @showImplicits()
    @startedCommands.add atom.commands.add 'atom-workspace', "ensime:typecheck-all", => @typecheckAll()
    @startedCommands.add atom.commands.add 'atom-workspace', "ensime:unload-all", => @unloadAll()
    @startedCommands.add atom.commands.add scalaSourceSelector, "ensime:typecheck-file", => @typecheckFile()
    @startedCommands.add atom.commands.add scalaSourceSelector, "ensime:typecheck-buffer", => @typecheckBuffer()

    @startedCommands.add atom.commands.add javaSourceSelector, "ensime:typecheck-file", => @typecheckFile()
    @startedCommands.add atom.commands.add javaSourceSelector, "ensime:typecheck-buffer", => @typecheckBuffer()


    @startedCommands.add atom.commands.add scalaSourceSelector, "ensime:go-to-definition", => @goToDefinitionOfCursor()

    @startedCommands.add atom.commands.add scalaSourceSelector, "ensime:go-to-doc", => @goToDocOfCursor()
    @startedCommands.add atom.commands.add javaSourceSelector, "ensime:go-to-doc", => @goToDocOfCursor()
    @startedCommands.add atom.commands.add 'atom-workspace', "ensime:browse-doc", => @goToDocIndex()

    @startedCommands.add atom.commands.add scalaSourceSelector, "ensime:format-source", => @formatCurrentSourceFile()

    @startedCommands.add atom.commands.add 'atom-workspace', "ensime:search-public-symbol", => @searchPublicSymbol()
    @startedCommands.add atom.commands.add 'atom-workspace', "ensime:organize-imports", => @organizeImports()



  activate: (state) ->
    @subscriptions = new CompositeDisposable
    
    logLevel = atom.config.get('Ensime.logLevel')

    logapi = require('loglevel')

    logapi.getLogger('ensime-client').setLevel(logLevel)
    logapi.getLogger('ensime.server-update').setLevel(logLevel)
    logapi.getLogger('ensime.startup').setLevel(logLevel)
    logapi.getLogger('ensime.autocomplete-plus-provider').setLevel(logLevel)
    logapi.getLogger('ensime.refactorings').setLevel(logLevel)
    log = logapi.getLogger('ensime.main')
    log.setLevel(logLevel)

    # Install deps if not there
    if(atom.config.get('Ensime.enableAutoInstallOfDependencies'))
      (require 'atom-package-deps').install('Ensime').then ->
        log.trace('Ensime dependencies installed, good to go!')


    # Feature controllers
    @showTypesControllers = new WeakMap
    @implicitControllers = new WeakMap
    @autotypecheckControllers = new WeakMap


    @addCommandsForStoppedState()
    @someInstanceStarted = false

    @controlSubscription = atom.workspace.observeTextEditors (editor) =>
      if utils().isScalaSource(editor) or utils().isJavaSource(editor)
        instanceLookup = => @instanceManager?.instanceOfFile(editor.getPath())
        clientLookup = -> instanceLookup()?.api
        if not @showTypesControllers.get(editor) then @showTypesControllers.set(editor, new ShowTypes(editor, clientLookup))
        if not @implicitControllers.get(editor) then @implicitControllers.set(editor, new Implicits(editor, instanceLookup))
        if not @autotypecheckControllers.get(editor) then @autotypecheckControllers.set(editor, new AutoTypecheck(editor, clientLookup))

        @subscriptions.add editor.onDidDestroy () =>
          @deleteControllers editor

    clientLookup = (editor) => @apiOfEditor(editor)
    @autocompletePlusProvider = new AutocompletePlusProvider(clientLookup)
    @refactorings = new Refactorings

    atom.workspace.onDidStopChangingActivePaneItem (pane) =>
      if atom.workspace.isTextEditor(pane)
        if utils().isScalaSource(pane) or utils().isJavaSource(pane)
          log.trace('this: ' + this)
          log.trace(['@instanceManager: ', @instanceManager])
          instance = @instanceManager?.instanceOfFile(pane.getPath())
          @switchToInstance(instance)

  switchToInstance: (instance) ->
    log.trace(['changed from ', @activeInstance, ' to ', instance])
    if(instance != @activeInstance)
      @activeInstance?.ui.statusbarView.hide()
      @activeInstance = instance
      if(instance)
        instance.ui.statusbarView.show()


  deactivate: ->
    @instanceManager?.destroyAll()

    @subscriptions.dispose()
    @controlSubscription.dispose()

    @autocompletePlusProvider?.dispose()
    @autocompletePlusProvider = null


  apiOfEditor: (editor) ->
    @instanceOfEditor(editor)?.api

  instanceOfEditor: (editor) ->
    if(editor)
      @instanceManager?.instanceOfFile(editor.getPath())
    else
      undefined
      
      
  apiOfOfActiveTextEditor: ->
    activeTextEditor = atom.workspace.getActiveTextEditor()
    if activeTextEditor
      @apiOfEditor(activeTextEditor)
    else
      @instanceManager?.firstInstance()

  # TODO: move out
  statusbarOutput: (statusbarView, typechecking) -> (msg) ->
    typehint = msg.typehint

    if(typehint == 'AnalyzerReadyEvent')
      statusbarView.setText('Analyzer ready!')

    else if(typehint == 'FullTypeCheckCompleteEvent')
      statusbarView.setText('Full typecheck finished!')

    else if(typehint == 'IndexerReadyEvent')
      statusbarView.setText('Indexer ready!')

    else if(typehint == 'CompilerRestartedEvent')
      statusbarView.setText('Compiler restarted!')

    else if(typehint == 'ClearAllScalaNotesEvent' || typehint == 'ClearAllJavaNotesEvent')
      typechecking?.clearScalaNotes()

    else if(typehint == 'NewScalaNotesEvent' || typehint == 'NewJavaNotesEvent')
      typechecking?.addScalaNotes(msg)

    else if(typehint.startsWith('SendBackgroundMessageEvent'))
      statusbarView.setText(msg.detail)



  startInstance: (dotEnsimePath) ->
    ImplicitInfo = require './model/implicit-info'
    ImplicitInfoView = require './views/implicit-info-view'

    # Register model-view mappings
    @subscriptions.add atom.views.addViewProvider ImplicitInfo, (implicitInfo) ->
      result = new ImplicitInfoView().initialize(implicitInfo)
      result


    # remove start command and add others
    @stoppedCommands.dispose()

    # FIXME: - we have had double commands for each instance :) This is a quick and dirty fix
    if(not @someInstanceStarted)
      @addCommandsForStartedState()
      @someInstanceStarted = true

    dotEnsimeUtils().parseDotEnsime(dotEnsimePath).then (dotEnsime) =>

      typechecking = undefined
      if(@registerIndie)
        TypeCheckingFeature = require './features/typechecking'
        typechecking = TypeCheckingFeature(@registerIndie({name: "Ensime: #{dotEnsimePath}"}))

      StatusbarView = require './views/statusbar-view'
      statusbarView = new StatusbarView()
      statusbarView.init()

      ensimeServerVersion = atom.config.get('Ensime.ensimeServerVersion')
      
      ensimeStartup().startClient(dotEnsime, ensimeServerVersion, @statusbarOutput(statusbarView, typechecking)).then (client) =>
        atom.notifications.addSuccess("Ensime connected!")
        
        # atom specific ui state of an instance
        ui = {
          statusbarView
          typechecking
          destroy: ->
            log.debug("destroy on instance ui")
            statusbarView.destroy()
            typechecking?.destroy()
        }
        
        instance = ensimeClient().makeInstanceOf(dotEnsime, client, ui)

        @instanceManager ?= new (ensimeClient().InstanceManager)
        @instanceManager.registerInstance(instance)
        if (not @activeInstance)
          @activeInstance = instance

        client.post({"typehint":"ConnectionInfoReq"}, (msg) -> )

        @switchToInstance(instance)
      



  deleteControllers: (editor) ->
    deactivateAndDelete = (map) ->
      map.get(editor)?.deactivate() # _ref.deactivate is not a function
      map.delete(editor)

    deactivateAndDelete(@showTypesControllers)
    deactivateAndDelete(@implicitControllers)
    deactivateAndDelete(@autotypecheckControllers)


  deleteAllEditorsControllers: ->
    for editor in atom.workspace.getTextEditors()
      @deleteControllers editor

  # Shows dialog to select a .ensime under this project paths and calls callback with parsed
  selectDotEnsime: (callback, filter = -> true) ->
    dirs = atom.project.getPaths()
    _ = lodash()
    dotEnsimeUtils().allDotEnsimesInPaths(dirs).then (dotEnsimes) ->
      filteredDotEnsime = _.filter(dotEnsimes, filter)


      if(filteredDotEnsime.length == 0)
        utils().modalMsg("No .ensime file found. Please generate with `sbt ensimeConfig` or similar")
      else if (filteredDotEnsime.length == 1)
        callback(filteredDotEnsime[0])
      else
        SelectDotEnsimeView = require './views/select-dot-ensime-view'
        new SelectDotEnsimeView(filteredDotEnsime, (selectedDotEnsime) ->
          callback(selectedDotEnsime)
        )

  selectAndBootAnEnsime: ->
    @selectDotEnsime(
      (selectedDotEnsime) => @startInstance(selectedDotEnsime.path),
      (dotEnsime) => not @instanceManager?.isStarted(dotEnsime.path)
    )

  selectAndStopAnEnsime: ->
    stopDotEnsime = (selectedDotEnsime) =>
      log.debug('stopping ensime')
      dotEnsimeUtils().parseDotEnsime(selectedDotEnsime.path).then (dotEnsime) =>
        @instanceManager?.stopInstance(dotEnsime)
        @switchToInstance(undefined)

    @selectDotEnsime(stopDotEnsime, (dotEnsime) => @instanceManager?.isStarted(dotEnsime.path))
  
  selectAndUpdateAnEnsime: ->
    @selectDotEnsime (selectedDotEnsime) ->
      dotEnsimeUtils().parseDotEnsime(selectedDotEnsime.path).then (dotEnsime) ->
        ensimeStartup().updateEnsimeServer(dotEnsime, -> atom.notifications.addSuccess("Updated!"))
    

  typecheckAll: ->
    @apiOfOfActiveTextEditor()?.typecheckAll()

  unloadAll: ->
    @apiOfOfActiveTextEditor()?.unloadAll()

  # typechecks currently open file
  typecheckBuffer: ->
    b = atom.workspace.getActiveTextEditor()?.getBuffer()
    @apiOfEditor(b)?.typecheckBuffer(b.getPath(), b.getText())

  typecheckFile: ->
    b = atom.workspace.getActiveTextEditor()?.getBuffer()
    @apiOfEditor(b)?.typecheckFile(b.getPath())

  goToDocOfCursor: ->
    editor = atom.workspace.getActiveTextEditor()
    documentation().goToDocAtPoint(@instanceOfEditor(editor), editor)

  goToDocIndex: ->
    editor = atom.workspace.getActiveTextEditor()
    documentation().goToDocIndex(@instanceOfEditor(editor))

  goToDefinitionOfCursor: ->
    editor = atom.workspace.getActiveTextEditor()
    textBuffer = editor.getBuffer()
    pos = editor.getCursorBufferPosition()
    GoTo().goToTypeAtPoint(@apiOfEditor(editor), textBuffer, pos)

  markImplicits: ->
    editor = atom.workspace.getActiveTextEditor()
    @implicitControllers.get(editor)?.showImplicits()

  unmarkImplicits: ->
    editor = atom.workspace.getActiveTextEditor()
    @implicitControllers.get(editor)?.clearMarkers()

  showImplicits: ->
    editor = atom.workspace.getActiveTextEditor()
    @implicitControllers.get(editor)?.showImplicitsAtCursor()


  provideAutocomplete: ->
    log.trace('provideAutocomplete called')

    getProvider = =>
      @autocompletePlusProvider

    {
      selector: '.source.scala, .source.java'
      disableForSelector: '.source.scala .comment'
      inclusionPriority: 10
      excludeLowerPriority: true

      getSuggestions: ({editor, bufferPosition, scopeDescriptor, prefix}) ->
        provider = getProvider()
        
        if (provider && !"[](){}_".includes(prefix))
          new Promise (resolve) ->
            log.trace('ensime.getSuggestions')
            provider.getCompletions(editor.getBuffer(), bufferPosition, resolve)
        else
          []

      onDidInsertSuggestion: (x) ->
        provider = getProvider()
        provider.onDidInsertSuggestion x
    }

  provideHyperclick: ->
    {
      providerName: 'ensime-atom'
      getSuggestionForWord: (textEditor, text, range) =>
        if utils().isScalaSource(textEditor) or utils().isJavaSource(textEditor)
          api = @apiOfEditor(textEditor)
          {
            range: range
            callback: () ->
              if(api)
                GoTo().goToTypeAtPoint(api, textEditor.getBuffer(), range.start)
              else
                atom.notifications.addError("Ensime not started! :(", {
                  detail: "There is no running ensime instance for this particular file. Please start ensime first!"
                  })
          }
        else
          undefined

    }

  consumeIndie: (@registerIndie) ->

  provideIntentions: ->
    getIntentions = (req) =>
      textEditor = req.textEditor
      bufferPosition = req.bufferPosition
      _ = lodash()
      new Promise (resolve) =>
        @apiOfEditor(textEditor)?.getImportSuggestions(
          textEditor.getPath(),
          textEditor.getBuffer().characterIndexForPosition(bufferPosition),
          textEditor.getWordUnderCursor()).then (res) =>
            result = _.map(res.symLists[0], (sym) =>
              onSelected = => @refactorings.doImport(@apiOfEditor(textEditor), sym.name, textEditor.getPath(), textEditor.getBuffer())
              {
                priority: 100
                icon: 'bucket'
                class: 'custom-icon-class'
                title: "import #{sym.name}"
                selected: onSelected
              }
            )
            resolve(result)
          
    {
      grammarScopes: ['source.scala']
      getIntentions: getIntentions
    }

  formatCurrentSourceFile: ->
    editor = atom.workspace.getActiveTextEditor()
    cursorPos = editor.getCursorBufferPosition()
    @apiOfEditor(editor)?.formatSourceFile(editor.getPath(), editor.getText()).then (msg) ->
      editor.setText(msg.text)
      editor.setCursorBufferPosition(cursorPos)
      

  searchPublicSymbol: ->
    unless @publicSymbolSearch
      PublicSymbolSearch = require('./features/public-symbol-search')
      @publicSymbolSearch = new PublicSymbolSearch()
    @publicSymbolSearch.toggle(@apiOfOfActiveTextEditor())

  organizeImports: ->
    editor = atom.workspace.getActiveTextEditor()
    @refactorings.organizeImports(@apiOfEditor(editor), editor.getPath())

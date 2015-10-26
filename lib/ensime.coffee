net = require('net')
exec = require('child_process').exec
fs = require 'fs'
path = require('path')
{Subscriber} = require 'emissary'
Client = require './client'
StatusbarView = require './views/statusbar-view'
{CompositeDisposable} = require 'atom'
{updateEnsimeServer, startEnsimeServer, classpathFileName} = require './ensime-startup'

ShowTypes = require './features/show-types'
Implicits = require('./features/implicits')
AutoTypecheck = require('./features/auto-typecheck')

TypeCheckingFeature = require('./features/typechecking')
AutocompletePlusProvider = require('./features/autocomplete-plus')
{log, modalMsg, isScalaSource, projectPath} = require './utils'

ImplicitInfo = require('./model/implicit-info')
ImplicitInfoView = require('./views/implicit-info-view')

portFile = ->
    loadSettings = atom.getLoadSettings()
    projectPath() + '/.ensime_cache/port'


createClient = (portFileLoc, generalHandler) ->
  port = fs.readFileSync(portFileLoc).toString()
  new Client(port, generalHandler)


scalaSourceSelector = """atom-text-editor[data-grammar="source scala"]"""


module.exports = Ensime =

  config:
    ensimeServerVersion:
      description: 'Version of Ensime server',
      type: 'string',
      default: "0.9.10-SNAPSHOT",
      order: 1
    sbtExec:
      description: "Full path to sbt. 'which sbt'"
      type: 'string'
      default: ''
      order: 2
    ensimeServerFlags:
      description: 'java flags for ensime server startup'
      type: 'string'
      default: ''
      order: 3
    devMode:
      description: 'Turn on for extra console logging during development'
      type: 'boolean'
      default: false
      order: 4
    runServerDetached:
      description: "Run the Ensime server as a detached process. Useful while developing"
      type: 'boolean'
      default: false
      order: 5
    typecheckWhen:
      description: "When to typecheck"
      type: 'string'
      default: 'typing'
      enum: ['command', 'save', 'typing']
      order: 6
    enableTypeTooltip:
      description: "Enable tooltip that shows type when hovering"
      type: 'boolean'
      default: true
      order: 7
    modifierKeyForJumpToDefinition:
      description: "Modifier key used when clicking for jump to definition"
      type: 'string'
      enum: ['cmd', 'alt', 'ctrl']
      default: 'cmd'
      order: 8
    markImplicitsAutomatically:
      description: "Mark implicits on buffer load and save"
      type: 'boolean'
      default: true
      order: 9


  addCommandsForStoppedState: ->
    # Need to have a started server and port file
    @stoppedCommands = new CompositeDisposable
    @stoppedCommands.add atom.commands.add 'atom-workspace', "ensime:update-ensime-server", => updateEnsimeServer()
    @stoppedCommands.add atom.commands.add 'atom-workspace', "ensime:start", =>
      if !projectPath()?
        modalMsg("no valid Ensime project found (did you remember to generate a .ensime file?)")
      else
        @initProject()




  addCommandsForStartedState: ->
    @startedCommands = new CompositeDisposable
    @startedCommands.add atom.commands.add 'atom-workspace', "ensime:stop", => @stopEnsime()

    @startedCommands.add atom.commands.add scalaSourceSelector, "ensime:mark-implicits", => @markImplicits()
    @startedCommands.add atom.commands.add scalaSourceSelector, "ensime:unmark-implicits", => @unmarkImplicits()
    @startedCommands.add atom.commands.add scalaSourceSelector, "ensime:show-implicits", => @showImplicits()
    @startedCommands.add atom.commands.add 'atom-workspace', "ensime:typecheck-all", => @typecheckAll()
    @startedCommands.add atom.commands.add 'atom-workspace', "ensime:unload-all", => @unloadAll()
    @startedCommands.add atom.commands.add scalaSourceSelector, "ensime:typecheck-file", => @typecheckFile()
    @startedCommands.add atom.commands.add scalaSourceSelector, "ensime:typecheck-buffer", => @typecheckBuffer()

    @startedCommands.add atom.commands.add scalaSourceSelector, "ensime:go-to-definition", => @goToDefinitionOfCursor()

    @startedCommands.add atom.commands.add 'atom-workspace', "ensime:update-ensime-server", => updateEnsimeServer()

    @startedCommands.add atom.commands.add scalaSourceSelector, "ensime:format-source", => @formatCurrentSourceFile()
    @startedCommands.add atom.commands.add scalaSourceSelector, "ensime:get-import-suggestions", => @getImportSuggestions()


  activate: (state) ->
    # Install deps if not there
    apd = require('atom-package-dependencies')
    apd.install()


    @subscriptions = new CompositeDisposable

    # Feature controllers
    @showTypesControllers = new WeakMap
    @implicitControllers = new WeakMap
    @autotypecheckControllers = new WeakMap

    @addCommandsForStoppedState()
    # https://discuss.atom.io/t/ok-to-use-grammar-cson-for-just-file-assoc/17801/11
    Promise.resolve(
      atom.packages.isPackageLoaded('language-scala') && atom.packages.activatePackage('language-scala')
    ).then (languageScalaPkg) ->
      if languageScalaPkg
        # language-scala is loaded and activated
      else
        # language-scala is not loaded
        grammar = atom.packages.resolvePackagePath('Ensime') + path.sep + 'grammars-hidden' + path.sep + 'scala.cson'
        atom.grammars.loadGrammar grammar




  deactivate: ->
    @stopEnsime()


  maybeStartEnsimeServer: ->
    if not @ensimeServerPid
      if fs.existsSync(portFile())
        modalMsg(".ensime_cache/port file already exists. Sure no running server already? If so, remove file and try again.")
      else
        startEnsimeServer((pid) =>
          @ensimeServerPid = pid
          @ensimeServerPid.on 'exit', (code) =>
            @ensimeServerPid = null
        )
    else
      modalMsg("Already running", "Ensime server process already running")

  generalHandler: (msg) ->

    typehint = msg.typehint

    if(typehint == 'AnalyzerReadyEvent')
      @statusbarView.setText('Analyzer ready!')

    else if(typehint == 'FullTypeCheckCompleteEvent')
      @statusbarView.setText('Full typecheck finished!')

    else if(typehint == 'IndexerReadyEvent')
      @statusbarView.setText('Indexer ready!')

    else if(typehint == 'CompilerRestartedEvent')
      @statusbarView.setText('Compiler restarted!')

    else if(typehint == 'ClearAllScalaNotesEvent')
      @typechecking.clearScalaNotes()

    else if(typehint == 'NewScalaNotesEvent')
      @typechecking.addScalaNotes(msg)

    else if(typehint.startsWith('SendBackgroundMessageEvent'))
      @statusbarView.setText(msg.detail)



  initProject: ->
    @typechecking = new TypeCheckingFeature()

    # Register model-view mappings
    @subscriptions.add atom.views.addViewProvider ImplicitInfo, (implicitInfo) ->
      result = new ImplicitInfoView().initialize(implicitInfo)
      result

    initClient = =>
      # remove start command and add others
      @stoppedCommands.dispose()
      @addCommandsForStartedState()

      @client = createClient(portFile(), (msg) => @generalHandler(msg) )


      @statusbarView = new StatusbarView()
      @statusbarView.init()

      @client.post({"typehint":"ConnectionInfoReq"}, (msg) -> )

      @controlSubscription = atom.workspace.observeTextEditors (editor) =>
        if isScalaSource(editor)
          if atom.config.get('Ensime.enableTypeTooltip')
            if not @showTypesControllers.get(editor) then @showTypesControllers.set(editor, new ShowTypes(editor, @client))
          if not @implicitControllers.get(editor) then @implicitControllers.set(editor, new Implicits(editor, @client))
          if not @autotypecheckControllers.get(editor) then @autotypecheckControllers.set(editor, new AutoTypecheck(editor, @client))

          @subscriptions.add editor.onDidDestroy () =>
            @deleteControllers editor


      @autocompletePlusProvider = new AutocompletePlusProvider(@client)


    # Startup server
    if not fs.existsSync(portFile())
      @maybeStartEnsimeServer()

    # Client
    tryStartup = (trysLeft) =>
      if(trysLeft == 0)
        modalMsg("Server doesn't seem to startup in time. Report bug!")
      else if fs.existsSync(portFile())
        initClient()
      else
        @clientStartupTimeout = setTimeout (=>
          tryStartup(trysLeft - 1)
        ), 500

    if(fs.existsSync(classpathFileName()))
      tryStartup(20) # 10 sec should be enough?
    else
      tryStartup(200)



  deleteControllers: (editor) ->
    deactivateAndDelete = (controller) =>
      controller.get(editor)?.deactivate()
      controller.delete(editor)

    deactivateAndDelete(@showTypesControllers)
    deactivateAndDelete(@implicitControllers)
    deactivateAndDelete(@autotypecheckControllers)


  deleteAllEditorsControllers: ->
    for editor in atom.workspace.getTextEditors()
      @deleteControllers editor


  stopEnsime: ->
    if not atom.config.get('Ensime.runServerDetached')
      @ensimeServerPid?.kill()

    @ensimeServerPid = null

    @statusbarView?.destroy()
    @statusbarView = null

    @deleteAllEditorsControllers()

    @client?.destroy()
    @client = null

    @typechecking?.destroy()
    @typechecking = null

    @startedCommands.dispose()
    @addCommandsForStoppedState()

    @subscriptions.dispose()
    @controlSubscription.dispose()

    @autocompletePlusProvider = null



  typecheckAll: ->
    @client.post( {"typehint": "TypecheckAllReq"}, (msg) ->)

  unloadAll: ->
    @client.post( {"typehint": "UnloadAllReq"}, (msg) ->)

  # typechecks currently open file
  typecheckBuffer: ->
    b = atom.workspace.getActiveTextEditor()?.getBuffer()
    @client.typecheckBuffer(b)

  typecheckFile: ->
    b = atom.workspace.getActiveTextEditor()?.getBuffer()
    @client.typecheckFile(b)

  goToDefinitionOfCursor: ->
    editor = atom.workspace.getActiveTextEditor()
    textBuffer = editor.getBuffer()
    pos = editor.getCursorBufferPosition()
    @client.goToTypeAtPoint(textBuffer, pos)

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
    log('provideAutocomplete called')

    getProvider = =>
      @autocompletePlusProvider

    {
      selector: '.source.scala'
      disableForSelector: '.source.scala .comment'
      inclusionPriority: 10
      excludeLowerPriority: true

      getSuggestions: ({editor, bufferPosition, scopeDescriptor, prefix}) =>
        provider = getProvider()
        if(provider)
          new Promise (resolve) =>
            log('ensime.getSuggestions')
            provider.getCompletions(editor.getBuffer(), bufferPosition, resolve)
        else
          []
    }

  provideHyperclick: ->
    {
      getSuggestionForWord: (textEditor, text, range) =>
        {
          range: range
          callback: () => @client?.goToTypeAtPoint(textEditor.getBuffer(), range.start)
        }
    }


  formatCurrentSourceFile: ->
    editor = atom.workspace.getActiveTextEditor()
    cursorPos = editor.getCursorBufferPosition()
    req =
      typehint: "FormatOneSourceReq"
      file:
        file: editor.getPath()
        contents: editor.getText()
    @client?.post(req, (msg) ->
      editor.setText(msg.text)
      editor.setCursorBufferPosition(cursorPos)
    )

  getImportSuggestions: ->
    @client.getImportSuggestions([atom.workspace.getActiveTextEditor().getWordUnderCursor()])

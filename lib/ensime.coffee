net = require('net')
exec = require('child_process').exec
fs = require 'fs'
path = require('path')
{Subscriber} = require 'emissary'
Client = require './client'
StatusbarView = require './views/statusbar-view'
{CompositeDisposable} = require 'atom'
EditorControl = require './editor-control'
{updateEnsimeServer, startEnsimeServer, classpathFileName} = require './ensime-startup'
ShowTypes = require './features/show-types'
TypeCheckingFeature = require('./features/typechecking')
{log, modalMsg, isScalaSource, projectPath} = require './utils'


portFile = ->
    loadSettings = atom.getLoadSettings()
    projectPath() + '/.ensime_cache/port'


createClient = (portFileLoc, generalHandler) ->
  port = fs.readFileSync(portFileLoc).toString()
  new Client(port, generalHandler)


module.exports = Ensime =
  subscriptions: null

  config: {
    ensimeServerVersion: {
      description: 'Version of Ensime server',
      type: 'string',
      default: "0.9.10-SNAPSHOT",
      order: 1
    },
    sbtExec: {
      description: "Full path to sbt. 'which sbt'",
      type: 'string',
      default: '',
      order: 2
    },
    ensimeServerFlags: {
      description: 'java flags for ensime server startup',
      type: 'string',
      default: '',
      order: 3,
    },
    devMode: {
      description: 'Turn on for extra console logging during development',
      type: 'boolean',
      default: false,
      order: 4,
    },
    runServerDetached: {
      description: "Run the Ensime server as a detached process. Useful while developing",
      type: 'boolean',
      default: false,
      order: 5
    }
    typecheckWhen: {
      description: "When to typecheck",
      type: 'string',
      default: 'typing',
      enum: ['command', 'save', 'typing'],
      order: 6

    }
    typecheckTypingDelay: {
      description: "Delay for typechecking while typing, in milliseconds. Too low might cause performance issues."
      type: 'integer'
      default: '500',
      order: 7
    }
  }

  deactivatedSubscriptions: ->
    # Need to have a started server and port file
    @subscriptions.add atom.commands.add 'atom-workspace', "ensime:update-ensime-server", => updateEnsimeServer()
    @subscriptions.add atom.commands.add 'atom-workspace', "ensime:start", =>
      if !projectPath()?
        modalMsg("no valid Ensime project found (did you remember to generate a .ensime file?)")
      else
        @initProject()


  activatedSubscriptions: ->
    @subscriptions.add atom.commands.add 'atom-workspace', "ensime:stop", => @stopEnsime()

    @subscriptions.add atom.commands.add 'atom-workspace', "ensime:typecheck-all", => @typecheckAll()
    @subscriptions.add atom.commands.add 'atom-workspace', "ensime:unload-all", => @unloadAll()
    @subscriptions.add atom.commands.add 'atom-workspace', "ensime:typecheck-file", => @typecheckFile()
    @subscriptions.add atom.commands.add 'atom-workspace', "ensime:typecheck-buffer", => @typecheckBuffer()

    @subscriptions.add atom.commands.add 'atom-workspace', "ensime:go-to-definition", => @goToDefinitionOfCursor()


  activate: (state) ->
    @subscriptions = new CompositeDisposable
    @editorControllers = new WeakMap
    @showTypesControllers = new WeakMap
    @deactivatedSubscriptions()
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
    @subscriptions.dispose()
    @controlSubscription.dispose()
    if not atom.config.get('Ensime.runServerDetached')
      @ensimeServerPid?.kill()
    @deleteControllers()

  maybeStartEnsimeServer: ->
    if not @ensimeServerPid
      if fs.existsSync(portFile())
        modalMsg(".ensime/cache/port file already exists. Sure no running server already? If so, remove file and try again.")
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

    initClient = =>
      @activatedSubscriptions()
      @client = createClient(portFile(), (msg) => @generalHandler(msg) )


      @statusbarView = new StatusbarView()
      @statusbarView.init()

      @client.post({"typehint":"ConnectionInfoReq"}, (msg) -> )

      @controlSubscription = atom.workspace.observeTextEditors (editor) =>
        if not @editorControllers.get(editor) && isScalaSource(editor)
          @editorControllers.set(editor, new EditorControl(editor, @client))
          @showTypesControllers.set(editor, new ShowTypes(editor, @client))

          @subscriptions.add editor.onDidDestroy () =>
            @removeControllers editor

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

  removeControllers: (editor) ->
    @showTypesControllers.get(editor)?.deactivate()
    @showTypesControllers.delete(editor)
    @editorControllers.get(editor)?.deactivate()
    @editorControllers.delete(editor)

  deleteControllers: ->
    for editor in atom.workspace.getTextEditors()
      @removeControllers editor


  stopEnsime: ->
    @ensimeServerPid?.kill()
    @ensimeServerPid = null



    @statusbarView?.destroy()
    @statusbarView = null

    @deleteControllers()

    @client?.destroy()
    @client = null


    @typechecking?.destroy()
    @typechecking = null
    
    @subscriptions = new CompositeDisposable
    @deactivatedSubscriptions()



    #atom.packages.deactivatePackage('Ensime')



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



  provideLinks: ->
    Processor = require('./provide-links-processor')
    new Processor( {getClient: => @client})

  provideAutocomplete: ->
    log('provideAutocomplete called')
    getClient = =>
      log('getClient called and this is ' + this + ", @client is " + @client)
      @client

    {
      selector: '.source.scala'
      disableForSelector: '.source.scala .comment'

      getSuggestions: ({editor, bufferPosition, scopeDescriptor, prefix}) =>
        if(getClient())
          new Promise (resolve) =>
            log('ensime.getSuggestions')
            getClient().getCompletions(editor.getBuffer(), bufferPosition, resolve)
        else
          log('@client undefined')
          []
    }

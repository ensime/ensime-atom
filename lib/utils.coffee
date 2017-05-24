path = require 'path'
fs = require 'fs'
temp = require 'temp'
log = require('loglevel').getLogger('ensime')


tempDir = temp.mkdirSync()

getTempDir = -> tempDir

isScalaSource = (editor) ->
  buffer = editor.getBuffer()
  fname = buffer.getUri()
  if(fname)
    path.extname(fname) in ['.scala']
  else
    false


isJavaSource = (editor) ->
  buffer = editor.getBuffer()
  fname = buffer.getUri()
  if(fname)
    path.extname(fname) in ['.java']
  else
    false

# pixel position from mouse event
pixelPositionFromMouseEvent = (editor, event) ->
  {clientX, clientY} = event
  elem = atom.views.getView(editor)
  linesClientRect = getElementsByClass(elem, ".lines")[0].getBoundingClientRect()
  top = clientY - linesClientRect.top
  left = clientX - linesClientRect.left
  {top, left}

# screen position from mouse event
screenPositionFromMouseEvent = (editor, event) ->
  atom.views.getView(editor).component.screenPositionForMouseEvent event
  # This was broken:
  #editor.screenPositionForPixelPosition(pixelPositionFromMouseEvent(editor, event))

# from haskell-ide
bufferPositionFromMouseEvent = (editor, event) ->
  editor.bufferPositionForScreenPosition (screenPositionFromMouseEvent(editor, event))

getElementsByClass = (elem,klass) ->
  elem.rootElement.querySelectorAll(klass)

modalMsg = (title, msg) ->
  atom.confirm
    message: title
    detailedMessage: msg
    buttons:
      Ok: ->

addModalPanel = (vue, visible = false) ->
  element = document.createElement('div')
  modalPanel = atom.workspace.addModalPanel
    item: element, visible: visible
  vue.$mount(element)
  modalPanel

withSbt = (callback) ->
  sbtCmd = atom.config.get('Ensime.sbtExec')
  if sbtCmd
    callback(sbtCmd)
  else
    # TODO: try to check if on path, can we do this with fs?
    dialog = remote.require('dialog')
    dialog.showOpenDialog(
      title: "Sorry, but we need you to point out your SBT executive"
      properties:['openFile']
      , (filenames) ->
        sbtCmd = filenames[0]
        atom.config.set('Ensime.sbtExec', sbtCmd)
        callback(sbtCmd)
      )

# create classpath file name for ensime server startup
mkClasspathFileName = (scalaVersion, ensimeServerVersion) ->
  path.join(packageDir(), "classpath_#{scalaVersion}_#{ensimeServerVersion}")

mkAssemblyJarFileName = (scalaEdition, ensimeServerVersion) ->
  path.join(packageDir(), "ensime_#{scalaEdition}-#{ensimeServerVersion}-assembly.jar")

packageDir = ->
  atom.packages.getActivePackage('Ensime')?.path || atom.packages.resolvePackagePath('Ensime')

proxySettings = ->
  atomProxySettings = atom.config.get('Ensime.proxySettings')
  if (!!atomProxySettings.host)
    settings =
      host: atomProxySettings.host
      port: atomProxySettings.port
    if (!!atomProxySettings.user)
      settings.user = atomProxySettings.user
    if (!!atomProxySettings.password)
      settings.password = atomProxySettings.password
    settings

module.exports = {
  isScalaSource,
  isJavaSource,
  pixelPositionFromMouseEvent,
  screenPositionFromMouseEvent,
  bufferPositionFromMouseEvent,
  getElementsByClass,
  log: log.trace,
  modalMsg,
  withSbt,
  addModalPanel,
  packageDir,
  mkClasspathFileName,
  mkAssemblyJarFileName
  getTempDir
  proxySettings
}

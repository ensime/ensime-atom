'use babel'

import path from 'path'
import fs from 'fs'
import temp from 'temp'
import loglevel from 'loglevel'

const log = loglevel.getLogger('ensime')

const tempDir = temp.mkdirSync()

const getTempDir = () => tempDir

const isScalaSource = function(editor) {
  const buffer = editor.getBuffer()
  const fname = buffer.getUri()
  if (fname) {
    let needle
    return (needle = path.extname(fname)), ['.scala'].includes(needle)
  } else {
    return false
  }
}

const isJavaSource = function(editor) {
  const buffer = editor.getBuffer()
  const fname = buffer.getUri()
  if (fname) {
    let needle
    return (needle = path.extname(fname)), ['.java'].includes(needle)
  } else {
    return false
  }
}

// pixel position from mouse event
const pixelPositionFromMouseEvent = function(editor, event) {
  const { clientX, clientY } = event
  const elem = atom.views.getView(editor)
  const linesClientRect = elem
    .querySelectorAll('.lines')[0]
    .getBoundingClientRect()
  const top = clientY - linesClientRect.top
  const left = clientX - linesClientRect.left
  return { top, left }
}

// screen position from mouse event
const screenPositionFromMouseEvent = (editor, event) =>
  atom.views.getView(editor).component.screenPositionForMouseEvent(event)
// This was broken:
// editor.screenPositionForPixelPosition(pixelPositionFromMouseEvent(editor, event))

// from haskell-ide
const bufferPositionFromMouseEvent = (editor, event) =>
  editor.bufferPositionForScreenPosition(
    screenPositionFromMouseEvent(editor, event)
  )

const modalMsg = (title, msg) =>
  atom.confirm({
    message: title,
    detailedMessage: msg,
    buttons: {
      Ok() {}
    }
  })

const addModalPanel = function(vue, visible) {
  if (visible == null) {
    visible = false
  }
  const element = document.createElement('div')
  const modalPanel = atom.workspace.addModalPanel({
    item: element,
    visible
  })
  vue.$mount(element)
  return modalPanel
}

const withSbt = function(callback) {
  let sbtCmd = atom.config.get('Ensime.sbtExec')
  if (sbtCmd) {
    return callback(sbtCmd)
  } else {
    // TODO: try to check if on path, can we do this with fs?
    const dialog = remote.require('dialog')
    return dialog.showOpenDialog(
      {
        title: 'Sorry, but we need you to point out your SBT executive',
        properties: ['openFile']
      },
      function(filenames) {
        sbtCmd = filenames[0]
        atom.config.set('Ensime.sbtExec', sbtCmd)
        return callback(sbtCmd)
      }
    )
  }
}

// create classpath file name for ensime server startup
const mkClasspathFileName = (scalaVersion, ensimeServerVersion) =>
  path.join(packageDir(), `classpath_${scalaVersion}_${ensimeServerVersion}`)

var packageDir = () =>
  __guard__(atom.packages.getActivePackage('Ensime'), x => x.path) ||
  atom.packages.resolvePackagePath('Ensime')

const proxySettings = function() {
  const atomProxySettings = atom.config.get('Ensime.proxySettings')
  if (atomProxySettings.host) {
    const settings = {
      host: atomProxySettings.host,
      port: atomProxySettings.port
    }
    if (atomProxySettings.user) {
      settings.user = atomProxySettings.user
    }
    if (atomProxySettings.password) {
      settings.password = atomProxySettings.password
    }
    return settings
  }
}

function __guard__(value, transform) {
  return typeof value !== 'undefined' && value !== null
    ? transform(value)
    : undefined
}

export default {
  isScalaSource,
  isJavaSource,
  pixelPositionFromMouseEvent,
  screenPositionFromMouseEvent,
  bufferPositionFromMouseEvent,
  log: log.trace,
  modalMsg,
  withSbt,
  addModalPanel,
  packageDir,
  mkClasspathFileName,
  getTempDir,
  proxySettings
}

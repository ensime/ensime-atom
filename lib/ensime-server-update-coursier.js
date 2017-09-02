'use babel'

import path from 'path'
import loglevel from 'loglevel'
import { packageDir, proxySettings } from './utils'
import EnsimeServerUpdateLogView from './views/ensime-server-update-log-view'

const log = loglevel.getLogger('ensime.server-update')

const getPidLogger = function() {
  const serverUpdateLog = new EnsimeServerUpdateLogView()
  const pane = atom.workspace.getActivePane()
  pane.addItem(serverUpdateLog)
  pane.activateItem(serverUpdateLog)
  return s => serverUpdateLog.addRow(s)
}

const failure = function(msg, code) {
  log.error(msg, code)
  return atom.notifications.addError(msg, {
    dismissable: true,
    detail: `Exit code: ${code}`
  })
}

const tempdir = path.join(packageDir(), 'ensime_update_coursier')

// updateServer(tempdir: string, getPidLogger: () => (string) => void, failure: (string, int) => void)

export default require('ensime-client').ensimeServerUpdate(
  tempdir,
  failure,
  getPidLogger,
  proxySettings()
)

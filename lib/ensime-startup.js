'use babel'

// Download and startup of ensime server
import fs from 'fs'

import Promise from 'bluebird'
import {
  startServerFromDotEnsimeCP,
  startServerFromAssemblyJar,
  clientStarterFromServerStarter
} from 'ensime-client'

// Start ensime server. If classpath file is out of date, make an update first
// (project: DotEnsime): Promise<ChildProcess>
const startEnsimeServer = function(parsedDotEnsime) {
  if (!fs.existsSync(parsedDotEnsime.cacheDir)) {
    fs.mkdirSync(parsedDotEnsime.cacheDir)
  }

  const ensimeServerFlags = atom.config.get('Ensime.ensimeServerFlags')
  const ensimeServerVersion = atom.config.get('Ensime.ensimeServerVersion')

  atom.notifications.addInfo('Starting Ensime server…')

  const assemblyJar = atom.config.get('Ensime.assemblyJar')
  if (assemblyJar && fs.existsSync(assemblyJar)) {
    return Promise.resolve(
      startServerFromAssemblyJar(
        assemblyJar,
        parsedDotEnsime,
        ensimeServerVersion,
        ensimeServerFlags
      )
    )
  } else {
    return startServerFromDotEnsimeCP(parsedDotEnsime, ensimeServerFlags)
  }
}

export default {
  startClient: clientStarterFromServerStarter(startEnsimeServer)
}

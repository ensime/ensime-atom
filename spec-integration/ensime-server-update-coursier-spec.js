const fs = require('fs')
const path = require('path')
const temp = require('temp')
const loglevel = require('loglevel')

loglevel.setDefaultLevel('trace')
loglevel.setLevel('trace')

describe('ensime-server-update', function () {
  beforeEach(function () {})

  it('should be able to download coursier', function () {
    // Java is installed installed on appveyor build servers C:\Program Files\Java\jdk1.8.0
    // http://www.appveyor.com/docs/installed-software#java
    const tempDir = temp.mkdirSync('ensime-integration-test')

    const dotEnsime = {
      name: 'test',
      scalaVersion: '2.11.7',
      scalaEdition: '2.11',
      rootDir: tempDir,
      cacheDir: tempDir + path.sep + '.ensime_cache',
      dotEnsimePath: tempDir + path.sep + '.ensime'
    }

    const spy = jasmine.createSpy('classpathfile-callback')

    const updateEnsimeServer = require('../lib/ensime-server-update-coursier')
    updateEnsimeServer(dotEnsime, '0.9.10-SNAPSHOT', tempDir + path.sep + 'classpathfile', spy)

    waitsFor(() => spy.callCount > 0, "callback wasn't called in time", 60000)
    return runs(function () {})
  })
  //      expect(spy.mostRecentCall.args).toEqual exp
  //      expect(spy).toHaveBeenCalledWith(null, ['example.coffee'])

  return afterEach(function () {})
})

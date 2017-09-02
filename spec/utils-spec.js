const utils = require('../lib/utils')
const log = require('loglevel')
log.setDefaultLevel('trace')

describe('utils', () =>
  describe('packageDir', () =>
    it('should be defined', function () {
      const packageDir = utils.packageDir()
      log.trace(`packageDir: ${packageDir}`)
      return expect(packageDir).toBeDefined()
    })
  )
)

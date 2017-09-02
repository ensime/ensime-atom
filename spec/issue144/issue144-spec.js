const fs = require('fs')
const path = require('path')
const {getTempDir} = require('../../lib/utils')

describe('mkdirSync should really be sync?', function () {
  const tempdir = getTempDir() + path.sep

  return it('should not blow with ENOENT: no such file or directory', function () {
    if (!fs.existsSync(tempdir)) {
      fs.mkdirSync(tempdir)
    }

    const inner = tempdir + path.sep + 'inner'
    if (!fs.existsSync(inner)) {
      fs.mkdirSync(inner)
    }

    fs.writeFileSync(tempdir + path.sep + 'foo', 'foo content')
    return fs.writeFileSync(tempdir + path.sep + 'inner' + path.sep + 'bar', 'bar content')
  })
})

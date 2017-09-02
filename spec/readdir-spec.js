const recread = require('recursive-readdir')
const process = require('process')
const path = require('path')

describe('read-dir depdendency should work', function () {
  const modulePath = path.dirname(module.filename)
  const root = __dirname + path.sep + 'testdata'

  return it('should work with another non-buggy version?', function () {
    const dotEnsimesFilter = (path, stats) => stats.isFile() && !path.endsWith('.ensime')

    return recread(root, [], function (err, files) {}
    )
  })
})

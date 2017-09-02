'use babel'

import fs from 'fs'
import * as JsDiff from 'diff'
import loglevel from 'loglevel'
import Promise from 'bluebird'
import _ from 'lodash'

const log = loglevel.getLogger('ensime.refactorings')

// Refactorings should be cleaned of Atom stuff and put in client module. Add callback for what to do with patches
export default class Refactorings {
  constructor() {
    this.ensimeRefactorId = 1
  }

  getRefactorPatch(client, refactoring, interactive, callback) {
    return client
      .getRefactoringPatch(this.ensimeRefactorId++, refactoring)
      .then(callback)
  }

  getAddImportPatch(client, qualifiedName, file, callback) {
    return this.getRefactorPatch(
      client,
      {
        typehint: 'AddImportRefactorDesc',
        qualifiedName,
        file
      },
      false,
      callback
    )
  }

  getOrganizeImportsPatch(client, file, callback) {
    return this.getRefactorPatch(
      client,
      {
        typehint: 'OrganiseImportsRefactorDesc',
        file
      },
      false,
      callback
    )
  }

  // Applies unified paths to editors using files. Not used anymore.
  applyPatch(client, patchPath, callback) {
    if (callback == null) {
      callback = function() {}
    }
    return fs.readFile(patchPath, 'utf8', function(err, unifiedDiff) {
      const options = {
        loadFile(index, callback) {
          // TODO: Should we always read the "before"-file from disk? ensime could have index of unsaved edits right?
          if (index.oldFileName) {
            return fs.readFile(index.oldFileName, 'utf8', callback)
          } else {
            return callback('no edits')
          }
        },

        patched(index, content) {
          return atom.workspace
            .open(index.newFileName)
            .then(editor => editor.setText(content))
        },

        complete(err) {
          if (!err) {
            return callback()
          } else {
            return log.trace(err)
          }
        }
      }
      return JsDiff.applyPatches(unifiedDiff, options)
    })
  }

  applyPatchFromFile(patchPath) {
    return Promise.promisify(fs.readFile)(
      patchPath,
      'utf8'
    ).then(unifiedDiff => {
      return this.applyPatchFromFileContent(unifiedDiff)
    })
  }

  applyPatchFromFileContent(unifiedDiff) {
    if (unifiedDiff.length > 0) {
      return this.applyPatchesInEditors(unifiedDiff)
    } else {
      return Promise.resolve()
    }
  }

  // Very atom specific. move out
  applyPatchesInEditors(unifiedDiff) {
    const patches = JsDiff.parsePatch(unifiedDiff)
    const promises = patches.map(function(patch) {
      log.trace(patch)
      if (patch.oldFileName === patch.newFileName) {
        return atom.workspace.open(patch.newFileName).then(function(editor) {
          const b = editor.getBuffer()
          const actions = patch.hunks.map(function(hunk) {
            const zeroBasedStart = hunk.newStart - 1
            const range = [
              [zeroBasedStart, 0],
              [zeroBasedStart + hunk.oldLines, 0]
            ]
            const newLines = _.filter(hunk.lines, l => !l.startsWith('-'))
            log.trace(['newLines: ', newLines])
            const nonEmpty = _.map(newLines, l => l.substring(1, l.length))
            const toInsert = _.join(_.map(nonEmpty, l => l + '\n'), '')
            return { range, toInsert }
          })

          log.trace(['diff actions: ', actions])
          return (() => {
            const result = []
            for (let { range, toInsert } of Array.from(actions)) {
              result.push(b.setTextInRange(range, toInsert))
            }
            return result
          })()
        })
      } else {
        return Promise.reject('Sorry, no file renames yet :(')
      }
    })
    return Promise.all(promises)
  }

  maybeApplyPatch(result) {
    if (result.typehint === 'RefactorDiffEffect') {
      return this.applyPatchFromFile(result.diff)
    } else {
      return log.trace(res)
    }
  }

  organizeImports(client, file, callback) {
    if (callback == null) {
      callback = function() {}
    }
    return this.getOrganizeImportsPatch(client, file, res => {
      return this.maybeApplyPatch(res)
    })
  }

  doImport(client, name, file, buffer, callback) {
    if (callback == null) {
      callback = function() {}
    }
    return this.getAddImportPatch(client, name, file, importResponse => {
      return this.maybeApplyPatch(importResponse, () =>
        client
          .typecheckBuffer(buffer.getPath(), buffer.getText())
          .then(callback)
      )
    })
  }
}

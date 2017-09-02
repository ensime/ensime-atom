'use babel'

const temp = require('temp')
const JsDiff = require('diff')
const log = require('loglevel')

import Refactorings from '../../lib/features/refactorings'
const refactorings = new Refactorings()

const testDiffApplication = function (fileName, before, diff, expected) {
  waitsForPromise(() =>
    atom.workspace.open(fileName).then(editor => editor.setText(before))
  )

  waitsForPromise(() => refactorings.applyPatchFromFileContent(diff))

  return waitsForPromise(() =>
    atom.workspace.open(fileName).then(function (editor) {
      const result = editor.getText()
      return expect(result).toEqual(expected)
    })
  )
}

describe('applyPatchesInEditors', function () {
  beforeEach(() => temp.track())

  it('should not fail https://github.com/ensime/ensime-atom/issues/214', function () {
    const fileName = temp.path({suffix: '.scala'})

    const fileContents = `\
import scala.collection.immutable.HashMap
import scala.concurrent.Future
import scala.util.Try

import scala.concurrent.ExecutionContext.Implicits.global

object foo {
val x = new HashMap()
val y = Try(1)
val f = Future.successful(2)
}\
`

    const diff = `\
--- ${fileName}	2016-03-21 02:50:51 +0100
+++ ${fileName}	2016-03-21 02:50:51 +0100
@@ -1,2 +1,3 @@
 import scala.collection.immutable.HashMap
+import scala.concurrent.ExecutionContext.Implicits.global
 import scala.concurrent.Future
@@ -4,4 +5,2 @@

-import scala.concurrent.ExecutionContext.Implicits.global
-
 object foo {\
`

    const expectedResult = `\
import scala.collection.immutable.HashMap
import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future
import scala.util.Try

object foo {
val x = new HashMap()
val y = Try(1)
val f = Future.successful(2)
}\
`

    return testDiffApplication(fileName, fileContents, diff, expectedResult)
  })

  it('should not fail like https://github.com/ensime/ensime-atom/pull/217#issuecomment-199369339', function () {
    const fileName = temp.path({suffix: '.scala'})

    const fileContents = `\
import scala.util.Try

import scala.concurrent.ExecutionContext.Implicits.global

object foo {
}\
`

    const diff = `\
--- ${fileName}	2016-03-21 08:23:12 +0100
+++ ${fileName}	2016-03-21 08:23:12 +0100
@@ -1,5 +1,5 @@
-import scala.util.Try
-
 import scala.concurrent.ExecutionContext.Implicits.global

+
+
 object foo {\
`
    const expectedResult = `\
import scala.concurrent.ExecutionContext.Implicits.global



object foo {
}\
`

    return testDiffApplication(fileName, fileContents, diff, expectedResult)
  })

  describe('empty diffs', function () {
    beforeEach(function () {
      spyOn(atom.workspace, 'open').andCallThrough()

      const fileName = temp.path({suffix: '.scala'})
      const fileContents = ''
      const diff = ''
      const expectedResult = ''

      return testDiffApplication(fileName, fileContents, diff, expectedResult)
    })

    return it('should not call open with undefined', function () {
      log.trace('expecting!')
      return expect(atom.workspace.open).not.toHaveBeenCalledWith(undefined)
    })
  })

  return afterEach(() => temp.cleanupSync())
})

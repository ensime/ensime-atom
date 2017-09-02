'use babel'

import SubAtom from 'sub-atom'
import loglevel from 'loglevel'

const log = loglevel.getLogger('ensime.autocomplete-plus-provider')

export default function(clientLookup) {
  const disposables = new SubAtom()
  let noOfAutocompleteSuggestions

  disposables.add(
    atom.config.observe('Ensime.noOfAutocompleteSuggestions', value => {
      noOfAutocompleteSuggestions = value
    })
  )

  return {
    dispose() {
      return disposables.dispose()
    },
    getCompletions(textBuffer, bufferPosition, callback) {
      const { formatCompletionsSignature } = require('../atom-formatting')
      const file = textBuffer.getPath()
      const offset = textBuffer.characterIndexForPosition(bufferPosition)
      return __guard__(clientLookup(textBuffer), x =>
        x
          .getCompletions(
            file,
            textBuffer.getText(),
            offset,
            noOfAutocompleteSuggestions
          )
          .then(function(result) {
            let c
            const { completions } = result

            if (completions) {
              const translate = function(c) {
                const { typeSig } = c
                if (c.isCallable) {
                  const formattedSignature = formatCompletionsSignature(
                    typeSig.sections
                  )
                  return {
                    leftLabel: c.typeSig.result,
                    snippet: `${c.name}${formattedSignature}`,
                    fullyQualified: c.typeSig.result
                  }
                } else {
                  return {
                    snippet: c.name
                  }
                }
              }

              const autocompletions = (() => {
                const result1 = []
                for (c of Array.from(completions)) {
                  result1.push(translate(c))
                }
                return result1
              })()
              return callback(autocompletions)
            }
          })
      )
    },

    onDidInsertSuggestion({ editor, suggestion, triggerPosition }) {
      return log.trace(['inserted suggestion', suggestion])
    }
  }
}

function __guard__(value, transform) {
  return typeof value !== 'undefined' && value !== null
    ? transform(value)
    : undefined
}

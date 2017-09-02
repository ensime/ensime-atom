'use babel'

import {
  formatTypeAsHtml,
  formatTypeAsString,
  formatCompletionsSignature
} from '../lib/atom-formatting'

describe('rich atom specific type hover formatter', () =>
  it('should format |@| correctly', function () {
    const typeStr = `\
{
  "typehint": "ArrowTypeInfo",
  "name": "[B](fb: F[B])scalaz.syntax.ApplicativeBuilder[F,A,B]",
  "resultType": {
    "name": "<refinement>",
    "fullName": "scalaz.syntax.ApplyOps$<refinement>",
    "typehint": "BasicTypeInfo",
    "typeArgs": [],
    "members": [],
    "declAs": {
      "typehint": "Class"
    }
  },
  "paramSections": [
    {
      "params": [
        [
          "fb",
          {
            "name": "F",
            "fullName": "scalaz.syntax.F",
            "typehint": "BasicTypeInfo",
            "typeArgs": [
              {
                "name": "B",
                "fullName": "scalaz.syntax.B",
                "typehint": "BasicTypeInfo",
                "typeArgs": [],
                "members": [],
                "declAs": {
                  "typehint": "Nil"
                }
              }
            ],
            "members": [],
            "declAs": {
              "typehint": "Nil"
            }
          }
        ]
      ],
      "isImplicit": false
    }
  ]
}\
`
    return JSON.parse(typeStr)
  })
)

describe('type-hover', function () {
  const thing = {
    'name': 'LanguageFeatureImport.Thing[LanguageFeatureImport.Thing.T]',
    'localName': 'Thing',
    'typehint': 'SymbolInfo',
    'declPos': {
      'typehint': 'OffsetSourcePosition',
      'file': '/Users/viktor/dev/projects/ensime-test-project/src/main/scala/LanguageFeatureImport.scala',
      'offset': 49
    },
    'type': {
      'name': 'Thing[T]',
      'fullName': 'LanguageFeatureImport.Thing[LanguageFeatureImport.Thing.T]',
      'pos': {
        'typehint': 'OffsetSourcePosition',
        'file': '/Users/viktor/dev/projects/ensime-test-project/src/main/scala/LanguageFeatureImport.scala',
        'offset': 49
      },
      'typehint': 'BasicTypeInfo',
      'typeArgs': [
        {
          'name': 'T',
          'fullName': 'LanguageFeatureImport.Thing.T',
          'typehint': 'BasicTypeInfo',
          'typeArgs': [],
          'members': [],
          'declAs': {
            'typehint': 'Nil'
          }
        }
      ],
      'members': [],
      'declAs': {
        'typehint': 'Class'
      }
    },
    'isCallable': false
  }
  it('should format type variables correctly in simple strings', function () {
    const string = formatTypeAsString(thing.type)
    return expect(string).toBe('Thing[T]')
  })

  return it('should format type variables correctly in rich html', function () {
    const html = formatTypeAsHtml(thing.type)
    const expected = '<a data-qualified-name="LanguageFeatureImport.Thing" title="LanguageFeatureImport.Thing">Thing</a>[<a data-qualified-name="LanguageFeatureImport.Thing.T" title="LanguageFeatureImport.Thing.T">T</a>]'
    return expect(html).toBe(expected)
  })
})

describe('formatCompletionsSignature', function () {
  it('should format x, y -> z', function () {
    const inputParams = [[['x', 'Int'], ['y', 'Int']]]
    const result = formatCompletionsSignature(inputParams)

    return expect(result).toBe('(${1:x: Int}, ${2:y: Int})')
  })

  it('should format foo(asdf: Int, y: Int)', function () {
    const inputString =
        `\
{"name":"foo","typeId":2801,"typeSig":{"sections":[[["asdf","Int"],["y","Int"]]],"result":"Int"},"relevance":90,"isCallable":true}\
`
    const json = JSON.parse(inputString)
    const result = formatCompletionsSignature(json.typeSig.sections)
    return expect(result).toBe('(${1:asdf: Int}, ${2:y: Int})')
  })

  return it('should format curried', function () {
    const sections =
       [
         [
           [
             'x',
             'Int'
           ]
         ],
         [
           [
             'y',
             'Int'
           ]
         ]
       ]

    const result = formatCompletionsSignature(sections)
    return expect(result).toBe('(${1:x: Int})(${2:y: Int})')
  })
})

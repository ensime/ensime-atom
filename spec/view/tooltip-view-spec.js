'use babel';

import TypeHoverElement from '../../lib/views/type-hover-element'

describe('when we add a tooltip view', function () {
  let [typeHoverElement] = Array.from([])

  beforeEach(function () {
    typeHoverElement = new TypeHoverElement()
    return jasmine.attachToDOM(typeHoverElement)
  })

  return it('should be in DOM', () => typeHoverElement.initialize('foo'))
})

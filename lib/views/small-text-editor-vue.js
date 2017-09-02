'use babel'

import Vue from 'vue'

export default Vue.extend({
  template:
    '<atom-text-editor class="editor mini" tabindex="-1" mini="" data-grammar="text plain null-grammar" data-encoding="utf8"></atom-text-editor>',
  methods: {
    getTextEditor() {
      return this.$el.getModel()
    }
  },
  ready() {
    // two ways-bind to the Atom texteditor stuff
    this.$el
      .getModel()
      .getBuffer()
      .onDidChange(() => {
        return (this.text = this.$el
          .getModel()
          .getBuffer()
          .getText())
      })

    return (this.watcher = this.$watch('text', function(text) {
      return this.$el
        .getModel()
        .getBuffer()
        .setText(this.text)
    }))
  },

  props: ['text']
})

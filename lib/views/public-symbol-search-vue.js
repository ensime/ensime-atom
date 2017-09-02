'use babel'

import Vue from 'vue'
import TextEditorVue from './small-text-editor-vue'

// TODO: Remove fuzz-finder style and copy to ensime namespace

export default Vue.extend({
  // https://github.com/atom/atom/blob/master/src/text-editor-component.coffee
  template: `\
<div class="select-list fuzzy-finder">
  <small-text-editor v-ref:editor :text.sync="searchText"></small-text-editor>
  <ol class="list-group">
    <li class="two-lines" v-for="symbol in results" v-bind:class="{'selected': $index==selected}">
      <div class="primary-line file icon icon-file-text">{{symbol.localName}}</div>
      <div class="secondary-line path no-icon">{{symbol.name}}</div>
    </li>
  </ol>
</div>\
`,

  data() {
    return {
      results: [],
      selected: 0,
      searchText: ''
    }
  },

  components: {
    'small-text-editor': TextEditorVue
  },

  methods: {
    onSearchTextUpdated(callback) {
      return (this.watcher = this.$watch('searchText', callback))
    },
    // TODO: kill of watcher when unmounted?

    focusSearchField() {
      this.searchText = '' // reset text on every new focus
      return this.$refs.editor.$el.focus()
    },

    getSelected() {
      return this.results[this.selected]
    }
  }
})

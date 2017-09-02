'use babel'

import Vue from 'vue'
import { addModalPanel } from '../utils'

// TODO: Look at https://github.com/js-padavan/atom-enhanced-tabs/blob/master/lib/SimpleListView.coffee

export default class SelectDotEnsimeView {
  constructor(files, onSelect, onCancel) {
    if (onCancel == null) {
      onCancel = function() {}
    }
    const vue = new Vue({
      template: `\
<div tabindex="0" id="select-file" class="select-list fuzzy-finder">
  <div>Please choose a .ensime file</div>
  <ol class="list-group">
    <li v-for="file in files" v-bind:class="{'selected': $index==selected}">
      <div class="primary-line file icon icon-file-text">{{file.path}}</div>
    </li>
  </ol>
</div>\
`,
      data() {
        return {
          selected: 0,
          files
        }
      },

      attached() {
        const done = () => {
          this.commands.dispose()
          return this.$emit('done')
        }

        this.commands = atom.commands.add(this.$el, {
          'core:move-up': event => {
            if (this.selected > 0) {
              this.selected -= 1
            }
            return event.stopPropagation()
          },
          'core:move-down': event => {
            if (this.selected < files.length - 1) {
              this.selected += 1
            }
            return event.stopPropagation()
          },
          'core:confirm': event => {
            const selected = files[this.selected]
            onSelect(selected)
            done()
            return event.stopPropagation()
          },
          'core:cancel'(event) {
            onCancel()
            done()
            return event.stopPropagation()
          }
        })

        return this.$on('focusout', () => done())
      }
    })

    this.container = addModalPanel(vue, true)
    vue.$on('done', () => {
      return this.container.destroy()
    })

    vue.$el.focus()
  }
}

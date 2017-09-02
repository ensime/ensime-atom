/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let Ensime;
const {CompositeDisposable} = require('atom');

// Just a cache slot, maybe not needed if require caches well anyways,
// but feels useful if we don't know when it's used first.
const c = function(resolve) {
  let x = undefined;
  return function() {
    if (x == null) { x = resolve(); }
    return x;
  };
};

const lodash = c(() => require('lodash'));
const ensimeClient = c(() => require('ensime-client'));
const ensimeStartup = c(() => require('./ensime-startup'));
const utils = c(() => require('./utils'));

const AutocompletePlusProvider = require('./features/autocomplete-plus');
const Refactorings = require('./features/refactorings');
const ShowTypes = require('./features/show-types');
const Implicits = require('./features/implicits');
const AutoTypecheck = require('./features/auto-typecheck');

const GoTo = c(() => require('./features/go-to'));
const documentation = c(() => require('./features/documentation'));

const dotEnsimeUtils = c(() => ensimeClient().dotEnsimeUtils);

let log = undefined;


const scalaSourceSelector = "atom-text-editor[data-grammar=\"source scala\"]";
const javaSourceSelector = "atom-text-editor[data-grammar=\"source java\"]";
module.exports = (Ensime = {

  config: require('./config'),

  addCommandsForStoppedState() {
    this.stoppedCommands = new CompositeDisposable;
    return this.stoppedCommands.add(atom.commands.add('atom-workspace', "ensime:start", () => this.selectAndBootAnEnsime()));
  },

  addCommandsForStartedState() {
    this.startedCommands = new CompositeDisposable;
    this.startedCommands.add(atom.commands.add('atom-workspace', "ensime:stop", () => this.selectAndStopAnEnsime()));
    this.startedCommands.add(atom.commands.add('atom-workspace', "ensime:start", () => this.selectAndBootAnEnsime()));


    this.startedCommands.add(atom.commands.add(scalaSourceSelector, "ensime:mark-implicits", () => this.markImplicits()));
    this.startedCommands.add(atom.commands.add(scalaSourceSelector, "ensime:unmark-implicits", () => this.unmarkImplicits()));
    this.startedCommands.add(atom.commands.add(scalaSourceSelector, "ensime:show-implicits", () => this.showImplicits()));
    this.startedCommands.add(atom.commands.add('atom-workspace', "ensime:typecheck-all", () => this.typecheckAll()));
    this.startedCommands.add(atom.commands.add('atom-workspace', "ensime:unload-all", () => this.unloadAll()));
    this.startedCommands.add(atom.commands.add(scalaSourceSelector, "ensime:typecheck-file", () => this.typecheckFile()));
    this.startedCommands.add(atom.commands.add(scalaSourceSelector, "ensime:typecheck-buffer", () => this.typecheckBuffer()));

    this.startedCommands.add(atom.commands.add(javaSourceSelector, "ensime:typecheck-file", () => this.typecheckFile()));
    this.startedCommands.add(atom.commands.add(javaSourceSelector, "ensime:typecheck-buffer", () => this.typecheckBuffer()));


    this.startedCommands.add(atom.commands.add(scalaSourceSelector, "ensime:go-to-definition", () => this.goToDefinitionOfCursor()));

    this.startedCommands.add(atom.commands.add(scalaSourceSelector, "ensime:go-to-doc", () => this.goToDocOfCursor()));
    this.startedCommands.add(atom.commands.add(javaSourceSelector, "ensime:go-to-doc", () => this.goToDocOfCursor()));
    this.startedCommands.add(atom.commands.add('atom-workspace', "ensime:browse-doc", () => this.goToDocIndex()));

    this.startedCommands.add(atom.commands.add(scalaSourceSelector, "ensime:format-source", () => this.formatCurrentSourceFile()));

    this.startedCommands.add(atom.commands.add('atom-workspace', "ensime:search-public-symbol", () => this.searchPublicSymbol()));
    return this.startedCommands.add(atom.commands.add('atom-workspace', "ensime:organize-imports", () => this.organizeImports()));
  },



  activate(state) {
    let clientLookup;
    this.subscriptions = new CompositeDisposable;
    
    const logLevel = atom.config.get('Ensime.logLevel');

    const logapi = require('loglevel');

    logapi.getLogger('ensime-client').setLevel(logLevel);
    logapi.getLogger('ensime.server-update').setLevel(logLevel);
    logapi.getLogger('ensime.startup').setLevel(logLevel);
    logapi.getLogger('ensime.autocomplete-plus-provider').setLevel(logLevel);
    logapi.getLogger('ensime.refactorings').setLevel(logLevel);
    log = logapi.getLogger('ensime.main');
    log.setLevel(logLevel);

    // Install deps if not there
    if(atom.config.get('Ensime.enableAutoInstallOfDependencies')) {
      (require('atom-package-deps')).install('Ensime').then(() => log.trace('Ensime dependencies installed, good to go!'));
    }


    // Feature controllers
    this.showTypesControllers = new WeakMap;
    this.implicitControllers = new WeakMap;
    this.autotypecheckControllers = new WeakMap;


    this.addCommandsForStoppedState();
    this.someInstanceStarted = false;

    this.controlSubscription = atom.workspace.observeTextEditors(editor => {
      if (utils().isScalaSource(editor) || utils().isJavaSource(editor)) {
        const instanceLookup = () => (this.instanceManager != null ? this.instanceManager.instanceOfFile(editor.getPath()) : undefined);
        clientLookup = () => __guard__(instanceLookup(), x => x.api);
        if (!this.showTypesControllers.get(editor)) { this.showTypesControllers.set(editor, new ShowTypes(editor, clientLookup)); }
        if (!this.implicitControllers.get(editor)) { this.implicitControllers.set(editor, new Implicits(editor, instanceLookup)); }
        if (!this.autotypecheckControllers.get(editor)) { this.autotypecheckControllers.set(editor, new AutoTypecheck(editor, clientLookup)); }

        return this.subscriptions.add(editor.onDidDestroy(() => {
          return this.deleteControllers(editor);
        })
        );
      }
    });

    clientLookup = editor => this.apiOfEditor(editor);
    this.autocompletePlusProvider = new AutocompletePlusProvider(clientLookup);
    this.refactorings = new Refactorings;

    return atom.workspace.onDidStopChangingActivePaneItem(pane => {
      if (atom.workspace.isTextEditor(pane)) {
        if (utils().isScalaSource(pane) || utils().isJavaSource(pane)) {
          log.trace(`this: ${this}`);
          log.trace(['@instanceManager: ', this.instanceManager]);
          const instance = this.instanceManager != null ? this.instanceManager.instanceOfFile(pane.getPath()) : undefined;
          return this.switchToInstance(instance);
        }
      }
    });
  },

  switchToInstance(instance) {
    log.trace(['changed from ', this.activeInstance, ' to ', instance]);
    if(instance !== this.activeInstance) {
      if (this.activeInstance != null) {
        this.activeInstance.ui.statusbarView.hide();
      }
      this.activeInstance = instance;
      if(instance) {
        return instance.ui.statusbarView.show();
      }
    }
  },


  deactivate() {
    if (this.instanceManager != null) {
      this.instanceManager.destroyAll();
    }

    this.subscriptions.dispose();
    this.controlSubscription.dispose();

    if (this.autocompletePlusProvider != null) {
      this.autocompletePlusProvider.dispose();
    }
    this.autocompletePlusProvider = null;
    
    return (this.publicSymbolSearch != null ? this.publicSymbolSearch.dispose() : undefined);
  },


  apiOfEditor(editor) {
    return __guard__(this.instanceOfEditor(editor), x => x.api);
  },

  instanceOfEditor(editor) {
    if(editor) {
      return (this.instanceManager != null ? this.instanceManager.instanceOfFile(editor.getPath()) : undefined);
    } else {
      return undefined;
    }
  },
      
      
  apiOfOfActiveTextEditor() {
    const activeTextEditor = atom.workspace.getActiveTextEditor();
    if (activeTextEditor) {
      return this.apiOfEditor(activeTextEditor);
    } else {
      return (this.instanceManager != null ? this.instanceManager.firstInstance() : undefined);
    }
  },

  // TODO: move out
  statusbarOutput(statusbarView, typechecking) { return function(msg) {
    const { typehint } = msg;

    if(typehint === 'AnalyzerReadyEvent') {
      return statusbarView.setText('Analyzer ready!');

    } else if(typehint === 'FullTypeCheckCompleteEvent') {
      return statusbarView.setText('Full typecheck finished!');

    } else if(typehint === 'IndexerReadyEvent') {
      return statusbarView.setText('Indexer ready!');

    } else if(typehint === 'CompilerRestartedEvent') {
      return statusbarView.setText('Compiler restarted!');

    } else if((typehint === 'ClearAllScalaNotesEvent') || (typehint === 'ClearAllJavaNotesEvent')) {
      return (typechecking != null ? typechecking.clearScalaNotes() : undefined);

    } else if((typehint === 'NewScalaNotesEvent') || (typehint === 'NewJavaNotesEvent')) {
      return (typechecking != null ? typechecking.addScalaNotes(msg) : undefined);

    } else if(typehint.startsWith('SendBackgroundMessageEvent')) {
      return statusbarView.setText(msg.detail);
    }
  }; },



  startInstance(dotEnsimePath) {
    const ImplicitInfo = require('./model/implicit-info');
    const ImplicitInfoView = require('./views/implicit-info-view');

    // Register model-view mappings
    this.subscriptions.add(atom.views.addViewProvider(ImplicitInfo, function(implicitInfo) {
      const result = new ImplicitInfoView().initialize(implicitInfo);
      return result;
    })
    );


    // remove start command and add others
    this.stoppedCommands.dispose();

    // FIXME: - we have had double commands for each instance :) This is a quick and dirty fix
    if(!this.someInstanceStarted) {
      this.addCommandsForStartedState();
      this.someInstanceStarted = true;
    }

    return dotEnsimeUtils().parseDotEnsime(dotEnsimePath).then(dotEnsime => {

      let typechecking = undefined;
      if(this.registerIndie) {
        const TypeCheckingFeature = require('./features/typechecking');
        typechecking = TypeCheckingFeature(this.registerIndie({name: `Ensime: ${dotEnsimePath}`}));
      }

      const StatusbarView = require('./views/statusbar-view');
      const statusbarView = new StatusbarView();
      statusbarView.init();

      const ensimeServerVersion = atom.config.get('Ensime.ensimeServerVersion');

      return ensimeStartup().startClient(dotEnsime, ensimeServerVersion, this.statusbarOutput(statusbarView, typechecking)).then(connection => {
        atom.notifications.addSuccess("Ensime connected!");

        // atom specific ui state of an instance
        const ui = {
          statusbarView,
          typechecking,
          destroy() {
            log.debug("destroy on instance ui");
            statusbarView.destroy();
            return (typechecking != null ? typechecking.destroy() : undefined);
          }
        };

        const instance = ensimeClient().makeInstanceFromRef(dotEnsime, connection, ui);

        if (this.instanceManager == null) { this.instanceManager = new (ensimeClient().InstanceManager); }
        this.instanceManager.registerInstance(instance);
        if (!this.activeInstance) {
          this.activeInstance = instance;
        }

        connection.post({"typehint":"ConnectionInfoReq"}, function(msg) {} );

        return this.switchToInstance(instance);
      });
    });
  },




  deleteControllers(editor) {
    const deactivateAndDelete = function(map) {
      __guard__(map.get(editor), x => x.deactivate()); // _ref.deactivate is not a function
      return map.delete(editor);
    };

    deactivateAndDelete(this.showTypesControllers);
    deactivateAndDelete(this.implicitControllers);
    return deactivateAndDelete(this.autotypecheckControllers);
  },


  deleteAllEditorsControllers() {
    return Array.from(atom.workspace.getTextEditors()).map((editor) =>
      this.deleteControllers(editor));
  },

  // Shows dialog to select a .ensime under this project paths and calls callback with parsed
  selectDotEnsime(callback, filter) {
    if (filter == null) { filter = () => true; }
    const dirs = atom.project.getPaths();
    const _ = lodash();
    return dotEnsimeUtils().allDotEnsimesInPaths(dirs).then(function(dotEnsimes) {
      const filteredDotEnsime = _.filter(dotEnsimes, filter);


      if(filteredDotEnsime.length === 0) {
        return utils().modalMsg("No .ensime file found. Please generate with `sbt ensimeConfig` or similar");
      } else if (filteredDotEnsime.length === 1) {
        return callback(filteredDotEnsime[0]);
      } else {
        const SelectDotEnsimeView = require('./views/select-dot-ensime-view');
        return new SelectDotEnsimeView(filteredDotEnsime, function(selectedDotEnsime) {
          return callback(selectedDotEnsime);
        });
      }
    });
  },

  selectAndBootAnEnsime() {
    return this.selectDotEnsime(
      selectedDotEnsime => this.startInstance(selectedDotEnsime.path),
      dotEnsime => !(this.instanceManager != null ? this.instanceManager.isStarted(dotEnsime.path) : undefined)
    );
  },

  selectAndStopAnEnsime() {
    const stopDotEnsime = selectedDotEnsime => {
      log.debug('stopping ensime');
      return dotEnsimeUtils().parseDotEnsime(selectedDotEnsime.path).then(dotEnsime => {
        if (this.instanceManager != null) {
          this.instanceManager.stopInstance(dotEnsime);
        }
        return this.switchToInstance(undefined);
      });
    };

    return this.selectDotEnsime(stopDotEnsime, dotEnsime => (this.instanceManager != null ? this.instanceManager.isStarted(dotEnsime.path) : undefined));
  },

  typecheckAll() {
    return __guard__(this.apiOfOfActiveTextEditor(), x => x.typecheckAll());
  },

  unloadAll() {
    return __guard__(this.apiOfOfActiveTextEditor(), x => x.unloadAll());
  },

  // typechecks currently open file
  typecheckBuffer() {
    const b = __guard__(atom.workspace.getActiveTextEditor(), x => x.getBuffer());
    return __guard__(this.apiOfEditor(b), x1 => x1.typecheckBuffer(b.getPath(), b.getText()));
  },

  typecheckFile() {
    const b = __guard__(atom.workspace.getActiveTextEditor(), x => x.getBuffer());
    return __guard__(this.apiOfEditor(b), x1 => x1.typecheckFile(b.getPath()));
  },

  goToDocOfCursor() {
    const editor = atom.workspace.getActiveTextEditor();
    return documentation().goToDocAtPoint(this.instanceOfEditor(editor), editor);
  },

  goToDocIndex() {
    const editor = atom.workspace.getActiveTextEditor();
    return documentation().goToDocIndex(this.instanceOfEditor(editor));
  },

  goToDefinitionOfCursor() {
    const editor = atom.workspace.getActiveTextEditor();
    const textBuffer = editor.getBuffer();
    const pos = editor.getCursorBufferPosition();
    return GoTo().goToTypeAtPoint(this.apiOfEditor(editor), textBuffer, pos);
  },

  markImplicits() {
    const editor = atom.workspace.getActiveTextEditor();
    return __guard__(this.implicitControllers.get(editor), x => x.showImplicits());
  },

  unmarkImplicits() {
    const editor = atom.workspace.getActiveTextEditor();
    return __guard__(this.implicitControllers.get(editor), x => x.clearMarkers());
  },

  showImplicits() {
    const editor = atom.workspace.getActiveTextEditor();
    return __guard__(this.implicitControllers.get(editor), x => x.showImplicitsAtCursor());
  },


  provideAutocomplete() {
    log.trace('provideAutocomplete called');

    const getProvider = () => {
      return this.autocompletePlusProvider;
    };

    return {
      selector: '.source.scala, .source.java',
      disableForSelector: '.source.scala .comment',
      inclusionPriority: 10,
      excludeLowerPriority: true,

      getSuggestions({editor, bufferPosition, scopeDescriptor, prefix}) {
        const provider = getProvider();
        
        if (provider && !"[](){}_".includes(prefix)) {
          return new Promise(function(resolve) {
            log.trace('ensime.getSuggestions');
            return provider.getCompletions(editor.getBuffer(), bufferPosition, resolve);
          });
        } else {
          return [];
        }
      },

      onDidInsertSuggestion(x) {
        const provider = getProvider();
        return provider.onDidInsertSuggestion(x);
      }
    };
  },

  provideHyperclick() {
    return {
      providerName: 'ensime-atom',
      getSuggestionForWord: (textEditor, text, range) => {
        if (utils().isScalaSource(textEditor) || utils().isJavaSource(textEditor)) {
          const api = this.apiOfEditor(textEditor);
          return {
            range,
            callback() {
              if(api) {
                return GoTo().goToTypeAtPoint(api, textEditor.getBuffer(), range.start);
              } else {
                return atom.notifications.addError("Ensime not started! :(", {
                  detail: "There is no running ensime instance for this particular file. Please start ensime first!"
                  });
              }
            }
          };
        } else {
          return undefined;
        }
      }

    };
  },

  consumeIndie(registerIndie) {
    this.registerIndie = registerIndie;
  },

  provideIntentions() {
    const getIntentions = req => {
      const { textEditor } = req;
      const { bufferPosition } = req;
      const _ = lodash();
      return new Promise(resolve => {
        return __guard__(this.apiOfEditor(textEditor), x => x.getImportSuggestions(
          textEditor.getPath(),
          textEditor.getBuffer().characterIndexForPosition(bufferPosition),
          textEditor.getWordUnderCursor()).then(res => {
            const result = _.map(res.symLists[0], sym => {
              const onSelected = () => this.refactorings.doImport(this.apiOfEditor(textEditor), sym.name, textEditor.getPath(), textEditor.getBuffer());
              return {
                priority: 100,
                icon: 'bucket',
                class: 'custom-icon-class',
                title: `import ${sym.name}`,
                selected: onSelected
              };
            });
            return resolve(result);
        }));
      });
    };
          
    return {
      grammarScopes: ['source.scala'],
      getIntentions
    };
  },

  formatCurrentSourceFile() {
    const editor = atom.workspace.getActiveTextEditor();
    const cursorPos = editor.getCursorBufferPosition();
    return __guard__(this.apiOfEditor(editor), x => x.formatSourceFile(editor.getPath(), editor.getText()).then(function(msg) {
      editor.setText(msg.text);
      return editor.setCursorBufferPosition(cursorPos);
    }));
  },
      

  searchPublicSymbol() {
    if (!this.publicSymbolSearch) {
      const PublicSymbolSearch = require('./features/public-symbol-search');
      this.publicSymbolSearch = new PublicSymbolSearch();
    }
    return this.publicSymbolSearch.toggle(this.apiOfOfActiveTextEditor());
  },

  organizeImports() {
    const editor = atom.workspace.getActiveTextEditor();
    return this.refactorings.organizeImports(this.apiOfEditor(editor), editor.getPath());
  }
});

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}
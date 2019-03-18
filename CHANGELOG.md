# Change Log

## v0.4.0
- [plugin] added `tasks.onDidEndTask` Plug-in API
- [plugin] Introduce `vscode.previewHtml` command support
- [cpp] fixed `CPP_CLANGD_COMMAND` and `CPP_CLANGD_ARGS` environment variables
- [electron] open markdown links in the OS default browser
- [plugin] added ability to display webview panel in 'left', 'right' and 'bottom' area
- [plugin] added `tasks.taskExecutions` Plug-in API
- [plugin] the "Command" interface has been split into two: "CommandDescription" and "Command". "Command" has been
made compatible with the "Command" interface in vscode. This is not a breaking change, currently, but fields in those interfaces
have been deprecated and will be removed in the future.

Breaking changes:
- menus aligned with built-in VS Code menus [#4173](https://github.com/theia-ide/theia/pull/4173)
  - navigator context menu group changes:
    - `1_open` and `4_new` replaced by `navigation` group
    - `6_workspace` renamed to `2_workspace` group
    - `5_diff` renamed to `3_compare` group
    - `6_find` renamed to `4_search` group
    - `2_clipboard` renamed to `5_cutcopypaste` group
    - `3_move` and `7_actions` replaced by `navigation` group
  - editor context menu group changes:
    - `2_cut_copy_paste` renamed to `9_cutcopypaste` group
- [debug] align commands with VS Code [#4204](https://github.com/theia-ide/theia/issues/4204)
    - `debug.breakpoint.toggle` renamed to `editor.debug.action.toggleBreakpoint`
    - `debug.start` renamed to `workbench.action.debug.start`
    - `debug.thread.continue` renamed to `workbench.action.debug.continue`
    - `debug.start.noDebug` renamed to `workbench.action.debug.run`
    - `debug.thread.pause` renamed to `workbench.action.debug.pause`
    - `debug.thread.stepin` renamed to `workbench.action.debug.stepInto`
    - `debug.thread.stepout` renamed to `workbench.action.debug.stepOut`
    - `debug.thread.next` renamed to `workbench.action.debug.stepOver`
    - `debug.stop` renamed to `workbench.action.debug.stop`
    - `debug.editor.showHover` renamed to `editor.debug.action.showDebugHover`
- multi-root workspace support for preferences [#3247](https://github.com/theia-ide/theia/pull/3247)
  - `PreferenceProvider`
    - is changed from a regular class to an abstract class.
    - the `fireOnDidPreferencesChanged` function is deprecated. `emitPreferencesChangedEvent` function should be used instead. `fireOnDidPreferencesChanged` will be removed with the next major release.
  - `PreferenceServiceImpl`
    - `preferences` is deprecated. `getPreferences` function should be used instead. `preferences` will be removed with the next major release.
  - having `properties` property defined in the `PreferenceSchema` object is now mandatory.
  - `PreferenceProperty` is renamed to `PreferenceDataProperty`.
  - `PreferenceSchemaProvider`
    - the type of `combinedSchema` property is changed from `PreferenceSchema` to `PreferenceDataSchema`.
    - the return type of `getCombinedSchema` function is changed from `PreferenceSchema` to `PreferenceDataSchema`.
  - `affects` function is added to `PreferenceChangeEvent` and `PreferenceChange` interface.
- `navigator.exclude` preference is renamed to `files.exclude` [#4274](https://github.com/theia-ide/theia/pull/4274)


## v0.3.19
- [core] added `hostname` alias
- [core] added new `editor.formatOnSave` preference, to format documents on manual save
- [core] added support for setting end of line character
- [cpp] added new `cpp.clangdExecutable` and `cpp.clangdArgs` to customize language server start command
- [debug] added node debugger as a Plug-in
- [debug] added support for source breakpoints
- [git] added `discardAll` command
- [git] added `stageAll` command
- [git] added `unstageAll` command
- [git] added new `git pull` command, to pull from default configured remote
- [git] added new `git push` command, to push from default configured remote
- [git] added the ability to refresh git repositories when a change is detected within a workspace
- [java] allow the ability to rebing `JavaContribution`
- [languages] enabled INI syntax highlighting for `.properties` and `.toml` files
- [monaco] fixed cross editor navigation
- [monaco] fixed document-saving that took too long
- [monaco] improved `MonacoWorkspace.fireWillSave` peformance
- [plugin] added `globalState` and `workspaceState` Plug-in API
- [plugin] added `registerColorProvider` Plug-in API
- [plugin] added `registerRenameProvider` Plug-in API
- [plugin] added `tasks.onDidStartTask` Plug-in API
- [plugin] added basic support of snippets
- [plugin] added common service to handle `when` expressions
- [plugin] added debug Plug-in API
- [plugin] added support for terminal APIs on window
- [plugin] added the ability to debug VS Code extensions
- [plugin] added the ability to get operating system connected to Plug-in
- [plugin] added the ability to provide a way to initialize workspace folders when Theia is started
- [plugin] added the ability to set the visiblity of menu items through `when` expressions
- [plugin] added workspace symbols Plug-in API
- [plugin] fixed spreading of command arguments
- [preferences] added the ability to update settings schema resource on schema changes
- [search-in-workspace] fixed issue regarding child root in `search-in-workspace` when there is a multiple-root workspace
- [search-in-workspace] removed duplicates from `search-in-workspace` tree
- [security] update xterm.js to 3.9.2
- [task] added support to run tasks from mulitple-roots
- [task] fixed cwd path
- [workspace] added multiple-root support for `WorkspaceService.getWorkspaceRootUri()`


## v0.3.18
- [core] added a preference to define how to handle application exit
- [core] added a way to prevent application exit from extensions
- [core] added functionality to prevent application exit if some editors are dirty
- [core] allowed the ability to scope bindings per connection
- [core] fixed `@theia/core/lib/node/debug#DEBUG_MODE` flag to correctly detect when the runtime is inspected/debugged
- [cpp] fixed clangd being prematurely started when a build config is active
- [electron] implemented HTTP-based authentication for Git
- [electron] updated Electron to `^2.0.14`
- [electron] updated Git for Electron to fall back to embedded Git if no Git is found on the `PATH`
- [file-search] added ability to search files from multiple-root workspaces
- [file-search] improved handling when attempting to open non-existent files from the `quick-open-file`
- [filesystem] added the ability to convert URIs to platform specific paths
- [git] updated Git view to display short hash when on detached state
- [java-debug] added major enhancements to `java-debug`
- [keybinding] normalized key sequences to US layout
- [languages] Add a preference for every language contribution to be able to trace the communication client <-> server
- [languages] allowed the ability to provide Language Server start options
- [languages] fixed leaking language clients
- [languages][java] reuse `jdt.ls` workspace
- [monaco] fixed keybindings on OSX
- [plug-in] added Plug-in API for language server contributions
- [plug-in] added `storagePath` Plug-in API
- [plug-in] added `tasks.registerTaskProvider` Plug-in API
- [plug-in] added `window.withProgress` Plug-in API
- [plug-in] added ability to register keybindings from a Plug-in's `package.json`
- [plug-in] added open link command
- [plug-in] added support for context menus in contributed views
- [plug-in] implemented API to get workspace folder by a given file URI
- [plug-in][languages] added ability to register a document highlight provider
- [search-in-workspace] added ability to perform 'Find in Folder...' with multiple folders simultaneously
- [search-in-workspace] added match and file count to search-in-workspace
- [search-in-workspace] added support for multiple-root workspaces
- [search-in-workspace] fixed path issues by instead using URIs
- [terminal] added ability to choose terminal root location when a workspace contains multiple roots
- [workspace] fixed long label computations for multiple-root workspaces
- [xterm] updated Xterm to `3.9.1`


## v0.3.17
- Added better widget error handling for different use cases (ex: no workspace present, no repository present, ...)
- Addressed multiple backend memory leaks
- Prefixed quick-open commands for easier categorization and searching
- Refactored `Task` menu items into the new `Terminal` menu
- [core] added `theia.applicationName` to application `package.json` and improved window title
- [core] added graceful handling of init and reconnection errors
- [core] added the keybinding `ctrl+alt+a` and `ctrl+alt+d` to switch tabs left/right
- [core] added the menu item `Find Command...` to easily trigger quick-open commands
- [core] added toolbar support for tab-bars
- [core] updated the status-bar display when offline
- [cpp] updated the keybinding for `Switch Header/Source` from `Option+o` to `Option+Command+o` when on macOS
- [debug] added the ability to fork a debug adapter
- [debug] added the ability to trace the debug adapter communication
- [debug] implemented major frontend and backend debug improvements
- [electron] miscellaneous stability and usability improvements on Electron
- [getting-started] added `Getting Started Widget` - used to view common commands, recent workspaces, and helpful links
- [lsp] added new symbol types and increased existing workspace symbol resilience
- [lsp] registered 'Restart' commands for each language server started for miscellaneous purposes
- [markers] added the context menu item `Collapse All` for problem markers
- [mini-browser] miscellaneous mini-browser improvements
- [plug-in] added Plug-in API to communicate between Theia and plugins
- [plug-in] added `languages.registerCodeLensProvider` Plug-in API
- [plug-in] added `languages.registerDocumentSymbolProvider` Plug-in API
- [plug-in] added `window.showTextDocument` Plug-in API
- [plug-in] added ability to provide custom namespaces for the Plug-in API
- [plug-in] registered a type definition provider
- [plug-in] added `tasks.registerTaskProvider` Plug-in API
- [preview-editor] added the ability to open editors in preview mode
- [process] added the ability to create new node processes through forking
- [search-in-workspace] prompt users when performing `Replace All...` to limit accidental triggering
- [search-in-workspace] when selecting a file, the command `Find in Folder...` searches from the node's closest parent
- [terminal] added the menu item and command `Split Terminal`
- [workspace] added the ability to open multiple files simultaneously from the file navigator
- [workspace] added the context menu item `Collapse All` for the file navigator
- [workspace] include workspace path as part of the URL fragment


## v0.3.16
- [plug-in] added `DocumentLinkProvider` Plug-in API
- [plug-in] Terminal.sendText API adds a new line to the text being sent to the terminal if `addNewLine` parameter wasn't specified
- Reverted [cpp] Add debugging for C/C++ programs. This feature will come back in its own cpp-specific repo
- [core] Add methods to unregister menus, commands and keybindings
- [terminal] Add 'open in terminal' to navigator
- [markers] Added ability to remove markers
- [windows] Implemented drives selector for the file dialog
- [callhierarchy][typescript] adapt to hierarchical document symbols
- [output] Add button to clear output view
- [debug] decouple debug model from UI + clean up


## v0.3.15
- [plug-in] added `menus` contribution point
- [cpp] Add debugging for C/C++ programs
- View Keybindings Widget - used to view and search keybindings
- multi-root workspace support, vsCode compatibility
- Add TCL grammar file
- [debug] resolve variables in configurations
- Add debug toolbar
- Make Debug Session Views Act like Panels


## v0.3.13
- [cpp] Add a status bar button to select an active cpp build configuration
- Recently opened workspaces history
- [git/blame] convert to toggle command
- [cpp] Watch changes to compile_commands.json
- [ts] one ls for all js related languages
- [terminal] update to xterm.js 3.5.0
- Reimplemented further widgets with use of React JSX
- Do not store markers in browser local storage by default
- fix #2315: fine grain marker tree computation
- [tree] don't render collapsed nodes
- [textmate] added C/C++, Java, Python, CSS, html, less, markdown, shell, xml, yaml
- Misc components re-impplemented using react


## v0.3.12
- New Plugin system !
    - See [design](https://github.com/theia-ide/theia/issues/1482) and [documentation](https://github.com/theia-ide/theia/blob/master/packages/plugin/API.md) for more details.
- Introducing [Task API](https://github.com/theia-ide/theia/pull/2086).
    - Note, the format of tasks.json has been changed. For details, see the Task extension's [README.md](https://github.com/theia-ide/theia/blob/master/packages/task/README.md).
- `HTML` files now open in the editor by default.
- `Search In Folder...` new feature !
- `git commit` now alerts the user if no files are staged.
- `.md` files that are edited in `diff` mode now correctly open with the editor.
- Added an UI when developing plugins.
- Theia alerts you when the opening of a new tab is denied by the browser.
- Migrated widgets to `react`.
- The workspace root can no longer be deleted.
- Fixed `git` unstaging feature.
- Added quick option to toggle the autosave feature.
- Added the missing `Search` menu item !
- `File Download` feature !
- Textmate syntax coloring support ! (works on `.ts` files for now until more grammars are registered)
- A lot of fixes and improvements !

## v0.3.11
- Delete files on OSX with cmd+backspace.
- Changed the font in the editor.
- Logger's level can be set more finely.
- `jdt.ls` download on postinstall.
- Fixed the capital `R` key (<kbd>shift + r</kbd>) not working in the editor.
- It is now possible to toggle hidden files in the navigator.
- Search and replace widget !
- Search can work in hidden files.
- Fixed several memory leaks.
- Added `git sync` and `git publish` actions.
- General fixes and improvements.

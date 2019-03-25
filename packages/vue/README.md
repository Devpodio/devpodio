# Theia Vue Extension
Adds VueJs extension support to [Theia IDE](https://www.theia-ide.org/) using customized version of [@devpodio/vue-language-server](https://github.com/Devpodio/vue-language-server) based from [vetur](https://github.com/vuejs/vetur/tree/master/server)

## Requirements
- `v0.4.2` is compatible with Theia `@next` packages. eg. `@devpodio/core@next`

## Changes v0.4.2

Starting v0.4.2, `@devpodio/vue` now have all the features of [vetur](https://github.com/vuejs/vetur) which includes:
- Syntax-highlighting
- Snippet
- Emmet
- Linting / Error Checking
- Formatting
- Auto Completion
- Debugging

It also adds 20+ new preference options under `vetur` on your theia-ide preferences.

### Notes
Since Theia does not install built-in vscode extensions by default, the `vue-language-server` uses a default configuration.
To learn how to customize these defaults, check the instructions at [@devpodio/vue-language-server](https://github.com/Devpodio/vue-language-server)


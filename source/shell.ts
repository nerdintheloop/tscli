import { CREATE_SHELL_COMMANDS_COMMAND } from './commands.ts'
import type { Run } from './run.ts'
import { EOL, parse, platform, Shell } from './shared.ts'

export const createShellCommands = async (run: Run, shell: Shell = Shell.Default) => {
  const { cli, cliScriptPath, configuration, runtime } = run
  const cliAlias = configuration.alias || parse(parse(cliScriptPath).dir).name
  const commandNames = Object.keys(cli.commands).sort()
  const commandAliases = Object.entries(cli.commands).filter(([, { aliased }]) => aliased).map(([name]) => name).sort()
  const completionValues = [...commandNames, CREATE_SHELL_COMMANDS_COMMAND]
  const runtimeCommand: string = `${runtime}${configuration.runtimeFlags ? ` ${configuration.runtimeFlags.join(' ').replaceAll(`'`, `"`)}` : ''} ${cliScriptPath} _${cliAlias}`
  const lines: string[] = []

  if (platform === 'win32') {

  } else {
    lines.push(`alias ${cliAlias}='${runtimeCommand}'`)

    if (commandAliases.length > 0) lines.push(...commandAliases.map((alias) => `alias ${alias}='${cliAlias} _${alias} ${alias}'`))

    switch (shell) {
      case 'bash':
        lines.push(`complete -W '${completionValues}' ${cliAlias}`)
        break

      case 'zsh':
        lines.push(`compdef '_arguments "1:command:(${completionValues})"' ${cliAlias}`)
        break
    }
  }

  console.log(lines.join(EOL))
}

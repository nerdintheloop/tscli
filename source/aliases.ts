import { blue, bold, cyan, dim, italic } from './ansi.ts'
import { InternalCommand } from './commands.ts'
import { CLIVariable } from './definition.ts'
import { EOL, parse, platform, resolve, writeFile } from './external.ts'
import { getRuntime, type Run } from './run.ts'
import { collapseWhitespace } from './utilities.ts'

const SHELL_SCRIPT_NAME = 'aliases'

export const createShellAliasesScripts = async (run: Run) => {
  const { cliScriptPath, commands, variables } = run
  const aliasBlacklist = variables[CLIVariable.AliasBlacklist]
  const aliasWhitelist = variables[CLIVariable.AliasWhitelist]
  const cliAlias = parse(parse(cliScriptPath).dir).name
  const commandNames = Object.keys(commands).sort()
  const completionValues = [...commandNames, InternalCommand.CreateShellAliases]
  const runtimeFlags = variables[CLIVariable.RuntimeFlags]
  const runtime = getRuntime()
  const runtimeCommand: string = `${runtime}${runtimeFlags ? ` ${runtimeFlags.replaceAll(`'`, `"`)}` : ''} ${cliScriptPath} _${cliAlias}`
  let commandAliases = [...commandNames]

  if (aliasWhitelist) {
    const whitelistedAliases = collapseWhitespace(aliasWhitelist).split(' ')

    commandAliases = commandAliases.filter((alias) => whitelistedAliases.includes(alias))
  }

  if (aliasBlacklist) {
    const blacklistedAliases = collapseWhitespace(aliasBlacklist).split(' ')

    commandAliases = commandAliases.filter((alias) => !blacklistedAliases.includes(alias))
  }

  commandAliases = [...commandAliases.toSorted()]

  const aliasesMaxLength = Math.max(...[cliAlias, ...commandAliases].map(alias => alias.length))

  if (platform === 'win32') createWindowsShellAliasesScripts(run, aliasesMaxLength, completionValues, cliAlias, runtime, runtimeCommand, runtimeFlags, commandAliases)
  else createPosixShellAliasesScript(run, aliasesMaxLength, completionValues, cliAlias, runtime, runtimeCommand, runtimeFlags, commandAliases)
}

const createPosixShellAliasesScript = async (run: Run, aliasesMaxLength: number, completionValues: string[], cliAlias: string, runtime: string, runtimeCommand: string, runtimeFlags: string | undefined, commandAliases: string[]) => {
  const { cliScriptPath } = run
  const scriptPath = resolve(parse(cliScriptPath).dir, SHELL_SCRIPT_NAME)
  const script = `
alias ${cliAlias}='${runtimeCommand}'
${commandAliases.map((alias) => `alias ${alias}='${cliAlias} _${alias} ${alias}'`).join(EOL)}
command -v complete > /dev/null && complete -W '${completionValues.join(' ')}' ${cliAlias}
`.trimStart()

  await writeFile(scriptPath, script)

  console.log(`The ${bold(scriptPath)} script includes the following aliases:

  ${bold(`${cliAlias}`.padEnd(aliasesMaxLength))}  =  ${blue(runtime)} ${runtimeFlags ? `${cyan(runtimeFlags)} ` : ''}${dim(cliScriptPath)}
  ${commandAliases.map((alias) => `${bold(`${alias}`.padEnd(aliasesMaxLength))}  =  ${blue(italic(cliAlias))} ${dim(alias)}`).join('\n  ')}

And completion values:

  ${blue(cliAlias)} ${completionValues.map(value => bold(italic(value))).join(`\n  ${''.padEnd(cliAlias.length)} `)}

To add them to the current shell, run:

  ${blue('source')} ${scriptPath}
`)
}

const createWindowsShellAliasesScripts = async (run: Run, aliasesMaxLength: number, completionValues: string[], cliAlias: string, runtime: string, runtimeCommand: string, runtimeFlags: string | undefined, commandAliases: string[]) => {
  const { cliScriptPath } = run
  const cliDirectoryPath = parse(cliScriptPath).dir
  const scriptPathCMD = resolve(cliDirectoryPath, `${SHELL_SCRIPT_NAME}.cmd`)
  const scriptPathPS1 = resolve(cliDirectoryPath, `${SHELL_SCRIPT_NAME}.ps1`)
  let scriptCMD = `@echo off${EOL}doskey ${cliAlias}=cmd /c "${runtimeCommand} $*"`
  let scriptPS1 = `function ${cliAlias}([ArgumentCompleter({${completionValues.map((value) => `'${value}'`).join(', ')}})] $command, [Parameter(ValueFromRemainingArguments)] $args) {${EOL}  ${runtimeCommand} $command $args${EOL}}`

  for (const alias of commandAliases) {
    scriptCMD += `${EOL}doskey ${alias}=${cliAlias} _${alias} ${alias} $*`
    scriptPS1 += `${EOL}function ${alias}([Parameter(ValueFromRemainingArguments)] $args) { ${cliAlias} _${alias} ${alias} @args }`
  }

  await Promise.all([writeFile(scriptPathCMD, scriptCMD), writeFile(scriptPathPS1, scriptPS1)])

  console.log(`${blue('Command Prompt')} script ${bold(`${SHELL_SCRIPT_NAME}.cmd`)} and ${blue('Powershell')} script ${bold(`${SHELL_SCRIPT_NAME}.ps1`)} include the following aliases:

  ${bold(`${cliAlias}`.padEnd(aliasesMaxLength))}  =  ${blue(runtime)} ${runtimeFlags ? `${cyan(runtimeFlags)} ` : ''}${dim(cliScriptPath)}
  ${commandAliases.map((alias) => `${bold(`${alias}`.padEnd(aliasesMaxLength))}  =  ${blue(italic(cliAlias))} ${dim(alias)}`).join('\n  ')}

To add them to a ${blue('Command Prompt')}, run:

  ${blue(scriptPathCMD)}

The ${blue('Powershell')} script also includes the following completion values:

  ${blue(cliAlias)} ${completionValues.map(value => bold(italic(value))).join(`\n  ${''.padEnd(cliAlias.length)} `)}

To add the alias and completion values to a ${blue('Powershell')} instance, run:

  ${blue(scriptPathPS1)}
`)
}
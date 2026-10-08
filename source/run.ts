import { CommandErrorMessage, type CommandFunction, type CommandsFunction, runCommand } from './commands.ts'
import { composeCLIDefinitionErrorsMessage, parseCLIDefinition, type ParsedCLIDefinition } from './definition.ts'
import { composeCLIHelp, HELP_PARSE_ARGS_OPTION } from './help.ts'
import { bold, capitalize, DOCUMENTATION_URL, DocumentationPath, EOL, ExitCode, format, parse, parseArgs, type ParseArgsOptionsConfig, process, Runtime, SIGINT, toString } from './shared.ts'
import { createShellCommands } from './shell.ts'
import type { CommandResult, Configuration } from './types.ts'

export type CommandFunctions = Record<string, CommandFunction | CommandsFunction>

export type Run = {
  abortSignal: AbortSignal
  cli: ParsedCLIDefinition
  cliFlags?: string[]
  cliScriptPath: string
  configuration: Configuration
  executablePaths: Record<string, string>
  env?: Record<string, string>
  exit(output?: unknown, exitCode?: number): void
  moduleCommandFunctions?: Record<string, CommandFunction>
  promise: Promise<void>
  runAlias?: string
  runCommandValues: string[]
  runtime: Runtime
}

export type StackTraceCallSite = {
  getFileName(): string
  getLineNumber(): number
  getColumnNumber(): number
}

export const SHELL_PARSE_ARGS_OPTION: ParseArgsOptionsConfig = {
  'shell': {
    type: 'boolean',
    short: 's'
  }
}

export const composeRunAbortMessage = (template: string, values: string[], documentationPath: DocumentationPath, documentationDescription?: string) => {
  let message = `${format(template, ...values)}${EOL.repeat(2)}`

  if (documentationDescription) message += `${documentationDescription} `

  message += `${bold(`${DOCUMENTATION_URL}${documentationPath}`)}${EOL}`

  return message
}

export const convertRunCommandValuesIntoSequence = (raw: string[]) => {
  const values = raw.map((value) => value.startsWith(' ') || value.endsWith(' ') ? `'${value}'` : value)
  const sequence: (string | string[])[] = []
  let commandValues: string[] = []
  let concurrent: string[] | undefined

  for (const value of values) {
    if (value === '+') {
      if (commandValues.length > 0) {
        const command = commandValues.join(' ')

        commandValues = []

        if (concurrent) {
          if (concurrent.length > 0) {
            concurrent.push(command)
            sequence.push(concurrent)
          } else sequence.push(command)

          concurrent = undefined
        } else sequence.push(command)
      } else if (concurrent) {
        if (concurrent.length > 0) sequence.push(concurrent.length === 1 ? concurrent[0] as string : concurrent)
        concurrent = undefined
      }
    } else if (value === '+.') {
      if (!concurrent) concurrent = []

      if (commandValues.length > 0) {
        concurrent.push(commandValues.join(' '))
        commandValues = []
      }
    } else commandValues.push(value)
  }

  if (commandValues.length > 0) {
    const command = commandValues.join(' ')

    if (concurrent && concurrent.length > 0) {
      concurrent.push(command)
      sequence.push(concurrent)
    } else sequence.push(command)
  } else if (concurrent && concurrent.length > 0) sequence.push(concurrent.length === 1 ? concurrent[0] as string : concurrent)

  return sequence
}

export const executeRun = async (run: Run) => {
  const { cli, cliFlags, configuration, exit, runCommandValues, runtime } = run
  let error: unknown
  let exitCode = 0

  if (cliFlags) {
    try {
      const { values: { help, shell } } = parseArgs({ args: cliFlags, options: { ...HELP_PARSE_ARGS_OPTION, ...SHELL_PARSE_ARGS_OPTION }, strict: true })

      if (help && shell) exit(`The flags ${bold('--help/-h')} and ${bold('--shell/-s')} cannot be combined${EOL}`, ExitCode.Failure)
      else if (help) exit(composeCLIHelp(run))
      else if (shell) exit(await createShellCommands(run))
    } catch (error) {
      exit(`${(error as Error).message}${EOL}`, ExitCode.Failure)
    }

    // TEMP
    return
  }

  if (cli.errors.length > 0) exit(composeCLIDefinitionErrorsMessage(cli.errors), ExitCode.Failure)
  else if (configuration.runtime && runtime !== configuration.runtime) exit(composeRunAbortMessage(CommandErrorMessage.InvalidRuntime, [bold(capitalize(configuration.runtime)), bold(capitalize(runtime))], DocumentationPath.CLIVariables), ExitCode.Failure)
  else if (runCommandValues.length === 0) exit(composeCLIHelp(run))
  else {
    const handleSigint = () => exitCode = ExitCode.SignalOffset + SIGINT
    const sequence = convertRunCommandValuesIntoSequence(runCommandValues)

    process.once('SIGINT', handleSigint)

    try {
      for (const item of sequence) {
        if (exitCode) break

        let failedCommandResult: CommandResult | undefined

        if (Array.isArray(item)) {
          const commandResults = await Promise.all((item as string[]).map((command) => runCommand(command, run)))

          failedCommandResult = commandResults.find(({ error, exitCode }) => error || exitCode)
        } else {
          const commandResult = await runCommand(item as string, run)

          if (commandResult.error || commandResult.exitCode) failedCommandResult = commandResult
        }

        if (failedCommandResult) {
          exitCode = failedCommandResult.exitCode || ExitCode.Failure

          if (failedCommandResult.error) error = failedCommandResult.error
          else if (exitCode === ExitCode.NotFound) {
            const command = failedCommandResult.command[0]

            error = format(CommandErrorMessage.InvalidRunCommand, command, command)
          }
        }

        if (exitCode) break
      }
    } catch (e) {
      error = e
      if (!exitCode) exitCode = ExitCode.Failure
    }

    process.off('SIGINT', handleSigint)
  }

  exit(error, exitCode)
}

export const prepareRun = ([executablePath, cliScriptPath, ...runCommandValues]: [string, string, ...string[]], definition: string, configuration: Configuration = {}): Run => {
  const abortController = new AbortController()
  const { promise, resolve } = Promise.withResolvers<void>()
  const run: Run = {
    abortSignal: abortController.signal,
    cli: parseCLIDefinition(definition),
    cliScriptPath,
    configuration,
    executablePaths: {},
    exit: (output: unknown, exitCode = 0) => {
      abortController.abort()

      if (exitCode) {
        if (output) {
          if (output instanceof Error) console.error(output)
          else process.stderr.write(toString(output))
        }
        process.exit(exitCode)
      } else if (output) process.stdout.write(toString(output))

      resolve()
    },
    promise,
    runCommandValues,
    runtime: parse(executablePath).name as Runtime,
  }

  if (runCommandValues.length > 0) {
    while (runCommandValues.length > 0 && runCommandValues[0]!.startsWith('_')) run.runAlias = runCommandValues.shift()?.slice(1)!

    if (runCommandValues.length > 0) {
      const cliFlags = []

      while (runCommandValues.length > 0 && runCommandValues[0]!.startsWith('-')) cliFlags.push(runCommandValues.shift()!)

      if (cliFlags.length > 0) run.cliFlags = cliFlags
    }
  }

  return run
}

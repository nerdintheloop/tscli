import { createShellAliasesScripts } from './aliases.ts'
import { bold, cyan, red } from './ansi.ts'
import { CREATE_ALIASES_COMMAND, getCommandName, runTSCommand, TSCommandError } from './commands.ts'
import { type ParsedCLIDefinition } from './definition.ts'
import { argv, EOL, format, parse, process, SIGHUP } from './external.ts'
import { composeMainUsageInformation } from './usage.ts'

export type Run = ParsedCLIDefinition & {
  abortController?: AbortController
  alias?: string
  childProcessEnvironmentVariables?: Record<string, string> | true
  commandValues: string[]
  cliScriptPath: string
  hasProjectExecutables?: boolean
  resolvedExecutablePaths?: Record<string, string>
}

type StackTraceCallSite = {
  getFileName(): string
  getLineNumber(): number
  getColumnNumber(): number
}

export const Runtime = {
  Bun: 'bun',
  Deno: 'deno',
  Node: 'node'
}

export const abort = (message: string, run?: Run) => {
  if (run && run.abortController) run.abortController.abort()

  process.stderr.write(`${message}${EOL}`)

  if (!process.exitCode) process.exitCode = SIGHUP

  process.exit()
}

export const composeRunErrorMessage = (error: unknown, run: Run) => {
  const cliDirectoryPath = parse(run.cliScriptPath).dir
  const errors: unknown[] = [error]
  let messages = ''

  if (error instanceof Error) {
    let cause = error.cause

    while (cause) {
      errors.push(cause)
      cause = cause instanceof Error ? cause.cause : undefined
    }
  }

  const originalPrepareStackTrace = Error.prepareStackTrace

  // @ts-ignore: Error.prepareStackTrace not defined in @types/node
  Error.prepareStackTrace = (error: Error, trace: StackTraceCallSite[]) => {
    const commandModuleCallSite = trace.find((frame: StackTraceCallSite) => frame.getFileName()?.includes(cliDirectoryPath) ?? false)
    let location: string | undefined

    if (commandModuleCallSite) {
      const modulePath = commandModuleCallSite.getFileName()
      const runtime = getRuntime()

      if (runtime === Runtime.Node) {
        const line = originalPrepareStackTrace(error, [commandModuleCallSite])!.split(EOL).at(-1)!

        const relativeModulePathStartIndex = line.indexOf(cliDirectoryPath!) + cliDirectoryPath!.length

        location = `at ${cyan(`.${line.slice(relativeModulePathStartIndex, line.indexOf(')', relativeModulePathStartIndex))}`)}`
      } else {
        const relativeModulePathStartIndex = modulePath?.indexOf(cliDirectoryPath!) + cliDirectoryPath!.length
        const relativeModulePath = `.${modulePath?.slice(relativeModulePathStartIndex)}`

        location = `at ${cyan(`${relativeModulePath}:${commandModuleCallSite.getLineNumber()}:${commandModuleCallSite.getColumnNumber()}`)}`
      }
    }

    return location
  }

  for (const [index, error] of errors.entries()) {
    if (index > 0) {
      if (index > 1) messages += EOL.repeat(2)

      if (error instanceof Error) {
        const { message, name, stack } = error

        let location = stack

        messages += `${bold(red(`${name}:`))} ${message}`

        if (!stack) {
          const cause = errors[index - 1] as TSCommandError
          const causeTSCommandName = getCommandName(cause.command)
          const causeTSCommandModulePath = run.commands[causeTSCommandName].modulePath!

          location = `in ${cyan(`.${causeTSCommandModulePath.replace(cliDirectoryPath!, '')}`)}`
        }

        messages += `${EOL}  ${location}`
      } else messages += format('%s', error)
    }
  }

  return `${messages}${EOL}`
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
        if (concurrent.length > 0) sequence.push(concurrent.length === 1 ? concurrent[0] : concurrent)
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
  } else if (concurrent && concurrent.length > 0) sequence.push(concurrent.length === 1 ? concurrent[0] : concurrent)

  return sequence
}

const executeRunCommand = async (command: string, run: Run): Promise<number | void> => {
  if (command.startsWith(CREATE_ALIASES_COMMAND)) await createShellAliasesScripts(run)
  else {
    const output = await runTSCommand(command, run!)

    if (output && output.exitCode) return output.exitCode
  }
}

export const executeRunCommands = async (run: Run) => {
  const sequence = convertRunCommandValuesIntoSequence(run.commandValues)
  const validCommandNames = [...Object.keys(run.commands), CREATE_ALIASES_COMMAND]
  const invalidCommand = sequence.flat().find((command) => !validCommandNames.includes(getCommandName(command)))

  if (invalidCommand) abort(`${bold('Invalid command:')} ${red(invalidCommand)}${EOL.repeat(2)}${composeMainUsageInformation(run)}`, run)

  let exitCode = 0

  for (const item of sequence) {
    if (Array.isArray(item)) {
      const commandsExitCode = (await Promise.all(item.map((command) => executeRunCommand(command, run)))).find((code) => !!code)

      if (commandsExitCode) exitCode = commandsExitCode
    } else {
      const commandExitCode = await executeRunCommand(item, run)

      if (commandExitCode) exitCode = commandExitCode
    }

    if (exitCode) return exitCode
  }

  return exitCode
}

export const getRuntime = () => parse(argv[0]!).name

export const prepareRun = (argv: string[], parsedCLIDefinition: ParsedCLIDefinition): Run => {
  const [, cliScriptPath, ...cliArguments] = argv as [string, string, ...string[]]
  const runValues: Partial<Run> = { ...parsedCLIDefinition, cliScriptPath }

  if (cliArguments.length > 0) {
    let alias: string | undefined

    while (cliArguments.length > 0 && cliArguments[0]!.startsWith('_')) alias = cliArguments.shift()?.slice(1)

    if (alias) runValues.alias = alias
  }

  if (cliArguments.length > 0) {
    const flags: string[] = []

    while (cliArguments.length > 0 && cliArguments[0]!.startsWith('-')) flags.push(cliArguments.shift()!)

    if (flags.length > 0) {
      if (flags.includes('-h') || flags.includes('--help')) cliArguments.length = 0
    }
  }

  runValues.commandValues = cliArguments

  return runValues as Run
}

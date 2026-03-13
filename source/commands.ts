import { bold } from './ansi.ts'
import type { FlagArgumentDefinition, PositionalArgumentDefinition, RestArgumentDefinition } from './definition.ts'
import { Buffer, EOL, format, parse, parseArgs, pathToFileURL, process, relative, resolve, sep } from './external.ts'
import { DocumentationLink, documentationLinkLine } from './links.ts'
import { firstExistingFilePath } from './paths.ts'
import { abort, type Run } from './run.ts'
import { type ScriptCommandCapturedOutput } from './scripts.ts'
import { composeCommandUsageInformation } from './usage.ts'
import { isObject } from './utilities.ts'

export type CLICommand = {
  description?: string
  flags?: Map<string, FlagArgumentDefinition>
  function?: CLICommandFunction
  modulePath?: string
  positionals?: Map<string, PositionalArgumentDefinition>
  rest?: RestArgumentDefinition
}

export type CLICommandArguments = Record<string, boolean | number | string | string[]>

export type CLICommandContext = {
  command: string
  script?: CLICommandScriptContext
  signal: AbortSignal
}

export type CLICommandError = Error & { command: string }

export type CLICommandFunction = (args: CLICommandArguments, context: CLICommandContext) => Promise<CLICommandOutput | unknown> | CLICommandOutput | unknown

export type CLICommandOutput = {
  exitCode?: number
  output?: unknown
  stderr?: Buffer | string
  stdout?: Buffer | string
}

export type CLICommandScriptContext = {
  captureOutput?: true
  capturedOutput?: ScriptCommandCapturedOutput[]
  commandName: string
}

export const InternalCommand = {
  ChangeDirectory: 'cd',
  CreateShellAliases: 'create-aliases',
  Help: 'help',
}

export const USAGE_INFORMATION_FLAG_LONG = 'help'

export const USAGE_INFORMATION_FLAG_SHORT = 'h'

export const convertArgsToCLICommandFunctionArguments = (args: string[], { flags, positionals: positionalDefinitions, rest }: CLICommand) => {
  const { values, positionals } = parseArgs({ args, options: flags ? convertFlagsIntoArgsParserOptions(flags) : {}, strict: false })
  const restArgumentName = rest ? rest.name : '_'
  const restArgumentType = rest && rest.type ? rest.type : 'array'
  const commandFunctionArguments: CLICommandArguments = {}

  if (flags) {
    for (const [long, { type }] of flags.entries()) {
      const value = values[long]

      if (type && ['number', 'string'].includes(type)) {
        if (typeof value === 'string') commandFunctionArguments[long] = type === 'number' ? Number(value) : value
      } else commandFunctionArguments[long] = !!value
    }
  }

  if (positionalDefinitions) {
    for (const [name, { type }] of positionalDefinitions.entries()) {
      if (positionals.length > 0) {
        const value = positionals.shift() as string

        commandFunctionArguments[name] = type === 'number' ? Number(value) : value
      }
    }
  }

  if (positionals.length > 0) commandFunctionArguments[restArgumentName] = restArgumentType === 'string' ? positionals.join(' ') : positionals
  else if (rest && restArgumentType === 'string') commandFunctionArguments[restArgumentName] = ''

  return Object.fromEntries(Object.entries(commandFunctionArguments).map(([key, value]) => [kebabCaseToCamelCase(key), value])) as CLICommandArguments
}

export const convertFlagsIntoArgsParserOptions = (flags: Map<string, FlagArgumentDefinition>) =>
  [...flags].reduce((options, [long, { short, type }]) => {
    const option: Record<string, string> = { type: type && ['number', 'string'].includes(type) ? 'string' : 'boolean' }

    if (short) option['short'] = short

    return Object.assign(options, { [long]: option })
  }, {})

export const getCommandName = (command: string) => command.includes(' ') ? command.slice(0, command.indexOf(' ')) : command

export const kebabCaseToCamelCase = (string: string) =>
  string
    .split('-')
    .map((word: string, index: number) => (index === 0 ? word : `${word.charAt(0).toUpperCase()}${word.slice(1)}`))
    .join('')

export const parseCommand = (command: string): [name: string, ...args: string[]] => {
  const values = []
  const length = command.length
  let quote: string | undefined
  let value = ''

  for (let i = 0; i < length; i++) {
    const character = command[i]

    if (quote) {
      if (character === quote) {
        quote = undefined

        if (value) {
          values.push(value)
          value = ''
        }
      } else value += character
    } else if (character === '"' || character === "'") {
      quote = character

      if (value) {
        values.push(value)
        value = ''
      }
    } else if (character === ' ' || character === '\t') {
      if (value) {
        values.push(value)
        value = ''
      }
    } else value += character
  }

  if (value) values.push(value)

  return values as [name: string, ...args: string[]]
}

export const runCLICommand = async (command: string, run: Run, script?: CLICommandScriptContext): Promise<CLICommandOutput | void> => {
  const [name, ...args] = parseCommand(command) as [string, ...string[]]
  const { values } = parseArgs({ args, options: convertFlagsIntoArgsParserOptions(new Map([[USAGE_INFORMATION_FLAG_LONG, { short: USAGE_INFORMATION_FLAG_SHORT }]])), strict: false })

  if (values['help']) {
    const output = composeCommandUsageInformation(name, run)

    if (script?.captureOutput) return { output }

    process.stdout.write(output)
  } else {
    const cliCommand = run.commands[name]!
    let cliCommandFunction = cliCommand.function

    if (!cliCommandFunction) {
      const cliDirectoryPath = parse(run.cliScriptPath).dir
      const modulePathPrefix = resolve(cliDirectoryPath, name)
      const modulePath = await firstExistingFilePath(
        `${modulePathPrefix}.ts`,
        `${modulePathPrefix}${sep}index.ts`
      )

      if (!modulePath) abort(`CLI Command ${bold(name)} is defined but has no corresponding module`, run)

      cliCommand.modulePath = modulePath

      cliCommandFunction = (await import(pathToFileURL(modulePath!).href)).default

      if (cliCommandFunction === undefined) {
        abort(
          `Module ${bold(relative(cliDirectoryPath, modulePath!))} has no default export${EOL.repeat(2)}${documentationLinkLine(DocumentationLink.CommandDefinitions)}`,
          run
        )
      }

      if (typeof cliCommandFunction !== 'function') {
        abort(
          `The default export from ${bold(relative(cliDirectoryPath, modulePath!))} is not a function${EOL.repeat(2)}${documentationLinkLine(DocumentationLink.CommandDefinitions)}`,
          run
        )
      }

      cliCommand.function = cliCommandFunction
    }

    try {
      const { signal } = run.abortController!
      const functionOutput = await cliCommandFunction!(convertArgsToCLICommandFunctionArguments(args, cliCommand), { command, script, signal })

      if (functionOutput) {
        if (Number.isInteger(functionOutput)) return { exitCode: functionOutput as number }

        if (script?.captureOutput) {
          if (isObject(functionOutput)) {
            const { exitCode, output, stderr, stdout } = functionOutput as CLICommandOutput
            const cliCommandOutput: CLICommandOutput = {}

            if (Number.isInteger(exitCode)) cliCommandOutput.exitCode = exitCode
            if (output !== undefined) cliCommandOutput.output = output
            if (stderr !== undefined) cliCommandOutput.stderr = stderr instanceof Buffer || typeof stderr ? stderr : format('%s', stderr)
            if (stdout !== undefined) cliCommandOutput.stdout = stdout instanceof Buffer || typeof stdout ? stdout : format('%s', stdout)

            return cliCommandOutput
          }

          return { output: functionOutput }
        }
      }
    } catch (error) {
      if (script) throw error

      throw Object.assign(new Error(), { cause: error, command, name: 'CommandError' })
    }
  }
}

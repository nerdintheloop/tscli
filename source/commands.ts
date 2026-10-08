import { runChildProcessBun } from './bun.ts'
import type { OptionArgumentDefinition, PositionalArgumentDefinition, RestArgumentDefinition } from './definition.ts'
import { hasDenoReadPermissions, runChildProcessDeno } from './deno.ts'
import { composeCommandHelp, HELP_PARSE_ARGS_OPTION } from './help.ts'
import { runChildProcessNode } from './node.ts'
import type { Run } from './run.ts'
import { bold, chdir, cyan, DOCUMENTATION_URL, ErrorCode, ExitCode, format, isObject, italic, parse, parseArgs, process, resolve, Runtime } from './shared.ts'
import { createShellCommands } from './shell.ts'
import type { CommandResult, FallbackCommandFunction, ScriptContext } from './types.ts'

export type Command = {
  aliased: boolean
  description?: string
  function?: CommandFunction
  options?: Map<string, OptionArgumentDefinition>
  positionals?: Map<string, PositionalArgumentDefinition>
  rest?: RestArgumentDefinition
}

export type CommandError = [
  error: unknown,
  exitCode: number
]

export type CommandFunction<A = unknown> = (args: CommandFunctionArguments & A, context: CommandFunctionContext) => unknown

export type CommandFunctionArguments = Record<string, boolean | number | string | string[]>

export type CommandFunctionContext = {
  command: [name: string, ...args: string[]]
  help: string
  script?: ScriptContext
  signal: AbortSignal
}

export type CommandFunctionOutput = {
  exitCode?: number
  output?: unknown
  stderr?: Buffer | string
  stdout?: Buffer | string
}

export type CommandsFunction<A = unknown> = (commandName: string, args: CommandFunctionArguments & A, context: CommandFunctionContext) => unknown

export type ErrorWithCode = Error & { code: ErrorCode }

export const CommandErrorMessage = {

  InvalidChangeDirectoryPath: `A ${bold('cd')} command requires a valid path value.

Learn more about running child processes at ${cyan(`${DOCUMENTATION_URL}/child-processes`)}.
`,

  InvalidCommandModuleExport: `The ${bold('%s')} value exported by ${bold('%s')} is not a function.

A command function exported as either ${bold('%s')} or ${bold('default')} is expected.

Learn more about command modules at ${cyan(`${DOCUMENTATION_URL}/command-modules`)}.
`,

  InvalidCommandName: `There is no command named ${bold('%s')}.

Valid command names are %s.

Learn more about defining commands at ${bold(cyan(`${DOCUMENTATION_URL}/commands`))}.
`,

  InvalidFunctionsValue: 'Invalid functions value: %s. An object containing named command functions is expected.',

  InvalidRunCommand: `No command named ${bold('%s')} is defined and no executable named ${bold('%s')} was resolved in project dependencies or on the system.

Learn more about running commands at ${cyan(`${DOCUMENTATION_URL}/commands`)}.
`,

  InvalidRuntime: `%s is required. To use %s instead, change or remove the ${bold('runtime')} configuration value.`,

  NoCommandFunction: `No function provided for the ${bold('%s')} command.

A command function can be defined as either:

  - A function named ${bold('%s')} or ${bold('default')} exported from ${bold('%s.ts')} or ${bold('%s/index.ts')}.
  - A function passed to tscli.functions({ '${bold('%s')}': ${cyan(italic('function'))} }).

A default command function can be defined as either:

  - A function passed to tscli.default( ${cyan(italic('function'))} ).
  - A function passed to tscli.functions({ '${bold('*')}': ${cyan(italic('function'))} }).

Learn more about command functions at ${cyan(`${DOCUMENTATION_URL}/command-functions`)}.
`,

  NoCommandModuleExport: `The ${bold('%s')} module does not export a command function.

A command function exported as either ${bold('%s')} or ${bold('default')} is expected.

Learn more about command modules at ${cyan(`${DOCUMENTATION_URL}/command-modules`)}.
`,

  NoDenoDirectoryReadPermissions: 'Deno read permissions are required to change directory to %s',

} as const

export type CommandErrorMessage = (typeof CommandErrorMessage)[keyof typeof CommandErrorMessage]

export const CommandType = {
  ChildProcess: 'child-process',
  CommandFunction: 'command-function',
  CommandHelp: 'help',
  Internal: 'internal',
} as const

export type CommandType = (typeof CommandType)[keyof typeof CommandType]

const COMMAND_FUNCTION_RESULT_KEYS = ['exitCode', 'output', 'stderr', 'stdout']

export const CHANGE_DIRECTORY_COMMAND = 'cd'

export const CREATE_SHELL_COMMANDS_COMMAND = 'shell'

export const convertArgsToCommandFunctionArguments = (args: string[], optionDefinitions?: Map<string, OptionArgumentDefinition>, positionalDefinitions?: Map<string, PositionalArgumentDefinition>, restDefinition?: RestArgumentDefinition) => {
  const { values, positionals } = parseArgs({ args, options: optionDefinitions ? convertOptionArgumentDefinitionsIntoArgsParserOptions(optionDefinitions) : {}, strict: false })
  const restArgumentName = restDefinition ? restDefinition.name : '_'
  const restArgumentType = restDefinition && restDefinition.type ? restDefinition.type : 'array'
  const commandFunctionArguments: CommandFunctionArguments = {}

  if (optionDefinitions) {
    for (const [long, { type }] of optionDefinitions.entries()) {
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
  else if (restDefinition && restArgumentType === 'string') commandFunctionArguments[restArgumentName] = ''

  return commandFunctionArguments // Object.fromEntries(Object.entries(commandFunctionArguments).map(([key, value]) => [key, value])) as CommandFunctionArguments
}

export const convertOptionArgumentDefinitionsIntoArgsParserOptions = (flags: Map<string, OptionArgumentDefinition>) =>
  [...flags].reduce((options, [long, { short, type }]) => {
    const option: Record<string, string> = { type: type && ['number', 'string'].includes(type) ? 'string' : 'boolean' }

    if (short) option['short'] = short

    return Object.assign(options, { [long]: option })
  }, {})

export const isCommandFunctionOutput = (object: unknown): object is CommandFunctionOutput => {
  if (!isObject(object)) return false

  const keys = Object.keys(object as {})

  if (!keys.every(key => COMMAND_FUNCTION_RESULT_KEYS.includes(key))) return false

  const result = object as CommandFunctionOutput

  if (keys.includes('exitCode') && !Number.isInteger(result.exitCode)) return false
  if (keys.includes('stderr') && !(typeof result.stderr === 'string' || result.stderr instanceof Buffer)) return false
  if (keys.includes('stdout') && !(typeof result.stdout === 'string' || result.stdout instanceof Buffer)) return false

  return true
}

export const parseCommand = (command: string): [name: string, ...args: string[]] => {
  const values: string[] = []
  let quote: string | undefined
  let token = false
  let value = ''

  for (const character of command) {
    if (quote) {
      if (character === quote) quote = undefined
      else value += character
    } else if (character === '"' || character === "'") {
      quote = character
      token = true
    } else if (character === ' ' || character === '\t') {
      if (token) {
        values.push(value)
        token = false
        value = ''
      }
    } else {
      token = true
      value += character
    }
  }

  if (token) values.push(value)

  return values as [name: string, ...args: string[]]
}

export const runCommand = async (command: string | [name: string, ...args: string[]], run: Run, script?: ScriptContext): Promise<CommandResult> => {
  const [name, ...args] = Array.isArray(command) ? command : parseCommand(command)
  const { values } = parseArgs({ args, options: HELP_PARSE_ARGS_OPTION, strict: false })
  const type = [CHANGE_DIRECTORY_COMMAND, CREATE_SHELL_COMMANDS_COMMAND].includes(name) ? CommandType.Internal
    : values['help'] ? CommandType.CommandHelp
      : run.cli.commands[name] && !(script?.parentCommand === name) ? CommandType.CommandFunction
        : CommandType.ChildProcess
  let result: CommandResult = { command: [name, ...args], exitCode: 0, type }

  switch (type) {
    case CommandType.ChildProcess: {
      try {
        const runChildProcess = run.runtime === Runtime.Bun ? runChildProcessBun : run.runtime === Runtime.Deno ? runChildProcessDeno : runChildProcessNode

        result = { ...result, ...(await runChildProcess(name, args, run, !!script?.capture.input, !!script?.capture.output)) }
      } catch (e) {
        if (Array.isArray(e) && e.length === 2 && Number.isInteger(e[1])) {
          result.error = e[0]
          result.exitCode = e[1]
        } else {
          result.error = e
          result.exitCode = ExitCode.Failure
        }

        if (result.error instanceof Error && Object.hasOwn(result.error, 'code')) {
          const { code } = result.error as ErrorWithCode

          if (code === ErrorCode.NoEntity) result.exitCode = ExitCode.NotFound
          else if (code === ErrorCode.Abort && run.abortSignal.aborted) delete result.error
        }
      }
      break
    }

    case CommandType.CommandFunction: {
      const { cli, cliScriptPath, configuration } = run
      let commandFunction = configuration.functions && configuration.functions[name] ? configuration.functions[name] : run.moduleCommandFunctions && run.moduleCommandFunctions[name] ? run.moduleCommandFunctions[name] : undefined
      let fallbackFunction: FallbackCommandFunction | undefined
      let module: { [name]?: CommandFunction, default?: CommandFunction } | undefined
      let modulePath: string | undefined

      if (!commandFunction) {
        const cliDirectoryPath = parse(cliScriptPath).dir

        try {
          modulePath = resolve(cliDirectoryPath, `${name}.ts`)
          module = await import(modulePath)
        } catch (_) {
          try {
            modulePath = resolve(cliDirectoryPath, name, 'index.ts')
            module = await import(modulePath)
          } catch (_) { }
        }

        if (module && (typeof module[name] === 'function' || typeof module.default === 'function')) {
          run.moduleCommandFunctions ??= {}
          run.moduleCommandFunctions[name] = commandFunction = typeof module[name] === 'function' ? module[name] : module.default as CommandFunction
        }
      }

      if (!commandFunction && configuration.functions) fallbackFunction = configuration.functions['*']

      if (commandFunction || fallbackFunction) {
        try {
          const { options, positionals, rest } = cli.commands[name]!
          const functionArguments = convertArgsToCommandFunctionArguments(args, options, positionals, rest)
          const functionContext = { command: [name, ...args], get help() { return composeCommandHelp(name, run) }, script, signal: run.abortSignal }
          const functionOutput = await (commandFunction ? commandFunction(functionArguments, functionContext as CommandFunctionContext) : fallbackFunction!(name, functionArguments, functionContext as CommandFunctionContext))

          result = {
            ...result,
            ...(functionOutput !== undefined
              ? isCommandFunctionOutput(functionOutput)
                ? functionOutput
                : Number.isInteger(functionOutput)
                  ? { exitCode: functionOutput as number }
                  : { output: functionOutput }
              : {})
          }
        } catch (error) {
          result.error = error
          result.exitCode = ExitCode.Failure
        }
      } else if (module) {
        if (module[name] !== undefined || module.default !== undefined) {
          const exportName = module[name] !== undefined ? name : 'default'

          result.error = format(CommandErrorMessage.InvalidCommandModuleExport, exportName, modulePath, name)
          result.exitCode = ExitCode.UsageError
        } else {
          result.error = format(CommandErrorMessage.NoCommandModuleExport, modulePath, name)
          result.exitCode = ExitCode.UsageError
        }
      } else {
        result.error = format(CommandErrorMessage.NoCommandFunction, name, name, name, name, name)
        result.exitCode = ExitCode.NotFound
      }

      break
    }

    case CommandType.CommandHelp: {
      const output = composeCommandHelp(name, run)

      result.type = CommandType.CommandHelp

      if (!!script?.capture.output) result.output = output
      else process.stdout.write(output)

      break
    }

    case CommandType.Internal: {
      if (name === CHANGE_DIRECTORY_COMMAND) {
        const [path] = args

        if (path) {
          if (run.runtime === Runtime.Deno && !await hasDenoReadPermissions(path!)) {
            result.error = format(CommandErrorMessage.NoDenoDirectoryReadPermissions, path)
            result.exitCode = ExitCode.PermissionDenied
          } else {
            try {
              chdir(path)
            } catch (_) {
              result.error = format(CommandErrorMessage.InvalidChangeDirectoryPath)
              result.exitCode = ExitCode.NotFound
            }
          }
        } else {
          result.error = format(CommandErrorMessage.InvalidChangeDirectoryPath)
          result.exitCode = ExitCode.UsageError
        }
      } else if (name === CREATE_SHELL_COMMANDS_COMMAND) await createShellCommands(run)

      break
    }
  }

  return result
}

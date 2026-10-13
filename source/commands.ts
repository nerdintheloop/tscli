import { runChildProcessBun } from './bun.ts'
import type { OptionArgumentDefinition, PositionalArgumentDefinition, RestArgumentDefinition } from './definition.ts'
import { hasDenoReadPermissions, runChildProcessDeno } from './deno.ts'
import { composeCommandHelp, HELP_PARSE_ARGS_OPTION } from './help.ts'
import { runChildProcessNode } from './node.ts'
import type { Run } from './run.ts'
import { blue, bold, chdir, cyan, dim, DOCUMENTATION_URL, ErrorCode, ExitCode, format, green, isExistingFilePath, isObject, italic, parse, parseArgs, process, Runtime, sep, yellow } from './shared.ts'
import type { CommandResult, FallbackCommandFunction, ScriptContext } from './types.ts'

export type Command = {
  aliased: boolean
  description?: string
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

Learn more about running child processes at ${bold(cyan(`${DOCUMENTATION_URL}/child-processes`))}.
`,

  InvalidCommandModuleExport: `The ${bold(yellow('%s'))} value exported from the ${bold(blue(`%s`))} module in ${bold('%s')} is not a function.

A command function can be defined as either:

  - A function named ${bold(yellow('%s'))} or ${bold(yellow('default'))} exported from ${bold(blue('%s.ts'))} or ${bold(blue('%s/index.ts'))}
  - A function named ${bold(yellow('%s'))} exported from ${bold(blue('%s.ts'))} or ${bold(blue('%s/index.ts'))}
  - A function passed to ${bold(green('tscli'))}${green('`')}${dim('...')}${green('`(')}${dim('{')} ${yellow('functions:')} ${dim('{')} ${bold(yellow("'%s'"))}: ${cyan(italic('function'))} ${dim('} }')}${green(')')}

A fallback command function can be defined as:

  - A function passed to ${bold(green('tscli'))}${green('`')}${dim('...')}${green('`(')}${dim('{')} ${yellow('functions:')} ${dim('{')} ${bold(yellow("'*'"))}: ${cyan(italic('function'))} ${dim('} }')}${green(')')}

Learn more about command functions at ${bold(cyan(`${DOCUMENTATION_URL}/command-functions`))}.
`,

  InvalidFunctionsValue: 'Invalid functions value: %s. An object containing named command functions is expected.',

  InvalidRunCommand: `No command named ${bold(yellow('%s'))} is defined and no executable named ${bold(yellow('%s'))} was resolved in project dependencies or on the system.

Learn more about running commands at ${bold(cyan(`${DOCUMENTATION_URL}/commands`))}.
`,

  InvalidRuntime: `${bold(green('%s'))} is required. To use ${bold(green('%s'))} instead, change or remove the ${bold(blue('runtime'))} configuration value.

Learn more about runtimes at ${bold(cyan(`${DOCUMENTATION_URL}/runtimes`))}.
`,

  NoCategoryModuleExport: `The ${bold(blue(`%s`))} module in ${bold('%s')} does not export a ${bold(yellow('%s'))} command function.

A command function can be defined as either:

  - A function named ${bold(yellow('%s'))} exported from ${bold(blue('%s.ts'))} or ${bold(blue('%s/index.ts'))}
  - A function named ${bold(yellow('%s'))} or ${bold(yellow('default'))} exported from ${bold(blue('%s.ts'))} or ${bold(blue('%s/index.ts'))}
  - A function passed to ${bold(green('tscli'))}${green('`')}${dim('...')}${green('`(')}${dim('{')} ${yellow('functions:')} ${dim('{')} ${bold(yellow("'%s'"))}: ${cyan(italic('function'))} ${dim('} }')}${green(')')}

A fallback command function can be defined as:

  - A function passed to ${bold(green('tscli'))}${green('`')}${dim('...')}${green('`(')}${dim('{')} ${yellow('functions:')} ${dim('{')} ${bold(yellow("'*'"))}: ${cyan(italic('function'))} ${dim('} }')}${green(')')}

Learn more about command functions at ${bold(cyan(`${DOCUMENTATION_URL}/command-functions`))}.
`,

  NoCommandFunction: `There is no command function provided for the ${bold(blue(`%s`))} command.

A command function can be defined as either:

  - A function named ${bold(yellow('%s'))} or ${bold(yellow('default'))} exported from ${bold(blue('%s.ts'))} or ${bold(blue('%s/index.ts'))}
  - A function named ${bold(yellow('%s'))} exported from ${bold(blue('%s.ts'))} or ${bold(blue('%s/index.ts'))}
  - A function passed to ${bold(green('tscli'))}${green('`')}${dim('...')}${green('`(')}${dim('{')} ${yellow('functions:')} ${dim('{')} ${bold(yellow("'%s'"))}: ${cyan(italic('function'))} ${dim('} }')}${green(')')}

A fallback command function can be defined as:

  - A function passed to ${bold(green('tscli'))}${green('`')}${dim('...')}${green('`(')}${dim('{')} ${yellow('functions:')} ${dim('{')} ${bold(yellow("'*'"))}: ${cyan(italic('function'))} ${dim('} }')}${green(')')}

Learn more about command functions at ${bold(cyan(`${DOCUMENTATION_URL}/command-functions`))}.
`,

  NoCommandModuleExport: `The ${bold(blue(`%s`))} module in ${bold('%s')} does not export a command function.

A command function can be defined as either:

  - A function named ${bold(yellow('%s'))} or ${bold(yellow('default'))} exported from ${bold(blue('%s.ts'))} or ${bold(blue('%s/index.ts'))}
  - A function named ${bold(yellow('%s'))} exported from ${bold(blue('%s.ts'))} or ${bold(blue('%s/index.ts'))}
  - A function passed to ${bold(green('tscli'))}${green('`')}${dim('...')}${green('`(')}${dim('{')} ${yellow('functions:')} ${dim('{')} ${bold(yellow("'%s'"))}: ${cyan(italic('function'))} ${dim('} }')}${green(')')}

A fallback command function can be defined as:

  - A function passed to ${bold(green('tscli'))}${green('`')}${dim('...')}${green('`(')}${dim('{')} ${yellow('functions:')} ${dim('{')} ${bold(yellow("'*'"))}: ${cyan(italic('function'))} ${dim('} }')}${green(')')}

Learn more about command functions at ${bold(cyan(`${DOCUMENTATION_URL}/command-functions`))}.
`,

  NoDenoDirectoryReadPermissions: 'Deno read permissions are required to change directory to %s',

} as const

export type CommandErrorMessage = (typeof CommandErrorMessage)[keyof typeof CommandErrorMessage]

export const CommandType = {
  ChangeDirectory: 'change-directory',
  ChildProcess: 'child-process',
  CommandFunction: 'command-function',
  CommandHelp: 'help',
} as const

export type CommandType = (typeof CommandType)[keyof typeof CommandType]

const COMMAND_FUNCTION_RESULT_KEYS = ['exitCode', 'output', 'stderr', 'stdout']

export const CHANGE_DIRECTORY_COMMAND = 'cd'

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


export const getCommandCategory = (name: string, run: Run) => [...run.cli.categories.entries()].find(([, commands]) => commands.includes(name))?.[0]!

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

const resolveCommandFunction = async (name: string, run: Run) => {
  let commandFunction = run.configuration.functions?.[name] ?? run.moduleCommandFunctions?.[name]

  if (!commandFunction) {
    const category = getCommandCategory(name, run)
    const cliDirectoryPath = parse(run.cliScriptPath).dir
    let isCategoryModule = false
    let module: { [name]?: CommandFunction, default?: CommandFunction } | undefined
    let moduleName = `${name}.ts`
    let modulePath = `${cliDirectoryPath}${sep}${moduleName}`
    let moduleExport: unknown
    let moduleExportName: string | undefined

    if (await isExistingFilePath(modulePath)) {
      module = await import(modulePath)
      moduleExportName = Object.hasOwn(module!, name) ? name : Object.hasOwn(module!, 'default') ? 'default' : undefined
      if (moduleExportName) moduleExport = module![moduleExportName]
    } else {
      moduleName = `${name}/index.ts`
      modulePath = `${cliDirectoryPath}${sep}${moduleName}`

      if (await isExistingFilePath(modulePath)) {
        module = await import(modulePath)
        moduleExportName = Object.hasOwn(module!, name) ? name : Object.hasOwn(module!, 'default') ? 'default' : undefined
        if (moduleExportName) moduleExport = module![moduleExportName]
      } else {
        moduleName = `${category}.ts`
        modulePath = `${cliDirectoryPath}${sep}${moduleName}`

        if (await isExistingFilePath(modulePath)) {
          isCategoryModule = true
          module = await import(modulePath)
          moduleExportName = Object.hasOwn(module!, name) ? name : undefined
          if (moduleExportName) moduleExport = module![moduleExportName]
        } else {
          moduleName = `${category}/index.ts`
          modulePath = `${cliDirectoryPath}${sep}${moduleName}`

          if (await isExistingFilePath(modulePath)) {
            isCategoryModule = true
            module = await import(modulePath)
            moduleExportName = Object.hasOwn(module!, name) ? name : undefined
            if (moduleExportName) moduleExport = module![moduleExportName]
          }
        }
      }
    }

    if (module) {
      if (moduleExport !== undefined) {
        if (typeof moduleExport === 'function') {
          run.moduleCommandFunctions ??= {}
          run.moduleCommandFunctions[name] = commandFunction = moduleExport as CommandFunction
        } else throw format(CommandErrorMessage.InvalidCommandModuleExport, moduleExportName, moduleName, cliDirectoryPath, name, name, name, name, category, category, name)
      } else {
        throw isCategoryModule
          ? format(CommandErrorMessage.NoCategoryModuleExport, moduleName, cliDirectoryPath, name, name, category, category, name, name, name, name)
          : format(CommandErrorMessage.NoCommandModuleExport, moduleName, cliDirectoryPath, name, name, name, name, category, category, name)
      }
    }
  }

  return commandFunction
}

export const runCommand = async (command: string | [name: string, ...args: string[]], run: Run, script?: ScriptContext): Promise<CommandResult> => {
  const [name, ...args] = Array.isArray(command) ? command : parseCommand(command)
  const { values } = parseArgs({ args, options: HELP_PARSE_ARGS_OPTION, strict: false })
  const type = name === CHANGE_DIRECTORY_COMMAND ? CommandType.ChangeDirectory
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
      const commandFunction = await resolveCommandFunction(name, run)
      let fallbackFunction: FallbackCommandFunction | undefined

      if (!commandFunction) fallbackFunction = run.configuration.functions?.['*']

      if (commandFunction || fallbackFunction) {
        try {
          const { options, positionals, rest } = run.cli.commands[name]!
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
      } else {
        const category = getCommandCategory(name, run)

        result.error = format(CommandErrorMessage.NoCommandFunction, name, name, name, name, name, category, category, name)
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

    case CommandType.ChangeDirectory: {
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
      }

      break
    }
  }

  return result
}

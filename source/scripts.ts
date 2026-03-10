import { createShellAliasesScripts } from './aliases.ts'
import { bold } from './ansi.ts'
import { ErrorCode, runChildProcess } from './child-processes.ts'
import { getCommandName, InternalCommand, parseCommand, runCLICommand } from './commands.ts'
import { Buffer, chdir, EOL, format, parse, process, sep, SIGHUP } from './external.ts'
import { DocumentationLink, documentationLinkLine } from './links.ts'
import { type Run } from './run.ts'
import { composeCommandUsageInformation, composeMainUsageInformation } from './usage.ts'
import { EOL_POSIX, normalizeLineBreaks } from './utilities.ts'

type ErrorWithCode = Error & { code: string }

export type ScriptCommandOutput = ScriptCommandCapturedOutput | number | void

export type ScriptCommandContext = {
  allowInput?: true
  captureOutput?: true
  capturedOutput?: ScriptCommandCapturedOutput[]
  commandName?: string
}

export type ScriptCommandCapturedOutput = {
  command: string
  error?: unknown
  exitCode?: number
  output?: unknown
  stderr?: Buffer | string
  stdout?: Buffer | string
  type: string
}

export type ScriptFunction = (strings: TemplateStringsArray, ...values: unknown[]) => ScriptPromise

export type ScriptOutputCaptured = {
  error?: unknown
  exitCode: number
  output: ScriptCommandCapturedOutput[]
}

export type ScriptOutputConcatenated = ScriptOutputConcatenatedBuffers | ScriptOutputConcatenatedText

export type ScriptOutputConcatenatedBuffers = {
  error?: unknown
  exitCode: number
  stderr: Buffer
  stdout: Buffer
}

export type ScriptOutputConcatenatedText = {
  error?: unknown
  exitCode: number
  stderr: string
  stdout: string
}

export type ScriptOutputDefault = {
  exitCode: number
}

export type ScriptPromise = Promise<{ exitCode: number }> & {
  allowInput: () => ScriptPromiseInputAllowed
  captureOutput: ScriptPromiseOutputCapturedFunction
}

export type ScriptPromiseInputAllowed = Promise<ScriptOutputDefault> & { captureOutput: ScriptPromiseInputAllowedOutputCapturedFunction }

export type ScriptPromiseInputAllowedOutputCapturedFunction = {
  (): Promise<ScriptOutputCaptured> & { concat: ScriptPromiseInputAllowedOutputConcatenatedFunction }
}

export type ScriptPromiseInputAllowedOutputConcatenatedFunction = {
  (): Promise<ScriptOutputConcatenatedBuffers> & { text: () => Promise<ScriptOutputConcatenatedText> }
}

export type ScriptPromiseOutputCapturedFunction = {
  (): Promise<ScriptOutputCaptured> & { allowInput: ScriptPromiseInputAllowedOutputCapturedFunction; concat: ScriptPromiseOutputConcatenatedFunction }
}

export type ScriptPromiseOutputConcatenatedFunction = {
  (): Promise<ScriptOutputConcatenatedBuffers> & { allowInput: () => Promise<ScriptOutputConcatenated>; text: ScriptPromiseOutputConcatenatedTextFunction }
}

export type ScriptPromiseOutputConcatenatedTextFunction = {
  (): Promise<ScriptOutputConcatenatedText> & { allowInput: () => Promise<ScriptOutputConcatenatedText> }
}

const ScriptCommandType = {
  ChildProcess: 'child-process',
  CLICommand: 'cli-command',
  Internal: 'internal',
}

const ScriptConcatenation = {
  Buffers: 0,
  Text: 1,
}

const concatenateCapturedOutput = (output: ScriptCommandCapturedOutput[], concatenation: number): Partial<ScriptOutputConcatenated> => {
  const stderr: (Buffer | string)[] = []
  const stdout: (Buffer | string)[] = []

  for (const command of output) {
    if (command.stderr) stderr.push(command.stderr)

    if (command.stdout) stdout.push(command.stdout)
    else if (command.output) stdout.push(command.output instanceof Buffer || typeof command.output === 'string' ? command.output : format('%s', command.output))
  }

  if (concatenation === ScriptConcatenation.Text) {
    return {
      stderr: stderr.map((value) => value instanceof Buffer ? value.toString() : value).join(''),
      stdout: stdout.map((value) => value instanceof Buffer ? value.toString() : value).join(''),
    }
  }

  return {
    stderr: Buffer.concat(stderr.map((value) => value instanceof Buffer ? value : Buffer.from(value))),
    stdout: Buffer.concat(stdout.map((value) => value instanceof Buffer ? value : Buffer.from(value))),
  }
}

const determineScriptCLICommandName = (run: Run) => {
  const cliDirectoryPath = parse(run.cliScriptPath).dir
  const commandFilePathLine = new Error().stack!.split('\n').find(line => line.includes(cliDirectoryPath))
  let name: string | undefined

  if (commandFilePathLine) {
    const nameString = commandFilePathLine.slice(commandFilePathLine.indexOf(cliDirectoryPath) + cliDirectoryPath.length).split(sep).find(value => !!value)

    if (nameString) name = nameString.includes('.ts') ? nameString.slice(0, nameString.indexOf('.ts')) : nameString
  }

  return name
}

export const parseScript = (raw: string) => {
  const script = normalizeLineBreaks(raw.trim())
  const scriptLength = script.length
  const sequence: (string | string[])[] = []
  let concurrent: string[] | undefined
  let command = ''
  let quote: string | undefined

  for (let i = 0; i < scriptLength; i++) {
    const character = script[i]

    if (quote) {
      command += character
      if (character === quote) quote = undefined
    } else if (character === '#') {
      const nextLineBreakIndex = script.indexOf(EOL_POSIX, i)

      i = nextLineBreakIndex === -1 ? scriptLength - 1 : nextLineBreakIndex - 1
    } else if (character === '+') {
      const isConcurrentOperator = script[i + 1] === '.'

      command = command.trim()

      if (isConcurrentOperator) {
        if (!concurrent) concurrent = []

        if (command) {
          concurrent.push(command)
          command = ''
        }

        i++
      } else if (command) {
        if (concurrent) {
          if (concurrent.length > 0) {
            concurrent.push(command)
            sequence.push(concurrent)
          } else sequence.push(command)

          concurrent = undefined
        } else sequence.push(command)

        command = ''
      } else if (concurrent) {
        if (concurrent.length > 0) sequence.push(concurrent.length === 1 ? concurrent[0] : concurrent)
        concurrent = undefined
      }
    } else if (character === EOL_POSIX) {
      command = command.trim()

      if (command) {
        if (concurrent && concurrent.length > 0) {
          concurrent.push(command)
          sequence.push(concurrent)
        } else sequence.push(command)
      } else if (concurrent && concurrent.length > 0) sequence.push(concurrent.length === 1 ? concurrent[0] : concurrent)

      command = ''
      concurrent = undefined
    } else {
      command += character
      if (character === '"' || character === "'") quote = character
    }
  }

  if (quote) command += quote

  command = command.trim()

  if (command) {
    if (concurrent && concurrent.length > 0) {
      concurrent.push(command)
      sequence.push(concurrent)
    } else sequence.push(command)
  } else if (concurrent && concurrent.length > 0) sequence.push(concurrent.length === 1 ? concurrent[0] : concurrent)

  return sequence
}

export const runScript = (script: string, run?: Run): ScriptPromise => {
  const commands = parseScript(script)
  const context: ScriptCommandContext = {}
  let error: unknown | undefined
  let exitCode = 0
  let concatenation: number | undefined

  if (run) context.commandName = determineScriptCLICommandName(run)

  const promise = (async (): Promise<unknown> => {
    await null

    if (commands.length > 0) {
      for (const item of commands) {
        if (Array.isArray(item)) {
          const commandsOutput: ScriptCommandOutput[] = await Promise.all((item as string[]).map((command) => runScriptCommand(command, context, run)))

          if (context.captureOutput === true) context.capturedOutput!.push(...(commandsOutput as ScriptCommandCapturedOutput[]))

          for (const commandOutput of commandsOutput) {
            if (context.captureOutput === true) {
              const commandCapturedOutput = commandOutput as ScriptCommandCapturedOutput

              if (commandCapturedOutput.exitCode) exitCode = commandCapturedOutput.exitCode

              if (commandCapturedOutput.error) {
                error = commandCapturedOutput.error

                if (!exitCode) exitCode = SIGHUP
              }
            } else if (commandOutput) exitCode = commandOutput as number

            if (exitCode) break
          }
        } else {
          const commandOutput = await runScriptCommand(item as string, context, run)

          if (context.captureOutput) {
            const commandCapturedOutput = commandOutput as ScriptCommandCapturedOutput

            context.capturedOutput!.push(commandCapturedOutput)

            if (commandCapturedOutput.exitCode) exitCode = commandCapturedOutput.exitCode

            if (commandCapturedOutput.error) {
              error = commandCapturedOutput.error

              if (!exitCode) exitCode = SIGHUP
            }
          } else if (commandOutput) exitCode = commandOutput as number
        }

        if (exitCode) break
      }
    }

    if (context.captureOutput) {
      const output = context.capturedOutput!
      const scriptOutput = { exitCode } as ScriptOutputCaptured

      if (error) scriptOutput.error = error

      if (concatenation !== undefined) return { ...scriptOutput, ...concatenateCapturedOutput(output, concatenation) }

      return { ...scriptOutput, output }
    }

    return { exitCode }
  })()

  return Object.assign(promise, {
    allowInput: () => {
      context.allowInput = true

      Object.assign(promise, { allowInput: undefined })

      return promise
    },
    captureOutput: () => {
      context.captureOutput = true
      context.capturedOutput = []

      Object.assign(promise, {
        captureOutput: undefined,
        concat: () => {
          concatenation = ScriptConcatenation.Buffers

          Object.assign(promise, {
            concat: undefined,
            text: () => {
              concatenation = ScriptConcatenation.Text

              Object.assign(promise, { text: undefined })

              return promise
            },
          })

          return promise
        },
      })

      return promise
    },
  }) as ScriptPromise
}

const runScriptCommand = async (command: string, context: ScriptCommandContext, run?: Run): Promise<ScriptCommandOutput> => {
  const { captureOutput, commandName } = context
  const name = getCommandName(command)

  if (name === InternalCommand.ChangeDirectory) {
    const [_, path] = parseCommand(command)

    if (path) chdir(path)

    return captureOutput ? { command, type: ScriptCommandType.Internal } : undefined
  }

  if (name === InternalCommand.Help && run) {
    const usage = commandName ? composeCommandUsageInformation(commandName, run) : composeMainUsageInformation(run)
    let output: ScriptCommandOutput | undefined

    if (captureOutput) output = { command, stdout: usage, type: ScriptCommandType.Internal }
    else process.stdout.write(usage)

    return output
  }

  if (name === InternalCommand.CreateShellAliases && run) {
    await createShellAliasesScripts(run)

    return captureOutput ? { command, type: ScriptCommandType.Internal } : undefined
  }


  if (run && run.commands[name] && context.commandName && commandName !== name) {
    const { captureOutput, capturedOutput, commandName } = context

    try {
      const commandOutput = await runCLICommand(command, run, { captureOutput, capturedOutput, commandName: commandName })

      if (captureOutput) return { command, type: ScriptCommandType.CLICommand, ...(commandOutput ?? {}) }

      return commandOutput && commandOutput.exitCode ? commandOutput.exitCode : undefined
    } catch (error) {
      if (captureOutput) return { command, error, exitCode: SIGHUP, type: ScriptCommandType.CLICommand }

      throw Object.assign(new Error(`Script command ${bold(command)} has thrown an error`), { cause: error, command, name: 'ScriptError' })
    }
  }

  const childProcessOutput = await runChildProcess(command, run, context)
  let { error, exitCode } = childProcessOutput

  if (error) {
    if (!exitCode) exitCode = SIGHUP

    if (error instanceof Error && Object.hasOwn(error, 'code')) {
      const { code } = error as ErrorWithCode

      if ((code === ErrorCode.Abort && run?.abortController?.signal.aborted) || code === ErrorCode.NoEntity) {
        error = undefined

        if (code === ErrorCode.NoEntity) {
          let message: string

          if ([InternalCommand.Help, InternalCommand.CreateShellAliases].includes(name)) message = `Running ${bold(name)} requires a CLI script.`
          else {
            message = `No ${run
              ? `command named ${bold(name)} is defined and no `
              : ''}executable named ${bold(name)} ${run && run.hasProjectExecutables
                ? 'was found in project dependencies or was resolved on the system.'
                : 'found.'
              }`
          }

          message += `${EOL.repeat(2)}${documentationLinkLine(DocumentationLink.Scripts)}\n`

          if (captureOutput) return { command, exitCode, stderr: message, type: ScriptCommandType.ChildProcess }
          else process.stderr.write(message)
        }
      }
    }
  }

  const output: ScriptCommandOutput = { command, type: ScriptCommandType.ChildProcess }

  if (captureOutput) {
    const { stderr, stdout } = childProcessOutput

    if (error) output.error = error
    if (exitCode !== 0) output.exitCode = exitCode
    if (stderr) output.stderr = stderr
    if (stdout) output.stdout = stdout

    return output
  } else if (error) throw Object.assign(new Error(`Script child process ${bold(command)} has thrown an error`), { cause: error, command, name: 'ScriptError' })

  if (exitCode) return exitCode
}

import { runCommand } from './commands.ts'
import type { Run } from './run.ts'
import { bold, EOL, EOL_POSIX, ExitCode, isObject, normalizeLineBreaks, parse, sep, toString } from './shared.ts'
import type { CommandResult, ScriptContext, ScriptOutputCaptureFunctionArguments, ScriptPromise } from './types.ts'

export const ScriptErrorsCapture = {
  All: 'all',
  First: 'first'
} as const

export type ScriptErrorsCapture = (typeof ScriptErrorsCapture)[keyof typeof ScriptErrorsCapture]

export const ScriptOutputType = {
  Buffers: 'buffers',
  JSON: 'json',
  Results: 'results',
  Text: 'text',
} as const

export type ScriptOutputType = (typeof ScriptOutputType)[keyof typeof ScriptOutputType]

export type ScriptResult = {
  error?: unknown
  errors?: unknown[]
  exitCode: number
}

const resolveCommandError = (result: CommandResult) => {
  let { error } = result

  if (!error && result.stderr) {
    const stderrString = String(result.stderr)

    if (stderrString) error = stderrString
  }

  if (!error) {
    let { command, exitCode } = result

    error = `The command ${bold(command.join(' '))} exited with code ${exitCode}\n`
  }

  return error
}

const determineScriptCommandName = (run: Run) => {
  const cliDirectoryPath = parse(run.cliScriptPath).dir
  const tscliPathName = new URL(import.meta.url).pathname
  const commandFilePathLine = new Error().stack!.split('\n').find(line => line.includes(cliDirectoryPath) && !line.includes(tscliPathName))
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
        if (concurrent.length > 0) sequence.push(concurrent.length === 1 ? concurrent[0] as string : concurrent)
        concurrent = undefined
      }
    } else if (character === EOL_POSIX) {
      command = command.trim()

      if (command) {
        if (concurrent && concurrent.length > 0) {
          concurrent.push(command)
          sequence.push(concurrent)
        } else sequence.push(command)
      } else if (concurrent && concurrent.length > 0) sequence.push(concurrent.length === 1 ? concurrent[0] as string : concurrent)

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
  } else if (concurrent && concurrent.length > 0) sequence.push(concurrent.length === 1 ? concurrent[0] as string : concurrent)

  return sequence
}

export const runScript = (script: string, run: Run): ScriptPromise => {
  const commands = parseScript(script)
  const context: ScriptContext = { capture: { errors: false, input: false, output: false }, script, parentCommand: determineScriptCommandName(run)! }
  const promise = (async () => {
    await null

    const { capture } = context
    const result: ScriptResult = { exitCode: 0 }

    if (capture.output) context.commandResults = []

    for (const item of commands) {
      if (run.abortSignal.aborted) break

      if (Array.isArray(item)) {
        const concurrentCommandResults = await Promise.all((item as string[]).map((command) => runCommand(command, run, context)))
        const errorResults = concurrentCommandResults.filter(({ error, exitCode }) => error || exitCode)

        if (capture.output) context.commandResults!.push(...concurrentCommandResults)

        if (errorResults.length > 0) {
          const firstErrorResult = errorResults[0]!

          if (!result.exitCode) result.exitCode = firstErrorResult.exitCode || ExitCode.Failure

          if (capture.errors === ScriptErrorsCapture.All) {
            result.errors ??= []
            result.errors.push(...errorResults.map(resolveCommandError))
          } else if (capture.errors === ScriptErrorsCapture.First) {
            result.error = resolveCommandError(firstErrorResult)
            break
          } else {
            const error = errorResults.find(({ error }) => !!error)?.error

            if (error) throw error
            else break
          }
        }
      } else {
        const commandResult = await runCommand(item as string, run, context)

        if (capture.output) context.commandResults!.push(commandResult)

        if (commandResult.error || commandResult.exitCode) {
          if (!result.exitCode) result.exitCode = commandResult.exitCode || ExitCode.Failure

          if (capture.errors === ScriptErrorsCapture.All) {
            result.errors ??= []
            result.errors.push(resolveCommandError(commandResult))
          } else if (capture.errors === ScriptErrorsCapture.First) {
            result.error = resolveCommandError(commandResult)
            break
          } else if (commandResult.error) throw commandResult.error
          else break
        }
      }
    }

    if (capture.output) {
      switch (capture.output) {
        case ScriptOutputType.Buffers: {
          let stderrBuffer = Buffer.alloc(0)
          let stdoutBuffer = Buffer.alloc(0)

          for (const { output, stderr, stdout } of context.commandResults!) {
            if (stderr) stderrBuffer = Buffer.concat([stderrBuffer, stderr instanceof Buffer ? stderr : Buffer.from(stderr)])
            if (stdout) stdoutBuffer = Buffer.concat([stdoutBuffer, stderr instanceof Buffer ? stderr : Buffer.from(stdout)])
            else if (output) stdoutBuffer = Buffer.concat([stdoutBuffer, output instanceof Buffer ? output : Buffer.from(toString(output))])
          }

          return { ...result, stderr: stderrBuffer, stdout: stdoutBuffer }
        }

        case ScriptOutputType.Results:
          return result

        case ScriptOutputType.JSON: {
          const strings: string[] = []
          let json: JSON | JSON[] = []

          for (const { output, stderr, stdout } of context.commandResults!) {
            const stderrString = stderr ? stderr instanceof Buffer ? stderr.toString() : toString(stderr) : ''
            const stdoutString = stdout
              ? stdout instanceof Buffer ? stdout.toString() : toString(stdout)
                ? output ? output instanceof Buffer : (output as Buffer).toString() : toString(output) :
              ''

            if (stderrString) strings.push(String(stderrString))
            if (stdoutString) strings.push(String(stdoutString))
          }

          for (const string of strings) {
            try {
              json.push(JSON.parse(string))
            } catch (error) {
              process.stderr.write(toString(error))
            }
          }

          if (json.length === 1) json = json[0]!

          return capture.errors ? { ...result, json } : json
        }

        case ScriptOutputType.Text: {
          const textStrings: string[] = []

          for (const { output, stderr, stdout } of context.commandResults!) {
            const stdoutString = stdout
              ? stdout instanceof Buffer ? stdout.toString() : toString(stdout)
                ? output ? output instanceof Buffer : (output as Buffer).toString() : toString(output) :
              ''

            if (stderr && !capture.errors) process.stderr.write(stderr instanceof Buffer ? stderr.toString() : toString(stdout))
            if (stdoutString) textStrings.push(String(stdoutString))
          }

          const text = textStrings.join('')

          return capture.errors ? { ...result, text } : text
        }
      }
    }

    return result
  })()

  return Object.assign(promise, {
    // TODO: Throw error for bad arguments?
    capture: (args?: ScriptOutputCaptureFunctionArguments) => {
      const { capture } = context

      capture.errors = ScriptErrorsCapture.First
      capture.output = ScriptOutputType.Results

      if (args) {
        if (isObject(args)) {
          const { errors, input, output } = args

          if (errors !== undefined) {
            if (errors === false || Object.values(ScriptErrorsCapture).includes(errors)) capture.errors = errors
            else process.stderr.write(`Invalid errors value: ${bold(toString(errors))}${EOL}`)
          }

          if (input !== undefined) {
            if (input === true) capture.input = true
            else if (input !== false) process.stderr.write(`Invalid input value: ${bold(toString(input))}${EOL}`)
          }

          if (output !== undefined) {
            if (output === false || Object.values(ScriptOutputType).includes(output)) capture.output = output
            else process.stderr.write(`Invalid output value: ${bold(toString(output))}${EOL}`)
          }
        } else process.stderr.write(`Invalid capture arguments value: ${bold(toString(args))}${EOL}`)
      }

      return promise
    }
  }) as ScriptPromise
}

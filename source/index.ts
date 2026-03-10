import { bold } from './ansi.ts'
import { cliDefinitionErrorMessage, CLIVariable, parseCLIDefinition } from './definition.ts'
import { argv, EOL, parse, process, SIGHUP, SIGINT } from './external.ts'
import { DocumentationLink, documentationLinkLine } from './links.ts'
import { abort, composeRunErrorMessage, executeRunCommands, getRuntime, prepareRun, type Run, Runtime } from './run.ts'
import { runScript, type ScriptPromise } from './scripts.ts'
import { composeMainUsageInformation } from './usage.ts'
import { hasDenoReadPermissions, splitLineOnLineBreaks } from './utilities.ts'

/**
 * A template literal tag function that parses a CLI definition and executes command-line commands or outputs usage information
 *
 * @returns - A promise that resolves when the run is complete
 */
export const tscli = async (strings: TemplateStringsArray, ...values: unknown[]): Promise<void> => {
  const cliDefinitionLines = splitLineOnLineBreaks(String.raw(strings, ...values))

  if (cliDefinitionLines[0]!.trim() === '') cliDefinitionLines.shift()

  const parsedCLIDefinition = parseCLIDefinition(cliDefinitionLines)
  const { errors } = parsedCLIDefinition

  if (errors) abort(cliDefinitionErrorMessage(cliDefinitionLines, errors))

  run = prepareRun(argv, parsedCLIDefinition)

  const { variables } = run
  const runtime = getRuntime()
  const runtimeRequired = variables[CLIVariable.RuntimeRequired]

  if (runtimeRequired && runtime !== runtimeRequired) abort(`CLI script must be run with ${bold(runtimeRequired)}. Change, remove or comment out the ${bold(CLIVariable.RuntimeRequired)} variable in the CLI definition to use ${bold(runtime)} instead.${EOL.repeat(2)}${documentationLinkLine(DocumentationLink.CLIVariables)}`)

  if (run.commandValues.length === 0) process.stdout.write(composeMainUsageInformation(run))
  else {
    const cliDirectoryPath = parse(run.cliScriptPath).dir

    if (runtime === Runtime.Deno) if (!await hasDenoReadPermissions(cliDirectoryPath)) abort(`Deno read permissions are required for ${bold(cliDirectoryPath)}.`)

    const abortController = run.abortController = new AbortController()
    let exitCode = 0

    process.once('SIGINT', () => {
      abortController.abort()
      process.exitCode = SIGINT
      process.exit()
    })

    try {
      exitCode = await executeRunCommands(run)
    } catch (error: unknown) {
      process.stderr.write(await composeRunErrorMessage(error, run))

      if (!exitCode) exitCode = SIGHUP
    }

    if (exitCode) {
      abortController.abort()
      process.exitCode = exitCode
      process.exit()
    }
  }
}

/**
 * A template literal tag function that parses and executes a commands script
 *
 * @returns - A ScriptPromise
 */
tscli.$ = (strings: TemplateStringsArray, ...values: unknown[]): ScriptPromise => runScript(String.raw(strings, ...values), run)

let run: Run | undefined

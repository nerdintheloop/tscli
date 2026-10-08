import { sanitizeConfiguration } from './configuration.ts'
import { executeRun, prepareRun, type Run } from './run.ts'
import { runScript } from './scripts.ts'
import { argv, bold, dim, EOL, italic } from './shared.ts'
import type { Configuration } from './types.ts'

export const tscli = (strings: TemplateStringsArray, ...values: unknown[]) => {
  let configuration: Configuration | undefined

  queueMicrotask(() => {
    run = prepareRun(argv as [string, string, ...string[]], String.raw(strings, ...values).trim(), configuration)
    executeRun(run)
  })

  return (c: Configuration) => void (configuration = sanitizeConfiguration(c))
}

tscli.$ = (strings: TemplateStringsArray, ...values: unknown[]) => {
  const script = String.raw(strings, ...values)

  if (!run) {
    process.stderr.write(`The following ${bold('tscli.$')} script can only be run inside of a command function:${EOL.repeat(2)}${italic(`${dim('tscli.$`')}${script}${dim('`')}`)}${EOL.repeat(2)}`)
    process.exit()
  }

  return runScript(script, run)
}

let run: Run | undefined

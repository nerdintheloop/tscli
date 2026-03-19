import { parseCommand } from './commands.ts'
import { CLIVariable } from './definition.ts'
import { Buffer, env, platform, SIGHUP, spawn, spawnSync, type SpawnOptions } from './external.ts'
import { getProjectExecutablePath, hasProjectExecutablesDirectory } from './paths.ts'
import { getRuntime, Runtime, type Run } from './run.ts'
import { ScriptCommandContext } from './scripts.ts'
import { collapseWhitespace, isObject } from './utilities.ts'

export type ChildProcessContext = {
  allowInput?: boolean
  captureOutput?: boolean
}

export type ChildProcessOutput = {
  error?: Error
  exitCode: number
  stderr?: Buffer
  stdout?: Buffer
}

export const ErrorCode = {
  Abort: 'ABORT_ERR',
  NoEntity: 'ENOENT',
}

export const Stdio = {
  Ignore: 'ignore',
  Inherit: 'inherit',
  Pipe: 'pipe',
}

export const runChildProcess = async (command: string, run?: Run, scriptContext?: ScriptCommandContext) => {
  const context: ChildProcessContext = {}

  if (run) {
    const { variables } = run

    run.childProcessEnvironmentVariables ??= variables[CLIVariable.ChildProcessEnv]
      ? Object.fromEntries(collapseWhitespace(variables[CLIVariable.ChildProcessEnv]!).split(' ').map((name) => [name, env[name]]).filter(([, value]) => value !== undefined))
      : true
    run.resolvedExecutablePaths ??= {}
  }

  if (context.allowInput) context.allowInput = true
  if (scriptContext?.captureOutput) context.captureOutput = true

  try {
    const [name, ...args] = parseCommand(command)
    const runtime = getRuntime()
    const childProcessFunction = runtime === Runtime.Bun ? runChildProcessBun : runtime === Runtime.Deno ? runChildProcessDeno : runChildProcessNode
    let executablePath: string | undefined

    if (run) {
      if (run.resolvedExecutablePaths && run.resolvedExecutablePaths[name]) executablePath = run.resolvedExecutablePaths[name]

      if (!executablePath) {
        executablePath = await getProjectExecutablePath(run.cliScriptPath, name)

        if (executablePath) {
          run.resolvedExecutablePaths ??= {}
          run.resolvedExecutablePaths[name] = executablePath
        }
      }
    }

    return childProcessFunction(name, args, context, run, executablePath)
  } catch (error) {
    return { error } as ChildProcessOutput
  }
}

export const runChildProcessBun = async (name: string, args: string[], context: ChildProcessContext, run?: Run, executablePath?: string): Promise<ChildProcessOutput> => {
  let executable = executablePath || name

  if (!executablePath && run) {
    const resolvedExecutablePath = Bun.which(name)

    if (resolvedExecutablePath) {
      executable = resolvedExecutablePath
      run.resolvedExecutablePaths ??= {}
      run.resolvedExecutablePaths[name] = resolvedExecutablePath
    } else return { error: Object.assign(new Error(), { code: ErrorCode.NoEntity }), exitCode: SIGHUP }
  }

  const commandOptions = { cmd: [executable, ...args] }

  if (run && isObject(run.childProcessEnvironmentVariables)) Object.assign(commandOptions, { env: run.childProcessEnvironmentVariables })

  if (context?.captureOutput) {
    const { exitCode, stderr, stdout } = Bun.spawnSync(commandOptions)
    const output: ChildProcessOutput = { exitCode }

    if (stderr.length > 0) output.stderr = stderr
    if (stdout.length > 0) output.stdout = stdout

    return output
  }

  return await new Promise<ChildProcessOutput>((resolve) => {
    const childProcess = Bun.spawn({
      ...commandOptions,
      onExit: (_, exitCode, __, error) => {
        const output: ChildProcessOutput = { exitCode: exitCode ?? SIGHUP }

        if (error) output.error = error

        if (run && run.abortController) run.abortController.signal.removeEventListener('abort', handleAbort)

        resolve(output)
      },
      stdin: context?.allowInput ? Stdio.Inherit : null,
      stdout: Stdio.Inherit,
    })
    const handleAbort = () => void childProcess.kill()

    if (run && run.abortController) run.abortController.signal.addEventListener('abort', handleAbort, { once: true })
  })
}

export const runChildProcessDeno = async (name: string, args: string[], context: ChildProcessContext, run?: Run, executablePath?: string): Promise<ChildProcessOutput> => {
  const commandOptions: Deno.CommandOptions = { args }
  let executable = executablePath || name

  if (!context.allowInput) commandOptions.stdin = 'null'

  if (run) {
    const { abortController, childProcessEnvironmentVariables } = run

    if (abortController) commandOptions.signal = abortController.signal

    if (isObject(childProcessEnvironmentVariables)) Object.assign(commandOptions, { clearEnv: true, env: childProcessEnvironmentVariables })
  }

  try {
    const denoCommand = new Deno.Command(executable, commandOptions)

    if (context.captureOutput) {
      const { code, stderr, stdout } = await denoCommand.output()
      const output: ChildProcessOutput = { exitCode: code }

      if (stderr.length > 0) output.stderr = Buffer.from(stderr)
      if (stdout.length > 0) output.stdout = Buffer.from(stdout)

      return output
    }

    return { exitCode: (await denoCommand.spawn().output()).code }
  } catch (_) {
    if (run) {
      const { cliScriptPath } = run

      run.hasProjectExecutables ??= await hasProjectExecutablesDirectory(cliScriptPath)

      if (run.hasProjectExecutables) {
        const projectExecutablePath = await getProjectExecutablePath(cliScriptPath, name)

        if (projectExecutablePath) {
          const denoCommand = new Deno.Command(projectExecutablePath, commandOptions)

          run.resolvedExecutablePaths ??= {}
          run.resolvedExecutablePaths[name] = projectExecutablePath

          if (context.captureOutput) {
            const { code, stderr, stdout } = await denoCommand.output()
            const output: ChildProcessOutput = { exitCode: code }

            if (stderr.length > 0) output.stderr = Buffer.from(stderr)
            if (stdout.length > 0) output.stdout = Buffer.from(stdout)

            return output
          }

          return { exitCode: (await denoCommand.spawn().output()).code }
        }
      }
    }

    return { error: Object.assign(new Error(), { code: ErrorCode.NoEntity }), exitCode: SIGHUP }
  }
}

export const runChildProcessNode = async (name: string, args: string[], context: ChildProcessContext, run?: Run, executablePath?: string): Promise<ChildProcessOutput> => {
  const commandOptions: SpawnOptions = {}
  const stdin = context.allowInput ? Stdio.Inherit : Stdio.Ignore
  let executable = executablePath || name

  if (platform === 'win32') Object.assign(commandOptions, { shell: true, windowsHide: true })

  if (run) {
    if (run.abortController) commandOptions.signal = run.abortController.signal

    if (isObject(run.childProcessEnvironmentVariables)) Object.assign(commandOptions, { env: run.childProcessEnvironmentVariables })
  }

  if (context.captureOutput) {
    const { error, signal, status, stderr, stdout } = await spawnSync(executable, args, { ...commandOptions, stdio: [stdin, Stdio.Pipe, Stdio.Pipe] })
    const output: ChildProcessOutput = { exitCode: signal ? SIGHUP : status! }

    if (error) output.error = error
    if (stderr) output.stderr = stderr
    if (stdout) output.stdout = stdout

    return output
  }

  return await new Promise((resolve) => {
    let error: Error | undefined

    spawn(executable, args, { ...commandOptions, stdio: [stdin, Stdio.Inherit, Stdio.Inherit] })
      .on('error', (value: unknown) => {
        error = value as Error
      })
      .on('close', (exitCode?: number) => {
        const output: ChildProcessOutput = { exitCode: exitCode ?? SIGHUP }

        if (error) output.error = error

        resolve(output)
      })
  })
}

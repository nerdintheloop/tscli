import { type Run } from './run.ts'
import { ExitCode, Stdio, env, getProjectExecutablePath, platform, spawn, type ChildProcessOutput, type SpawnOptions } from './shared.ts'

export const runChildProcessNode = async (name: string, args: string[], run: Run, captureInput: boolean, captureOutput: boolean): Promise<ChildProcessOutput> => {
  const { abortSignal, configuration, executablePaths } = run
  const output: ChildProcessOutput = { exitCode: 0 }
  let command = executablePaths[name]

  if (!command) {
    command = await getProjectExecutablePath(name)

    if (command) executablePaths[name] = command
    else command = name
  }

  run.env ??= { ...(configuration.preserveEnv === true ? env as Record<string, string> : configuration.preserveEnv === false ? {} : { PATH: env['PATH']! }), ...(configuration.env ?? {}) }

  const options: SpawnOptions = {
    env: run.env,
    signal: abortSignal,
    stdio: [captureInput ? Stdio.Inherit : null, captureOutput ? Stdio.Pipe : Stdio.Inherit, captureOutput ? Stdio.Pipe : Stdio.Inherit]
  }

  if (platform === 'win32') options.windowsHide = true

  output.exitCode = await new Promise((resolve) => {
    const childProcess = spawn(command, args, options)
      .on('error', (error) => output.error = error)
      .on('close', (exitCode?: number) => resolve(exitCode ?? ExitCode.Failure))

    if (captureOutput) {
      output.stderr = Buffer.alloc(0)
      output.stdout = Buffer.alloc(0)
      childProcess.stderr!.on('data', (buffer: Buffer) => void (output.stderr = Buffer.concat([output.stderr!, buffer])))
      childProcess.stdout!.on('data', (buffer: Buffer) => void (output.stdout = Buffer.concat([output.stderr!, buffer])))
    }
  })

  return output
}

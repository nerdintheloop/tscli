import { type Run } from './run.ts'
import { type ChildProcessOutput, ExitCode, Stdio, env, getProjectExecutablePath } from './shared.ts'

export const runChildProcessBun = async (name: string, args: string[], run: Run, captureInput: boolean, captureOutput: boolean): Promise<ChildProcessOutput> => {
  const { abortSignal, configuration, executablePaths } = run
  const output: ChildProcessOutput = { exitCode: 0 }
  let command: string | null | undefined = executablePaths[name] ?? await getProjectExecutablePath(name) ?? Bun.which(name)

  if (command) {
    executablePaths[name] ??= command
    run.env ??= { ...(configuration.preserveEnv === true ? env as Record<string, string> : configuration.preserveEnv === false ? {} : { PATH: env['PATH']! }), ...(configuration.env ?? {}) }

    const childProcess = Bun.spawn({
      cmd: [command, ...args],
      env: run.env,
      onExit: (_, __, ___, error) => {
        if (error) output.error = error
      },
      signal: abortSignal,
      stdio: [captureInput ? Stdio.Inherit : null, captureOutput ? Stdio.Pipe : Stdio.Inherit, captureOutput ? Stdio.Pipe : Stdio.Inherit],
    })

    if (captureOutput) {
      const [stderr, stdout] = await Promise.all([Bun.readableStreamToArrayBuffer(childProcess.stderr!), Bun.readableStreamToArrayBuffer(childProcess.stdout!)])

      output.stderr = Buffer.from(stderr)
      output.stdout = Buffer.from(stdout)
    }

    await childProcess.exited

    output.exitCode = childProcess.exitCode ?? ExitCode.Failure
  } else output.exitCode = ExitCode.NotFound

  return output
}

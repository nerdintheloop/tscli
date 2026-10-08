import { type Run } from './run.ts'
import { type ChildProcessOutput, ExitCode, Stdio, bold, env, getProjectExecutablePath } from './shared.ts'

export const hasDenoReadPermissions = async (path: string) => (await Deno.permissions.query({ name: 'read', path })).state === 'granted'

export const runChildProcessDeno = async (name: string, args: string[], run: Run, captureInput: boolean, captureOutput: boolean): Promise<ChildProcessOutput> => {
  if ((await Deno.permissions.query({ command: name, name: 'run' })).state !== 'granted') return { error: `Deno run permissions are required for ${bold(name)}`, exitCode: ExitCode.PermissionDenied }

  const { abortSignal, configuration, executablePaths } = run

  if (!run.env) {
    run.env = { ...(configuration.env ?? {}) }

    if (configuration.preserveEnv === undefined) {
      if ((await Deno.permissions.query({ name: 'env', variable: 'PATH' })).state === 'granted') run.env['PATH'] = env['PATH']!
      else return { error: `Deno env permissions are required for the ${bold('PATH')} environment variable`, exitCode: ExitCode.PermissionDenied }
    }
  }

  const output: ChildProcessOutput = { exitCode: 0 }
  const options: Deno.CommandOptions = {
    args,
    clearEnv: configuration.preserveEnv !== true,
    env: run.env,
    signal: abortSignal,
    stderr: captureOutput ? Stdio.Piped : Stdio.Inherit,
    stdin: captureInput ? Stdio.Inherit : 'null',
    stdout: captureOutput ? Stdio.Piped : Stdio.Inherit,
  }
  let command: string | undefined = executablePaths[name] ?? name

  try {
    const denoCommand = new Deno.Command(command, options)

    if (captureOutput) {
      const { code, stderr, stdout } = await denoCommand.output()

      output.exitCode = code
      output.stderr = Buffer.from(stderr)
      output.stdout = Buffer.from(stdout)
    } else output.exitCode = (await denoCommand.spawn().output()).code
  } catch (error) {
    command = await getProjectExecutablePath(name)

    if (command) {
      executablePaths[name] = command

      const denoCommand = new Deno.Command(command, options)

      if (captureOutput) {
        const { code, stderr, stdout } = await denoCommand.output()

        output.exitCode = code
        output.stderr = Buffer.from(stderr)
        output.stdout = Buffer.from(stdout)
      } else output.exitCode = (await denoCommand.spawn().output()).code
    } else output.exitCode = ExitCode.NotFound
  }

  return output
}

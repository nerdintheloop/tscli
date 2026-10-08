export type CommandFunction = (args: CommandFunctionArguments, context: CommandFunctionContext) => unknown

export type CommandFunctionArguments<A = any> = Record<string, boolean | number | string | string[]> & A

export type CommandFunctionContext = {
  command: [name: string, ...args: string[]]
  help: string
  script?: ScriptContext
  signal: AbortSignal
}

export type CommandResult = {
  command: [name: string, ...args: string[]],
  error?: unknown
  exitCode: number
  output?: unknown
  stderr?: Buffer | string
  stdout?: Buffer | string
  type: 'child-process' | 'command-function' | 'help' | 'internal'
}

export type Configuration = {
  alias?: string
  env?: Record<string, string>
  functions?: { '*'?: FallbackCommandFunction } & { [name: string]: CommandFunction }
  preserveEnv?: boolean
  runtime?: 'bun' | 'deno' | 'node',
  runtimeFlags?: string[]
}

export type FallbackCommandFunction = (commandName: string, args: CommandFunctionArguments, context: CommandFunctionContext) => unknown

export type ScriptContext = {
  capture: {
    errors: false | 'all' | 'first',
    input: boolean,
    output: false | 'buffers' | 'json' | 'results' | 'text'
  }
  commandResults?: CommandResult[]
  parentCommand: string
  script: string
}

export type ScriptOutputCaptureFunction = {
  (args?: { input?: true }): Promise<{ error?: unknown, exitCode: number, results: CommandResult[] }>
  (args: { input?: true, output: false }): Promise<{ error?: unknown, exitCode: number }>
  (args: { input?: true, output: 'buffers' }): Promise<{ error?: unknown, exitCode: number, stderr: Buffer, stdout: Buffer }>
  <T>(args: { input?: true, output: 'json' }): Promise<{ error?: unknown, exitCode: number, json: T }>
  (args: { input?: true, output: 'text' }): Promise<{ error?: unknown, exitCode: number, text: string }>
  (args: { errors: false, input?: true, output: false }): Promise<{ exitCode: number }>
  (args: { errors: false, input?: true, output: 'buffers' }): Promise<{ exitCode: number, stderr: Buffer, stdout: Buffer }>
  <T>(args: { errors: false, input?: true, output: 'json' }): Promise<{ exitCode: number, json: T }>
  (args: { errors: false, input?: true, output: 'text' }): Promise<{ exitCode: number, text: string }>
  (args: { errors: 'all', input?: true, output: false }): Promise<{ errors?: unknown[], exitCode: number }>
  (args: { errors: 'all', input?: true, output: 'buffers' }): Promise<{ errors?: unknown[], exitCode: number, stderr: Buffer, stdout: Buffer }>
  <T>(args: { errors: 'all', input?: true, output: 'json' }): Promise<{ errors?: unknown[], exitCode: number, json: T }>
  (args: { errors: 'all', input?: true, output: 'text' }): Promise<{ errors?: unknown[], exitCode: number, text: string }>
}

export type ScriptOutputCaptureFunctionArguments = {
  errors?: false | 'all',
  input?: true,
  output?: false | 'buffers' | 'json' | 'text'
}

export type ScriptPromise = Promise<{ exitCode: number }> & { capture: ScriptOutputCaptureFunction }

export type tscli = {
  (strings: TemplateStringsArray, ...values: unknown[]): (configuration: Configuration) => void
  $: (strings: TemplateStringsArray, ...values: unknown[]) => ScriptPromise
}

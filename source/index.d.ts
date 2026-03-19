import type { Buffer } from 'node:buffer'

export type ScriptCommandCapturedOutput = {
  command: string
  error?: unknown
  exitCode?: number
  output?: unknown
  stderr?: Buffer | string
  stdout?: Buffer | string
  type: 'child-process' | 'ts-command'
}

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

export type TSCommandError = Error & { command: string }

export type TSCommandFunction = (args: TSCommandFunctionArguments, context: TSCommandFunctionContext) => Promise<TSCommandOutput | unknown> | TSCommandOutput | unknown

export type TSCommandFunctionArguments = Record<string, boolean | number | string | string[]>

export type TSCommandFunctionContext = {
  command: string
  help: string
  script?: TSCommandScriptContext
  signal: AbortSignal
}

export type TSCommandOutput = {
  exitCode?: number
  output?: unknown
  stderr?: Buffer | string
  stdout?: Buffer | string
}

export type TSCommandScriptContext = {
  captureOutput?: true
  capturedOutput?: ScriptCommandCapturedOutput[]
  commandName: string
}

export const tscli: {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<void>
  $: (strings: TemplateStringsArray, ...values: unknown[]) => ScriptPromise
}

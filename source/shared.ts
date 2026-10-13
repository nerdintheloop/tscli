import { stat } from 'node:fs/promises'
import { constants, EOL } from 'node:os'
import { resolve } from 'node:path'
import { platform } from 'node:process'
import { format } from 'node:util'

const { SIGINT } = constants.signals

export { Buffer } from 'node:buffer'
export { spawn, type SpawnOptions } from 'node:child_process'
export { writeFile } from 'node:fs/promises'
export { parse, sep } from 'node:path'
export { argv, chdir, env, default as process } from 'node:process'
export { pathToFileURL } from 'node:url'
export { parseArgs, type ParseArgsConfig, type ParseArgsOptionsConfig } from 'node:util'
export { constants, EOL, format, platform, resolve, SIGINT, stat }

export const ANSICode = {
  Blue: 94,
  Bold: 1,
  Cyan: 96,
  Dim: 2,
  Green: 92,
  Italic: 3,
  Magenta: 95,
  Red: 91,
  RemoveBoldOrDim: 22,
  RemoveColor: 39,
  RemoveItalic: 23,
  Reset: 0,
  Yellow: 93
} as const

export type ANSICode = (typeof ANSICode)[keyof typeof ANSICode]

export type ChildProcessOutput = {
  error?: unknown
  exitCode: number
  stderr?: Buffer
  stdout?: Buffer
}

export const DocumentationPath = {
  Categories: '/categories',
  CLI: '/cli-definition',
  CLICommands: '/cli-commands',
  CLIVariables: '/cli-variables',
  CommandAliases: '/command-aliases',
  CommandDefinitions: '/command-definitions',
  CommandFunctions: '/command-functions',
  Installation: '/installation',
  Introduction: '',
  OptionArguments: '/option-arguments',
  PositionalArguments: '/positional-arguments',
  RestArgument: '/rest-argument',
  Run: '/run',
  Scripts: '/scripts',
  ShellAliases: '/shell-aliases',
} as const

export type DocumentationPath = (typeof DocumentationPath)[keyof typeof DocumentationPath]

export const ErrorCode = {
  Abort: 'ABORT_ERR',
  NoEntity: 'ENOENT',
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

export const ExitCode = {
  Failure: 1,
  UsageError: 2,
  PermissionDenied: 13,
  NotFound: 127,
  SignalOffset: 128,
} as const

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode]

export const RegularExpression = {
  CommandName: /^[a-z0-9][a-z0-9_-]*$/,
  DefinitionLineCommand: /^\s*([A-Za-z0-9][A-Za-z0-9_-]*)(\*)?(?:\s+([^#]*?))?\s*(?=#|$)/,
  DefinitionLineOptionArgument: /^\s*--([a-z0-9]+(?:-[a-z0-9]+)*)(?:\s+-([a-zA-Z0-9])?)?(?:\s+(number|string))?(?:\s+(.+?))?\s*$/,
  DefinitionLinePositionalArgument: /^\s*\.\s*([a-z0-9]+(?:-[a-z0-9]+)*)(?:\s+(number))?(?:\s+(.+?))?\s*$/,
  DefinitionLineRestArgument: /^\s*\.{3}([a-z0-9]+(?:-[a-z0-9]+)*)(?:\s+(string))?(?:\s+(.+?))?\s*$/
} as const

export type RegularExpression = (typeof RegularExpression)[keyof typeof RegularExpression]

export const Runtime = {
  Bun: 'bun',
  Deno: 'deno',
  Node: 'node',
} as const

export type Runtime = (typeof Runtime)[keyof typeof Runtime]

export const Shell = {
  Bash: 'bash',
  CommandPrompt: 'cmd',
  Default: 'sh',
  PowerShell: 'ps',
  Zsh: 'zsh'
} as const

export type Shell = (typeof Shell)[keyof typeof Shell]

export const Stdio = {
  Ignore: 'ignore',
  Inherit: 'inherit',
  Pipe: 'pipe',
  Piped: 'piped',
} as const

export type Stdio = (typeof Stdio)[keyof typeof Stdio]

export const ANSI_ESCAPE = '\x1b'

export const COLLAPSE_WHITESPACE_REGEX = /\s+/g

export const DOCUMENTATION_URL = 'https://tscli.nerdintheloop.com'

export const EOL_POSIX = '\n'

export const EOL_WINDOWS = '\r\n'

export const ansi = (code: ANSICode) => `${ANSI_ESCAPE}[${code}m`

export const blue = (string: string) => `${ansi(ANSICode.Blue)}${string}${ansi(ANSICode.RemoveColor)}`

export const bold = (string: string) => `${ansi(ANSICode.Bold)}${string}${ansi(ANSICode.RemoveBoldOrDim)}`

export const capitalize = (string: string) => string.charAt(0).toUpperCase() + string.slice(1)

export const collapseWhitespace = (string: string) => string.trim().replace(COLLAPSE_WHITESPACE_REGEX, ' ')

export const cyan = (string: string) => `${ansi(ANSICode.Cyan)}${string}${ansi(ANSICode.RemoveColor)}`

export const dim = (string: string) => `${ansi(ANSICode.Dim)}${string}${ansi(ANSICode.RemoveBoldOrDim)}`

export const firstExistingFilePath = async (...filePaths: string[]) => {
  for (const filePath of filePaths) {
    if (await isExistingFilePath(filePath)) return filePath
  }

  return undefined
}

const getPathStats = async (path: string) => {
  try {
    return await stat(path)
  } catch (_) {
    return undefined
  }
}

export const getProjectExecutablePath = (name: string) => {
  const executablesDirectoryPath = resolve(new URL('../..', import.meta.url).pathname, ".bin")
  const possibleExecutablePaths = [resolve(executablesDirectoryPath, name)]

  if (platform === 'win32') possibleExecutablePaths.unshift(resolve(executablesDirectoryPath, `${name}.cmd`), resolve(executablesDirectoryPath, `${name}.exe`))

  return firstExistingFilePath(...possibleExecutablePaths)
}

export const green = (string: string) => `${ansi(ANSICode.Green)}${string}${ansi(ANSICode.RemoveColor)}`

export const isExistingFilePath = async (path: string) => (await getPathStats(path))?.isFile() ?? false

export const isObject = (value: unknown) => typeof value === 'object' && value !== null && !Array.isArray(value)

export const isProjectDirectoryPath = async (path: string, runtime: string) => (runtime === Runtime.Deno && await isExistingFilePath(resolve(path, 'deno.json')) || await isExistingFilePath(resolve(path, 'package.json')))

export const italic = (string: string) => `${ansi(ANSICode.Italic)}${string}${ansi(ANSICode.RemoveItalic)}`

export const magenta = (string: string) => `${ansi(ANSICode.Magenta)}${string}${ansi(ANSICode.RemoveColor)}`

export const normalizeLineBreaks = (line: string) => line.replaceAll(EOL_WINDOWS, EOL_POSIX)

export const red = (string: string) => `${ansi(ANSICode.Red)}${string}${ansi(ANSICode.RemoveColor)}`

export const splitLineOnLineBreaks = (line: string) => normalizeLineBreaks(line).split(EOL_POSIX)

export const toString = (value: unknown) => format('%s', value)

export const yellow = (string: string) => `${ansi(ANSICode.Yellow)}${string}${ansi(ANSICode.RemoveColor)}`

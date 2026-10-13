import { cp as _cp, mkdir as _mkdir, rm } from 'node:fs/promises'
import { EOL } from 'node:os'
import { parse, resolve } from 'node:path'
import { default as process } from 'node:process'
import { format } from 'node:util'
import { type CommandFunctionContext } from '../source/types.ts'
import { PROJECT_DIRECTORY_PATH } from './shared.ts'

type FileSystemFunctionArguments = {
  paths?: string[]
}

export type LogTaskFunctionArguments = {
  error?: boolean
  label: string
  message: string
  startTimer?: boolean
  stopTimer?: boolean
  success?: boolean
  wait?: boolean
}

export const AnsiCode = {
  Bold: 1,
  BrightBlue: 94,
  BrightCyan: 96,
  BrightGreen: 92,
  BrightRed: 91,
  BrightYellow: 93,
  RemoveBold: 22,
  RemoveColor: 39,
} as const

export type AnsiCode = (typeof AnsiCode)[keyof typeof AnsiCode]

export const LogMessageIcon = {
  Error: '✘',
  Info: '•',
  Success: '✔',
  Wait: '⏳︎',
} as const

export type LogMessageIcon = (typeof LogMessageIcon)[keyof typeof LogMessageIcon]

export const ANSI_SEQUENCE_PREFIX = '\x1b['

export const ANSI_SEQUENCE_SUFFIX = 'm'

export const ansi = (code: AnsiCode) => `${ANSI_SEQUENCE_PREFIX}${code}${ANSI_SEQUENCE_SUFFIX}`

export const blue = (string: string) => `${ansi(AnsiCode.BrightBlue)}${string}${ansi(AnsiCode.RemoveColor)}`

export const bold = (string: string) => `${ansi(AnsiCode.Bold)}${string}${ansi(AnsiCode.RemoveBold)}`

export const cp = async ({ paths }: FileSystemFunctionArguments) => {
  if (paths && paths.length > 1) {
    const destinationPath = resolve(PROJECT_DIRECTORY_PATH, paths.pop()!)
    const destinationIsDirectory = await isDirectory(destinationPath)

    await Promise.all(paths.map(async path => {
      const sourcePath = resolve(PROJECT_DIRECTORY_PATH, path)
      const destinationFilePath = destinationIsDirectory ? resolve(destinationPath, parse(sourcePath).base) : destinationPath

      await _cp(sourcePath, destinationFilePath, { force: true, recursive: true })
    }))
  }
}

export const cyan = (string: string) => `${ansi(AnsiCode.BrightCyan)}${string}${ansi(AnsiCode.RemoveColor)}`

export const green = (string: string) => `${ansi(AnsiCode.BrightGreen)}${string}${ansi(AnsiCode.RemoveColor)}`

const isDirectory = async (path: string): Promise<boolean> => {
  try {
    return (await Bun.file(path).stat()).isDirectory()
  } catch {
    return false
  }
}

export const log = ({ error, label, message, startTimer, stopTimer, success, wait }: LogTaskFunctionArguments, { script }: CommandFunctionContext) => {
  const icon = error ? LogMessageIcon.Error : success ? LogMessageIcon.Success : wait ? LogMessageIcon.Wait : LogMessageIcon.Info
  let prefix = (error ? red : success ? green : wait ? yellow : blue)(`${icon} ${label ?? ''} `)

  if (startTimer || stopTimer) {
    const key = label || '__no_label__'

    if (stopTimer && startTimerTimes[key]) {
      const duration = Date.now() - startTimerTimes[key]

      if (!message) message = 'Completed'

      message = `${message} in ${duration > 1000 ? `${duration / 1000}s` : `${duration}ms`}`

      delete startTimerTimes[key]
    } else if (startTimer) {
      startTimerTimes[key] = Date.now()

      message ||= 'Started...'
    }
  }

  message ||= ''

  if (typeof message !== 'string') message = format(message)

  const output = `${prefix ? (message as string).split(EOL).map((line) => `${prefix}${line}`).join(EOL) : message}${EOL}`

  if (script?.capture.output) return script?.capture.output === 'buffers' ? { stdout: Buffer.from(output) } : output

  process[error ? 'stderr' : 'stdout'].write(output)
}

export const mkdir = async ({ paths }: FileSystemFunctionArguments) => {
  if (paths) await Promise.all(paths.map(path => _mkdir(resolve(PROJECT_DIRECTORY_PATH, path))))
}

export const red = (string: string) => `${ansi(AnsiCode.BrightRed)}${string}${ansi(AnsiCode.RemoveColor)}`

export const rmdir = async ({ paths }: FileSystemFunctionArguments) => {
  if (paths) await Promise.all(paths.map(path => rm(resolve(PROJECT_DIRECTORY_PATH, path), { force: true, recursive: true })))
}

export const yellow = (string: string) => `${ansi(AnsiCode.BrightYellow)}${string}${ansi(AnsiCode.RemoveColor)}`

const startTimerTimes: Record<string, number> = {}

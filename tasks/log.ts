import { type TSCommandFunctionContext } from '@nerdintheloop/tscli'
import { EOL } from 'node:os'
import { format } from 'node:util'

type LogTaskFunctionArguments = {
  alert: boolean
  blue: boolean
  bold: boolean
  check: boolean
  cross: boolean
  cyan: boolean
  green: boolean
  info?: boolean
  italic: boolean
  label?: string
  magenta: boolean
  message: string
  red: boolean
  timerStart: boolean
  timerStop: boolean
  yellow: boolean
  wait: boolean
}

enum AnsiCode {
  Blink = 5,
  Bold = 1,
  BrightBlue = 94,
  BrightCyan = 96,
  BrightGreen = 92,
  BrightMagenta = 95,
  BrightRed = 91,
  BrightYellow = 93,
  Dim = 2,
  Italic = 3,
  RemoveAll = 0,
  RemoveBlink = 25,
  RemoveBoldDim = 22,
  RemoveColor = 39,
  RemoveItalic = 23,
  RemoveUnderline = 24,
  Underline = 4
}

export enum LogMessageIcon {
  Alert = '!',
  Check = '✔',
  Cross = '✘',
  Info = '•',
  Wait = '⏳︎',
}

export const ANSI_SEQUENCE_PREFIX = '\x1b['

export const ANSI_SEQUENCE_SUFFIX = 'm'

export const ansi = (code: AnsiCode) => `${ANSI_SEQUENCE_PREFIX}${code}${ANSI_SEQUENCE_SUFFIX}`

export const blink = (string: string) => `${ansi(AnsiCode.Blink)}${string}${ansi(AnsiCode.RemoveBlink)}`

export const blue = (string: string) => `${ansi(AnsiCode.BrightBlue)}${string}${ansi(AnsiCode.RemoveColor)}`

export const bold = (string: string) => `${ansi(AnsiCode.Bold)}${string}${ansi(AnsiCode.RemoveBoldDim)}`

export const clearLine = () => process.stdout.write(`\r${ANSI_SEQUENCE_PREFIX}2K`)

export const cursorUp = (lineCount = 1) => `${ANSI_SEQUENCE_PREFIX}${lineCount}A`

export const cyan = (string: string) => `${ansi(AnsiCode.BrightCyan)}${string}${ansi(AnsiCode.RemoveColor)}`

export const dim = (string: string) => `${ansi(AnsiCode.Dim)}${string}${ansi(AnsiCode.RemoveBoldDim)}`

export const green = (string: string) => `${ansi(AnsiCode.BrightGreen)}${string}${ansi(AnsiCode.RemoveColor)}`

export const italic = (string: string) => `${ansi(AnsiCode.Italic)}${string}${ansi(AnsiCode.RemoveItalic)}`

export const magenta = (string: string) => `${ansi(AnsiCode.BrightMagenta)}${string}${ansi(AnsiCode.RemoveColor)}`

export const red = (string: string) => `${ansi(AnsiCode.BrightRed)}${string}${ansi(AnsiCode.RemoveColor)}`

export const underline = (string: string) => `${ansi(AnsiCode.Underline)}${string}${ansi(AnsiCode.RemoveUnderline)}`

export const yellow = (string: string) => `${ansi(AnsiCode.BrightYellow)}${string}${ansi(AnsiCode.RemoveColor)}`

const timerStartTimes: Record<string, number> = {}

export default ({ label, message, timerStart, timerStop, ...args }: LogTaskFunctionArguments, { script }: TSCommandFunctionContext) => {
  const color = args.blue ? blue : args.cyan ? cyan : args.green ? green : args.magenta ? magenta : args.red ? red : args.yellow ? yellow : undefined
  const icon = args.alert ? LogMessageIcon.Alert : args.check ? LogMessageIcon.Check : args.cross ? LogMessageIcon.Cross : args.info ? LogMessageIcon.Info : args.wait ? LogMessageIcon.Wait : undefined
  let prefix = ''

  if (label) prefix = `${args.italic ? italic(label) : label} `
  if (icon) prefix = `${icon} ${prefix}`

  if (prefix) {
    if (args.bold) prefix = bold(prefix)
    if (color) prefix = color(prefix)
  }

  if (timerStart || timerStop) {
    const key = label || '__no_label__'

    if (timerStop && timerStartTimes[key]) {
      const duration = Date.now() - timerStartTimes[key]

      if (!message) message = 'Completed'

      message = `${message} in ${duration > 1000 ? `${duration / 1000}s` : `${duration}ms`}`

      delete timerStartTimes[key]
    } else if (timerStart) {
      timerStartTimes[key] = Date.now()

      if (!message) message = 'Started...'
    }
  }

  if (!message) message = ''

  if (typeof message !== 'string') message = format(message)

  const output = prefix ? (message as string).split(EOL).map((line) => `${prefix}${line}`).join(EOL) : message

  if (script?.captureOutput) return `${output}${EOL}`

  console.log(output)
}

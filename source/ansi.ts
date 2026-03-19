export const ANSICode = {
  Blue: 94,
  Bold: 1,
  Cyan: 96,
  Dim: 2,
  Green: 92,
  Italic: 3,
  Red: 91,
  RemoveBoldOrDim: 22,
  RemoveColor: 39,
  RemoveItalic: 23,
}

export const ansi = (code: number) => `\x1B[${code}m`

export const blue = (string: string) => `${ansi(ANSICode.Blue)}${string}${ansi(ANSICode.RemoveColor)}`

export const bold = (string: string) => `${ansi(ANSICode.Bold)}${string}${ansi(ANSICode.RemoveBoldOrDim)}`

export const cyan = (string: string) => `${ansi(ANSICode.Cyan)}${string}${ansi(ANSICode.RemoveColor)}`

export const dim = (string: string) => `${ansi(ANSICode.Dim)}${string}${ansi(ANSICode.RemoveBoldOrDim)}`

export const green = (string: string) => `${ansi(ANSICode.Green)}${string}${ansi(ANSICode.RemoveColor)}`

export const italic = (string: string) => `${ansi(ANSICode.Italic)}${string}${ansi(ANSICode.RemoveItalic)}`

export const red = (string: string) => `${ansi(ANSICode.Red)}${string}${ansi(ANSICode.RemoveColor)}`

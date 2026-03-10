const COLLAPSE_WHITESPACE_REGEX = /\s+/g

export const EOL_POSIX = '\n'

const EOL_WINDOWS = '\r\n'

export const collapseWhitespace = (string: string) => string.trim().replace(COLLAPSE_WHITESPACE_REGEX, ' ')

export const normalizeLineBreaks = (line: string) => line.replaceAll(EOL_WINDOWS, EOL_POSIX)

export const hasDenoReadPermissions = async (path: string) => (await Deno.permissions.query({ name: 'read', path })).state === 'granted'

export const isObject = (value: unknown) => typeof value === 'object' && value !== null && !Array.isArray(value)

export const splitLineOnLineBreaks = (line: string) => normalizeLineBreaks(line).split(EOL_POSIX)

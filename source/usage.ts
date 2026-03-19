import { bold, dim, italic } from './ansi.ts'
import { CREATE_ALIASES_COMMAND, USAGE_INFORMATION_FLAG_LONG, USAGE_INFORMATION_FLAG_SHORT } from './commands.ts'
import { EOL, process } from './external.ts'
import { getRuntime, type Run, Runtime } from './run.ts'
import { collapseWhitespace } from './utilities.ts'

const DEFAULT_DESCRIPTION = 'No description provided'

const INDENT_SPACE_COUNT = 2

const USAGE_INFORMATION_FLAG_DESCRIPTION = 'Prints this usage information'

export const composeCommandUsageInformation = (name: string, run: Run) => {
  const { alias, cliScriptPath, commands } = run
  const command = commands[name]!
  const { description, positionals, rest } = command
  const flags = command.flags ?? new Map()

  flags.set(USAGE_INFORMATION_FLAG_LONG, { description: USAGE_INFORMATION_FLAG_DESCRIPTION, short: USAGE_INFORMATION_FLAG_SHORT })

  const argumentValues = [...flags].map(([long, { short }]) => short ? `-${short}  --${long}` : `--${long}`)

  if (positionals) argumentValues.push(...positionals.keys())
  if (rest) argumentValues.push(`...${rest.name}`)

  const firstColumnWidth = Math.max(...argumentValues.map((value) => value.length))
  const descriptionsColumn = INDENT_SPACE_COUNT + firstColumnWidth + INDENT_SPACE_COUNT * 2
  let tsCommand: string

  // Header
  if (alias) {
    tsCommand = bold(alias)

    if (alias !== name) tsCommand += ` ${bold(name)}`
  } else {
    const runtime = getRuntime()

    tsCommand = cliScriptPath

    if (runtime === Runtime.Deno) tsCommand = `${dim('[...permissions]')} ${tsCommand}`

    tsCommand = `${bold(runtime)} ${tsCommand}`
  }

  tsCommand += ` [...flags]`

  if (positionals) {
    for (const name of positionals.keys()) tsCommand += ` ${name}`
  }

  if (rest) tsCommand += ` ...${rest.name}`

  let output = `${bold('Usage:')} ${tsCommand}`

  // Description
  output += `${EOL.repeat(2)}${description || DEFAULT_DESCRIPTION}`

  // Flags
  output += `${EOL.repeat(2)}${bold('Flags:')}${EOL.repeat(2)}`

  for (const { description } of flags.values()) {
    const args = argumentValues.shift()!

    output += `  ${args}${wrapDescription(description || DEFAULT_DESCRIPTION, descriptionsColumn, INDENT_SPACE_COUNT + args.length)}${EOL}`
  }

  // Values
  if (argumentValues.length > 0) {
    output += `${EOL}${bold('Values:')}${EOL.repeat(2)}`

    if (positionals) {
      for (const { description } of positionals.values()) {
        const arg = argumentValues.shift()!

        output += `  ${arg}${wrapDescription(description || DEFAULT_DESCRIPTION, descriptionsColumn, INDENT_SPACE_COUNT + arg.length)}${EOL}`
      }
    }

    if (argumentValues.length > 0) {
      const arg = argumentValues.shift()!

      output += `  ${arg}${wrapDescription(rest?.description || DEFAULT_DESCRIPTION, descriptionsColumn, INDENT_SPACE_COUNT + arg.length)}${EOL}`
    }
  }

  return output
}

export const composeMainUsageInformation = (run: Run) => {
  const { alias, categories, cliScriptPath, commands } = run
  const runtime = getRuntime()
  const commandNameLengthMaximum = Math.max(...Object.keys(commands).map((commandName) => commandName.length))
  const commandDescriptionsColumn = INDENT_SPACE_COUNT + commandNameLengthMaximum + INDENT_SPACE_COUNT * 2
  let tsCommand: string

  if (alias) tsCommand = `${bold(alias)}`
  else {
    tsCommand = cliScriptPath

    if (runtime === Runtime.Deno) tsCommand = `${dim('[...permissions]')} ${tsCommand}`

    tsCommand = `${bold(runtime)} ${tsCommand}`
  }

  // Header
  let output = `${bold('Usage:')} ${tsCommand} ${bold('<command>')} [...args] ${dim(italic(`[ +[.] <command> [...args] ... ]`))}${EOL.repeat(2)}`

  // Categories/commands
  for (const [categoryName, commandNames] of categories) {
    output += `${bold(`${categoryName}:`)} ${EOL.repeat(2)}`

    for (const commandName of commandNames) {
      const { description } = commands[commandName]!

      output += `  ${bold(commandName)}${wrapDescription(description || DEFAULT_DESCRIPTION, commandDescriptionsColumn, INDENT_SPACE_COUNT + commandName.length)}${EOL}`
    }

    output += EOL
  }

  // Footer command usage
  output += `Print command usage information: ${tsCommand} ${bold('<command>')} --help/-h
${alias ? 'Update' : 'Create'} shell aliases scripts:    ${tsCommand} ${bold(CREATE_ALIASES_COMMAND)}
Learn more about ${bold('tscli')}:          https://tscli.nerdintheloop.com${EOL}`

  return output
}

const wrapDescription = (description: string, column = 0, firstLineAtColumn = 0) => {
  const string = collapseWhitespace(description)
  const maximumLineLength = process.stdout.columns - column
  let output = ''

  if (string.length <= maximumLineLength) {
    if (column > 0) output += ' '.repeat(column - firstLineAtColumn)
    output += string
  } else {
    let lineCount = 0
    let stringEndCursor = 0

    while (stringEndCursor < string.length) {
      let stringStartCursor = stringEndCursor

      if (string.charAt(stringStartCursor) === ' ') stringStartCursor++

      stringEndCursor = stringStartCursor + (lineCount === 0 ? maximumLineLength - firstLineAtColumn : maximumLineLength)

      if (stringEndCursor > string.length) stringEndCursor = string.length
      else if (stringEndCursor < string.length) {
        while (string.charAt(stringEndCursor) !== ' ' && stringEndCursor > stringStartCursor) stringEndCursor--
      }

      if (stringEndCursor > stringStartCursor) {
        if (column > 0) output += ' '.repeat(lineCount === 0 ? column - firstLineAtColumn : column)

        output += string.slice(stringStartCursor, stringEndCursor)

        if (stringEndCursor < string.length) output += EOL
      }

      lineCount++
    }
  }

  return output
}

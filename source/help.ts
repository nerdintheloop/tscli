import { type Run } from './run.ts'
import { bold, collapseWhitespace, dim, EOL, italic, parse, type ParseArgsOptionsConfig, platform, process, Runtime } from './shared.ts'

export const DEFAULT_DESCRIPTION = 'No description provided'

export const INDENT_SPACE_COUNT = 2

const HELP_OPTION_DESCRIPTION = 'Prints this usage information'

export const HELP_FLAG_LONG = 'help'

export const HELP_FLAG_SHORT = 'h'

export const HELP_PARSE_ARGS_OPTION: ParseArgsOptionsConfig = {
  [HELP_FLAG_LONG]: {
    type: 'boolean',
    short: HELP_FLAG_SHORT
  }
}

export const composeCLIHelp = (run: Run) => {
  const { cli, cliScriptPath, runAlias, runtime } = run
  const commandNameLengthMaximum = Math.max(...Object.keys(cli.commands).map((commandName) => commandName.length))
  const commandDescriptionsColumn = INDENT_SPACE_COUNT + commandNameLengthMaximum + INDENT_SPACE_COUNT * 2
  const lines: string[] = []
  const shellOptions = platform === 'win32' ? `${bold('cmd')} or ${bold('ps')}` : `${bold('bash')} or ${bold('zsh')}`
  let tsCommand: string

  if (runAlias) tsCommand = `${bold(runAlias)}`
  else {
    tsCommand = `${bold(runtime)} `

    if (runtime === Runtime.Deno) tsCommand += `${dim('[...permissions]')} ${cliScriptPath}`
    else {
      const { name, dir } = parse(cliScriptPath)

      tsCommand += `${dir}${name === 'index' ? '' : name}`
    }
  }

  // Header
  lines.push(`${bold('Usage:')} ${tsCommand} ${bold('<command>')} [...args] ${dim(italic(`[ +[.] <command> [...args] ... ]`))}`, '')

  // Categories/commands
  for (const [categoryName, commandNames] of cli.categories) {
    lines.push(`${bold(`${categoryName}:`)}`, '')

    for (const commandName of commandNames) {
      const { description } = cli.commands[commandName]!

      lines.push(`  ${bold(commandName)}${wrapDescription(description || DEFAULT_DESCRIPTION, commandDescriptionsColumn, INDENT_SPACE_COUNT + commandName.length)}`)
    }

    lines.push('')
  }

  // Footer
  lines.push(
    `Shell setup:   ${bold('eval')} "$(${tsCommand} --shell/-s)" (add ${shellOptions} if not detected)`,
    `Command help:  ${tsCommand} ${bold('<command>')} --help/-h`,
    `Learn more:    ${bold('https://tscli.nerdintheloop.com')}${EOL}`
  )

  return lines.join(EOL)
}

export const composeCommandHelp = (name: string, run: Run) => {
  const { cli, cliScriptPath, runAlias, runtime } = run
  const command = cli.commands[name]!
  const { description, positionals, rest } = command
  const options = command.options ?? new Map()

  options.set(HELP_FLAG_LONG, { description: HELP_OPTION_DESCRIPTION, short: HELP_FLAG_SHORT })

  const argumentValues = [...options].map(([long, { short }]) => short ? `-${short}  --${long}` : `--${long}`)

  if (positionals) argumentValues.push(...positionals.keys())
  if (rest) argumentValues.push(`...${rest.name}`)

  const firstColumnWidth = Math.max(...argumentValues.map((value) => value.length))
  const descriptionsColumn = INDENT_SPACE_COUNT + firstColumnWidth + INDENT_SPACE_COUNT * 2
  let tsCommand: string

  // Header
  if (runAlias) {
    tsCommand = bold(runAlias)

    if (runAlias !== name) tsCommand += ` ${bold(name)}`
  } else {
    tsCommand = cliScriptPath

    if (runtime === Runtime.Deno) tsCommand = `${dim('[...permissions]')} ${tsCommand}`

    tsCommand = `${bold(runtime)} ${tsCommand}`
  }

  tsCommand += ` [...options]`

  if (positionals) {
    for (const name of positionals.keys()) tsCommand += ` ${name}`
  }

  if (rest) tsCommand += ` ...${rest.name}`

  let output = `${bold('Usage:')} ${tsCommand}`

  // Description
  output += `${EOL.repeat(2)}${description || DEFAULT_DESCRIPTION}`

  // Options
  output += `${EOL.repeat(2)}${bold('Options:')}${EOL.repeat(2)}`

  for (const { description } of options.values()) {
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

  output += EOL

  return output
}

export const wrapDescription = (description: string, column = 0, firstLineAtColumn = 0) => {
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

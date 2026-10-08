import type { Command } from './commands.ts'
import { bold, collapseWhitespace, cyan, DOCUMENTATION_URL, DocumentationPath, EOL, format, italic, red, RegularExpression } from './shared.ts'

export type CLIDefinitionError = [
  lineIndex: number,
  line: string,
  errorMessage: CLIDefinitionErrorMessage,
  documentationPath: DocumentationPath,
  ...invalidValues: string[]
]

type CommandArgumentDefinition = OptionArgumentDefinition | PositionalArgumentDefinition | RestArgumentDefinition

export type OptionArgumentDefinition = {
  description?: string
  short?: string
  type?: 'number' | 'string'
}

export type ParsedCLIDefinition = {
  categories: Map<string, string[]>
  commands: Record<string, Command>
  definition: string
  errors: CLIDefinitionError[]
}

type ParsedCLIDefinitionLine = [
  type: CLIDefinitionLineType,
  index: number,
  line: string,
  ...values: unknown[]
]

export type PositionalArgumentDefinition = {
  name: string
  description?: string
  type?: 'number'
}

export type RestArgumentDefinition = {
  name: string
  description?: string
  type?: 'string'
}

const CLIDefinitionLineType = {
  Category: 0,
  Command: 1,
  CommandOptionArgument: 2,
  CommandPositionalArgument: 3,
  CommandRestArgument: 4,
  Empty: 5,
  Error: 6
} as const

type CLIDefinitionLineType = (typeof CLIDefinitionLineType)[keyof typeof CLIDefinitionLineType]

const CLIDefinitionErrorMessage = {
  DuplicateCategoryName: "Category name already in use",
  DuplicateCommandArgumentName: "Argument name already in use",
  DuplicateCommandName: "Command name already in use",
  DuplicateCommandShortFlag: "Short flag already in use",
  DuplicateRestArgument: "A rest argument has already been defined for this command",
  DuplicateVariable: "Variable has already been defined",
  EmptyVariableAlias: "Alias value required",
  EmptyVariableChildProcessEnv: "Environment variable names separated by whitespace required",
  EmptyVariableCommandAliases: "Command names separated by whitespace required",
  EmptyVariableRuntimeFlags: "Runtime flags required",
  InvalidArgumentDefinition: "Invalid argument definition",
  InvalidOptionArgumentDefinition: "Invalid option argument syntax",
  InvalidPositionalArgumentDefinition: "Invalid positional argument syntax",
  InvalidRestArgumentDefinition: "Invalid rest argument syntax",
  InvalidVariableAlias: "Invalid alias value",
  InvalidVariableChildProcessEnv: "Invalid environment variable(s)",
  InvalidVariableCommandAliases: "Invalid command alias(es)",
  InvalidVariableRuntimeRequired: `Either ${bold("bun")}, ${bold("deno")} or ${bold("node")} required`,
  NoCommandDefinedBeforeArgumentDefinition: "No command defined before argument definition",
  NoCommandDefinedForCategory: "Category has no command definitions",
  NoCommandDefinitions: "No commands defined",
  SyntaxError: "Syntax error",
} as const

type CLIDefinitionErrorMessage = (typeof CLIDefinitionErrorMessage)[keyof typeof CLIDefinitionErrorMessage]

const ERROR_LINE_PREFIX = '  Line %s:  '

const LINK_LINES_PREFIX = '%s '

const SUPERSCRIPT_NUMBERS = '⁰¹²³⁴⁵⁶⁷⁸⁹'

const CATEGORY_DEFAULT = 'Commands'

const CATEGORY_UNCATEGORIZED = 'Other'

export const composeCLIDefinitionErrorLine = (line: string, ...invalidValues: string[]) => {
  let errorLine = ''

  if (invalidValues.length > 0) {
    for (const value of invalidValues) {
      const errorStartIndex = line.indexOf(value)
      const [begin, end] = [line.slice(0, errorStartIndex), line.slice(errorStartIndex + value.length)]

      if (begin) errorLine += begin

      errorLine += italic(red(value))

      if (end) errorLine += end
    }
  } else errorLine += italic(red(line))

  return errorLine
}

export const composeCLIDefinitionErrorsMessage = (errors: CLIDefinitionError[]) => {
  const noCommandsError = errors.find(([lineIndex]) => lineIndex === -1)
  const parseErrors = errors.filter(([lineIndex]) => lineIndex > -1)

  if (noCommandsError && parseErrors.length === 0) {
    const [, errorMessage, documentationPath, ...invalidValues] = noCommandsError

    return `${format(errorMessage, ...invalidValues)}. ${DOCUMENTATION_URL}${documentationPath}.${EOL}`
  }

  const errorLinePrefixWidth = format(ERROR_LINE_PREFIX, Math.max(...errors.map(([lineIndex]) => lineIndex + 1))).length
  const errorMessages = [...new Set(errors!.map(([, , message]) => message))]
  const linkLinesPrefixWidth = format(LINK_LINES_PREFIX, errorMessages.length).length
  const outputLines = [bold(`CLI definition error${errors.length > 1 ? 's' : ''}:`), EOL, EOL]

  for (const [lineIndex, line, errorMessage] of parseErrors) {
    outputLines.push(
      `${format(ERROR_LINE_PREFIX, lineIndex + 1).padEnd(errorLinePrefixWidth)}${line} ${sup(errorMessages.indexOf(errorMessage) + 1)}`,
      EOL
    )
  }

  for (const [index, errorMessage] of errorMessages.entries()) {
    const [, , , documentationPath] = errors.find(([, , message]) => message === errorMessage)!
    let linkLines = `${EOL}${sup(index + 1).padEnd(linkLinesPrefixWidth)}${errorMessage}${EOL}${''.padEnd(linkLinesPrefixWidth)}${cyan(italic(`${DOCUMENTATION_URL}${documentationPath}`))}${EOL}`

    outputLines.push(linkLines)
  }

  return outputLines.join('')
}

export const parseCLIDefinition = (raw: string): ParsedCLIDefinition => {
  const definition: ParsedCLIDefinition = { categories: new Map(), commands: {}, definition: raw, errors: [] }
  const { categories, commands, errors } = definition
  const categoryLineIndices: Record<string, number> = {}
  const lines = raw.split(EOL)
  const parsedLines = lines.map((line, lineIndex) => parseCLIDefinitionLine(line, lineIndex))
  const uncategorizedCommandNames: string[] = []
  let currentCategory: string | undefined
  let currentCommand: Command | undefined
  let currentCommandArgumentNames: string[] | undefined
  let currentCommandShortFlagCharacters: string[] | undefined

  for (const [type, lineIndex, line, ...values] of parsedLines) {
    switch (type) {
      case CLIDefinitionLineType.Category: {
        const [category] = values as [string]

        if (categories.has(category)) errors.push([lineIndex, line, CLIDefinitionErrorMessage.DuplicateCategoryName, DocumentationPath.Categories, category])
        else {
          if (currentCategory && categories.get(currentCategory)!.length === 0) errors.push([categoryLineIndices[currentCategory]!, line, CLIDefinitionErrorMessage.NoCommandDefinedForCategory, DocumentationPath.Categories, currentCategory])

          categories.set(category, [])
          categoryLineIndices[category] = lineIndex
          currentCategory = category
          currentCommand = currentCommandArgumentNames = currentCommandShortFlagCharacters = undefined
        }

        break
      }

      case CLIDefinitionLineType.Command: {
        const [name, command] = values as [string, Command]

        if (commands[name]) errors.push([lineIndex, line, CLIDefinitionErrorMessage.DuplicateCommandName, DocumentationPath.CLICommands, name])
        else {
          commands[name] = command

          if (currentCategory) categories.get(currentCategory)!.push(name)
          else uncategorizedCommandNames.push(name)

          currentCommand = command
          currentCommandArgumentNames = []
          currentCommandShortFlagCharacters = []
        }

        break
      }

      case CLIDefinitionLineType.CommandOptionArgument:
      case CLIDefinitionLineType.CommandPositionalArgument:
      case CLIDefinitionLineType.CommandRestArgument: {
        if (currentCommand) {
          const [name, definition] = values as [string, CommandArgumentDefinition]

          if (currentCommandArgumentNames!.includes(name)) errors.push([lineIndex, line, CLIDefinitionErrorMessage.DuplicateCommandArgumentName, DocumentationPath.CommandDefinitions, name])
          else {
            currentCommandArgumentNames!.push(name)

            switch (type) {
              case CLIDefinitionLineType.CommandOptionArgument: {
                const { short } = definition as OptionArgumentDefinition

                if (short && currentCommandShortFlagCharacters!.includes(short)) errors.push([lineIndex, line, CLIDefinitionErrorMessage.DuplicateCommandShortFlag, DocumentationPath.OptionArguments, short])
                else {
                  currentCommandShortFlagCharacters!.push(short!)
                  currentCommand.options ??= new Map()
                  currentCommand.options.set(name, definition)
                }

                break
              }

              case CLIDefinitionLineType.CommandPositionalArgument: {
                currentCommand.positionals ??= new Map()
                currentCommand.positionals.set(name, definition as PositionalArgumentDefinition)
                break
              }

              case CLIDefinitionLineType.CommandRestArgument: {
                if (currentCommand.rest) errors.push([lineIndex, line, CLIDefinitionErrorMessage.DuplicateRestArgument, DocumentationPath.RestArgument])
                else currentCommand.rest = definition as RestArgumentDefinition
                break
              }
            }
          }
        } else errors.push([lineIndex, line, CLIDefinitionErrorMessage.NoCommandDefinedBeforeArgumentDefinition, DocumentationPath.CLICommands])

        break
      }

      case CLIDefinitionLineType.Error:
        errors.push([lineIndex, line, ...values as [CLIDefinitionErrorMessage, DocumentationPath]])
        break
    }
  }

  if (Object.keys(commands).length === 0) errors.unshift([-1, '', CLIDefinitionErrorMessage.NoCommandDefinitions, DocumentationPath.CommandDefinitions])
  else if (uncategorizedCommandNames.length > 0) categories.set(categories.size === 0 ? CATEGORY_DEFAULT : CATEGORY_UNCATEGORIZED, [...uncategorizedCommandNames])

  return definition
}

const parseCLIDefinitionLine = (line: string, lineIndex: number): ParsedCLIDefinitionLine => {
  if (line.includes('#')) line = line.slice(0, line.indexOf('#'))

  line = collapseWhitespace(line)

  let parsedLine: ParsedCLIDefinitionLine = [
    !line ? CLIDefinitionLineType.Empty
      : line.endsWith(':') ? CLIDefinitionLineType.Category
        : RegularExpression.DefinitionLineCommand.test(line) ? CLIDefinitionLineType.Command
          : line.startsWith('--') ? CLIDefinitionLineType.CommandOptionArgument
            : line.startsWith('...') ? CLIDefinitionLineType.CommandRestArgument
              : line.startsWith('.') ? CLIDefinitionLineType.CommandPositionalArgument
                : CLIDefinitionLineType.Error,
    lineIndex,
    line
  ]

  switch (parsedLine[0]) {
    case CLIDefinitionLineType.Category:
      parsedLine.push(collapseWhitespace(line.slice(0, line.lastIndexOf(':'))))
      break

    case CLIDefinitionLineType.Command: {
      const [, name, aliasMarker, description] = RegularExpression.DefinitionLineCommand.exec(line) as unknown as [unknown, string, ...string[]]
      const command: Command = { aliased: !!aliasMarker }

      if (description) Object.assign(command, { description })

      parsedLine.push(name, command)
      break
    }

    case CLIDefinitionLineType.CommandOptionArgument: {
      const values = RegularExpression.DefinitionLineOptionArgument.exec(line)

      if (values) {
        const [, long, short, type, description] = values
        const definition = {}

        if (description) Object.assign(definition, { description })
        if (short) Object.assign(definition, { short })
        if (type) Object.assign(definition, { type })

        parsedLine.push(long, definition)
      } else parsedLine = [CLIDefinitionLineType.Error, lineIndex, line, CLIDefinitionErrorMessage.InvalidOptionArgumentDefinition, DocumentationPath.OptionArguments]

      break
    }

    case CLIDefinitionLineType.CommandPositionalArgument: {
      const values = RegularExpression.DefinitionLinePositionalArgument.exec(line)

      if (values) {
        const [, name, type, description] = values
        const definition = {}

        if (description) Object.assign(definition, { description })
        if (type) Object.assign(definition, { type })

        parsedLine.push(name, definition)
      } else parsedLine = [CLIDefinitionLineType.Error, lineIndex, line, CLIDefinitionErrorMessage.InvalidPositionalArgumentDefinition, DocumentationPath.PositionalArguments]

      break
    }

    case CLIDefinitionLineType.CommandRestArgument: {
      const values = RegularExpression.DefinitionLineRestArgument.exec(line)

      if (values) {
        const [, name, type, description] = values
        const definition = { name }

        if (description) Object.assign(definition, { description })
        if (type) Object.assign(definition, { type })

        parsedLine.push(name, definition)
      } else parsedLine = [CLIDefinitionLineType.Error, lineIndex, line, CLIDefinitionErrorMessage.InvalidRestArgumentDefinition, DocumentationPath.RestArgument]

      break
    }

    case CLIDefinitionLineType.Error:
      parsedLine.push(line, CLIDefinitionErrorMessage.SyntaxError, DocumentationPath.CLI)
      break
  }

  return parsedLine
}

const sup = (number: number): string => number.toString()
  .split('')
  .map((digit: string) => SUPERSCRIPT_NUMBERS.charAt(Number(digit)))
  .join('')

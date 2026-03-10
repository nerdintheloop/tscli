import { bold, dim, italic, red } from './ansi.ts'
import type { CLICommand } from './commands.ts'
import { EOL } from './external.ts'
import { DocumentationLink, documentationLinkLine } from './links.ts'
import { Runtime } from './run.ts'
import { collapseWhitespace } from './utilities.ts'

export type CLIDefinitionError = [lineIndex: number, invalidValue: string | undefined, link: number, type: number, ...messageValues: string[]]

export type FlagArgumentDefinition = {
  description?: string
  short?: string
  type?: 'number' | 'string'
}

export type ParsedCLIDefinition = {
  categories: Map<string, string[]>
  commands: Record<string, CLICommand>
  errors?: CLIDefinitionError[]
  variables: Record<string, string>
}

export type PositionalArgumentDefinition = {
  description?: string
  type?: 'number'
}

export type RestArgumentDefinition = {
  name: string
  description?: string
  type?: 'string'
}

export const CLIDefinitionErrorType = {
  ConflictingAliasListVariables: 0,
  DuplicateCategoryName: 1,
  DuplicateCLICommandArgumentName: 2,
  DuplicateCLICommandName: 3,
  DuplicateCLICommandShortFlag: 4,
  DuplicateCLIVariable: 5,
  InvalidArgumentDefinition: 6,
  InvalidFlagArgumentDefinition: 7,
  InvalidRestArgumentDefinition: 8,
  InvalidVariableAliasList: 9,
  InvalidVariableAliasListCLICommandNames: 10,
  InvalidVariableChildProcessEnv: 11,
  InvalidVariableRuntimeFlags: 12,
  InvalidVariableRuntimeRequired: 13,
  InvalidVariableWorkingDirectory: 14,
  NoCLICommandDefinedBeforeArgumentDefinition: 15,
  NoCLICommandDefinedForCategory: 16,
  NoCLICommandDefinitions: 17,
  NoCLIVariableValue: 18,
  RestArgumentAlreadyDefined: 19,
  SyntaxError: 20,
}

export const CLIDefinitionErrorValue = {
  LineIndex: 0,
  Error: 1,
  Link: 2,
  Type: 3,
  MessageValues: 4,
}

export const CLIVariable = {
  AliasBlacklist: 'ALIAS_BLACKLIST',
  AliasWhitelist: 'ALIAS_WHITELIST',
  ChildProcessEnv: 'CHILD_PROCESS_ENV',
  RuntimeFlags: 'RUNTIME_FLAGS',
  RuntimeRequired: 'RUNTIME_REQUIRED'
}

const RegularExpression = {
  AliasList: '^[a-z0-9]+[\\s+[a-z0-9]+]*$',
  CLICommandLine: '^\\s*([a-z0-9]+(?:-[a-z0-9]+)*)\\s*(?:\\s*(.*))?$',
  KebabCase: '^[a-z0-9]+[-[a-z0-9]+]*$',
  LetterOrNumber: '^[a-zA-Z0-9]$',
  FlagLine: '^\\s*--([a-z0-9]+(?:-[a-z0-9]+)*)(?:\\s+-([a-zA-Z0-9])?)?(?:\\s+(number|string))?(?:\\s+(.+?))?\\s*$',
  PositionalLine: '^\\s*\\.\\s*([a-z0-9]+(?:-[a-z0-9]+)*)(?:\\s+(number))?(?:\\s+(.+?))?\\s*$',
  RestLine: '^\\s*\\.{3}([a-z0-9]+(?:-[a-z0-9]+)*)(?:\\s+(string))?(?:\\s+(.+?))?\\s*$',
  ValidEnvironmentVariablesList: '^[\\w-]+[\\s+[\\w-]+]*$',
}

const CATEGORY_DEFAULT = 'Commands'

const CATEGORY_UNCATEGORIZED = 'Other'

const CLI_VARIABLE_NAMES = [
  CLIVariable.AliasBlacklist,
  CLIVariable.AliasWhitelist,
  CLIVariable.ChildProcessEnv,
  CLIVariable.RuntimeFlags,
  CLIVariable.RuntimeRequired
]

const LIST_FORMAT_LOCALE = 'en-GB'

const TEMPLATE_TAG_FUNCTION_NAME = 'tscli'

export const cliDefinitionErrorMessage = (lines: string[], errors: CLIDefinitionError[]) => {
  const links = new Set<number>()
  const noCLICommandsError = errors.find(([lineIndex]) => lineIndex === -1)
  const parseErrors = errors.filter(([lineIndex]) => lineIndex > -1)
  let message = ''

  if (noCLICommandsError && parseErrors.length === 0) {
    const [, , link, type, ...values] = noCLICommandsError

    message += `${getCLIDefinitionErrorMessage(type, ...values)}. ${documentationLinkLine(link!)}.`
  } else {
    if (parseErrors.length > 0) {
      const backtick = '`'

      message += `${bold(`CLI definition error${parseErrors.length > 1 ? 's' : ''}:`)}${EOL.repeat(2)}${dim(italic(`${TEMPLATE_TAG_FUNCTION_NAME}${backtick}`))}${EOL}`

      for (const [errorIndex, [lineIndex, invalidValue]] of parseErrors.entries()) {
        const line = lines[lineIndex]!

        if (lineIndex > 0) {
          const previousDisplayedLineIndex = errorIndex === 0 ? -1 : errors[errorIndex - 1]![0]
          const gapLineBreakCount = lineIndex - previousDisplayedLineIndex

          if (gapLineBreakCount > 1) {
            const spacer = gapLineBreakCount > 2 || lines[lineIndex - 1]!.trim() !== '' ? dim('...') : ''

            message += `${spacer}${EOL}`
          }
        }

        if (invalidValue) {
          const errorStartIndex = line.indexOf(invalidValue)
          const [begin, end] = [line.slice(0, errorStartIndex), line.slice(errorStartIndex + invalidValue.length)]

          if (begin) message += begin

          message += red(invalidValue)

          if (end) message += end
        } else message += red(line)

        message += ` ${'*'.repeat(errorIndex + 1)}${EOL}`

        if (errorIndex === parseErrors.length - 1 && lineIndex < lines.length - 1) message += `${dim('...')}${EOL}`
      }

      message += `${dim(italic(backtick))}`

      if (noCLICommandsError) message += ` ${'*'.repeat(errors.length)}`

      message += EOL.repeat(2)
    }

    for (const [index, [, , link, type, ...values]] of errors.entries()) {
      links.add(link)

      message += `${'*'.repeat(index + 1)} ${getCLIDefinitionErrorMessage(type, ...values)}`

      if (link !== undefined && errors.length > 1) message += ` ${bold('†'.repeat([...links.keys()].indexOf(link) + 1))}`

      message += EOL
    }

    if (links.size > 0) {
      for (const [index, link] of [...links].entries()) {
        message += EOL

        if (errors.length > 1) message += `${bold('†'.repeat(index + 1))} `

        message += documentationLinkLine(link)
      }
    } else message += `${EOL}${documentationLinkLine(DocumentationLink.CLI)}`
  }

  return message
}

export const getCLIDefinitionErrorMessage = (type: number, ...values: string[]) => {
  switch (type) {
    case CLIDefinitionErrorType.ConflictingAliasListVariables:
      return `Use either an alias blacklist or whitelist, both are unnecessary`

    case CLIDefinitionErrorType.DuplicateCategoryName:
      return `A previous category is already using the name ${bold(values[0]!)}`

    case CLIDefinitionErrorType.DuplicateCLICommandArgumentName:
      return `A previous command argument is already using the name ${bold(values[0]!)}`

    case CLIDefinitionErrorType.DuplicateCLICommandName:
      return `A previous command is already using the name ${bold(values[0]!)}`

    case CLIDefinitionErrorType.DuplicateCLICommandShortFlag:
      return `A previous command flag argument was already assigned the short flag character ${bold(values[0]!)}`

    case CLIDefinitionErrorType.DuplicateCLIVariable:
      return `Variable ${bold(values[0]!)} has already been defined`

    case CLIDefinitionErrorType.InvalidArgumentDefinition:
      return 'Invalid argument definition'

    case CLIDefinitionErrorType.InvalidFlagArgumentDefinition:
      return 'Invalid flag argument syntax'

    case CLIDefinitionErrorType.InvalidRestArgumentDefinition:
      return 'Invalid rest argument syntax'

    case CLIDefinitionErrorType.InvalidVariableAliasList:
      return 'Valid command names separated by whitespace required'

    case CLIDefinitionErrorType.InvalidVariableAliasListCLICommandNames: {
      const plural = values.length > 1

      return `There ${plural ? 'are' : 'is'} no command${plural ? 's' : ''} named ${plural ? new Intl.ListFormat(LIST_FORMAT_LOCALE, { type: 'disjunction' }).format(values.map(bold)) : bold(values[0]!)}`
    }

    case CLIDefinitionErrorType.InvalidVariableChildProcessEnv:
      return 'Environment variable names separated by whitespace required'

    case CLIDefinitionErrorType.InvalidVariableRuntimeFlags:
      return 'Runtime flags expected'

    case CLIDefinitionErrorType.InvalidVariableRuntimeRequired:
      return `Either ${bold(values[0]!)}, ${bold(values[1]!)} or ${bold(values[2]!)} expected`

    case CLIDefinitionErrorType.InvalidVariableWorkingDirectory:
      return 'Relative or absolute path required'

    case CLIDefinitionErrorType.NoCLICommandDefinedBeforeArgumentDefinition:
      return 'No command defined before argument definition'

    case CLIDefinitionErrorType.NoCLICommandDefinedForCategory:
      return `Category ${bold(values[0]!)} has no command definitions`

    case CLIDefinitionErrorType.NoCLICommandDefinitions:
      return 'No commands defined'

    case CLIDefinitionErrorType.NoCLIVariableValue:
      return 'No value provided'

    case CLIDefinitionErrorType.RestArgumentAlreadyDefined:
      return 'A rest argument has already been defined for this command'

    case CLIDefinitionErrorType.SyntaxError:
      return 'Syntax error'
  }
}

export const parseCLIDefinition = (lines: string[]): ParsedCLIDefinition => {
  const categories: Map<string, string[]> = new Map()
  const errors: CLIDefinitionError[] = []
  const cliCommandLineRegex = new RegExp(RegularExpression.CLICommandLine)
  const cliCommands: Record<string, CLICommand> = {}
  const uncategorizedCLICommandNames: string[] = []
  const variables: Record<string, string> = {}
  let aliasBlacklistLineIndex: number | undefined
  let aliasWhitelistLineIndex: number | undefined
  let currentCategory: string | undefined
  let currentCLICommand: CLICommand | undefined
  let currentCLICommandArgumentNames: string[] | undefined
  let currentCLICommandShortFlagCharacters: string[] | undefined
  let flagLineRegex: RegExp | undefined
  let positionalLineRegex: RegExp | undefined
  let restLineRegex: RegExp | undefined

  for (let [lineIndex, line] of lines.entries()) {
    line = collapseWhitespace(line)

    if (line.includes('#')) line = collapseWhitespace(line.slice(0, line.indexOf('#')))

    if (!line) continue

    // CLI command argument definition
    if (line.startsWith('--') || line.startsWith('.')) {
      if (!currentCLICommand) errors.push([lineIndex, undefined, DocumentationLink.CommandDefinitions, CLIDefinitionErrorType.NoCLICommandDefinedBeforeArgumentDefinition])
      // Flag definition
      else if (line.startsWith('--')) {
        flagLineRegex ??= new RegExp(RegularExpression.FlagLine)

        const regexResults = flagLineRegex.exec(line) as unknown as [unknown, string, ...string[]]

        if (regexResults) {
          const [, long, short, type, description] = regexResults
          const definition: FlagArgumentDefinition = {}

          if (description) Object.assign(definition, { description })
          if (short) Object.assign(definition, { short })
          if (type) Object.assign(definition, { type })

          if (currentCLICommandArgumentNames!.includes(long)) errors.push([lineIndex, undefined, DocumentationLink.CommandDefinitions, CLIDefinitionErrorType.DuplicateCLICommandName, long])
          else currentCLICommandArgumentNames!.push(long)

          if (short && currentCLICommandShortFlagCharacters!.includes(short)) {
            errors.push([lineIndex, undefined, DocumentationLink.FlagArguments, CLIDefinitionErrorType.DuplicateCLICommandShortFlag, short])
          } else currentCLICommandShortFlagCharacters!.push(short!)

          currentCLICommand.flags ??= new Map()
          currentCLICommand.flags.set(long, definition)
        } else errors.push([lineIndex, undefined, DocumentationLink.FlagArguments, CLIDefinitionErrorType.InvalidFlagArgumentDefinition])

        // Rest definition
      } else if (line.startsWith('...')) {
        restLineRegex ??= new RegExp(RegularExpression.RestLine)

        const regexResults = restLineRegex.exec(line)

        if (regexResults) {
          const [, name, type, description] = regexResults as unknown as [unknown, string, ...string[]]
          const definition: RestArgumentDefinition = { name }

          if (description) Object.assign(definition, { description })
          if (type) Object.assign(definition, { type })

          if (currentCLICommandArgumentNames!.includes(name)) errors.push([lineIndex, undefined, DocumentationLink.CLI, CLIDefinitionErrorType.DuplicateCLICommandArgumentName, name])
          else {
            currentCLICommandArgumentNames!.push(name)

            if (currentCLICommand.rest) errors.push([lineIndex, undefined, DocumentationLink.RestArgument, CLIDefinitionErrorType.RestArgumentAlreadyDefined])
            else currentCLICommand.rest = definition
          }
        } else errors.push([lineIndex, undefined, DocumentationLink.RestArgument, CLIDefinitionErrorType.InvalidRestArgumentDefinition])

        // Positional definition
      } else {
        positionalLineRegex ??= new RegExp(RegularExpression.PositionalLine)

        const regexResults = positionalLineRegex.exec(line)

        if (regexResults) {
          const [, name, type, description] = regexResults as unknown as [unknown, string, ...string[]]
          const definition: PositionalArgumentDefinition = {}

          if (description) Object.assign(definition, { description })
          if (type) Object.assign(definition, { type })

          if (currentCLICommandArgumentNames!.includes(name)) errors.push([lineIndex, undefined, DocumentationLink.CLI, CLIDefinitionErrorType.DuplicateCLICommandArgumentName, name])
          else {
            currentCLICommandArgumentNames!.push(name)

            currentCLICommand.positionals ??= new Map()
            currentCLICommand.positionals.set(name, definition)
          }
        } else errors.push([lineIndex, undefined, DocumentationLink.CLI, CLIDefinitionErrorType.InvalidArgumentDefinition])
      }

      // CLI variable definition
    } else if (CLI_VARIABLE_NAMES.some((name) => line.startsWith(name))) {
      const name = CLI_VARIABLE_NAMES.find((name) => line.startsWith(name))!
      const value = line.slice(line.indexOf(name) + name.length).trim()

      if (Object.hasOwn(variables, name)) errors.push([lineIndex, undefined, DocumentationLink.CLIVariables, CLIDefinitionErrorType.DuplicateCLIVariable, name])
      else {
        variables[name] = value

        switch (name) {
          case CLIVariable.AliasBlacklist:
          case CLIVariable.AliasWhitelist:
            if (!value || !new RegExp(RegularExpression.AliasList).test(value)) {
              errors.push([lineIndex, value, DocumentationLink.CLIVariables, CLIDefinitionErrorType.InvalidVariableAliasList])
            } else if (name === CLIVariable.AliasBlacklist) aliasBlacklistLineIndex = lineIndex
            else if (name === CLIVariable.AliasWhitelist) aliasWhitelistLineIndex = lineIndex
            break

          case CLIVariable.ChildProcessEnv:
            if (!value || !new RegExp(RegularExpression.ValidEnvironmentVariablesList).test(value)) {
              errors.push([lineIndex, value, DocumentationLink.CLIVariables, CLIDefinitionErrorType.InvalidVariableChildProcessEnv])
            }
            break

          case CLIVariable.RuntimeFlags:
            if (!value) errors.push([lineIndex, undefined, DocumentationLink.CLIVariables, CLIDefinitionErrorType.InvalidVariableRuntimeFlags])
            break

          case CLIVariable.RuntimeRequired:
            if (!value || ![Runtime.Bun, Runtime.Deno, Runtime.Node].includes(value)) {
              errors.push([lineIndex, value, DocumentationLink.CLIVariables, CLIDefinitionErrorType.InvalidVariableRuntimeRequired, Runtime.Bun, Runtime.Deno, Runtime.Node])
            }
            break
        }
      }

      // CLI command definition
    } else if (cliCommandLineRegex.test(line)) {
      const [, name, description] = cliCommandLineRegex.exec(line) as unknown as [unknown, string, ...string[]]
      const command: CLICommand = {}

      if (description) Object.assign(command, { description })

      if (cliCommands[name] !== undefined) errors.push([lineIndex, name, DocumentationLink.CommandDefinitions, CLIDefinitionErrorType.DuplicateCLICommandName, name])
      else cliCommands[name] = command

      if (currentCategory) categories.get(currentCategory)!.push(name)
      else uncategorizedCLICommandNames.push(name)

      currentCLICommand = command
      currentCLICommandArgumentNames = []
      currentCLICommandShortFlagCharacters = []

      // Category definition
    } else if (line.endsWith(':')) {
      if (currentCategory && categories.get(currentCategory)!.length === 0) {
        const categoryLineIndex = lines.findLastIndex((line, index) => {
          if (line.endsWith(':') && line.startsWith(currentCategory!) && index < lineIndex) {
            const name = line.slice(0, line.lastIndexOf(':'))

            if (name === currentCategory) return true
          }

          return false
        })

        errors.push([categoryLineIndex, undefined, DocumentationLink.Categories, CLIDefinitionErrorType.NoCLICommandDefinedForCategory, currentCategory])
      }

      currentCategory = line.slice(0, line.lastIndexOf(':'))

      if (categories.has(currentCategory)) errors.push([lineIndex, undefined, DocumentationLink.Categories, CLIDefinitionErrorType.DuplicateCategoryName, currentCategory])

      categories.set(currentCategory, [])

      if (currentCLICommand) currentCLICommand = currentCLICommandArgumentNames = currentCLICommandShortFlagCharacters = undefined
    } else errors.push([lineIndex, undefined, DocumentationLink.CLI, CLIDefinitionErrorType.SyntaxError])
  }

  if (currentCategory && categories.get(currentCategory)!.length === 0) {
    const categoryLineIndex = lines.findLastIndex((line) => {
      if (line.endsWith(':') && line.startsWith(currentCategory)) {
        const name = line.slice(0, line.lastIndexOf(':'))

        if (name === currentCategory) return true
      }

      return false
    })

    errors.push([categoryLineIndex, undefined, DocumentationLink.Categories, CLIDefinitionErrorType.NoCLICommandDefinedForCategory, currentCategory])
  }

  if (Object.keys(cliCommands).length === 0) errors.push([-1, '', DocumentationLink.CommandDefinitions, CLIDefinitionErrorType.NoCLICommandDefinitions])
  else if (uncategorizedCLICommandNames.length > 0) categories.set(categories.size === 0 ? CATEGORY_DEFAULT : CATEGORY_UNCATEGORIZED, [...uncategorizedCLICommandNames])

  const parsedCLIDefinition: ParsedCLIDefinition = { categories, commands: cliCommands, variables }

  if (aliasBlacklistLineIndex !== undefined || aliasWhitelistLineIndex !== undefined) {
    if (aliasBlacklistLineIndex !== undefined && aliasWhitelistLineIndex !== undefined) {
      errors.push([aliasBlacklistLineIndex, CLIVariable.AliasBlacklist, DocumentationLink.CLIVariables, CLIDefinitionErrorType.ConflictingAliasListVariables])
      errors.push([aliasWhitelistLineIndex, CLIVariable.AliasWhitelist, DocumentationLink.CLIVariables, CLIDefinitionErrorType.ConflictingAliasListVariables])
    } else {
      const commandNames = Object.keys(cliCommands)

      if (aliasBlacklistLineIndex !== undefined) {
        const variable = variables[CLIVariable.AliasBlacklist]!
        const invalidAliases = [...new Set(variable.split(' '))].filter((name) => !commandNames.includes(name))

        if (invalidAliases.length > 0) {
          errors.push([aliasBlacklistLineIndex, variable, DocumentationLink.CLIVariables, CLIDefinitionErrorType.InvalidVariableAliasListCLICommandNames, ...invalidAliases])
        }
      }

      if (aliasWhitelistLineIndex !== undefined) {
        const invalidAliases = [...new Set(variables[CLIVariable.AliasWhitelist]!.split(' '))].filter((name) => !commandNames.includes(name))

        if (invalidAliases.length > 0) {
          const line = lines[aliasWhitelistLineIndex]!
          const value = line.slice(line.indexOf(CLIVariable.AliasWhitelist) + CLIVariable.AliasWhitelist.length)

          errors.push([aliasWhitelistLineIndex, value, DocumentationLink.CLIVariables, CLIDefinitionErrorType.InvalidVariableAliasListCLICommandNames, ...invalidAliases])
        }
      }
    }
  }

  if (errors.length > 0) parsedCLIDefinition.errors = errors.sort(([lineIndexA], [lineIndexB]) => lineIndexA > lineIndexB ? 1 : -1)

  return parsedCLIDefinition
}

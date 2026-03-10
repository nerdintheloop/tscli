import { bold } from './ansi.ts'

export const DocumentationLink = {
  Categories: 0,
  CLI: 7,
  CLICommands: 8,
  CLIVariables: 9,
  CommandDefinitions: 1,
  FlagArguments: 2,
  Installation: 3,
  Introduction: 4,
  PositionalArguments: 5,
  RestArgument: 6,
  Scripts: 10,
  ShellAliases: 11,
}

export const DOCUMENTATION_URL = 'https://nerdintheloop.pages.dev/tscli'

export const documentationLinkLine = (link: number) => {
  _documentationLabels ??= [
    'categories',
    'creating a CLI',
    'running CLI commands',
    'CLI variables',
    'defining commands',
    'flag arguments',
    'installing tscli',
    'tscli',
    'positional arguments',
    'rest arguments',
    `using the ${bold('r$')} scripting function`,
    'shell aliases',
  ]
  _documentationPaths ??= [
    '/categories',
    '/cli',
    '/cli-commands',
    '/cli-variables',
    '/command-definitions',
    '/flag-arguments',
    '/installation',
    '',
    '/positional-arguments',
    '/rest-argument',
    '/scripts',
    '/shell-aliases',
  ]

  return `Learn more about ${_documentationLabels[link]} at ${bold(`${DOCUMENTATION_URL}${_documentationPaths[link]}`)}.`
}

let _documentationLabels: string[] | undefined
let _documentationPaths: string[] | undefined

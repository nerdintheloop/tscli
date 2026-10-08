import { readFile, rm, writeFile } from 'node:fs/promises'
import { EOL } from 'node:os'
import { resolve } from 'node:path'
import { chdir } from 'node:process'
import { tscli } from '../source/index.ts'
import { bold } from './log.ts'

type PublishTaskFunctionArguments = {
  token: string
}

export const publish = async ({ token }: PublishTaskFunctionArguments) => {
  if (!token) {
    await tscli.$`log -rXl publish An npm registry access token is required`
    return 1
  }

  const projectDirectoryPath = new URL('..', import.meta.url).pathname

  chdir(projectDirectoryPath)

  const currentBranch = (await tscli.$`git branch --show-current`.capture({ output: 'text' })).text.trim()

  if (currentBranch !== 'main') {
    await tscli.$`log -rXl publish Currently on the ${bold(currentBranch)} branch, switch to the ${bold('main')} branch and ensure that all changes are committed before publishing`
    return 1
  }

  const currentStatus = (await tscli.$`git status -s`.capture({ output: 'text' })).text.trim()

  if (currentStatus !== '') {
    await tscli.$`log -rXl publish Commit all changes before publishing`
    console.log(currentStatus.trimEnd())
    return 1
  }

  const packageJSON = JSON.parse(await readFile(resolve(projectDirectoryPath, 'package.json'), { encoding: 'utf8' }))
  const { version } = packageJSON
  const tagIndex = (await tscli.$`git tag`.capture({ output: 'text' })).text.trim().split(EOL).findIndex(tag => tag === `v${version}`)

  if (tagIndex === -1) {
    await tscli.$`log -rXl publish Create tag ${bold(`v${version}`)} before publishing package to the npm registry`
    return 1
  }

  let { exitCode } = await tscli.$`
    log -tWyl publish Publishing ${bold(`${packageJSON.name}@${version}`)} to the npm registry...
    build
  `

  if (exitCode) return exitCode

  const buildDirectoryPath = resolve(projectDirectoryPath, 'build')

  await writeFile(resolve(buildDirectoryPath, '.npmrc'), `//registry.npmjs.org/:_authToken=${token}`)

  void ({ exitCode } = await tscli.$`
    cd ${buildDirectoryPath}
    bun publish --access public
  `)

  await rm(resolve(buildDirectoryPath, '.npmrc'))

  if (exitCode) return exitCode

  await tscli.$`
    bun update
    log -CgTl publish
  `
}

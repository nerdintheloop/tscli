import { tscli } from '@nitl-temp/tscli'
import { rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

type PublishTaskFunctionArguments = {
  token: string
}

export default async ({ token }: PublishTaskFunctionArguments) => {
  if (!token) {
    await tscli.$`log -brnx An npm registry access token is required`
    return 1
  }

  let { exitCode } = await tscli.$`
    log -tWyl publish Publishing package to npm registry...
    build
  `

  if (exitCode) return exitCode

  const buildDirectoryPath = new URL('../build', import.meta.url).pathname

  await writeFile(resolve(buildDirectoryPath, '.npmrc'), `//registry.npmjs.org/:_authToken=${token}`)

  void ({ exitCode } = await tscli.$`
    cd ${buildDirectoryPath}
    bun publish --access public
  `)

  await rm(resolve(buildDirectoryPath, '.npmrc'))

  if (exitCode) return exitCode

  await tscli.$`log -CgTl publish`
}

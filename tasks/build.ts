import { tscli } from '@nitl-temp/tscli'
import { build, file } from 'bun'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import packageJSON from '../package.json' with { type: 'json' }

const LET_VARIABLES = ['_documentationLabels', '_documentationPaths', 'run']

export default async () => {
  const projectDirectoryPath = new URL('..', import.meta.url).pathname
  const buildDirectoryPath = resolve(projectDirectoryPath, 'build')
  const sourceDirectoryPath = resolve(projectDirectoryPath, 'source')

  await tscli.$`
    log -tWyl build Building...
    rm -rf ${buildDirectoryPath}
  `

  const { logs, outputs, success } = await build({
    entrypoints: [resolve(sourceDirectoryPath, 'index.ts')],
    format: 'esm',
    outdir: buildDirectoryPath,
    packages: 'external',
    target: 'node',
  })

  if (logs.length > 0) {
    for (const message of logs) console.error(message)
  }

  if (success) {
    await Promise.all(outputs.map(async ({ path }) => {
      let fileContents = (await file(path).text())
        .replaceAll('var ', 'const ')
        .split('\n')
        .filter((line: string) => !(line.startsWith('//')))
        .join('\n')

      for (const variable of LET_VARIABLES) fileContents = fileContents.replace(`const ${variable};`, `let ${variable};`)

      await writeFile(path, fileContents)
    }))
  } else return 1

  delete packageJSON.devDependencies

  packageJSON.exports = { import: './index.js', types: './index.d.ts' }

  await writeFile(resolve(buildDirectoryPath, 'package.json'), JSON.stringify(packageJSON, null, '  '))

  await tscli.$`cp ${resolve(projectDirectoryPath, 'LICENSE')} ${resolve(projectDirectoryPath, 'README.md')} ${resolve(sourceDirectoryPath, 'index.d.ts')} ${buildDirectoryPath}`

  await tscli.$`log -CgTl build Build completed`
}

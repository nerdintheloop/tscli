import { build as bunBuild, file, write } from 'bun'
import { chdir } from 'node:process'
import packageJSON from '../package.json'
import { tscli } from '../source/index.ts'
import { PROJECT_DIRECTORY_PATH } from './shared.ts'

const LET_VARIABLES = ['CLIDefinitionErrorMessage', '_documentationValues', '_optionArgumentRegex', '_positionalArgumentRegex', '_restArgumentRegex', 'functions', 'run']

export const build = async () => {
  const { version } = packageJSON

  chdir(PROJECT_DIRECTORY_PATH)

  await tscli.$`
    log -tw build Building version ${version}...
    rmdir build
    mkdir build
    log -w build Bundling code...
  `

  await bunBuild({
    entrypoints: ['source/index.ts'],
    format: 'esm',
    packages: 'external',
    plugins: [{
      name: 'Restore constants',
      setup(build) {
        build.onEnd(async ({ outputs: [output] }) => {
          let code = (await output!.text())
            .replaceAll('var ', 'const ')
            .split('\n')
            .filter((line: string) => !(line.trim().startsWith('//')))
            .join('\n')

          for (const variable of LET_VARIABLES) code = code.replace(`const ${variable};`, `let ${variable};`)

          await write('build/index.js', code)
        })
      }
    }],
    target: 'node',
  })

  await tscli.$`log -w build Writing package and types files...`

  delete packageJSON.devDependencies
  packageJSON.exports = { import: './index.js', types: './index.d.ts' }

  await Promise.all([
    write('build/package.json', JSON.stringify(packageJSON, null, '  ')),
    write('build/index.d.ts', (await file('source/types.ts').text()).replace('type tscli =', 'const tscli:'))
  ])

  await tscli.$`
    log -w build Adding license, README and types...
    cp LICENSE README.md build
    log -sT build Version ${version} built
  `
}

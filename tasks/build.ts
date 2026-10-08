import { build as bunBuild, file, write } from 'bun'
import { chdir } from 'node:process'
import { tscli } from '../source/index.ts'

const LET_VARIABLES = ['CLIDefinitionErrorMessage', '_documentationValues', '_optionArgumentRegex', '_positionalArgumentRegex', '_restArgumentRegex', 'functions', 'run']

export const build = async () => {
  chdir(new URL('..', import.meta.url).pathname)

  const packageJSON = await file('package.json').json()
  const { version } = packageJSON

  await tscli.$`
    log -tw build Building version ${version}...
    rm -rf build
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

  await tscli.$`log -w build Writing package file...`
  delete packageJSON.devDependencies
  packageJSON.exports = { import: './index.js', types: './index.d.ts' }
  await write('build/package.json', JSON.stringify(packageJSON, null, '  '))

  await tscli.$`log -w build Writing types file...`
  await write('build/index.d.ts', (await file('source/types.ts').text()).replace('type tscli =', 'const tscli:'))

  await tscli.$`
    log -w build Adding license, README and types...
    cp LICENSE README.md build
    log -sT build Version ${version} built
  `
}

import { platform, resolve, stat } from './external.ts'
import { Runtime } from './run.ts'

export const firstExistingFilePath = async (...filePaths: string[]) => {
  for (const filePath of filePaths) {
    if (await isExistingFilePath(filePath)) return filePath
  }

  return undefined
}

const getPathStats = async (path: string) => {
  try {
    return await stat(path)
  } catch (_) {
    return undefined
  }
}

export const getProjectExecutablePath = (projectDirectoryPath: string, name: string) => {
  const executablesDirectoryPath = resolve(projectDirectoryPath, 'node_modules', '.bin')
  const possibleExecutablePaths = [resolve(executablesDirectoryPath, name)]

  if (platform === 'win32') possibleExecutablePaths.unshift(resolve(executablesDirectoryPath, `${name}.cmd`), resolve(executablesDirectoryPath, `${name}.exe`))

  return firstExistingFilePath(...possibleExecutablePaths)
}

export const hasProjectExecutablesDirectory = (projectDirectoryPath: string) => isExistingDirectoryPath(resolve(projectDirectoryPath, 'node_modules', '.bin'))

export const isExistingDirectoryPath = async (path: string) => (await getPathStats(path))?.isDirectory() ?? false

export const isExistingFilePath = async (path: string) => (await getPathStats(path))?.isFile() ?? false

export const isProjectDirectoryPath = async (path: string, runtime: string) => (runtime === Runtime.Deno && await isExistingFilePath(resolve(path, 'deno.json')) || await isExistingFilePath(resolve(path, 'package.json')))

export { Buffer } from 'node:buffer'
export { spawn, spawnSync, type SpawnOptions } from 'node:child_process'
export { stat, writeFile } from 'node:fs/promises'
export { EOL } from 'node:os'
export { parse, relative, resolve, sep } from 'node:path'
export { argv, chdir, cwd, env, execArgv, platform, default as process } from 'node:process'
export { pathToFileURL } from 'node:url'
export { format, parseArgs, type ParseArgsConfig } from 'node:util'
export { SIGHUP, SIGINT }
import { constants } from 'node:os'
const { SIGHUP, SIGINT } = constants.signals

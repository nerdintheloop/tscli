import { tscli } from '../source/index.ts'
import { green, LogMessageIcon, red, yellow } from './Utilities.ts'

tscli`

Main:

  build Builds npm package

  publish Publishes package to the npm registry
    . token The npm registry access token

Utilities:

  cp Copies files in project
    ...paths The source path(s) and destination path

  log Logs a message with an icon and label
    --error -e Writes to stderr and uses the error icon: ${red(LogMessageIcon.Error)}
    --start-timer -t Starts a timer
    --stop-timer -T Stops timer and outputs elapsed time
    --success -s Uses the success icon: ${green(LogMessageIcon.Success)}
    --wait -w Uses the wait icon: ${yellow(LogMessageIcon.Wait)}
    . label The label
    ...message string The log message

  mkdir Makes directories in project
    ...paths The directory paths

  rmdir Removes directories from project
    ...paths The directory paths

`({
  alias: 'tscli',
  runtime: 'bun'
})

import { bold, isObject, RegularExpression, Runtime, toString } from './shared.ts'
import type { Configuration } from './types.ts'

export const sanitizeConfiguration = (configuration: Configuration) => {
  const values: Configuration = {}

  if (isObject(configuration)) {
    const { alias, env, functions, runtime } = configuration

    if (alias !== undefined) {
      if (typeof alias === 'string' && RegularExpression.CommandName.test(alias)) values.alias = alias
      else process.stderr.write(`Invalid alias value: ${bold(toString(alias))}`)
    }

    if (env !== undefined) {
      if (isObject(env) && Object.values(env).every(value => typeof value === 'string')) values.env = env
      else process.stderr.write(`Invalid env value: ${bold(toString(env))}`)
    }

    if (functions !== undefined) {
      if (isObject(functions) && Object.values(functions).every(value => typeof value === 'function')) values.functions = functions
      else process.stderr.write(`Invalid functions value: ${bold(toString(functions))}`)
    }

    if (runtime !== undefined) {
      if (Object.values(Runtime).includes(runtime)) values.runtime = runtime
      else process.stderr.write(`Invalid runtime value: ${bold(toString(runtime))}`)
    }
  } else process.stderr.write(`Invalid configuration value: ${bold(toString(configuration))}`)

  return values
}

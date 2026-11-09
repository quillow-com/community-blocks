import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const sdk = path.dirname(
  fileURLToPath(import.meta.resolve('@quillow/custom-block-sdk'))
)
const license = await readFile(path.join(sdk, '../LICENSE'), 'utf8')
const pkg = JSON.parse(
  await readFile(path.join(sdk, '../package.json'), 'utf8')
)
const runtime =
  `/*! @quillow/custom-block-sdk\n${license}*/\n` +
  (await readFile(path.join(sdk, 'index.js'), 'utf8')).replace(
    /^\/\/# sourceMappingURL=.*\r?\n?/gm,
    ''
  )
const outputs = {
  'examples/hello-world/package/runtime.js': runtime,
  'examples/hello-world/THIRD_PARTY_NOTICES': `@quillow/custom-block-sdk@${pkg.version}\n\n${license}`,
}

for (const [name, content] of Object.entries(outputs)) {
  const target = path.join(root, name)
  if (process.argv.includes('--check')) {
    if ((await readFile(target, 'utf8')) !== content)
      throw new Error(`${name} is stale; run npm run sync:runtime`)
  } else {
    await writeFile(target, content)
  }
}
console.log(
  `Starter SDK ${pkg.version}: ${process.argv.includes('--check') ? 'verified' : 'copied'}`
)

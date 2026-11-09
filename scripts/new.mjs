import {
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { validSlug } from './lib/metadata.mjs'
import { screenshotLayouts } from './lib/screenshots.mjs'
import { syncReleaseConfig } from './lib/release-config.mjs'

const [slug, flag, github, ...extra] = process.argv.slice(2)
if (
  !validSlug(slug) ||
  flag !== '--author' ||
  !github ||
  !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(github) ||
  extra.length
)
  throw new Error('Usage: npm run new -- my-widget --author your-github-handle')
const root = fileURLToPath(new URL('../', import.meta.url))
const target = path.join(root, 'blocks', slug)
await mkdir(target) // Exclusive creation: never overwrite a contributor's existing block.
try {
  const example = path.join(root, 'examples/hello-world')
  for (const name of await readdir(example)) {
    await cp(path.join(example, name), path.join(target, name), {
      recursive: true,
      force: false,
      errorOnExist: true,
    })
  }
  const metadata = JSON.parse(
    await readFile(path.join(target, 'metadata.json'), 'utf8')
  )
  metadata.slug = slug
  metadata.author = { name: github, github }
  metadata.description = `A community ${slug.replaceAll('-', ' ')} block.`
  const manifest = JSON.parse(
    await readFile(path.join(target, 'package/manifest.json'), 'utf8')
  )
  manifest.name = slug
    .split('-')
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ')
  await writeFile(
    path.join(target, 'metadata.json'),
    JSON.stringify(metadata, null, 2) + '\n'
  )
  await writeFile(
    path.join(target, 'package/manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  )
  await mkdir(path.join(target, 'screenshots'), { recursive: true })
  if (!(await lstat(path.join(target, 'package/runtime.js'))).isFile())
    throw new Error('Starter runtime is missing; run npm run sync:runtime')
} catch (error) {
  await rm(target, { recursive: true, force: true }) // Only the new directory created by this invocation.
  throw error
}
await syncReleaseConfig(root)
console.log(
  `Created blocks/${slug}/. Customize its name, README, description and author before opening a PR.\nAdd real screenshots: ${screenshotLayouts.map(({ name, width, height }) => `${name} ${width}×${height}`).join(', ')} pixels.\nNo placeholder images were created. Checks/builds require these files; see blocks/${slug}/screenshots/README.md.`
)

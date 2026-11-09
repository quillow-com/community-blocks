import { createGitHubClient } from './lib/github.mjs'

const outputs = JSON.parse(process.env.RELEASE_OUTPUTS_JSON ?? '{}')
const prs = JSON.parse(outputs.prs ?? '[]')
if (!Array.isArray(prs)) throw new Error('Invalid release PR outputs')
const github = createGitHubClient(process.env.GITHUB_TOKEN)
const base = await github.getMainCommit()
for (const pr of prs) {
  if (pr.baseBranchName !== 'main')
    throw new Error('Release PR must target main')
  await github.dispatchCheck(pr.headBranchName, base)
}
console.log(`Dispatched read-only checks for ${prs.length} release PR(s).`)

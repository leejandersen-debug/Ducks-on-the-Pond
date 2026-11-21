# Rollback evidence: 2026-11-21

A real production rollback of the live app (`ducks-on-the-pond`, https://ducks-on-the-pond-psi.vercel.app), done once on purpose and then undone. Both deployments run the same app code (the two pushes between them changed only `.gitignore` and the untracked prompt logs), so users saw no change in behavior.

How each step was proven: fetch `/catalog`, take the request id from the response's `x-vercel-id` header, then find that request's `request_done` line in the production logs (`vercel logs`). The log line names the deployment that served it.

| Step | Time (UTC) | Command | Serving deployment (from the request log line) |
|---|---|---|---|
| Before | 17:57:53 | (none) | `dpl_DoBvLLGCCajX36MzSmMhAP1nT5GZ` (khpxmhut3, commit 22f1557) |
| Roll back | 18:00:06 | `vercel rollback https://ducks-on-the-pond-7mwd2gvgv-team-lee5.vercel.app --yes`: "Success! … rolled back to … (dpl_2oCEfQ2rkP8Mbk9cn2NKmji66XsW) [2s]" | |
| After rollback | 18:00:17 | (none) | `dpl_2oCEfQ2rkP8Mbk9cn2NKmji66XsW` (7mwd2gvgv, commit b1e4370) |
| Promote back | 18:05:08 | `vercel promote https://ducks-on-the-pond-khpxmhut3-team-lee5.vercel.app --yes`: "Success! … promoted to … (dpl_DoBvLLGCCajX36MzSmMhAP1nT5GZ) [2s]" | |
| After promote | 18:05:13 | (none) | `dpl_DoBvLLGCCajX36MzSmMhAP1nT5GZ` (khpxmhut3) |

## The log lines
```
2026-11-21T17:57:53.113Z deploymentId=dpl_DoBvLLGCCajX36MzSmMhAP1nT5GZ requestId=bw5bq-1795283872973-d85a96a69ee7
{"ts":"2026-11-21T17:57:53.113Z","level":"info","event":"request_done","details":{"route":"/catalog","method":"GET","status":200,"ms":85}}

2026-11-21T18:00:17.331Z deploymentId=dpl_2oCEfQ2rkP8Mbk9cn2NKmji66XsW requestId=jjvjw-1795284016364-14578d63e209
{"ts":"2026-11-21T18:00:17.330Z","level":"info","event":"request_done","details":{"route":"/catalog","method":"GET","status":200,"ms":222}}

2026-11-21T18:05:13.991Z deploymentId=dpl_DoBvLLGCCajX36MzSmMhAP1nT5GZ requestId=tr8sk-1795284313807-7ce5a801ec8e
{"ts":"2026-11-21T18:05:13.991Z","level":"info","event":"request_done","details":{"route":"/catalog","method":"GET","status":200,"ms":124}}
```

## Checks
- While rolled back, `/catalog` still showed 2026 Topps Chrome and 2026 Bowman Prospects.
- After the promote, the project has `autoAssignCustomDomains: true` and `lastRollbackTarget: null`, so the next git push deploys to production as usual.
- Screenshots: the owner took the Vercel Deployments page showing the rolled-back state, and the live catalog while rolled back.

## How to roll back in an emergency
1. Run `npx vercel ls ducks-on-the-pond --prod` and pick the last deployment that was ● Ready before the bad one.
2. Run `npx vercel rollback <that deployment's URL> --yes`. It takes about 2 seconds.
3. Confirm with a request: the `request_done` log line's `deploymentId` should be the one you rolled back to.
4. After fixing and pushing, run `npx vercel promote <new deployment URL> --yes` to turn automatic production deploys back on.

# SonarQube Quality Gate (optional)

Configure after the first coverage-enabled analysis is green.

## SonarQube UI

1. **Quality Gates → Create** (or edit default):
   - **New Code**:
     - 0 new Blocker/Critical issues
     - Max 5 new High issues (tighten over time)
     - Coverage on new code ≥ 50% (raise quarterly)
   - **Overall** (informational):
     - Track HIGH count trending down

2. **Project `dome` → Project Settings → Quality Gate**: assign the gate above.

3. **Webhook** (optional): notify Slack/email when gate fails on `main` analysis.

## GitHub PR decoration (optional)

Requires SonarQube Developer Edition or community plugin + token.

Add to CI or Jenkins PR builds:

```properties
sonar.pullrequest.key=${CHANGE_ID}
sonar.pullrequest.branch=${CHANGE_BRANCH}
sonar.pullrequest.base=${CHANGE_TARGET}
```

For GitHub Actions on `pull_request`, set env from `github.event`.

## Metrics to track weekly

- OPEN HIGH count (target: −20 in first 2 weeks)
- Coverage % on `packages/agent-core` + `electron/__tests__` + renderer (`app/`) + `@dome/ai` — see [sonar-hotspots-and-coverage.md](./sonar-hotspots-and-coverage.md)
- Security Hotspots Reviewed (UI card **Hotspots Reviewed**): mark Safe / Fixed / Acknowledged; script `pnpm run sonar:review-hotspots`
- GitHub issues closed with label `sonar`

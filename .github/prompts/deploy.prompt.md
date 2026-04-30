---
description: "Deploy the current project — checks status, runs build, deploys to target platform (Vercel, AWS, etc.)"
agent: "minimax"
tools: ["execute", "read", "search"]
---

Deploy this project to production:

1. Check git status — ensure working directory is clean
2. Run the build command and verify no errors
3. Deploy to the configured platform
4. Verify the deployment is live and healthy
5. Report the deployment URL and status

If there are uncommitted changes, ask before proceeding.
If the build fails, diagnose and fix before retrying.

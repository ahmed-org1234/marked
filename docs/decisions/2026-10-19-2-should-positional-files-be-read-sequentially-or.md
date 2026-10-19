# Should positional files be read sequentially or concurrently? AutoPilot chose: Keeps failure order predictable and limits simultaneous file operations. (#2)

**Question:** Should positional files be read sequentially or concurrently?

**What:** Should positional files be read sequentially or concurrently? AutoPilot chose: Keeps failure order predictable and limits simultaneous file operations.

**Why:** AutoPilot settled this without asking a person, because reverting this PR undoes it.

**Evidence:**

- bin/main.js:149
- bin/main.js:163
- bin/main.js:278

**Undo:** Revert the PR that added this record (#2), or reply on the ticket with what you want instead and AutoPilot will re-plan.

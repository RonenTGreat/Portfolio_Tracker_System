---
name: commit-msg
description: Inspects staged git changes, generates a conventional commit message, and commits the changes. Trigger when user says "write a commit message", "generate a commit", "commit my changes", or runs /commit-msg.
---

# Commit Message Skill

Follow this workflow when generating commit messages and committing staged changes:

## Workflow Steps

1. **Check Staged Changes**:
   Run `git diff --staged` to verify if any changes are staged.
   - If there are **no staged changes**, stop execution and tell the user to stage their changes first (e.g., using `git add`).

2. **Read Staged Diff**:
   Inspect the full staged diff output from `git diff --staged`.

3. **Generate Commit Message**:
   Format the commit message strictly according to the following structure:

   ```text
   type(scope): short subject

   - bullet of what changed
   - bullet of why
   ```

   ### Formatting Guidelines
   - **Types**: Must be one of `feat`, `fix`, `refactor`, `chore`, `docs`, `style`, `test`.
   - **Scope**: Concise lowercase identifier for the affected component or scope (e.g., `ui`, `skills`, `api`).
   - **Subject**: Short summary in imperative mood, under 60 characters.
   - **Body Bullets**: Optional but encouraged. Add bullet points detailing what changed and why.
   - **No Co-Author Trailer**: Never include a `Co-Authored-By` trailer.

4. **Run Commit**:
   Execute `git commit` using the generated commit message.

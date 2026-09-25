# GitHub push checklist

## 1. Create the repository

Create a new empty repository in the intended GitHub account or organization.

- Do not initialize it with a README, `.gitignore`, or license because this local repository already has history.
- Copy the exact repository URL GitHub displays after creation.
- No GitHub credentials or access tokens belong in this repository.

## 2. Commit this checklist

From the project root:

```bash
git add GITHUB_PUSH_CHECKLIST.md
git commit -m "Add GitHub push checklist"
```

Confirm the working tree is clean:

```bash
git status
```

## 3. Add the GitHub remote and push

Replace the placeholder below with the exact repository URL copied from GitHub. Do not run the placeholder literally.

```bash
git remote add origin <YOUR_GITHUB_REPOSITORY_URL>
git branch -M main
git push -u origin main
```

Authentication is handled by the user's normal Git credential manager, SSH agent, or GitHub sign-in flow. Do not put credentials in the remote URL.

## 4. Run the real macOS build

1. Open the repository on GitHub.
2. Select **Actions**.
3. Select **Mac Build**.
4. Select **Run workflow** on the `main` branch.
5. Wait for **Build unsigned macOS installer** to complete.

The workflow must run on GitHub's real `macos-latest` environment. Linux and Docker preflight must never be used to fabricate a `.pkg`.

## 5. Download the artifact

Open the completed workflow run and download the artifact named:

```text
RYZE_Caption_Tool_Mac
```

Extract it. The expected installer filename is:

```text
RYZE_Caption_Tool_Mac.pkg
```

The unsigned package is for internal testing. Production distribution still requires the appropriate Adobe CEP signing, Apple Developer ID Installer signing, and Apple notarization.

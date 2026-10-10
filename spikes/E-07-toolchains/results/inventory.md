| الأداة | المسار | الإصدار |
|---|---|---|
| node | `/opt/homebrew/bin/node` → `/opt/homebrew/Cellar/node@24/24.18.1/bin/node` | v24.18.1 |
| node | `~/.nvm/versions/node/v20.20.2/bin/node` | v20.20.2 |
| node | `~/.nvm/versions/node/v24.14.0/bin/node` | v24.14.0 |
| node | `~/.nvm/versions/node/v24.16.0/bin/node` | v24.16.0 |
| npm | `/opt/homebrew/bin/npm` → `/opt/homebrew/Cellar/node@24/24.18.1/lib/node_modules/npm/bin/npm-cli.js` | 11.16.0 |
| npm | `~/.nvm/versions/node/v20.20.2/bin/npm` → `~/.nvm/versions/node/v20.20.2/lib/node_modules/npm/bin/npm-cli.js` | 10.8.2 |
| npm | `~/.nvm/versions/node/v24.14.0/bin/npm` → `~/.nvm/versions/node/v24.14.0/lib/node_modules/npm/bin/npm-cli.js` | 11.9.0 |
| npm | `~/.nvm/versions/node/v24.16.0/bin/npm` → `~/.nvm/versions/node/v24.16.0/lib/node_modules/npm/bin/npm-cli.js` | 11.13.0 |
| npx | `/opt/homebrew/bin/npx` → `/opt/homebrew/Cellar/node@24/24.18.1/lib/node_modules/npm/bin/npx-cli.js` | 11.16.0 |
| npx | `~/.nvm/versions/node/v20.20.2/bin/npx` → `~/.nvm/versions/node/v20.20.2/lib/node_modules/npm/bin/npx-cli.js` | 10.8.2 |
| npx | `~/.nvm/versions/node/v24.14.0/bin/npx` → `~/.nvm/versions/node/v24.14.0/lib/node_modules/npm/bin/npx-cli.js` | 11.9.0 |
| npx | `~/.nvm/versions/node/v24.16.0/bin/npx` → `~/.nvm/versions/node/v24.16.0/lib/node_modules/npm/bin/npx-cli.js` | 11.13.0 |
| pnpm | `~/.nvm/versions/node/v24.14.0/bin/pnpm` → `~/.nvm/versions/node/v24.14.0/lib/node_modules/corepack/dist/pnpm.js` | 12.8.1 |
| pnpm | `~/.nvm/versions/node/v24.16.0/bin/pnpm` → `~/.nvm/versions/node/v24.16.0/lib/node_modules/corepack/dist/pnpm.js` | 12.8.1 |
| yarn | `~/.nvm/versions/node/v24.14.0/bin/yarn` → `~/.nvm/versions/node/v24.14.0/lib/node_modules/corepack/dist/yarn.js` | 1.22.22 |
| yarn | `~/.nvm/versions/node/v24.16.0/bin/yarn` → `~/.nvm/versions/node/v24.16.0/lib/node_modules/corepack/dist/yarn.js` | 1.22.22 |
| bun | `~/.bun/bin/bun` | 1.3.14 |
| corepack | `/opt/homebrew/bin/corepack` → `/opt/homebrew/Cellar/node@24/24.18.1/lib/node_modules/corepack/dist/corepack.js` | 0.35.0 |
| corepack | `~/.nvm/versions/node/v20.20.2/bin/corepack` → `~/.nvm/versions/node/v20.20.2/lib/node_modules/corepack/dist/corepack.js` | 0.34.6 |
| corepack | `~/.nvm/versions/node/v24.14.0/bin/corepack` → `~/.nvm/versions/node/v24.14.0/lib/node_modules/corepack/dist/corepack.js` | 0.34.6 |
| corepack | `~/.nvm/versions/node/v24.16.0/bin/corepack` → `~/.nvm/versions/node/v24.16.0/lib/node_modules/corepack/dist/corepack.js` | 0.35.0 |
| python3 | `/usr/bin/python3` | Python 3.9.6 |
| python3.12 | `/opt/homebrew/bin/python3.12` → `/opt/homebrew/Cellar/python@3.12/3.12.13_4/Frameworks/Python.framework/Versions/3.12/bin/python3.12` | Python 3.12.13 |
| git | `/usr/bin/git` | git version 2.54.0 (Apple Git-157) |
| gh | `/opt/homebrew/bin/gh` → `/opt/homebrew/Cellar/gh/2.96.0/bin/gh` | gh version 2.96.0 (2026-07-02) |
| brew | `/opt/homebrew/bin/brew` | Homebrew 7.0.7 |
| xed | `/usr/bin/xed` | xed version 27.0 |
| xcodebuild | `/usr/bin/xcodebuild` | Xcode 27.0 |
| gitleaks | `/opt/homebrew/bin/gitleaks` → `/opt/homebrew/Cellar/gitleaks/8.30.1/bin/gitleaks` | 8.30.1 |

| مدير الإصدارات | المجلد | المحتوى |
|---|---|---|
| nvm | `~/.nvm/versions/node` | v20.20.2، v24.14.0، v24.16.0 |
| nvmDefault | `~/.nvm/alias/default` | 24 |
| fnm | `~/.local/share/fnm/node-versions` | غير موجود |
| mise | `~/.local/share/mise/installs` | غير موجود |
| asdf | `~/.asdf/installs` | غير موجود |
| pyenv | `~/.pyenv/versions` | غير موجود |
| uvPython | `~/.local/share/uv/python` | غير موجود |
| volta | `~/.volta/tools/image/node` | غير موجود |
| corepackCache | `~/.cache/node/corepack` | lastKnownGood.json، v1 |

**صدفة المالك (`zsh -ic whence -w`):**

```text
node: function
npm: function
npx: function
pnpm: function
corepack: function
yarn: function
nvm: function
uv: none
python3: command
PATH=~/.kimi-code/bin:~/.fly/bin:~/.fly/bin:/usr/local/bin:~/.bun/bin:~/.local/bin:~/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin
v24.16.0
12.8.1
```

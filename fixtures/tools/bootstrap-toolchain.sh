#!/bin/sh
# يبني صندوق أدوات مشاريع الاختبار بإصدارات مثبتة (ORG-09: تنزيل دون استئذان من المصدر الرسمي، ويُذكر في التسليم).
#   sh fixtures/tools/bootstrap-toolchain.sh            # إلى ~/.cache/ayar-fixtures-toolchain
#   AYAR_FX_HOME=/مجلد sh fixtures/tools/bootstrap-toolchain.sh
# المتطلبات المسبقة (لا يثبتها هذا السكربت): macOS arm64، وnode 24 مع pnpm 12.8.1 في المجلد نفسه، وpython3.12، وgit، وgh مسجل الدخول،
# وgitleaks 8.30.1. الإصدارات المثبتة معلنة أدناه وفي toolchain.json.
set -eu
HOME_DIR="${AYAR_FX_HOME:-$HOME/.cache/ayar-fixtures-toolchain}"
UV=0.13.0; SEMGREP=1.180.0; OSV=v2.6.0; LYCHEE=lychee-v0.24.2
OSV_SHA=98c460dcd37de25819babd757d04542045b6243113e209edcd4d89fedb0256b4
mkdir -p "$HOME_DIR/bin" "$HOME_DIR/dl" "$HOME_DIR/node"

# 1) بايثون: uv وsemgrep في بيئة معزولة
[ -x "$HOME_DIR/py/bin/python" ] || python3.12 -m venv "$HOME_DIR/py"
"$HOME_DIR/py/bin/pip" install --quiet "uv==$UV" "semgrep==$SEMGREP"

# 2) osv-scanner (ثنائي Go) مع التحقق من البصمة
gh release download "$OSV" -R google/osv-scanner -p 'osv-scanner_darwin_arm64' -D "$HOME_DIR/dl" --clobber
echo "$OSV_SHA  $HOME_DIR/dl/osv-scanner_darwin_arm64" | shasum -a 256 -c -
install -m 0755 "$HOME_DIR/dl/osv-scanner_darwin_arm64" "$HOME_DIR/bin/osv-scanner"

# 3) lychee (ثنائي Rust) مع التحقق من البصمة المنشورة
gh release download "$LYCHEE" -R lycheeverse/lychee -p 'lychee-aarch64-apple-darwin.tar.gz*' -D "$HOME_DIR/dl" --clobber
(cd "$HOME_DIR/dl" && shasum -a 256 -c lychee-aarch64-apple-darwin.tar.gz.sha256 && tar xzf lychee-aarch64-apple-darwin.tar.gz)
install -m 0755 "$HOME_DIR/dl/lychee-aarch64-apple-darwin/lychee" "$HOME_DIR/bin/lychee"

# 4) أدوات Node المساعدة: playwright-core وaxe-core (للفاحصات) وeslint (لقياس التعقيد في FX-NOTEST)
cat > "$HOME_DIR/node/package.json" <<'JSON'
{ "name": "ayar-fx-toolchain-node", "private": true, "version": "1.0.0" }
JSON
(cd "$HOME_DIR/node" && npm install --save-exact --no-audit --no-fund playwright-core@1.64.0 axe-core@4.14.0 eslint@10.12.0)
ln -sf "$HOME_DIR/node/node_modules/.bin/eslint" "$HOME_DIR/bin/eslint"

# 5) Chromium لـ Playwright (يُنزَّل إلى ~/Library/Caches/ms-playwright)
(cd "$HOME_DIR/node" && ./node_modules/.bin/playwright-core install chromium)

echo "تم: $HOME_DIR"
"$HOME_DIR/py/bin/uv" --version; "$HOME_DIR/py/bin/semgrep" --version; "$HOME_DIR/bin/osv-scanner" --version | head -1; "$HOME_DIR/bin/lychee" --version

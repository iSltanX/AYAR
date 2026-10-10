#!/bin/sh
# E-08 (1): تنزيل Betterleaks 1.9.0 وcosign 3.1.3 بإصدارين مثبتين من GitHub Releases إلى ~/.cache/ayar-dev2 (ORG-09، D-13)،
# والتحقق من بصمة SHA-256 ومن توقيع sigstore لملف checksums الخاص بـ Betterleaks (بـ cosign)، ثم تشغيل betterleaks version.
# يكتب الخرج إلى results/download.txt. لا يثبّت شيئًا في النظام.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
OUT="$HERE/results/download.txt"; mkdir -p "$HERE/results"
D=~/.cache/ayar-dev2; mkdir -p "$D/betterleaks/dl" "$D/cosign/dl" "$D/gitleaks/dl"
GH=/opt/homebrew/bin/gh
{
echo "# E-08 downloads — $(date -u +%FT%TZ)"
echo "## cosign 3.1.3"
cd "$D/cosign/dl" && $GH release download v3.1.3 -R sigstore/cosign -p 'cosign-darwin-arm64' -p 'cosign_checksums.txt' -p 'cosign_checksums.txt.sigstore.json' --clobber 2>&1
grep ' cosign-darwin-arm64$' cosign_checksums.txt | shasum -a 256 -c - && echo "cosign sha256: $(shasum -a 256 cosign-darwin-arm64 | cut -d' ' -f1)"
install -m 0755 cosign-darwin-arm64 "$D/cosign/cosign"
xattr -l "$D/cosign/cosign" | head -3; echo "xattr(cosign) listed above (فارغ = لا سمة حجر)"
codesign -dv "$D/cosign/cosign" 2>&1 | grep -E "Signature|Identifier|flags" | head -3
"$D/cosign/cosign" version 2>&1 | head -4
echo "## betterleaks 1.9.0"
cd "$D/betterleaks/dl" && $GH release download v1.9.0 -R betterleaks/betterleaks -p 'betterleaks_1.9.0_darwin_arm64.tar.gz' -p 'checksums.txt' -p 'checksums.txt.sigstore.json' --clobber 2>&1
grep ' betterleaks_1.9.0_darwin_arm64.tar.gz$' checksums.txt | shasum -a 256 -c - && echo "betterleaks tarball sha256: $(shasum -a 256 betterleaks_1.9.0_darwin_arm64.tar.gz | cut -d' ' -f1)"
echo "### cosign verify-blob (sigstore bundle, keyless: GitHub Actions OIDC)"
"$D/cosign/cosign" verify-blob --bundle checksums.txt.sigstore.json \
  --certificate-identity-regexp '^https://github.com/betterleaks/betterleaks/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com checksums.txt 2>&1; echo "verify-blob exit=$?"
echo "### cosign verify-blob بهوية خاطئة (ضابط سلبي: يجب أن يفشل)"
"$D/cosign/cosign" verify-blob --bundle checksums.txt.sigstore.json \
  --certificate-identity-regexp '^https://github.com/gitleaks/gitleaks/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com checksums.txt 2>&1 | tail -2; echo "verify-blob(wrong identity) exit=$?"
mkdir -p "$D/betterleaks/bin" && tar xzf betterleaks_1.9.0_darwin_arm64.tar.gz -C "$D/betterleaks/bin" && ls -la "$D/betterleaks/bin"
xattr -l "$D/betterleaks/bin/betterleaks" | head -3; echo "xattr(betterleaks) listed above"
codesign -dv "$D/betterleaks/bin/betterleaks" 2>&1 | grep -E "Signature|Identifier|flags" | head -3
"$D/betterleaks/bin/betterleaks" version 2>&1 | head -2
echo "## gitleaks 8.30.1 (نسخة مُدارة لتجربة E-20؛ نسخة النظام من Homebrew تبقى كما هي)"
cd "$D/gitleaks/dl" && $GH release download v8.30.1 -R gitleaks/gitleaks -p 'gitleaks_8.30.1_darwin_arm64.tar.gz' -p 'gitleaks_8.30.1_checksums.txt' --clobber 2>&1
grep ' gitleaks_8.30.1_darwin_arm64.tar.gz$' gitleaks_8.30.1_checksums.txt | shasum -a 256 -c - && echo "gitleaks tarball sha256: $(shasum -a 256 gitleaks_8.30.1_darwin_arm64.tar.gz | cut -d' ' -f1)"
ls "$D/gitleaks/dl" | grep -c sigstore || echo "gitleaks: لا ملف توقيع sigstore في الإصدار (checksums فقط)"
mkdir -p "$D/gitleaks/bin" && tar xzf gitleaks_8.30.1_darwin_arm64.tar.gz -C "$D/gitleaks/bin" && "$D/gitleaks/bin/gitleaks" version
codesign -dv "$D/gitleaks/bin/gitleaks" 2>&1 | grep -E "Signature|Identifier|flags" | head -3
echo "## sizes"; du -sh "$D/cosign" "$D/betterleaks" "$D/gitleaks" 2>&1
} 2>&1 | sed "s#$HOME#~#g" | tee "$OUT"

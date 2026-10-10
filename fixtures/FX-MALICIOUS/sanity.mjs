// تشغيلات السلامة لـ FX-MALICIOUS (تُنفَّذ بـ: node fixtures/tools/sanity.mjs run FX-MALICIOUS)
// لا يُشغَّل git على المستودع المولَّد أبدًا: الأدوات الساكنة تُشغَّل تحت PATH فيه git مزيف يسجل كل استدعاء ويرفضه.
const run = (id, cmd, proves, extra = {}) => ({ id, cmd, exit: 0, proves, evidence: true, ...extra });
const SHIM = 'SH=$(mktemp -d); printf \'#!/bin/sh\\necho "cwd=$(pwd) $@" >> "%s/git.log"\\nexit 99\\n\' "$SH" > "$SH/git"; chmod +x "$SH/git"';
const RULE = '$FX_TOOLS/../FX-ADAPTERS/base/semgrep/rules/ayar-eval.yml';
const REPORT = 'n=0; m=0; [ -f "$SH/git.log" ] && n=$(wc -l < "$SH/git.log" | tr -d " ") && m=$(grep -c "cwd=$REPO" "$SH/git.log"); echo "GIT_CALLS=$n"; echo "GIT_CALLS_IN_REPO=$m"; echo "MARKERS=$(ls "$REPO/../markers" | wc -l | tr -d " ")"';
export default {
  versions: { node: 'node --version', git: 'git --version', semgrep: 'semgrep --version', gitleaks: 'gitleaks version' },
  variants: {
    default: [
      run('generator-test', 'node $FX_TOOLS/malicious/test.mjs', 'المولّد لا يشغّل git، والفخاخ مكتوبة وفعّالة، والعلامات غائبة، وبنية المستودع سليمة (نسخة بلا فخاخ)، والسر القديم مكشوف بـ gitleaks git', { match: ['نجحت كل فحوص مولّد FX-MALICIOUS'], nomatch: ['✗'], excerpt: 600 }),
      run('semgrep-from-repo-cwd', `${SHIM}; REPO=$(pwd -P); PATH="$SH:$PATH" semgrep scan --no-git-ignore --config ${RULE} --metrics=off --disable-version-check --quiet src; echo "SEMGREP_EXIT=$?"; ${REPORT}; cat "$SH/git.log"`,
        'اكتشاف: Semgrep 1.180.0 يستدعي git (ls-remote --get-url) من مجلد العمل الحالي ولو مع --no-git-ignore و--metrics=off و--disable-version-check؛ فلو شُغّل من داخل المستودع المفخخ لمسه git (يُمنع هنا بـ git مزيف)', { match: ['ayar-test\\.no-eval', 'SEMGREP_EXIT=0', 'GIT_CALLS=2', 'GIT_CALLS_IN_REPO=1', 'MARKERS=0', 'ls-remote --get-url'] }),
      run('semgrep-from-neutral-cwd', `${SHIM}; REPO=$(pwd -P); N=$(mktemp -d); cd "$N" && PATH="$SH:$PATH" semgrep scan --no-git-ignore --config ${RULE} --metrics=off --disable-version-check --quiet "$REPO/src"; echo "SEMGREP_EXIT=$?"; ${REPORT}`,
        'التخفيف: تشغيل Semgrep من مجلد عمل محايد وهدف مطلق يبقي استدعاءي git خارج المستودع (GIT_CALLS_IN_REPO=0) ولا علامات', { match: ['ayar-test\\.no-eval', 'SEMGREP_EXIT=0', 'GIT_CALLS=2', 'GIT_CALLS_IN_REPO=0', 'MARKERS=0'] }),
      run('gitleaks-dir-no-git', `${SHIM}; REPO=$(pwd -P); PATH="$SH:$PATH" gitleaks dir src --redact=100 --no-banner --exit-code 42; echo "GITLEAKS_EXIT=$?"; ${REPORT}`,
        'فاحص الأسرار في وضع dir لا يستدعي git، ولا سر في src', { match: ['GITLEAKS_EXIT=0', 'GIT_CALLS=0', 'GIT_CALLS_IN_REPO=0', 'MARKERS=0'] }),
    ],
  },
};

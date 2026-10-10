#!/bin/zsh
# E-04: create a self-signed code-signing identity in the login keychain. RUN BY THE OWNER.
# No trust setting is added: codesign signs with the untrusted self-signed identity, and the
# designated requirement pins the leaf certificate hash (E-04, 2026-10-10). Nothing is written
# to the repository: the key and certificate files live in a temp dir deleted on exit.
emulate -L zsh
set -e -o pipefail
NAME="AYAR Local Code Signing"
KC="$HOME/Library/Keychains/login.keychain-db"
if /usr/bin/security find-certificate -c "$NAME" "$KC" > /dev/null 2>&1; then
  print -r -- "Identity \"$NAME\" already exists:"; /usr/bin/security find-identity -p codesigning "$KC" | grep "$NAME"; exit 0
fi
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
cat > "$TMP/cfg" <<CFG
[ req ]
distinguished_name = dn
x509_extensions = ext
prompt = no
[ dn ]
CN = $NAME
[ ext ]
basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
subjectKeyIdentifier = hash
CFG
/usr/bin/openssl req -x509 -newkey rsa:3072 -sha256 -days 3650 -nodes \
  -keyout "$TMP/key.pem" -out "$TMP/cert.pem" -config "$TMP/cfg" 2> /dev/null
P=$(/usr/bin/openssl rand -hex 16)   # throwaway password for the transfer file only
/usr/bin/openssl pkcs12 -export -inkey "$TMP/key.pem" -in "$TMP/cert.pem" -name "$NAME" \
  -out "$TMP/id.p12" -passout "pass:$P"
# -T: only codesign may use the private key without asking.
/usr/bin/security import "$TMP/id.p12" -k "$KC" -P "$P" -T /usr/bin/codesign
cp /usr/bin/true "$TMP/selftest"
/usr/bin/codesign --force --sign "$NAME" "$TMP/selftest" && /usr/bin/codesign --verify "$TMP/selftest"
/usr/bin/security find-identity -p codesigning "$KC" | grep "$NAME"   # shows CSSMERR_TP_NOT_TRUSTED: expected
print -r -- "E04_IDENTITY_OK"

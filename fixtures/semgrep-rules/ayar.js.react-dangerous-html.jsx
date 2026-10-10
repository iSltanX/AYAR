// Test project of ayar.js.react-dangerous-html.
export function Bio({ html }) {
  // ruleid: ayar.js.react-dangerous-html
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Fixed() {
  // ok: ayar.js.react-dangerous-html
  return <div dangerouslySetInnerHTML={{ __html: '<hr/>' }} />;
}

export function Text({ text }) {
  // ok: ayar.js.react-dangerous-html
  return <div>{text}</div>;
}

// Summarize a keys-<label>.json result on stdout.
const r = require(require('path').resolve(process.argv[2]));
console.log(r.label, JSON.stringify(r.fs), 'allDetected=' + r.allDetected);
for (const [k, v] of Object.entries(r.methods))
  console.log('  ', k.padEnd(14), 'content=' + v.contentChanged, 'key=' + v.keyChanged, JSON.stringify(v.changed), 'later=' + v.laterChangedBySystem);

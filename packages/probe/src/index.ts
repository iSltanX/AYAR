// @ayar/probe (C-14): the contract between the engine and the probe process, the comparison of images, and the
// judges that turn what the probe saw into findings. Pure: the browser lives in ./driver, loaded by the probe's own
// process only. One line per module (docs/waves/README.md 6).
export * from './contract.ts';
export * from './compare.ts';
export * from './judge/index.ts';

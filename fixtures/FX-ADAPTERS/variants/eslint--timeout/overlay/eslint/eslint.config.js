// قاعدة محلية تعلق في حلقة لا نهائية، لتجربة المهلة.
const hang = { create() { for (;;) { /* لا تنتهي */ } } };

export default [{ plugins: { local: { rules: { hang } } }, rules: { 'local/hang': 'error' } }];

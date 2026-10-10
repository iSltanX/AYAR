'use strict';
exports.slug = function slug(text) {
  return String(text).trim().replace(/\s+/g, '-');
};

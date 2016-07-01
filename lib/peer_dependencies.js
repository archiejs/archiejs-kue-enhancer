/** 
 * This is a dev environment workaround.
 * 
 * require of project modules does not work when we `npm link` and
 * when developing enhancers.
 */

var archiejs, mongoose;

try {
  archiejs = require('archiejs');
} catch(_) {
  // workaround when `npm link`'ed for development 
  var prequire = require('parent-require')
    , archiejs = prequire('archiejs');
}

module.exports = { archiejs };

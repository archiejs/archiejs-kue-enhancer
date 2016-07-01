var { archiejs } = require('./peer_dependencies');

var kue_redis = require('./kue_enhancer.js');

var ArchiejsEnhancers = archiejs.Enhancers;

// kue enhancer

ArchiejsEnhancers.registerEnhancerFactory(
  "kue",
  function() {
    return new kue_redis;
  }
);

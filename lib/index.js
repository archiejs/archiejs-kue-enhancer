var ArchiejsEnhancers = require('archiejs').Enhancers;

var kue_redis = require('./kue_enhancer.js');

// kue enhancer

ArchiejsEnhancers.registerEnhancerFactory(
  "kue",
  function() {
    return new kue_redis;
  }
);

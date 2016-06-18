// This is an abstract class.

'use strict';
var resolve = require('path').resolve;
var DEBUG = false;

var BaseEnhancerClass = require('archiejs').BaseEnhancerClass;

var MicroservEnhancer = function(){
    this.baseEnhancer = new BaseEnhancerClass(); // contains base class
    this.enhancerName = "microservice";
};

// static vars
MicroservEnhancer.ERR_MSG1 = "\n\
config.packageRole value should be client | server | default or nothing.";

MicroservEnhancer.ERR_MSG2 = "\n\
  WARNING! `provides` structure is empty or incorrect. \n\
  In case of a microservice, `provides` should have structure as below:- \n\n\
  provides: { \n\
    ObjA: { \n\
      implementaton: 'fileImpl.js', \n\
      interface: 'inter.js' \n\
    }, \n\
    ObjB: 'impl_and_interface.js', \n\
    ... \n\
  }\n";

MicroservEnhancer.WARN_MSG1 = "\n\
  WARNING! Please provide the implementation and interface files properly.\n\
  Maybe if you have supplied us nested `plugin.provides`. You should know, \n\
  that they are not suppored by `microservice` enhancer.\n";

// public members
(function(){
    /* resolveConfig function does following :-
     *
     * 1. Initializes plugin.enhancer, given the packageRole
     * 2. If packageRole is a 'client', it sets plugin.consumes to
     * empty array.
     * 3. If packageRole is a 'server', it sets plugin.provides to
     * empty array (safety feature, we should not call these functions
     * directly).
     * 4. If packageRole is 'disable' or is empty, normal function calls are
     * made and microservices are disabled.
     */

    this.resolveConfig = function(plugin, base){
        if(!base)
            throw new Error("base path must be provided in arguments");

        if(plugin.packageRole && !(plugin.packageRole === 'client' || plugin.packageRole === 'server'
                || plugin.packageRole === 'default'))
            throw new Error(MicroservEnhancer.ERR_MSG1);

        if(plugin.packageRole === 'default') plugin.packageRole = null;
        plugin.enhancers = {};
        plugin.implementations = {};

        if(!plugin.consumes)
            plugin.consumes = [];

        if(typeof plugin.consumes === 'string')
            plugin.consumes = [ plugin.consumes ];

        if(!plugin.provides){
            plugin.provides = [];
            console.warn(MicroservEnhancer.ERR_MSG2);
            return;
        }

        var provides = Object.keys(plugin.provides);
        var modulePath = plugin.packagePath;
        var enhancers = {};
        var implementations = {};
        var provide;
        var tmpPath;

        // parse the enhancers

        for(var serviceName in plugin.provides){
            provide = plugin.provides[serviceName];
            if(typeof provide === 'string'){ // file
                tmpPath = resolve(base, modulePath, provide);
                enhancers[serviceName] = tmpPath;
                implementations[serviceName] = tmpPath;
            } else {
                if(typeof provide !== 'object' || provide.implementations === null || provide.interface === null){
                    console.error("Skipping " + serviceName);
                    console.warn(MicroservEnhancer.WARN_MSG1);
                    continue; // skip
                }
                enhancers[serviceName] = resolve(base, modulePath, provide.interface);
                implementations[serviceName] = resolve(base, modulePath, provide.implementation);
            }
        }

        if (plugin.packageRole === 'client'){
            plugin.consumes = [];
            plugin.provides = provides;
        }else if(plugin.packageRole === 'server'){
            plugin.provides = [];
            plugin.implementations = implementations;
        }else{ // default
            plugin.provides = provides;
        }

        plugin.enhancers = enhancers;
    };

    this.setupPlugin = function(plugin, imports){
        if(plugin.packageRole === 'client'){
            return this.setupPluginClient(plugin, imports);
        } else if (plugin.packageRole === 'server'){
            return this.setupPluginServer(plugin, imports);
        } else {
            // normal module - runs in process (because the developer did not specify client/server role
            return this.baseEnhancer.setupPlugin(plugin, imports);
        }
    };

    this.setupPluginClient = function(plugin, imports){
        var me = this;
        Object.keys(plugin.enhancers) // each service
        .forEach(function(serviceName){
            // create an object that wraps each enhancer function
            var EnhancerObj = function(){};

            // add functions to enhancer object
            var ServiceObj = require(plugin.enhancers[serviceName]);
            var proto = (ServiceObj.prototype) ? (ServiceObj.prototype) : (ServiceObj); // is an object or instance?
            Object.keys(proto) // wrap exposed functions
            .forEach(function(functionName){
                if(proto[functionName]) { // is not false
                    var fn = me.makePluginEnhancer(serviceName, functionName);
                    if(!fn){
                        console.warn("makePluginEnhancer for " + serviceName + "." + functionName + " returned undefined.");
                    }else{
                        EnhancerObj.prototype[functionName] = fn;
                    }
                }
            });

            // create an enhancer
            plugin.enhancers[serviceName] = new EnhancerObj(plugin, imports);
        });
        return plugin.enhancers;
    };

    this.setupPluginServer = function(plugin, imports){
        var me = this;
        var err;

        // objects being initialized can throw an error
        Object.keys(plugin.enhancers) // each service
        .forEach(function(serviceName){
            // makeHooks
            var makeHooksFn = function(theServiceName, theEnhancer, theInstance) {
                return function(){
                    var proto = (theEnhancer.prototype) ? (theEnhancer.prototype) : (theEnhancer); // is an object or instance?
                    Object.keys(proto) // wrap exposed functions
                    .forEach(function(functionName){
                        if(proto[functionName]) { // is not false
                            me.makePluginHook(theServiceName, functionName, theInstance);
                        }
                     });
                }
            };

            // implementation
            var serviceInstance;
            var ServiceObj = require(plugin.implementations[serviceName]);
            var wrap = require(plugin.enhancers[serviceName]);
            if (ServiceObj.prototype){ // if this is an object
                serviceInstance = new ServiceObj(plugin, imports); // make an instance
            }else{
                serviceInstance = ServiceObj; // is an instance
            }
            plugin.implementations[serviceName] = serviceInstance;
            makeHooksFn(serviceName, wrap, serviceInstance)(); // make hooks
        });

        // microservice server plugin does not provide these functions
        // via provides interface, to avoid various entry points into these
        // functions (keeps things simple).

        if(DEBUG)
            return plugin.implementations; // if we are testing/degugging
        else
            return {};
    };
    
    /*
     * Abstract function
     */
    
    this.makePluginEnhancer = function(serviceName, functionName){
        throw new Error("override");
    };

    this.makePluginHook = function(serviceName, functionName){
        throw new Error("override");
    };

    this.openClient = function(){
        throw new Error("override");
    };

    this.closeClient = function(){
        throw new Error("override");
    };

    this.getClient = function(){
        throw new Error("override");
    };

    /* Helper functions
     */

    // We will need to often convert formats of data while making RPC calls
    // into queues. These helper functions make the task easier.
    //
    // The arguments are converted from an array of format:-
    //
    //      service.func(arg1, arg2, callback, options);
    //
    // Into a json of following format:-
    //
    //      {
    //          data: {
    //              0: arg1,
    //              1: arg2
    //          },
    //          callback: function,
    //          option: optional json (has special attributes)
    //      }
    //

    this.parseServiceArgs = function(_args){
        // max index (callback is either the last or second last element)
        var max=-1;
        var idx=-1;
        for(var key in _args){
            idx = Number(key);
            if(!isNaN(idx) && idx > max){
                max = idx;
            }
        }

        if ( max < 0 ) {
            throw new Error("no callback provided");
        }
        
        // get callback and options from the last places in argument array
        var callback;
        var options = _args[max];
        --max;
        if (typeof(options) === 'function') { // this is callback
            callback = options;
            options = {};
        } else {
            if ( max < 0 ) {
                throw new Error("no callback provided");
            }
            callback = _args[max];
            if( typeof(callback) !== 'function') {
                throw new Error("no callback provided");
            }
            --max;
        }

        // copy keys into data
        var data = {};
        for(var key in _args){
            idx = Number(key);
            if(key <= max){
                data[key] = _args[key];
            }
        }

        // return values
        return {
            data: data,
            callback: callback,
            options: options
        };
    };
    
    this.createServiceArgs = function(data, cb){
        var results = [];
        for(var key in data){
            results.push( data[key] );
        }
        if(cb){
            results.push( cb );
        }
        return results;
    };

}).call(MicroservEnhancer.prototype);

module.exports = MicroservEnhancer;

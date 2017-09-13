'use strict';
var resolve = require('path').resolve;
var kue = require('kue');

var MicroserviceEnhancer = require('./micro_base_enhancer')

var KUE_TIMEOUT = 5000;

var debug = require('debug')('archiejs-kue-enhancer');


var KueEnhancer = function(){
    MicroserviceEnhancer.call(this); // override functions
    this.wrapperName = "kuewrapper";
    this.redisConfig = {};

    // todo (check - is it better to register/unregister this in open/closeClient)
    var me = this;
    process.once( 'exit', function (sig) {
        me.closeClient();
    });
};

KueEnhancer.extends(MicroserviceEnhancer);

KueEnhancer.HELP_MSG = "\
Your config should have following fields.  \n\
  {                        \n\
    prefix: optional,  \n\
    server: {              \n\
      host: HOST ,         \n\
      port: PORT ,         \n\
      username: optional , \n\
      password: optional   \n\
    }                      \n\
  }";

(function(){

    this.setupPlugin = function(plugin, imports){
        // open redis session first
        if(!plugin.prefix) plugin.prefix="";

        // client or server plugins open redis client
        if (plugin.packageRole === 'server' || plugin.packageRole === 'client')
        {
            this.redisConfig = {
                redis: plugin.server,
                prefix: plugin.prefix
            };
            this.openClient();
        }

        // this uses the redis session
        return this.super.setupPlugin.call(this, plugin, imports);
    };

    this.openClient = function(){
        if(!this.redisConfig.redis || !this.redisConfig.redis.host || !this.redisConfig.redis.port){
            console.log(KueEnhancer.HELP_MSG);
            throw new Error("Archiejs kue wrapper plugin error");
        }
        this.jobsClient = kue.createQueue(this.redisConfig);
    };

    this.closeClient = function(){
        var me = this;
        return new Promise((resolve, reject) => {
            if(me.jobsClient){
                me.jobsClient.shutdown(KUE_TIMEOUT, function(err){
                    if(err) {
                        reject(err);
                    } else {
                        me.jobsClient = null;
                        resolve();
                    }
                });
            }
        });
    };

    this.getClient = function(){
        return this.jobsClient;
    };

    this.makePluginEnhancer = function(serviceName, functionName){
        // unique service name
        var jobKey = serviceName + '.' + functionName;
        var me = this;

        // return a wrapper function that fires the job
        return function(){
                //console.log("called " + jobKey);

                // pop data from arguments and make RPC call
                var _a = me.parseServiceArgs(arguments);
                var data = _a.data;
                var options = _a.options;
                var cb = _a.callback;

                // create a job
                var job = me.jobsClient.create(jobKey, data);

                // properties
                if(options.priority){
                    job.priority(options.priority);
                }
                if(options.attempts){
                    job.priority(options.attempts);
                }

                // fire the job
                job.save(function(err){
                    debug(`job save ${jobKey}`);
                    if(err) return cb(err);
                })
                .on('failed', function(err){
                    debug(`job failed ${jobKey}`);
                    return cb(err);
                })
                .on('complete', function(result){
                    debug(`job complete ${jobKey}`);
                    return cb(null, result);
                });

                // return to user to update any options
                return job;
            };
    };

    this.makePluginHook = function(serviceName, functionName, serviceInstance){
        // unique service name
        var jobKey = serviceName + '.' + functionName;
        var me = this;

        // create hook
        this.jobsClient.process( jobKey, function(job, done){
            var _data = me.createServiceArgs(job.data, done);
            serviceInstance[functionName].apply(serviceInstance, _data);
            return;
        });
    };

}).call(KueEnhancer.prototype);

module.exports = KueEnhancer;

'use strict';

require('./../lib/util/inherit.js');

var chai = require('chai');
var expect = chai.expect;
var should = chai.should();
var resolve = require('path').resolve;

var ServiceObj1 = require('./kueTestObj1'); // object
var ServiceObj2 = require('./kueTestObj2'); // object
var ServiceInt = require('./serviceIntf'); // interface

var KueEnhancer = require('./../lib/kue_enhancer.js');
var kueEnhancer;

// redis config
var redisConfig = {
    server: {
        host: '127.0.0.1',
        port: 6379
    }
};

describe('Kue Enhancer Testcases:', function(){
    
    before(function(done){
        kueEnhancer = new KueEnhancer();
        done();
    });

    it('#makes rpc calls', function(done){
        // create producer - consumer
        var count = 0;
        var basedir = resolve(__dirname, '..');
        var config = {
            packagePath: 'test',
            provides: {
                'Obj1': {
                    implementation: 'kueTestObj1',
                    interface: 'serviceIntf'
                },
                'Obj2': 'kueTestObj2'
            },
            server: redisConfig.server,
            prefix: redisConfig.prefix
        };
        var configClient = JSON.parse(JSON.stringify(config));
        var configServer = JSON.parse(JSON.stringify(config));
        configClient.packageRole = 'client';
        configServer.packageRole = 'server';

        var server = {};

        Promise
        .resolve()
        .then(() => {
            //console.log('setup server');
            kueEnhancer.resolveConfig(configServer, basedir);
            configServer.provides.length.should.equal(0);
            return kueEnhancer.setupPlugin(configServer, {});
        })
        .then((_server) => {
            server = _server;

            //console.log('setup client');
            kueEnhancer.resolveConfig(configClient, basedir);
            configClient.provides.length.should.equal(2);
            configClient.enhancers.should.have.property('Obj1');
            configClient.enhancers.should.have.property('Obj2');
            return kueEnhancer.setupPlugin(configClient, {});
        })
        .then((client) => {
            client.should.have.property('Obj1');
            client.should.have.property('Obj2');
            client.Obj1.func1( function(){ count++; } );
            client.Obj1.func2( function(){ count++; } );
            client.Obj1.func3( function(){ count++; } );
            // wait for a bit - let all callbacks above arrive
            return new Promise((resolve) => setTimeout(resolve, 1000));
         })
        .then(() => {
            server.Obj1.func1_count.should.equal(1);
            server.Obj1.func2_count.should.equal(1);
            server.Obj1.func3_count.should.equal(1);
            count.should.equal(3);
            //console.log(server);
         })
         .then(kueEnhancer.closeClient.call(kueEnhancer))
         .then(done)
         .catch((err) => {
            console.error("ALERT! Turn on DEBUG=true in lib/micro_base_enhancer.js for testing RPC calls.");
            done(err);
         })

    }).timeout(4000);

}); 

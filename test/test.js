/*global describe, it */
var EventEmitter = require('../index').EventEmitter;
var should = require('should');
var path = require('path');
var emitter1;
var emitter2;

describe('Multicast Events on same process', function() {
  before(function(done) {
    emitter1 = new EventEmitter();
    emitter2 = new EventEmitter({
      id: 'app'
    });
    done();
  });
  it('should emit an event and receive it', function(done) {
    function handler(data) {
      data.should.eql('message');
      emitter1.off('test', handler);
      done();
    }
    emitter1.on('test', handler);
    emitter1.emit('test', 'message');
  });
  it('should emit an event not handled from a different emitter', function(done) {
    function handler(data){
      should.not.exist(data);
    }
    function handler2(data) {
      data.should.eql('message');
      emitter2.off('test', handler);
      emitter2.off('test2', handler2);
      done();
    }
    emitter2.on('test', handler);
    emitter2.on('test2', handler2);
    emitter1.emit('test', 'message');
    setTimeout(function () {
      emitter2.emit('test2', 'message');
    }, 50);
  });
  it('should handle an event from another process', function(done) {
    function handler(data) {
      data.should.eql('message');
      emitter1.off('process', handler);
      child.kill();
      done();
    }
    emitter1.on('process', handler);
    var child = require('child_process').fork(path.resolve(__dirname, './other-emitter'));
    child.pid.should.should.not.eql(process.pid);
  });
  it('should handle ONLY events from another process (NOT handle events from the SAME process)', function(done) {
    var emitter3 = new EventEmitter({
      foreignOnly: true
    });
    function handler(data) {
      data.should.eql('message');
      emitter3.off('process', handler);
      child.kill();
      done();
    }
    emitter3.on('process', handler);
    emitter3.emit('process', 'not handled locally');
    setTimeout(function () {
      child = require('child_process').fork(path.resolve(__dirname, './other-emitter'));
      child.pid.should.should.not.eql(process.pid);
    }, 100);
  });
  it('should emit an encrypted event and receive it', function(done) {
    var emitter4 = new EventEmitter({
      secure: true,
      secret: 'password'
    });
    function handler(data) {
      data.should.eql('message');
      emitter4.off('test', handler);
      done();
    }
    emitter4.on('test', handler);
    emitter4.emit('test', 'message');
  });
  it('should don\'t set a wrong interface', function(done) {
    (function (){
      new EventEmitter({
        name: 'wrong',
        interface: '190.190.190.190'
      });
    }).should.throw('wrong does not have 190.190.190.190 as a valid multicast interface');
    done();
  });
});
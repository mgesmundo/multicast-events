var EventEmitter = require('../').EventEmitter;

var emitter = new EventEmitter({
  name: 'emitter on app1',
  loopback: false
});
emitter.on('event-name', function (data) { console.log('listener on app1: ', data); });
emitter.on('event-name-2', function (data) { console.log('listener2 on app1: ', data); });

emitter.emit('event-name', '--> emit from emitter on app1');

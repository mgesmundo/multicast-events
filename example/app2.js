var EventEmitter = require('../').EventEmitter;

var emitter = new EventEmitter({
  name: 'emitter on app2'
});
emitter.on('event-name', function (data) { console.log('listener on app2: ', data); });

emitter.emit('event-name', '--> emit from emitter on app2');

var EventEmitter = require('../index').EventEmitter;
var emitter = new EventEmitter({
  foreignOnly: true
});

emitter.emit('process', 'message');

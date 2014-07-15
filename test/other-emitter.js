var EventEmitter = require('../index').EventEmitter;
var emitter = new EventEmitter();

emitter.emit('process', 'message');

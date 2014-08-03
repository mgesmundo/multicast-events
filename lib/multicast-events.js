/**
 * If you need to emit an event from a machine listening it on another machine (or a different process),
 * you can simply use this module to do it. It uses a multicast msgpack message: when a node application
 * add a listener for an event, it joins into a multicast group. Using this technique the message is handled
 * only by the listener into the same multicast group (and listening on the same UDP port) and is not necessary
 * to drop unwanted messages inside the application` . All events are (optionally) encrypted.
 * This module is inspired to [multicast-eventemitter][2]
 *
 * @class node_modules.multicast_events.EventEmitter
 * @author Marcello Gesmundo
 *
 *
 * ### License
 *
 * Copyright (c) 2014 Yoovant by Marcello Gesmundo. All rights reserved.
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *    * Redistributions of source code must retain the above copyright
 *      notice, this list of conditions and the following disclaimer.
 *    * Redistributions in binary form must reproduce the above
 *      copyright notice, this list of conditions and the following
 *      disclaimer in the documentation and/or other materials provided
 *      with the distribution.
 *    * Neither the name of Yoovant nor the names of its
 *      contributors may be used to endorse or promote products derived
 *      from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 */

var dgram = require('dgram');
var debug = require('debug')('events');
var os = require('os');
var crypto = require('crypto');
var util = require('util');
var tools = require('buffertools');
var Message = require('amp-message');

var msgpack = {
  pack: function(args){
    var msg = new Message(args);
    return msg.toBuffer();
  },
  unpack: function(buf){
    var msg = new Message(buf);
    return msg.args;
  }
};

var ttl = 64;
var ttlMin = 1;
var ttlMax = 255;
var octet = 239;
var octetMin = 224;
var octetMax = 239;
var port = 1967;
var portMin = 1024;     // min std free udp port
var portMax = 16384;    // max port to obtain 49151 as max udp port because 49152 is the first ephemeral udp port
var group = 'events';
var id = 'default';

// http://stackoverflow.com/questions/13145397/regex-for-multicast-ip-address
function isMulticastAddress(ip) {
  var re = /2(?:2[4-9]|3\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]\d?|0)){3}/g;
  return re.test(ip);
}

function md5(value) {
  var hash = crypto.createHash('md5');
  hash.update(value);
  return hash.digest('binary');
}

/**
 * Encrypt a message
 * @param {Buffer} message The message to encrypt
 * @return {Buffer} The encrypted message
 * @ignore
 */
function encrypt(message) {
  if (this.cipher && this.secret) {
    debug('%s encrypt message with %s', this.name, this.cipher);
    var cipher = crypto.createCipher(this.cipher, this.secret);
    return Buffer.concat([cipher.update(message), cipher.final()]);
  }
  return message;
}

/**
 * Decrypt a message
 * @param {Buffer} message The encrypted message
 * @return {Buffer} The decrypted buffer
 * @ignore
 */
function decrypt(message) {
  if (this.cipher && this.secret) {
    debug('%s decrypt message with %s', this.name, this.cipher);
    var decipher = crypto.createDecipher(this.cipher, this.secret);
    return Buffer.concat([decipher.update(message), decipher.final()]);
  }
  return message;
}

function handleEvent(event, msg, rinfo) {
  var data =  msgpack.unpack(msg);
  var msgEvent = data.shift();
  if (event !== msgEvent) {
    throw new Error(util.format('%s has received "%s" but "%s" was expected', this.name, msgEvent, event));
  }
  this.listeners[event].handlers.forEach(function(handler) {
    debug('%s handle "%s" from "%s:%d" with arguments', this.name, event, rinfo.address, rinfo.port, data);
    handler.apply(undefined, data);
  }.bind(this));
}

function generatePort(event) {
  // to avoid conflict with other applications with same event name
  var hash = md5(this.id + '::' + this.group + '::' + event);
  return this.port + hash.charCodeAt(hash.length - 1) + 256 * (hash.charCodeAt(hash.length - 2) % 128);
}

/**
 * Verify that a provided address is configured on a NIC
 *
 * @param {String} address The address to verify
 * @return {Boolean} True if the address is configured on a NIC
 */
function verifyAddress(address) {
  var ifs = os.networkInterfaces();
  var nics = Object.keys(ifs);
  var i, j, match = false;
  nicLoop:
    for (i = 0; i < nics.length; i++) {
      var nic = ifs[nics[i]];
      for (j = 0; j < nic.length; j++) {
        if (nic[j].address === address && !nic[j].internal) {
          match = true;
          break nicLoop;
        }
      }
    }
  return match;
}

var emitterCounter = 0;

/**
 * EventEmitter class
 *
 * @class node_modules.multicast_events.EventEmitter
 * @cfg {Object} opts Options
 * @cfg {String} [opts.name = 'emitter #n'] The name assigned to the instance for debug purpose
 * @cfg {String} [opts.id = 'default'] The identifier of the application
 * @cfg {String} opts.secret The shared secret password use to encrypt all messages
 * @cfg {String} [opts.cipher = 'aes256'] The cipher used to encrypt/decrypt the messages
 * @cfg {Number} [opts.ttl = 64] The number of IP hops that a packet is allowed to go through
 * @cfg {String} opts.interface If not specified, every listener will add membership to all valid interfaces. The interface must be a valid multicast address (from 224.0.0.1 to 239.255.255.254)
 * @cfg {Boolean} [opts.loopback = true] When this option is true, multicast packets will also be received on the local interface
 * @cfg {Boolean} [opts.foreignOnly = false] This option only makes sense when loopback is true. In this case, if foreignOnly is true, the events are handled ONLY by a process other than the one that issued the event.
 * @cfg {Number} [opts.octet = 239] The first octet used for the generated multicast address
 * @cfg {Number} [opts.port = 1967] The port used as base for the generated port used for every event message
 * @cfg {String} [opts.group = 'events'] All events can be grouped into the same multicast domain generated using this option. It can be a string or a valid multicast address.
 * @cfg {Object} opts.events All event correspond to an UDP port; if this port is not free, you can override it using this option: { eventName: portNumber }
 * @constructor
 */
function EventEmitter(opts) {
  opts = opts || {};
  this.name = opts.name || 'emitter #' + emitterCounter;  // for debug purpose
  emitterCounter++;
  this.id = opts.id || id;
  this.secret = opts.secret;
  this.cipher = opts.cipher || 'aes256';
  this.ttl = parseInt(opts.ttl || ttl, 10);
  // validate ttl
  if (this.ttl < ttlMin || this.ttl > ttlMax || isNaN(this.ttl)) {
    throw new Error(util.format('%s must have %d < ttl < %d', this.name, ttlMin, ttlMax));
  }
  this.interface = opts.interface;
  // validate multicast interface
  if (this.interface) {
    if (!verifyAddress(this.interface)) {
      throw new Error(util.format('%s does not have %s as a valid multicast interface', this.name, this.interface));
    }
  }
  if (opts.loopback === undefined || this.loopback === null) {
    this.loopback = true;
  } else {
    // ensure it is boolean
    this.loopback = !!(opts.loopback);
  }
  if (opts.foreignOnly === undefined || this.foreignOnly === null) {
    this.foreignOnly = false;
  } else {
    // ensure it is boolean
    this.foreignOnly = !!(opts.foreignOnly);
  }
  if (!this.loopback && this.foreignOnly) {
    throw new Error(util.format('%s can\'t listen foreign only events if loopback is false', this.name));
  }
  this.octet = opts.octet || octet;
  if (this.octet < octetMin || this.octet > octetMax) {
    throw new Error(util.format('%s must have %d < octet < %d as first octet for a valid multicast address', this.name, octetMin, octetMax));
  }
  this.port = opts.port || port;
  if (this.port < portMin || this.port > portMax) {
    throw new Error(util.format('%s must have %d < port < %d', this.name, portMin, portMax));
  }
  this.group = opts.group || group;
  if (isMulticastAddress(this.group)) {
    this.address = this.group;
  } else {
    var hash = md5(this.group);
    this.address = [this.octet,
                    hash.charCodeAt(0),
                    hash.charCodeAt(1),
                    (hash.charCodeAt(2) === 0 || hash.charCodeAt(2) === 255 ? 1 : hash.charCodeAt(2))
                   ].join('.');
  }
  this.events = opts.events || {};
  this.listeners = {};

  this.sender = dgram.createSocket('udp4');
  this.sender.on('error', function (err) {
    this.sender.close();
    var e = new Error(util.format('%s has encountered an event emitter error:\n', this.name));
    e.stack = err.stack;
    throw e;
  }.bind(this));

  this.sender.bind(function() {
    this.sender.setBroadcast(false);
    this.sender.setMulticastTTL(this.ttl);
    this.sender.setMulticastLoopback(this.loopback);

    debug('%s ready to emit event of the group %s', this.name, this.getAddress());
  }.bind(this));
  debug('%s new event emitter of the group %s', this.name, this.getAddress());
}

/**
 * Get current assigned address
 * @return {String} The address
 * @private
 */
EventEmitter.prototype.getAddress = function getAddress() {
  return this.address;
};

/**
 * Get the port for the event. If the event does not have an UDP port, a new value is assigned.
 * @method getPort
 * @param {String} event The event
 * @return {Number} The UDP port
 * @private
 */
// max 32767 ports generated
EventEmitter.prototype.getPort = function getPort(event) {
  if (!event) {
    throw new Error(util.format('%s requires an event', this.name));
  }
  if (this.events.hasOwnProperty(event)) {
    return this.events[event];
  }
  this.events[event] = generatePort.call(this, event);
  return this.events[event];
};

/**
 * Verify if the event has a receiver
 * @param {String} event The event
 * @return {Boolean} True if the event has a receiver
 * @private
 */
EventEmitter.prototype.hasReceiver = function hasReceiver(event) {
  if (!event) {
    throw new Error(util.format('%s requires an event', this.name));
  }
  return this.listeners.hasOwnProperty(event) &&
    this.listeners[event].hasOwnProperty('receiver');
};

/**
 * Verify if the event has at least one listener
 * @param {String} event The event
 * @return {Boolean} True if the event has at least one listener
 */
EventEmitter.prototype.hasListeners = function hasListeners(event) {
  if (!event) {
    throw new Error(util.format('%s requires an event', this.name));
  }
  return this.listeners.hasOwnProperty(event) &&
    this.listeners[event].hasOwnProperty('receiver') &&
    this.listeners[event].hasOwnProperty('handlers') &&
    this.listeners[event].handlers.length > 0;
};

/**
 * Verify if exist an event with the specified UDP port
 * @param {String} event The event
 * @param {Number} port The UDP port
 * @return {String} The already registered event with the specified UDP port or undefined if the UDP port is not assigned to another event
 * @private
 */
EventEmitter.prototype.hasEventWithPort = function hasEventWithPort(event, port) {
  if (!port) {
    port = generatePort.call(this, event);
  }
  var prp;
  for (prp in this.events) {
    if (this.events.hasOwnProperty(prp)) {
      if (this.events[prp] === port) {
        return prp;
      }
    }
  }
  return undefined;
};

/**
 * Verify if exist an event with the specified UDP port and at least one listener
 * @param {String} event The event
 * @param {Number} port The UDP port
 * @return {String} The already registered event with the specified UDP port if it has at least a listener or undefined if the UDP port is not assigned to another event
 * @private
 */
EventEmitter.prototype.fullDefined = function fullDefined(event, port) {
  if (this.hasReceiver(event) && this.hasListeners(event)) {
    return this.hasEventWithPort(event, port);
  }
  return null;
};

/**
 * Add a listener for the specified event
 * @param {String} event The event
 * @param {Function} listener The function to call when the event occurs
 * @return {EventEmitter}
 * @chainable
 */
EventEmitter.prototype.addListener = function addListener(event, listener) {
  var definedEvent = this.fullDefined(event, this.events[event]);
  if (definedEvent && definedEvent !== event) {
    throw new Error(util.format('%s was unable to add "%s" listener because the UDP port %d was assigned to "%s"', this.name, event, this.getPort(event), definedEvent));
  }
  if (!this.hasReceiver(event)) {
    var receiver = dgram.createSocket('udp4');
    this.listeners[event] = this.listeners[event] || {
      receiver: receiver,
      handlers: []
    };
    receiver.bind(this.getPort(event), this.getAddress(), function (){
      receiver.setMulticastTTL(this.ttl);
      receiver.addMembership(this.getAddress(), this.interface);
      receiver.setMulticastLoopback(this.loopback);
      var processMessage = true;
      receiver.on('message', function(msg, rinfo) {
        if (msg[0] === 64) {  // ascii value of @
          // get the pid
          var idx = tools.indexOf(msg, ':');
          if (idx > 1) {
            var _pid = new Buffer(idx - 1);
            msg.copy(_pid, 0, 1, idx);
            var pid = parseInt(_pid.toString(), 10);
            // remove the pid
            msg = msg.slice(idx + 1, msg.length);
            // verify the pid
            processMessage = (process.pid !== pid);
          }
        }
        debug('%s reveived message from %s:%d and %s', this.name, rinfo.address, rinfo.port, processMessage ? 'processed' : 'not processed (foreign only allowed)');
        if (processMessage) {
          var decryptedMessage = decrypt.call(this, msg);
          handleEvent.call(this, event, decryptedMessage, rinfo);
        }
      }.bind(this));
      debug('%s ready to handle "%s" at %s:%d', this.name, event, this.getAddress(), this.getPort(event));
    }.bind(this));
  }
  this.listeners[event].handlers.push(listener);
  var source = listener.toString();
  if (source.length > 50) {
    source = source.replace(/\n\s+/gi, ' ').substr(0, 50) + '\u2026';
  }
  debug('%s add listener for "%s" to %s:%d', this.name, event, this.getAddress(), this.getPort(event), source);
  return this;
};

/**
 * Alias for addListener
 * @method on
 * @inheritdoc #addListener
 * @chainable
 */
EventEmitter.prototype.on = EventEmitter.prototype.addListener;

/**
 * Add a listener for the specified event but remove it after the first call
 * @param {String} event The event
 * @param {Function} listener The function to call when the event occurs
 * @return {EventEmitter}
 * @chainable
 */
EventEmitter.prototype.once = function once(event, listener) {
  var self = this;
  function onceListener() {
    self.removeListener(event, onceListener);
    listener.apply(undefined, arguments);
  }
  this.addListener(event, onceListener);
  return this;
};

/**
 * Remove the listener for the specified event
 * @param {String} event The event
 * @param {Function} listener The function to remove when the event occurs
 * @return {EventEmitter}
 * @chainable
 */
EventEmitter.prototype.removeListener = function removeListener(event, listener) {
  if (!(event && listener)) {
    throw new Error(util.format('%s requires an event and a listener', this.name));
  }
  if (this.hasListeners(event)) {
    var i, match = false;
    var handlers = this.listeners[event].handlers;
    for (i = handlers.length - 1; i >= 0; i--) {
      if (handlers[i].toString() === listener.toString()) {
        handlers.splice(i, 1);
        debug('%s remove listener for "%s" at %s:%d', this.name, event, this.getAddress(), this.getPort(event));
        if (handlers.length === 0) {
          var receiver = this.listeners[event].receiver;
          receiver.dropMembership(this.getAddress(), this.interface);
          receiver.close();
          delete this.listeners[event];
          debug('%s has no more listeners for "%s" at %s:%d: closed receiver', this.name, event, this.getAddress(), this.getPort(event));
        }
        match = true;
      }
    }
    if (!match) {
      debug('%s has no listener to remove for "%s" at %s:%d', this.name, event, this.getAddress(), this.getPort(event));
    }
  }
  return this;
};

/**
 * Alias for removeListener
 * @method off
 * @inheritdoc #removeListener
 * @chainable
 */
EventEmitter.prototype.off = EventEmitter.prototype.removeListener;

/**
 * Remove all listener or only all listeners for the event if specified
 * @param {String} [event] The event
 * @return {EventEmitter}
 * @chainable
 */
EventEmitter.prototype.removeAllListeners = function removeAllListeners(event) {
  if (event) {
    while (this.hasListeners(event)) {
      this.removeListener(event, this.listeners[event].handlers[0]);
    }
  } else {
    var events = Object.keys(this.listeners);
    events.forEach(function (event) {
      this.removeAllListeners(event);
    }.bind(this));
  }
  return this;
};

function _emit(event) {
  var args = [].slice.call(arguments);
  var message = msgpack.pack(args);
  var encryptedMessage = encrypt.call(this, message);
  // concat pid
  var pid, data;
  if (this.foreignOnly) {
    pid = new Buffer('@' + (process.pid).toString() + ':');
    data = Buffer.concat([pid, encryptedMessage]);
  } else {
    data = encryptedMessage;
  }
  this.sender.send(data, 0, data.length, this.getPort(event), this.getAddress());
  debug('%s emit "%s" to %s:%d', this.name, event, this.getAddress(), this.getPort(event), args);
}

EventEmitter.prototype.emit = function emit(event) {
  var args = [].slice.call(arguments);
  // process on next tick because the socket bind is asynchronous
  process.nextTick(function() {
    _emit.apply(this, args);
  }.bind(this));
};

exports.EventEmitter = EventEmitter;

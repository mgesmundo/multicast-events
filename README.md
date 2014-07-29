# Multicast Events

If you need to emit an event from a machine listening it on another machine (or a different process), you can simply use this module to do it. It uses a multicast [AMP][1] message: when a node application add a listener for an event, it joins into a multicast group. Using this technique the message is handled only by the listener into the same multicast group (and listening on the same UDP port) and is not necessary to drop unwanted messages inside the application. All events are (optionally) encrypted.

## Installation

Install `multicast-events` as usual:

    $ npm install multicast-events --save

## Options

Below the options for the EventEmitter constructor:

```javascript
var EventEmitter = require('multicast-events').EventEmitter;
var emitter = new EventEmitter(opts);
```

where `opts` is an `Object` with this properties:

* __name__ (`String`): the name assigned to the instance for debug purpose. The default value is `'emitter #n'` where _n_ is a counter.
* __id__ (`String`): the identifier of the application. The default value is `'default'`.
* __secret__ (`String`): the shared secret password used to encrypt/decrypt all messages.
* __cipher__ (`String`): the cipher used to encrypt/decrypt the messages. The default value is `'aes256'`.
* __ttl__ (`Number`): the number of IP hops that a packet is allowed to go through. The default value is `64`.
* __interface__ (`String`): if not specified, every listener will add membership to all valid interfaces. The interface must be a valid multicast address (from 224.0.0.1 to 239.255.255.254).
* __loopback__ (`Boolean`): when this option is set, multicast packets will also be received on the local interface. The default value is `true`.
* __foreignOnly__ (`Boolean`) This option only makes sense when loopback is true. In this case, if foreignOnly is true, the events are handled ONLY by a process other than the one that issued the event. The default value is `false`.
* __octet__ (`Number`): the first octet used for the generated multicast address. The default value is `239`.
* __port__ (`Number`): the port used as base to generate a unique port used for every event. The default value is `1967`.
* __group__ (`String`): all events can be grouped into the same multicast domain generated using this option. It can be a string or a valid multicast address. The default value is `'events'`.
* __events__ (`Object`): every event correspond to a unique UDP port; if this port is not free, you can override it using this option: { eventName: portNumber }.

## Methods

### addListener( event, listener )

Add a listener for the specified event

__Parameters__
* event: (`String`) The event.
* listener: (`Function`) The function to call when the event occurs.

__Returns__
* `EventEmitter`

### on( event, listener )

Is an alias for `addListener` method.

### once( event, listener )

Add a listener for the specified event, but the listener is removed after the first call.

__Parameters__
* event: (`String`) The event.
* listener: (`Function`) The function to call when the event occurs.

__Returns__
* `EventEmitter`

### removeListener( event, listener )

Remove the listener for the specified event.

__Parameters__
* event: (`String`) The event.
* listener: (`Function`) The function to remove when the event occurs.

__Returns__
* `EventEmitter`

### off( event, listener )

Is an alias for `removeListener` method.

### removeAllListeners( [event] )

Remove all listener or only all listeners for the event if specified.

__Parameters__
* event: (`String`) (optional) The event.

__Returns__
* `EventEmitter`

### hasListeners( event )

Verify if the event has at least one listener.

__Parameters__
* event: (`String`) The event.

__Returns__
* `Boolean` True if the event has at least one listener.

## Usage

The usage is the same of the standard EventEmitter (with the additional methods).

### Example

Create a new javascript file and save it as `app1.js`:

```javascript
var EventEmitter = require('multicast-events').EventEmitter;

var emitter = new EventEmitter({
  name: 'emitter on app1',
  loopback: false
});
emitter.on('event-name', function (data) { console.log('listener on app1: ', data); });

emitter.emit('event-name', '--> emit from emitter on app1');
```

Create a new javascript file and save it as `app2.js`:


```javascript
var EventEmitter = require('multicast-events').EventEmitter;

var emitter = new EventEmitter({
  name: 'emitter on app2'
});
emitter.on('event-name', function (data) { console.log('listener on app2: ', data); });

emitter.emit('event-name', '--> emit from emitter on app2');
```

Open a terminal window and run the first application:

    $ DEBUG=events node app1.js

      events emitter on app1 new event emitter of the group 239.22.144.139 +0ms
      events emitter on app1 add listener for "event-name" to 239.22.144.139:30618 +4ms function (data) { console.log('listener on app1: ', data); }
      events emitter on app1 ready to emit event of the group 239.22.144.139 +2ms
      events emitter on app1 ready to handle "event-name" at 239.22.144.139:30618 +0ms
      events emitter on app1 emit "event-name" to 239.22.144.139:30618 +1ms [ 'event-name', '--> emit from emitter on app1' ]
      events emitter on app1 handle "event-name" from "192.168.2.37:55761" with arguments +7s [ '--> emit from emitter on app2' ]

Open a new terminal window and run the second application:

    $ DEBUG=events node app2.js

      events emitter on app2 new event emitter of the group 239.22.144.139 +0ms
      events emitter on app2 add listener for "event-name" to 239.22.144.139:30618 +3ms function (data) { console.log('listener on app2: ', data); }
      events emitter on app2 ready to emit event of the group 239.22.144.139 +3ms
      events emitter on app2 ready to handle "event-name" at 239.22.144.139:30618 +0ms
      events emitter on app2 emit "event-name" to 239.22.144.139:30618 +0ms [ 'event-name', '--> emit from emitter on app2' ]
      events emitter on app2 handle "event-name" from "192.168.2.37:55761" with arguments +2ms [ '--> emit from emitter on app2' ]
    listener on app2:  --> emit from emitter on app2

On the first terminal window now you see a new line:

    listener on app1:  --> emit from emitter on app2

As you can see, the event `emitter.emit(...)` on the `app1.js` is not handled because the emitter has the option `loopback = false`, whereas the event `emitter.emit(...)`  on the `app2.js` is handled both in `app2.js` and `app1.js` (because when not specified the `loopback` parameter is `true`).

See the content of the `example` folder.

To avoid a node process to handle their own events listening only the events from another node process, you can set the `EventEmitter` as in the previous example or setting `foreignOnly` option on both `EventEmitter`:

```javascript
// first application
var EventEmitter = require('multicast-events').EventEmitter;

var emitter = new EventEmitter({
  name: 'emitter on app1',
  foreignOnly: true
});
emitter.on('event-name', function (data) { console.log('listener on app1: ', data); });

// this event is handled only on the second application
emitter.emit('event-name', '--> emit from emitter on app1');

// second application
var EventEmitter = require('multicast-events').EventEmitter;

var emitter = new EventEmitter({
  name: 'emitter on app2',
  foreignOnly: true
});
emitter.on('event-name', function (data) { console.log('listener on app2: ', data); });

// this event is handled only on the first application
emitter.emit('event-name', '--> emit from emitter on app2');

```


## Documentation

To create your own  documentation you must install [JSDuck](https://github.com/senchalabs/jsduck) and type in your terminal:

    $ cd /path-of-package
    $ ./gen_doc.sh

## Run Tests

As usual I use [mocha][2] as test framework:

    $ npm test


[1]: https://www.npmjs.org/package/amp
[2]: http://visionmedia.github.io/mocha

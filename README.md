# MQTT-SN Gateway: Core

This module is part of [mqttsngw](https://github.com/jue89/node-mqttsngw). It is responsible for handling parsed MQTT-SN packets from the event bus and maintaining state machines for connected sensors. If necessary it requests a connection to the broker on the event bus.

## Factory

```js
const Core = require('mqttsngw-core');
mqttsngw.attach(Core(opts));
```

Creates a new Core factory and attaches it to an existing instance of *mqttsngw*. ```opts``` has the following fields:
 * ```log```: Optional. An object containing logging callbacks for all log levels (```error```, ```warn```, ```info```, ```debug```). Every callback is called with a human-readable message as the first argument followed by an object containing more information regarding the event: ```{ error: (msg, info) => { ... }, ...}```.

## State Machines

### [Core] Main

 * **init**: Preparing the state machine
 * **listening**: Listens for incoming connection requests from the sensor network. If a request is received, a new instance of *[Core] Client* is created and started.

### [Core] Client

Reflects the current sensor state.

 * **init**: Preparing the state machine.
 * **willTopic**: Waits for a will topic sent by the sensor.
 * **willMessage**: Waits for a will message sent by the sensor.
 * **connectBroker**: Tries to connect to the broker.
 * **active**: The sensor is connected. Depending on the received sensor messages, it will start the state machines *[Core] Subscribe*, *[Core] PublishToBroker* or *[Core] PublishToClient*.
 * **sleep**: The sensor may enter sleep state by stating a non-zero duration in the DISCONNECT packet. The gateway will collect ingress publishes from the broker and sends them to the sensores once it's active again.

### [Core] Subscribe

Handles topic subscription requested sent by sensors.

 * **init**: Checks subscription request.
 * **brokerSubscribe**: Subscribes the topic at the broker.

### [Core] PublishToBroker

Sends a message to the broker

 * **init**: Checks the publish request and translates the ```topicId``` to the topic name.
 * **publishToBroker**: Sends the message to the broker.

### [Core] PublishToClient

Sends a message to the sensor

 * **init**: Lookup the ```topicId``` to the given topic name or register one.
 * **registerTopic**: Registers a topic at the sensor.
 * **publishToClient**: Sends the message to the sensor.


## Events

Several events are consumed and emitted by the *Core* module on the event bus.

### Consumed

| Event                          | State Machine          | Description |
| ------------------------------ | ---------------------- | ----------- |
| snUnicastIngress,*,connect     | [Core] Main            | Incoming connection requests packet |
| brokerConnect,*,res            | [Core] Client          | Response to a broker connection request |
| snUnicastIngress,*,disconnect  | [Core] Client          | Sensor sent disconnect |
| snUnicastIngress,*,register    | [Core] Client          | Sensor registers a new topic name |
| snUnicastIngress,*,subscribe   | [Core] Client          | Sensor subscribes to a new topic |
| snUnicastIngress,*,unsubscribe | [Core] Client          | Sensor unsubscribes from a topic |
| snUnicastIngress,*,publish     | [Core] Client          | Sensor publishes a message |
| snUnicastIngress,*,pingreq     | [Core] Client          | Sensor sent ping request |
| brokerDisconnect,*,notify      | [Core] Client          | Connection to the broker has been disconnected |
| brokerPublishToClient,*,req    | [Core] Client          | A message shall be sent from the broker to the sensor |
| brokerSubscribe,*,res          | [Core] Subscribe       | Response to a subscription request |
| brokerUnsubscribe,*,res        | [Core] Unsubscribe     | Response to a desubscription request |
| brokerPublishFromClient,*,res  | [Core] PublishToBroker | Response to a publish to broker request |
| snUnicastIngress,*,regack      | [Core] PublishToClient | Reaction to a register request from the sensor |
| snUnicastIngress,*,puback      | [Core] PublishToClient | Reaction to a publish request from the sensor |


### Emitted

| Event                          | State Machine          | Description |
| ------------------------------ | ---------------------- | ----------- |
| brokerConnect,*,req            | [Core] Client          | Request a connection to the broker |
| brokerDisconnect,*,call        | [Core] Client          | Disconnect from the broker |
| snUnicastOutgress,*,connack    | [Core] Client          | Send a CONNACK to the sensor |
| snUnicastOutgress,*,disconnect | [Core] Client          | Disconnect from sensor |
| snUnicastOutgress,*,regack     | [Core] Client          | Send a REGACK to the sensor |
| snUnicastOutgress,*,pingresp   | [Core] Client          | Respond to a ping request |
| brokerSubscribe,*,req          | [Core] Subscribe       | Subscribes a topic at the broker |
| snUnicastOutgress,*,suback     | [Core] Subscribe       | Respond to a subscription request |
| brokerUnsubscribe,*,req        | [Core] Unsubscribe     | Unsubscribes a topic at the broker |
| snUnicastOutgress,*,unsuback   | [Core] Unsubscribe     | Respond to a desubscription request |
| brokerPublishFromClient,*,req  | [Core] PublishToBroker | Publish a message to the broker |
| snUnicastOutgress,*,puback     | [Core] PublishToBroker | Send PUBACK to the sensor |
| snUnicastOutgress,*,register   | [Core] PublishToClient | Register a topic at the sensor |
| snUnicastOutgress,*,publish    | [Core] PublishToClient | Publish a message to the sensor |
| brokerPublishToClient,*,res    | [Core] PublishToClient | Respond to publish request from the broker |

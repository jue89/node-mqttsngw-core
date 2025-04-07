const EventEmitter = require('eventemitter2');

jest.mock('edfsm');

jest.mock('../fsmSubscribe.js');
const fsmSubscribe = require('../fsmSubscribe.js');

jest.mock('../fsmUnsubscribe.js');
const fsmUnsubscribe = require('../fsmUnsubscribe.js');

jest.mock('../fsmPublishToBroker.js');
const fsmPublishToBroker = require('../fsmPublishToBroker.js');

jest.mock('../fsmPublishToClient.js');
const fsmPublishToClient = require('../fsmPublishToClient.js');

const fsmClient = require('../fsmClient.js');

test('init subscribe fsm factory', () => {
	const BUS = {};
	const LOG = {};
	fsmClient(BUS, LOG);
	expect(fsmSubscribe.mock.calls[0][0]).toBe(BUS);
	expect(fsmSubscribe.mock.calls[0][1]).toBe(LOG);
});

test('init publish to broker fsm factory', () => {
	const BUS = {};
	const LOG = {};
	fsmClient(BUS, LOG);
	expect(fsmPublishToBroker.mock.calls[0][0]).toBe(BUS);
	expect(fsmPublishToBroker.mock.calls[0][1]).toBe(LOG);
});

test('init publish to client fsm factory', () => {
	const BUS = {};
	const LOG = {};
	fsmClient(BUS, LOG);
	expect(fsmPublishToClient.mock.calls[0][0]).toBe(BUS);
	expect(fsmPublishToClient.mock.calls[0][1]).toBe(LOG);
});

describe('state: init', () => {
	test('clean up context', () => {
		const CTX = {
			clientKey: '::1_12345',
			cmd: 'connect',
			will: false,
			cleanSession: true,
			duration: 10,
			clientId: 'client'
		};
		fsmClient().testState('init', CTX);
		expect(CTX.cmd).toBeUndefined();
	});
	test('prepare connack promise', () => {
		const CTX = {};
		fsmClient().testState('init', CTX);
	});
	test('request will topic if will is true', () => {
		const CTX = {
			will: true
		};
		const fsm = fsmClient().testState('init', CTX);
		expect(fsm.next.mock.calls[0][0]).toEqual('willTopic');
	});
	test('connect broker if will is false', () => {
		const CTX = {
			will: false
		};
		const fsm = fsmClient().testState('init', CTX);
		expect(fsm.next.mock.calls[0][0]).toEqual('connectBroker');
	});
});

describe('state: connectBroker', () => {
	test('request broker connect', () => {
		const CTX = {
			clientKey: '::1_12345',
			will: true,
			willTopic: 'willTopic',
			willMessage: 'willMessage',
			cleanSession: true,
			clientId: 'client'
		};
		const bus = new EventEmitter();
		const req = jest.fn();
		bus.on(['brokerConnect', CTX.clientKey, 'req'], req);
		fsmClient(bus).testState('connectBroker', CTX);
		expect(req.mock.calls[0][0]).toMatchObject(CTX);
	});
	test('wait for broker response and go in active state if connection was successful', () => {
		const CTX = {
			clientKey: '::1_12345',
			will: true,
			willTopic: 'willTopic',
			willMessage: 'willMessage',
			cleanSession: true,
			clientId: 'client'
		};
		const bus = new EventEmitter();
		const fsm = fsmClient(bus).testState('connectBroker', CTX);
		bus.emit(['brokerConnect', CTX.clientKey, 'res'], {
			clientKey: CTX.clientKey,
			error: null,
			sessionResumed: false
		});
		expect(CTX.sessionResumed).toBe(false);
		expect(CTX.connectedToBroker).toBe(true);
		expect(CTX.connectedToClient).toBe(true);
		expect(fsm.next.mock.calls[0][0]).toEqual('active');
	});
	test('wait for broker response and goto final if connection was not successful', () => {
		const CTX = {
			clientKey: '::1_12345',
			will: true,
			willTopic: 'willTopic',
			willMessage: 'willMessage',
			cleanSession: true,
			clientId: 'client'
		};
		const bus = new EventEmitter();
		const fsm = fsmClient(bus).testState('connectBroker', CTX);
		bus.emit(['brokerConnect', CTX.clientKey, 'res'], {
			clientKey: CTX.clientKey,
			error: 'test error'
		});
		expect(fsm.next.mock.calls[0][0].message).toEqual('test error');
	});
});

describe('state: active', () => {
	test('send connack', () => {
		const CTX = {
			connackResolve: jest.fn(),
			clientKey: '::1_12345'
		};
		const bus = new EventEmitter();
		const onConnack = jest.fn();
		bus.on(['snUnicastOutgress', CTX.clientKey, 'connack'], onConnack);
		fsmClient(bus).testState('active', CTX);
		expect(onConnack.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			cmd: 'connack',
			returnCode: 'Accepted'
		});
	});
	test('reenter state on connect message', () => {
		const CTX = {
			clientKey: '::1_12345',
			duration: 456
		};
		const bus = new EventEmitter();
		const fsm = fsmClient(bus).testState('active', CTX);
		const duration = 123;
		bus.emit(['snUnicastIngress', CTX.clientKey, 'connect'], {
			clientKey: CTX.clientKey,
			cmd: 'connect',
			duration
		});
		expect(fsm.next.mock.calls[0][0]).toEqual('active');
		expect(CTX.duration).toBe(duration);
	});
	test('destroy fms on client disconnect', () => {
		const CTX = {
			clientKey: '::1_12345',
			connectedToClient: true,
			connectedToBroker: true
		};
		const bus = new EventEmitter();
		const fsm = fsmClient(bus).testState('active', CTX);
		bus.emit(['snUnicastIngress', CTX.clientKey, 'disconnect'], {
			clientKey: CTX.clientKey,
			cmd: 'disconnect'
		});
		expect(fsm.next.mock.calls[0][0]).toBe(null);
	});
	test('go to sleep state', () => {
		const CTX = {
			clientKey: '::1_12345',
			connectedToClient: true,
			connectedToBroker: true
		};
		const bus = new EventEmitter();
		const fsm = fsmClient(bus).testState('active', CTX);
		const duration = 123;
		bus.emit(['snUnicastIngress', CTX.clientKey, 'disconnect'], {
			clientKey: CTX.clientKey,
			cmd: 'disconnect',
			duration
		});
		expect(fsm.next.mock.calls[0][0]).toEqual('sleep');
		expect(CTX.sleepDuration).toBe(duration);
	});
	test('destroy fms on broker disconnect', () => {
		const CTX = {
			clientKey: '::1_12345',
			connectedToClient: true,
			connectedToBroker: true
		};
		const bus = new EventEmitter();
		const fsm = fsmClient(bus).testState('active', CTX);
		bus.emit(['brokerDisconnect', CTX.clientKey, 'notify'], {
			clientKey: CTX.clientKey
		});
		expect(CTX.connectedToBroker).toBe(false);
		expect(fsm.next.mock.calls[0][0]).toBe(null);
	});
	test('react to register events', () => {
		const CTX = {
			clientKey: '::1_12345',
			topics: []
		};
		const bus = new EventEmitter();
		const ack = jest.fn();
		bus.on(['snUnicastOutgress', CTX.clientKey, 'regack'], ack);
		fsmClient(bus).testState('active', CTX);
		bus.emit(['snUnicastIngress', CTX.clientKey, 'register'], {
			clientKey: CTX.clientKey,
			cmd: 'register',
			msgId: 123,
			topicName: 'testtopic'
		});
		expect(ack.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			cmd: 'regack',
			msgId: 123,
			topicId: 1,
			returnCode: 'Accepted'
		});
		expect(CTX.topics[0]).toEqual('testtopic');
	});
	test('reuse topic IDs if topic has been registered in the past', () => {
		const CTX = {
			clientKey: '::1_12345',
			topics: ['a', 'b']
		};
		const bus = new EventEmitter();
		const ack = jest.fn();
		bus.on(['snUnicastOutgress', CTX.clientKey, 'regack'], ack);
		fsmClient(bus).testState('active', CTX);
		bus.emit(['snUnicastIngress', CTX.clientKey, 'register'], {
			clientKey: CTX.clientKey,
			cmd: 'register',
			msgId: 123,
			topicName: 'a'
		});
		expect(CTX.topics.length).toEqual(2);
		expect(ack.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			cmd: 'regack',
			msgId: 123,
			topicId: 1,
			returnCode: 'Accepted'
		});
	});
	test('react to pings', () => {
		const CTX = {
			clientKey: '::1_12345',
			topics: []
		};
		const bus = new EventEmitter();
		const res = jest.fn();
		bus.on(['snUnicastOutgress', CTX.clientKey, 'pingresp'], res);
		fsmClient(bus).testState('active', CTX);
		bus.emit(['snUnicastIngress', CTX.clientKey, 'pingreq'], {
			clientKey: CTX.clientKey,
			cmd: 'pingreq'
		});
		expect(res.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			cmd: 'pingresp'
		});
	});
	test('timeout after duration exceeded without packets', () => {
		const CTX = {
			clientKey: '::1_12345',
			duration: 1234
		};
		const bus = new EventEmitter();
		const fsm = fsmClient(bus).testState('active', CTX);
		expect(fsm.next.timeout.mock.calls[0][0]).toEqual(CTX.duration * 1000);
		expect(fsm.next.timeout.mock.calls[0][1].message).toEqual('Received no ping requests within given connection duration');
	});
	test('retrigger timeout on ingress packets', () => {
		const CTX = {
			clientKey: '::1_12345',
			duration: 1234,
			topics: []
		};
		const PACKETS = [
			{ clientKey: CTX.clientKey, cmd: 'subscribe' },
			{ clientKey: CTX.clientKey, cmd: 'publish' },
			{ clientKey: CTX.clientKey, cmd: 'register', topicName: 'testtopic' },
			{ clientKey: CTX.clientKey, cmd: 'pingreq' }
		];
		const bus = new EventEmitter({wildcard: true});
		const fsm = fsmClient(bus).testState('active', CTX);
		PACKETS.forEach((p, n) => {
			bus.emit(['snUnicastIngress', CTX.clientKey, p.cmd], p);
			expect(fsm.next.timeout.mock.calls[n + 1][0]).toEqual(CTX.duration * 1000);
		});
	});
	test('start new subscribe fsm if subscribe request has been received from client', () => {
		const CTX = {
			clientKey: '::1_12345',
			topics: ['a', 'b']
		};
		const SUB = {
			clientKey: CTX.clientKey,
			cmd: 'subscribe',
			msgId: 123,
			topicIdType: 'normal',
			topicName: 'testtopic',
			qos: 1
		};
		const bus = new EventEmitter();
		fsmClient(bus).testState('active', CTX);
		bus.emit(['snUnicastIngress', CTX.clientKey, 'subscribe'], SUB);
		expect(fsmSubscribe._run.mock.calls[0][0]).toMatchObject(Object.assign({
			topics: CTX.topics
		}, SUB));
	});
	test('start new unsubscribe fsm if unsubscribe request has been received from client', () => {
		const CTX = {
			clientKey: '::1_12345',
			topics: ['a', 'b']
		};
		const SUB = {
			clientKey: CTX.clientKey,
			cmd: 'unsubscribe',
			msgId: 123,
			topicIdType: 'normal',
			topicName: 'testtopic'
		};
		const bus = new EventEmitter();
		fsmClient(bus).testState('active', CTX);
		bus.emit(['snUnicastIngress', CTX.clientKey, 'unsubscribe'], SUB);
		expect(fsmUnsubscribe._run.mock.calls[0][0]).toMatchObject(SUB);
	});
	test('start new publish to broker fsm if publish request has been received from client', () => {
		const CTX = {
			clientKey: '::1_12345'
		};
		const PUBLISH = {
			clientKey: CTX.clientKey,
			cmd: 'publish',
			msgId: 123,
			topicIdType: 'normal',
			topicId: 123,
			qos: 1,
			retain: false,
			payload: Buffer.alloc(1)
		};
		const bus = new EventEmitter();
		fsmClient(bus).testState('active', CTX);
		bus.emit(['snUnicastIngress', CTX.clientKey, 'publish'], PUBLISH);
		expect(fsmPublishToBroker._run.mock.calls[0][0]).toMatchObject(Object.assign({
			topics: CTX.topics
		}, PUBLISH));
	});
	test('start new publish to client fsm if publish request has been received from broker and report success', () => {
		const CTX = {
			clientKey: '::1_12345'
		};
		const PUBLISH = {
			clientKey: CTX.clientKey,
			msgId: 123,
			topic: 'test',
			qos: 1,
			payload: Buffer.alloc(1)
		};
		const bus = new EventEmitter();
		fsmClient(bus).testState('active', CTX);
		bus.emit(['brokerPublishToClient', CTX.clientKey, 'req'], PUBLISH);
		expect(fsmPublishToClient._run.mock.calls[0][0]).toMatchObject(Object.assign({
			topics: CTX.topics
		}, PUBLISH));
		const onRes = jest.fn();
		bus.on(['brokerPublishToClient', CTX.clientKey, 'res'], onRes);
		fsmPublishToClient._run.mock.calls[0][1](null);
		expect(onRes.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			msgId: PUBLISH.msgId,
			error: null
		});
	});
	test('start new publish to client fsm if publish request has been received from broker and report failure', () => {
		const CTX = {
			clientKey: '::1_12345'
		};
		const PUBLISH = {
			clientKey: CTX.clientKey,
			msgId: 123,
			topic: 'test',
			qos: 1,
			payload: Buffer.alloc(1)
		};
		const bus = new EventEmitter();
		fsmClient(bus).testState('active', CTX);
		bus.emit(['brokerPublishToClient', CTX.clientKey, 'req'], PUBLISH);
		expect(fsmPublishToClient._run.mock.calls[0][0]).toMatchObject(Object.assign({
			topics: CTX.topics
		}, PUBLISH));
		const onRes = jest.fn();
		bus.on(['brokerPublishToClient', CTX.clientKey, 'res'], onRes);
		fsmPublishToClient._run.mock.calls[0][1](null);
		expect(onRes.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			msgId: PUBLISH.msgId,
			error: null
		});
	});
	test('unsubscribe on congestion errors', (done) => {
		const CTX = {
			clientKey: '::1_12345'
		};
		const PUBLISH = {
			clientKey: CTX.clientKey,
			msgId: 123,
			topic: 'test',
			qos: 1,
			payload: Buffer.alloc(1)
		};
		const bus = new EventEmitter();
		fsmClient(bus).testState('active', CTX);
		bus.emit(['brokerPublishToClient', CTX.clientKey, 'req'], PUBLISH);
		bus.on(['brokerUnsubscribe', CTX.clientKey, 'req'], (pkt) => {
			expect(pkt.topic).toEqual(PUBLISH.topic);
			bus.emit(['brokerUnsubscribe', CTX.clientKey, 'res'], { msgId: pkt.msgId });
			done();
		});
		fsmPublishToClient._run.mock.calls[0][1](new Error('Rejected: congestion'));
	});
});

describe('sleep', () => {
	test('emit disconenct packet on state enter', () => {
		const CTX = {
			clientKey: '::1_12345',
			sleepDuration: 1234
		};
		const bus = new EventEmitter({wildcard: true});
		const onDisconnect = jest.fn();
		bus.on(['snUnicastOutgress', CTX.clientKey, 'disconnect'], onDisconnect);
		fsmClient(bus).testState('sleep', CTX);
		expect(onDisconnect.mock.calls[0][0]).toMatchObject({
			cmd: 'disconnect',
			clientKey: CTX.clientKey,
			duration: CTX.sleepDuration
		});
	});
	test('timeout handling', () => {
		const CTX = {
			clientKey: '::1_12345',
			sleepDuration: 1234
		};
		const PACKETS = [
			{ clientKey: CTX.clientKey, cmd: 'subscribe' },
			{ clientKey: CTX.clientKey, cmd: 'publish' },
			{ clientKey: CTX.clientKey, cmd: 'register', topicName: 'testtopic' },
			{ clientKey: CTX.clientKey, cmd: 'pingreq' }
		];
		const bus = new EventEmitter({wildcard: true});
		const fsm = fsmClient(bus).testState('sleep', CTX);
		expect(fsm.next.timeout.mock.calls[0][0]).toEqual(CTX.sleepDuration * 1000);
		PACKETS.forEach((p, n) => {
			bus.emit(['snUnicastIngress', CTX.clientKey, p.cmd], p);
			expect(fsm.next.timeout.mock.calls[n + 1][0]).toEqual(CTX.sleepDuration * 1000);
		});
	});
	test('collect messages from broker and send them within ping request', () => {
		const CTX = {
			clientKey: '::1_12345',
			sleepDuration: 1234
		};
		const bus = new EventEmitter({wildcard: true});
		const onPublishRes = jest.fn();
		bus.on(['brokerPublishToClient', CTX.clientKey, 'res'], onPublishRes);
		const onPingRsp = jest.fn();
		bus.on(['snUnicastOutgress', CTX.clientKey, 'pingresp'], onPingRsp);
		fsmClient(bus).testState('sleep', CTX);
		const msg1 = {msgId: 123};
		bus.emit(['brokerPublishToClient', CTX.clientKey, 'req'], msg1);
		expect(onPublishRes.mock.calls[0][0]).toMatchObject({
			msgId: msg1.msgId,
			clientKey: CTX.clientKey,
			error: null
		});
		const msg2 = {msgId: 456};
		bus.emit(['brokerPublishToClient', CTX.clientKey, 'req'], msg2);
		expect(onPublishRes.mock.calls[1][0]).toMatchObject({
			msgId: msg2.msgId,
			clientKey: CTX.clientKey,
			error: null
		});
		bus.emit(['snUnicastIngress', CTX.clientKey, 'pingreq']);
		expect(fsmPublishToClient._run.mock.calls[0][0]).toBe(msg1);
		fsmPublishToClient._run.mock.calls[0][1]();
		expect(fsmPublishToClient._run.mock.calls[1][0]).toBe(msg2);
		fsmPublishToClient._run.mock.calls[1][1]();
		expect(onPingRsp.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			cmd: 'pingresp'
		});
	});
	test('collect messages from broker and send them before entering active state', () => {
		const CTX = {
			clientKey: '::1_12345',
			sleepDuration: 1234,
			duration: 312
		};
		const bus = new EventEmitter({wildcard: true});
		const onPublishRes = jest.fn();
		bus.on(['brokerPublishToClient', CTX.clientKey, 'res'], onPublishRes);
		const onPingRsp = jest.fn();
		bus.on(['snUnicastOutgress', CTX.clientKey, 'pingresp'], onPingRsp);
		const fsm = fsmClient(bus).testState('sleep', CTX);
		const msg = {msgId: 123};
		bus.emit(['brokerPublishToClient', CTX.clientKey, 'req'], msg);
		expect(onPublishRes.mock.calls[0][0]).toMatchObject({
			msgId: msg.msgId,
			clientKey: CTX.clientKey,
			error: null
		});
		bus.emit(['snUnicastIngress', CTX.clientKey, 'connect'], {
			duration: 543
		});
		expect(CTX.duration).toBe(543);
		expect(fsmPublishToClient._run.mock.calls[0][0]).toBe(msg);
		fsmPublishToClient._run.mock.calls[0][1]();
		expect(fsm.next.mock.calls[0][0]).toEqual('active');
	});
	test('change sleep duration', () => {
		const CTX = {
			clientKey: '::1_12345',
			sleepDuration: 1234
		};
		const bus = new EventEmitter({wildcard: true});
		const disconnect = {duration: 567};
		const fsm = fsmClient(bus).testState('sleep', CTX);
		bus.emit(['snUnicastIngress', CTX.clientKey, 'disconnect'], disconnect);
		expect(CTX.sleepDuration).toBe(disconnect.duration);
		expect(fsm.next.mock.calls[0][0]).toEqual('sleep');
	});
	test('disconnect', () => {
		const CTX = {
			clientKey: '::1_12345'
		};
		const bus = new EventEmitter({wildcard: true});
		const fsm = fsmClient(bus).testState('sleep', CTX);
		bus.emit(['snUnicastIngress', CTX.clientKey, 'disconnect'], {duration: 0});
		expect(fsm.next.mock.calls[0][0]).toBe(null);
	});
	test('destroy on broker disconnect', () => {
		const CTX = {
			clientKey: '::1_12345',
			connectedToBroker: true
		};
		const bus = new EventEmitter({wildcard: true});
		const fsm = fsmClient(bus).testState('sleep', CTX);
		bus.emit(['brokerDisconnect', CTX.clientKey, 'notify']);
		expect(CTX.connectedToBroker).toBe(false);
		expect(fsm.next.mock.calls[0][0]).toBe(null);
	});
});

describe('final', () => {
	test('send connack with error if no connection could be established', () => {
		const CTX = {
			clientKey: '::1_12345',
			connectedToClient: false
		};
		const bus = new EventEmitter();
		const req = jest.fn();
		bus.on(['snUnicastOutgress', CTX.clientKey, 'connack'], req);
		fsmClient(bus).testState('_final', CTX);
		expect(req.mock.calls[0][0]).toMatchObject({
			clientKey: '::1_12345',
			cmd: 'connack',
			returnCode: 'Rejected: congestion'
		});
	});
	test('send disconnect to client if connection has been established before', () => {
		const CTX = {
			clientKey: '::1_12345',
			connectedToClient: true
		};
		const bus = new EventEmitter();
		const req = jest.fn();
		bus.on(['snUnicastOutgress', CTX.clientKey, 'disconnect'], req);
		fsmClient(bus).testState('_final', CTX);
		expect(req.mock.calls[0][0]).toMatchObject({
			clientKey: '::1_12345',
			cmd: 'disconnect'
		});
	});
	test('send disconnect to broker if connection has been established before', () => {
		const CTX = {
			clientKey: '::1_12345',
			connectedToClient: true,
			connectedToBroker: true
		};
		const bus = new EventEmitter();
		const req = jest.fn();
		bus.on(['brokerDisconnect', CTX.clientKey, 'call'], req);
		fsmClient(bus).testState('_final', CTX);
		expect(req.mock.calls[0][0]).toMatchObject({
			clientKey: '::1_12345'
		});
	});
});

const EventEmitter = require('eventemitter2');

jest.mock('edfsm');

const fsmClient = require('../fsmClient.js');

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
		const connack = jest.fn();
		bus.on(['snUnicastOutgress', CTX.clientKey, 'connack'], connack);
		const fsm = fsmClient(bus).testState('connectBroker', CTX);
		bus.emit(['brokerConnect', CTX.clientKey, 'res'], {
			clientKey: CTX.clientKey,
			error: null,
			sessionResumed: false
		});
		expect(CTX.sessionResumed).toBe(false);
		expect(CTX.connectedToBroker).toBe(true);
		expect(CTX.connectedToClient).toBe(true);
		expect(connack.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			cmd: 'connack',
			returnCode: 'Accepted'
		});
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
	test('react to pings', () => {
		const CTX = {
			clientKey: '::1_12345',
			topics: []
		};
		const bus = new EventEmitter();
		const res = jest.fn();
		bus.on(['snUnicastOutgress', CTX.clientKey, 'pingresp'], res);
		const fsm = fsmClient(bus).testState('active', CTX);
		bus.emit(['snUnicastIngress', CTX.clientKey, 'pingreq'], {
			clientKey: CTX.clientKey,
			cmd: 'pingreq'
		});
		expect(res.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			cmd: 'pingresp'
		});
		expect(fsm.next.mock.calls[0][0]).toEqual('active');
	});
	test('timeout after duration exceeded without pings', () => {
		const CTX = {
			clientKey: '::1_12345',
			duration: 1234
		};
		const bus = new EventEmitter();
		const fsm = fsmClient(bus).testState('active', CTX);
		expect(fsm.next.timeout.mock.calls[0][0]).toEqual(CTX.duration * 1000);
		expect(fsm.next.timeout.mock.calls[0][1].message).toEqual('Received no ping requests within given connection duration');
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

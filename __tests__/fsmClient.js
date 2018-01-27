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
		expect(CTX.connected).toBe(true);
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

describe('final', () => {
	test('send connack with error if no connection could be established', () => {
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
		bus.on(['snUnicastOutgress', CTX.clientKey, 'connack'], req);
		fsmClient(bus).testState('_final', CTX);
		expect(req.mock.calls[0][0]).toMatchObject({
			clientKey: '::1_12345',
			cmd: 'connack',
			returnCode: 'Rejected: congestion'
		});
	});
});

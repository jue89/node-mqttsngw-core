const EventEmitter = require('eventemitter2');

jest.mock('edfsm');

jest.mock('../fsmClient.js');
const fsmClient = require('../fsmClient.js');

const fsmMain = require('../fsmMain.js');

test('init client fsm factory', () => {
	const BUS = {};
	const LOG = {};
	fsmMain(BUS, LOG);
	expect(fsmClient.mock.calls[0][0]).toBe(BUS);
	expect(fsmClient.mock.calls[0][1]).toBe(LOG);
});

describe('state: init', () => {
	test('create client list and start to listen', () => {
		const CTX = {};
		const fsm = fsmMain().testState('init', CTX);
		expect(CTX).toMatchObject({clients: {}});
		expect(fsm.next.mock.calls[0][0]).toMatch('listening');
	});
});

describe('state: listening', () => {
	test('react on CONNECT messages', () => {
		const CONNECT = {
			clientKey: '::1_12345',
			cmd: 'connect',
			will: false,
			cleanSession: true,
			duration: 10,
			clientId: 'client'
		};
		const CTX = { clients: {} };
		const bus = new EventEmitter({wildcard: true});
		fsmMain(bus).testState('listening', CTX);
		bus.emit(['snUnicastIngress', CONNECT.clientKey, CONNECT.cmd], CONNECT);
		expect(fsmClient._run.mock.calls[0][0]).toBe(CONNECT);
		expect(Object.keys(CTX.clients)[0]).toBe(CONNECT.clientKey);
		bus.emit(['snUnicastIngress', CONNECT.clientKey, CONNECT.cmd], CONNECT);
		expect(fsmClient._run.mock.calls.length).toBe(1);
	});
	test('remove client handle if the client disappears', () => {
		const CONNECT = {
			clientKey: '::1_12345',
			cmd: 'connect'
		};
		const CTX = { clients: {} };
		const bus = new EventEmitter({wildcard: true});
		fsmMain(bus).testState('listening', CTX);
		bus.emit(['snUnicastIngress', CONNECT.clientKey, CONNECT.cmd], CONNECT);
		fsmClient._run.mock.calls[0][1]();
		expect(Object.keys(CTX.clients).length).toEqual(0);
	});
	test('remove client handle if some else uses the same clientId', () => {
		const CONNECT1 = {
			clientKey: '::1_12345',
			cmd: 'connect',
			clientId: 'abc'
		};
		const CONNECT2 = {
			clientKey: '::1_12346',
			cmd: 'connect',
			clientId: 'abc'
		};
		const CTX = { clients: {}, enforceUniqueClientIds: true };
		const bus = new EventEmitter({wildcard: true});
		fsmMain(bus).testState('listening', CTX);
		bus.emit(['snUnicastIngress', CONNECT1.clientKey, CONNECT1.cmd], CONNECT1);
		bus.emit(['snUnicastIngress', CONNECT2.clientKey, CONNECT2.cmd], CONNECT2);
		expect(fsmClient._next.mock.calls[0][0]).toBe(null);
	})
});

describe('final', () => {
	test('close connection to all clients', () => {
		const next = jest.fn();
		const CTX = { clients: { 'a': { next } } };
		fsmMain().testState('_final', CTX);
		expect(next.mock.calls[0][0]).toBe(null);
	});
});

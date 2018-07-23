const EventEmitter = require('eventemitter2');

jest.mock('edfsm');

const fsmUnsubscribe = require('../fsmUnsubscribe.js');

describe('state: init', () => {
	test('get topic from \'normal\' topic id type', () => {
		const CTX = {
			topicIdType: 'normal',
			topicName: 'testtopic'
		};
		const fsm = fsmUnsubscribe().testState('init', CTX);
		expect(CTX.topic).toEqual('testtopic');
		expect(fsm.next.mock.calls[0][0]).toEqual('brokerUnsubscribe');
	});
	test('get topic from \'short topic\' topic id type', () => {
		const CTX = {
			topicIdType: 'short topic',
			topicName: 'ab'
		};
		const fsm = fsmUnsubscribe().testState('init', CTX);
		expect(CTX.topic).toEqual('ab');
		expect(fsm.next.mock.calls[0][0]).toEqual('brokerUnsubscribe');
	});
	test('send negativ unsuback if topic cannot determined', () => {
		const CTX = {
			topicIdType: 'pre-defined',
			topicId: 123
		};
		const fsm = fsmUnsubscribe().testState('init', CTX);
		expect(fsm.next.mock.calls[0][0].message).toEqual('Rejected: invalid topic ID');
	});
});

describe('state: brokerUnsubscribe', () => {
	test('send unsubscribe request to broker', () => {
		const CTX = {
			clientKey: '::1_12345',
			msgId: 123,
			topic: 'testtopic'
		};
		const bus = new EventEmitter();
		const req = jest.fn();
		bus.on(['brokerUnsubscribe', CTX.clientKey, 'req'], req);
		fsmUnsubscribe(bus).testState('brokerUnsubscribe', CTX);
		expect(req.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			msgId: CTX.msgId,
			topic: CTX.topic
		});
	});
	test('wait for subscribe response from broker', () => {
		const CTX = {
			clientKey: '::1_12345',
			msgId: 123
		};
		const bus = new EventEmitter();
		const fsm = fsmUnsubscribe(bus).testState('brokerUnsubscribe', CTX);
		bus.emit(['brokerUnsubscribe', CTX.clientKey, 'res'], {
			clientKey: CTX.clientKey,
			msgId: 123,
			error: null
		});
		expect(fsm.next.mock.calls[0][0]).toBe(null);
	});
	test('ignore subscribe responses from broker for other msgIds', () => {
		const CTX = {
			clientKey: '::1_12345',
			msgId: 123
		};
		const bus = new EventEmitter();
		const fsm = fsmUnsubscribe(bus).testState('brokerUnsubscribe', CTX);
		bus.emit(['brokerUnsubscribe', CTX.clientKey, 'res'], {
			clientKey: CTX.clientKey,
			msgId: 124,
			error: null
		});
		expect(fsm.next.mock.calls.length).toEqual(0);
	});
	test('handle failed desubscription', () => {
		const CTX = {
			clientKey: '::1_12345',
			msgId: 123
		};
		const bus = new EventEmitter();
		const fsm = fsmUnsubscribe(bus).testState('brokerUnsubscribe', CTX);
		bus.emit(['brokerUnsubscribe', CTX.clientKey, 'res'], {
			clientKey: CTX.clientKey,
			msgId: 123,
			error: 'Subscription failed'
		});
		expect(fsm.next.mock.calls[0][0].message).toEqual('Rejected: congestion');
	});
});

describe('final', () => {
	test('if err is not null, send no unsuback', () => {
		const CTX = {
			clientKey: '::1_12345',
			msgId: 123
		};
		const ERR = new Error('Rejected: invalid topic ID');
		const bus = new EventEmitter();
		const ack = jest.fn();
		bus.on(['snUnicastOutgress', CTX.clientKey, 'unsuback'], ack);
		fsmUnsubscribe(bus).testState('_final', CTX, ERR);
		expect(ack.mock.calls.length).toBe(0);
	});
	test('send unsuback if everything went fine', () => {
		const CTX = {
			clientKey: '::1_12345',
			msgId: 123,
			topic: 'def',
			topics: ['abc', 'def']
		};
		const bus = new EventEmitter();
		const ack = jest.fn();
		bus.on(['snUnicastOutgress', CTX.clientKey, 'unsuback'], ack);
		fsmUnsubscribe(bus).testState('_final', CTX);
		expect(ack.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			cmd: 'unsuback',
			msgId: CTX.msgId
		});
	});
});

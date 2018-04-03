const EventEmitter = require('eventemitter2');

jest.mock('edfsm');

const fsmPublishToBroker = require('../fsmPublishToBroker.js');

describe('state: init', () => {
	test('get topic from \'normal\' topic id type', () => {
		const CTX = {
			topicIdType: 'normal',
			topicId: 1,
			topics: ['abc', 'def'],
			qos: 0
		};
		const fsm = fsmPublishToBroker().testState('init', CTX);
		expect(CTX.topic).toEqual(CTX.topics[0]);
		expect(fsm.next.mock.calls[0][0]).toEqual('publishToBroker');
	});
	test('get topic from \'short topic\' topic id type', () => {
		const CTX = {
			topicIdType: 'short topic',
			topicId: 'ab',
			qos: 0
		};
		const fsm = fsmPublishToBroker().testState('init', CTX);
		expect(CTX.topic).toEqual('ab');
		expect(fsm.next.mock.calls[0][0]).toEqual('publishToBroker');
	});
	test('reject if topic id type is \'pre-defined\'', () => {
		const CTX = {
			topicIdType: 'pre-defined',
			topicId: 123,
			qos: 0
		};
		const fsm = fsmPublishToBroker().testState('init', CTX);
		expect(fsm.next.mock.calls[0][0].message).toEqual('Rejected: invalid topic ID');
	});
	test('reject if topic id type is \'normal\' and topic id is unknown', () => {
		const CTX = {
			topicIdType: 'normal',
			topicId: 2,
			topics: ['abc'],
			qos: 0
		};
		const fsm = fsmPublishToBroker().testState('init', CTX);
		expect(fsm.next.mock.calls[0][0].message).toEqual('Rejected: invalid topic ID');
	});
	test('reject if qos > 1', () => {
		const CTX = {
			topicIdType: 'normal',
			topicId: 1,
			topics: ['abc'],
			qos: 2
		};
		const fsm = fsmPublishToBroker().testState('init', CTX);
		expect(fsm.next.mock.calls[0][0].message).toEqual('Rejected: congestion');
	});
});

describe('state: publishToBroker', () => {
	test('send packet to broker', () => {
		const CTX = {
			clientKey: '::1_12345',
			msgId: 12345,
			topic: 'test',
			payload: Buffer.from('a'),
			qos: 0,
			retain: true
		};
		const bus = new EventEmitter();
		const req = jest.fn();
		bus.on(['brokerPublishFromClient', CTX.clientKey, 'req'], req);
		fsmPublishToBroker(bus).testState('publishToBroker', CTX);
		expect(req.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			msgId: CTX.msgId,
			topic: CTX.topic,
			qos: CTX.qos,
			payload: CTX.payload,
			retain: CTX.retain
		});
	});
	test('goto final if broker replies with response', () => {
		const CTX = {
			clientKey: '::1_12345',
			msgId: 12345,
			topic: 'test',
			payload: Buffer.from('a'),
			qos: 0
		};
		const bus = new EventEmitter();
		const fsm = fsmPublishToBroker(bus).testState('publishToBroker', CTX);
		expect(fsm.next.mock.calls.length).toEqual(0);
		bus.emit(['brokerPublishFromClient', CTX.clientKey, 'res'], {
			clientKey: CTX.clientKey,
			msgId: CTX.msgId,
			error: null
		});
		expect(fsm.next.mock.calls[0][0]).toBe(null);
	});
	test('ignore responses with wrong msgId', () => {
		const CTX = {
			clientKey: '::1_12345',
			msgId: 12345,
			topic: 'test',
			payload: Buffer.from('a'),
			qos: 0
		};
		const bus = new EventEmitter();
		const fsm = fsmPublishToBroker(bus).testState('publishToBroker', CTX);
		bus.emit(['brokerPublishFromClient', CTX.clientKey, 'res'], {
			clientKey: CTX.clientKey,
			msgId: 123,
			error: null
		});
		expect(fsm.next.mock.calls.length).toEqual(0);
	});
	test('report errors', () => {
		const CTX = {
			clientKey: '::1_12345',
			msgId: 12345,
			topic: 'test',
			payload: Buffer.from('a'),
			qos: 0
		};
		const bus = new EventEmitter();
		const fsm = fsmPublishToBroker(bus).testState('publishToBroker', CTX);
		bus.emit(['brokerPublishFromClient', CTX.clientKey, 'res'], {
			clientKey: CTX.clientKey,
			msgId: CTX.msgId,
			error: 'Not published'
		});
		expect(fsm.next.mock.calls[0][0].message).toEqual('Rejected: congestion');
	});
});

describe('final', () => {
	test('if err is not null, send negative puback', () => {
		const CTX = {
			clientKey: '::1_12345',
			msgId: 123
		};
		const ERR = new Error('Rejected: invalid topic ID');
		const bus = new EventEmitter();
		const ack = jest.fn();
		bus.on(['snUnicastOutgress', CTX.clientKey, 'puback'], ack);
		fsmPublishToBroker(bus).testState('_final', CTX, ERR);
		expect(ack.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			cmd: 'puback',
			msgId: CTX.msgId,
			returnCode: ERR.message
		});
	});
	test('send puback', () => {
		const CTX = {
			clientKey: '::1_12345',
			msgId: 123,
			qos: 1,
			topicId: 342
		};
		const bus = new EventEmitter();
		const ack = jest.fn();
		bus.on(['snUnicastOutgress', CTX.clientKey, 'puback'], ack);
		fsmPublishToBroker(bus).testState('_final', CTX);
		expect(ack.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			cmd: 'puback',
			msgId: CTX.msgId,
			topicId: CTX.topicId,
			returnCode: 'Accepted'
		});
	});
	test('don\'t send puback if qos < 1', () => {
		const CTX = {
			clientKey: '::1_12345',
			msgId: 123,
			qos: 0
		};
		const bus = new EventEmitter();
		const ack = jest.fn();
		bus.on(['snUnicastOutgress', CTX.clientKey, 'puback'], ack);
		fsmPublishToBroker(bus).testState('_final', CTX);
		expect(ack.mock.calls.length).toEqual(0);
	});
});

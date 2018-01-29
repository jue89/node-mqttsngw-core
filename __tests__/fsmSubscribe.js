const EventEmitter = require('eventemitter2');

jest.mock('edfsm');

const fsmSubscribe = require('../fsmSubscribe.js');

describe('state: init', () => {
	test('get topic from \'normal\' topic id type', () => {
		const CTX = {
			topicIdType: 'normal',
			topicName: 'testtopic'
		};
		const fsm = fsmSubscribe().testState('init', CTX);
		expect(CTX.topic).toEqual('testtopic');
		expect(fsm.next.mock.calls[0][0]).toEqual('brokerSubscribe');
	});
	test('get topic from \'short topic\' topic id type', () => {
		const CTX = {
			topicIdType: 'short topic',
			topicName: 'ab'
		};
		const fsm = fsmSubscribe().testState('init', CTX);
		expect(CTX.topic).toEqual('ab');
		expect(fsm.next.mock.calls[0][0]).toEqual('brokerSubscribe');
	});
	test('send negativ suback if topic cannot determined', () => {
		const CTX = {
			topicIdType: 'pre-defined',
			topicId: 123
		};
		const fsm = fsmSubscribe().testState('init', CTX);
		expect(fsm.next.mock.calls[0][0].message).toEqual('Rejected: invalid topic ID');
	});
	test('reduce requested qos if >1 (wo don\'t support this atm)', () => {
		const CTX = {
			qos: 2
		};
		fsmSubscribe().testState('init', CTX);
		expect(CTX.qos).toEqual(1);
	});
});

describe('state: brokerSubscribe', () => {
	test('send subscribe request to broker', () => {
		const CTX = {
			clientKey: '::1_12345',
			msgId: 123,
			topic: 'testtopic',
			qos: 1
		};
		const bus = new EventEmitter();
		const req = jest.fn();
		bus.on(['brokerSubscribe', CTX.clientKey, 'req'], req);
		fsmSubscribe(bus).testState('brokerSubscribe', CTX);
		expect(req.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			msgId: CTX.msgId,
			topic: CTX.topic,
			qos: CTX.qos
		});
	});
	test('wait for subscribe response from broker', () => {
		const CTX = {
			clientKey: '::1_12345',
			msgId: 123
		};
		const bus = new EventEmitter();
		const fsm = fsmSubscribe(bus).testState('brokerSubscribe', CTX);
		bus.emit(['brokerSubscribe', CTX.clientKey, 'res'], {
			clientKey: CTX.clientKey,
			msgId: 123,
			error: null,
			qos: 1
		});
		expect(fsm.next.mock.calls[0][0]).toBe(null);
	});
	test('ignore subscribe responses from broker for other msgIds', () => {
		const CTX = {
			clientKey: '::1_12345',
			msgId: 123
		};
		const bus = new EventEmitter();
		const fsm = fsmSubscribe(bus).testState('brokerSubscribe', CTX);
		bus.emit(['brokerSubscribe', CTX.clientKey, 'res'], {
			clientKey: CTX.clientKey,
			msgId: 124,
			error: null,
			qos: 1
		});
		expect(fsm.next.mock.calls.length).toEqual(0);
	});
	test('set granted qos', () => {
		const CTX = {
			clientKey: '::1_12345',
			msgId: 123,
			qos: 1
		};
		const bus = new EventEmitter();
		const fsm = fsmSubscribe(bus).testState('brokerSubscribe', CTX);
		bus.emit(['brokerSubscribe', CTX.clientKey, 'res'], {
			clientKey: CTX.clientKey,
			msgId: 123,
			error: null,
			qos: 0
		});
		expect(fsm.next.mock.calls.length).toEqual(1);
		expect(CTX.qos).toEqual(0);
	});
	test('handle failed subscription', () => {
		const CTX = {
			clientKey: '::1_12345',
			msgId: 123,
			qos: 1
		};
		const bus = new EventEmitter();
		const fsm = fsmSubscribe(bus).testState('brokerSubscribe', CTX);
		bus.emit(['brokerSubscribe', CTX.clientKey, 'res'], {
			clientKey: CTX.clientKey,
			msgId: 123,
			error: 'Subscription failed'
		});
		expect(fsm.next.mock.calls[0][0].message).toEqual('Rejected: congestion');
	});
});

describe('final', () => {
	test('if err is not null, send negative suback', () => {
		const CTX = {
			clientKey: '::1_12345',
			msgId: 123
		};
		const ERR = new Error('Rejected: invalid topic ID');
		const bus = new EventEmitter();
		const ack = jest.fn();
		bus.on(['snUnicastOutgress', CTX.clientKey, 'suback'], ack);
		fsmSubscribe(bus).testState('_final', CTX, ERR);
		expect(ack.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			cmd: 'suback',
			msgId: CTX.msgId,
			returnCode: ERR.message
		});
	});
	test('if subscribed topic is in registerd topics, return it\'s id', () => {
		const CTX = {
			clientKey: '::1_12345',
			msgId: 123,
			topic: 'def',
			qos: 1,
			topics: ['abc', 'def']
		};
		const bus = new EventEmitter();
		const ack = jest.fn();
		bus.on(['snUnicastOutgress', CTX.clientKey, 'suback'], ack);
		fsmSubscribe(bus).testState('_final', CTX);
		expect(ack.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			cmd: 'suback',
			msgId: CTX.msgId,
			returnCode: 'Accepted',
			topicId: 2
		});
	});
	test('if subscribed topic is not in registerd topics, create new topicId and return it', () => {
		const CTX = {
			clientKey: '::1_12345',
			msgId: 123,
			topic: 'ghi',
			qos: 1,
			topics: ['abc', 'def']
		};
		const bus = new EventEmitter();
		const ack = jest.fn();
		bus.on(['snUnicastOutgress', CTX.clientKey, 'suback'], ack);
		fsmSubscribe(bus).testState('_final', CTX);
		expect(ack.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			cmd: 'suback',
			msgId: CTX.msgId,
			returnCode: 'Accepted',
			qos: CTX.qos,
			topicId: 3
		});
		expect(CTX.topics[2]).toMatch(CTX.topic);
	});
	test('don\'t create a new topicId if the topic is 2 chars long (short topic)', () => {
		const CTX = {
			clientKey: '::1_12345',
			msgId: 123,
			topic: 'ab',
			qos: 1
		};
		const bus = new EventEmitter();
		const ack = jest.fn();
		bus.on(['snUnicastOutgress', CTX.clientKey, 'suback'], ack);
		fsmSubscribe(bus).testState('_final', CTX);
		expect(ack.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			cmd: 'suback',
			msgId: CTX.msgId,
			returnCode: 'Accepted',
			topicId: 0
		});
	});
	test('don\'t create a new topicId if the topic is 1 char long (short topic)', () => {
		const CTX = {
			clientKey: '::1_12345',
			msgId: 123,
			topic: 'a',
			qos: 1
		};
		const bus = new EventEmitter();
		const ack = jest.fn();
		bus.on(['snUnicastOutgress', CTX.clientKey, 'suback'], ack);
		fsmSubscribe(bus).testState('_final', CTX);
		expect(ack.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			cmd: 'suback',
			msgId: CTX.msgId,
			returnCode: 'Accepted',
			topicId: 0
		});
	});
	test('don\'t create a new topicId if the topic contains \'+\'', () => {
		const CTX = {
			clientKey: '::1_12345',
			msgId: 123,
			topic: 'aaa/+',
			qos: 1,
			topics: []
		};
		const bus = new EventEmitter();
		const ack = jest.fn();
		bus.on(['snUnicastOutgress', CTX.clientKey, 'suback'], ack);
		fsmSubscribe(bus).testState('_final', CTX);
		expect(ack.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			cmd: 'suback',
			msgId: CTX.msgId,
			returnCode: 'Accepted',
			topicId: 0
		});
	});
	test('don\'t create a new topicId if the topic contains \'#\'', () => {
		const CTX = {
			clientKey: '::1_12345',
			msgId: 123,
			topic: 'aab/#',
			qos: 1,
			topics: []
		};
		const bus = new EventEmitter();
		const ack = jest.fn();
		bus.on(['snUnicastOutgress', CTX.clientKey, 'suback'], ack);
		fsmSubscribe(bus).testState('_final', CTX);
		expect(ack.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			cmd: 'suback',
			msgId: CTX.msgId,
			returnCode: 'Accepted',
			topicId: 0
		});
	});
});

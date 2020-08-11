const EventEmitter = require('eventemitter2');

jest.mock('edfsm');

const fsmPublishToClient = require('../fsmPublishToClient.js');

describe('state: init', () => {
	test('throw error is qos is > 1', () => {
		const CTX = {
			qos: 2
		};
		const fsm = fsmPublishToClient().testState('init', CTX);
		expect(fsm.next.mock.calls[0][0].message).toEqual('QOS=2 is currently not supported');
	});
	test('find topic id in topic store', () => {
		const CTX = {
			topic: 'def',
			topics: ['abc', 'def']
		};
		const fsm = fsmPublishToClient().testState('init', CTX);
		expect(CTX.topicId).toEqual(2);
		expect(CTX.topicIdType).toEqual('normal');
		expect(fsm.next.mock.calls[0][0]).toEqual('publishToClient');
	});
	test('register topic at client if not present in store', () => {
		const CTX = {
			topic: 'ghi',
			topics: ['abc', 'def']
		};
		const fsm = fsmPublishToClient().testState('init', CTX);
		expect(CTX.topicId).toEqual(3);
		expect(CTX.topics[2]).toEqual(CTX.topic);
		expect(fsm.next.mock.calls[0][0]).toEqual('registerTopic');
	});
	test('don\'t lookup short topics', () => {
		const CTX = {
			topic: 'ab'
		};
		const fsm = fsmPublishToClient().testState('init', CTX);
		expect(CTX.topicId).toEqual('ab');
		expect(CTX.topicIdType).toEqual('short topic');
		expect(fsm.next.mock.calls[0][0]).toEqual('publishToClient');
	});
});

describe('state: registerTopic', () => {
	test('send register request to client', () => {
		const CTX = {
			clientKey: '::1_12345',
			topic: 'testtopic',
			topicId: 1
		};
		const bus = new EventEmitter();
		const req = jest.fn();
		bus.on(['snUnicastOutgress', CTX.clientKey, 'register'], req);
		fsmPublishToClient(bus).testState('registerTopic', CTX);
		expect(req.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			cmd: 'register',
			msgId: CTX.msgId,
			topicId: CTX.topicId,
			topicName: CTX.topic
		});
	});
	test('wait for regack from client', () => {
		const CTX = {
			clientKey: '::1_12345',
			msgId: 123
		};
		const bus = new EventEmitter();
		const fsm = fsmPublishToClient(bus).testState('registerTopic', CTX);
		bus.emit(['snUnicastIngress', CTX.clientKey, 'regack'], {
			clientKey: CTX.clientKey,
			cmd: 'regack',
			msgId: CTX.msgId,
			returnCode: 'Accepted'
		});
		expect(fsm.next.mock.calls[0][0]).toEqual('publishToClient');
	});
	test('ignore regack with wrong msgId', () => {
		const CTX = {
			clientKey: '::1_12345',
			msgId: 123
		};
		const bus = new EventEmitter();
		const fsm = fsmPublishToClient(bus).testState('registerTopic', CTX);
		bus.emit(['snUnicastIngress', CTX.clientKey, 'regack'], {
			clientKey: CTX.clientKey,
			cmd: 'regack',
			msgId: 124,
			returnCode: 'Accepted'
		});
		expect(fsm.next.mock.calls.length).toEqual(0);
	});
	test('throw error if client has not accepted register request', () => {
		const CTX = {
			clientKey: '::1_12345',
			msgId: 123
		};
		const bus = new EventEmitter();
		const fsm = fsmPublishToClient(bus).testState('registerTopic', CTX);
		bus.emit(['snUnicastIngress', CTX.clientKey, 'regack'], {
			clientKey: CTX.clientKey,
			cmd: 'regack',
			msgId: CTX.msgId,
			returnCode: 'Rejected: congestion'
		});
		expect(fsm.next.mock.calls[0][0].message).toEqual('Rejected: congestion');
	});
	test('retry after 6s without regack', () => {
		const CTX = {
			clientKey: '::1_12345',
			msgId: 123
		};
		const bus = new EventEmitter();
		const fsm = fsmPublishToClient(bus).testState('registerTopic', CTX);
		expect(fsm.next.timeout.mock.calls[0][0]).toEqual(6000);
		expect(fsm.next.timeout.mock.calls[0][1]).toEqual('registerTopic');
	});
	test('retry only 3 times', () => {
		const CTX = {
			clientKey: '::1_12345',
			msgId: 123,
			registerTry: 3
		};
		const bus = new EventEmitter();
		const fsm = fsmPublishToClient(bus).testState('registerTopic', CTX);
		expect(CTX.registerTry).toEqual(4);
		expect(fsm.next.mock.calls[0][0].message).toEqual('Client has not answered register topic requests');
	});
});

describe('state: publishToClient', () => {
	test('send data to client', () => {
		const CTX = {
			clientKey: '::1_12345',
			topic: 'testtopic',
			topicId: 1,
			topicIdType: 'normal',
			qos: 1,
			payload: Buffer.from('a'),
			msgId: 123
		};
		const bus = new EventEmitter();
		const pub = jest.fn();
		bus.on(['snUnicastOutgress', CTX.clientKey, 'publish'], pub);
		fsmPublishToClient(bus).testState('publishToClient', CTX);
		expect(pub.mock.calls[0][0]).toMatchObject({
			clientKey: CTX.clientKey,
			cmd: 'publish',
			msgId: CTX.msgId,
			topicId: CTX.topicId,
			topicIdType: CTX.topicIdType,
			qos: CTX.qos
		});
	});
	test('if qos = 0 go to final', () => {
		const CTX = {
			clientKey: '::1_12345',
			qos: 0
		};
		const bus = new EventEmitter();
		const fsm = fsmPublishToClient(bus).testState('publishToClient', CTX);
		expect(fsm.next.mock.calls[0][0]).toBe(null);
	});
	test('if qos = 1 wait for puback from client', () => {
		const CTX = {
			clientKey: '::1_12345',
			qos: 1,
			msgId: 123
		};
		const bus = new EventEmitter();
		const fsm = fsmPublishToClient(bus).testState('publishToClient', CTX);
		expect(fsm.next.mock.calls.length).toEqual(0);
		bus.emit(['snUnicastIngress', CTX.clientKey, 'puback'], {
			clientKey: CTX.clientKey,
			cmd: 'puback',
			msgId: CTX.msgId,
			returnCode: 'Accepted'
		});
		expect(fsm.next.mock.calls[0][0]).toBe(null);
	});
	test('ignore pubacks with wrong msgId', () => {
		const CTX = {
			clientKey: '::1_12345',
			qos: 1,
			msgId: 123
		};
		const bus = new EventEmitter();
		const fsm = fsmPublishToClient(bus).testState('publishToClient', CTX);
		bus.emit(['snUnicastIngress', CTX.clientKey, 'puback'], {
			clientKey: CTX.clientKey,
			cmd: 'puback',
			msgId: 142,
			returnCode: 'Accepted'
		});
		expect(fsm.next.mock.calls.length).toEqual(0);
	});
	test('abort rejected pubacks', () => {
		const CTX = {
			clientKey: '::1_12345',
			qos: 1,
			msgId: 123
		};
		const bus = new EventEmitter();
		const fsm = fsmPublishToClient(bus).testState('publishToClient', CTX);
		bus.emit(['snUnicastIngress', CTX.clientKey, 'puback'], {
			clientKey: CTX.clientKey,
			cmd: 'puback',
			msgId: CTX.msgId,
			returnCode: 'Reject: congestion'
		});
		expect(fsm.next.mock.calls[0][0].message).toEqual('Reject: congestion');
	});
	test('retry after 6s', () => {
		const CTX = {
			clientKey: '::1_12345',
			qos: 1,
			msgId: 123
		};
		const bus = new EventEmitter();
		const fsm = fsmPublishToClient(bus).testState('publishToClient', CTX);
		expect(fsm.next.timeout.mock.calls[0][0]).toEqual(6000);
		expect(fsm.next.timeout.mock.calls[0][1]).toEqual('publishToClient');
	});
	test('abort publishing to client if we have tried 3 times', () => {
		const CTX = {
			clientKey: '::1_12345',
			qos: 1,
			publishTry: 3
		};
		const bus = new EventEmitter();
		const fsm = fsmPublishToClient(bus).testState('publishToClient', CTX);
		expect(CTX.publishTry).toEqual(4);
		expect(fsm.next.mock.calls[0][0].message).toEqual('Client has not sent puback');
	});
	test('send register request of client reported invalid topic id', () => {
		const CTX = {
			clientKey: '::1_12345',
			qos: 1,
			msgId: 123
		};
		const bus = new EventEmitter();
		const fsm = fsmPublishToClient(bus).testState('publishToClient', CTX);
		bus.emit(['snUnicastIngress', CTX.clientKey, 'puback'], {
			clientKey: CTX.clientKey,
			msgId: CTX.msgId,
			returnCode: 'Rejected: invalid topic ID'
		});
		expect(fsm.next.mock.calls[0][0]).toEqual('registerTopic');
	});
});

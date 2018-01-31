const FSM = require('edfsm');
module.exports = (bus, log) => {
	return FSM({
		fsmName: '[Core] PublishToBroker',
		log: log,
		input: bus,
		output: bus,
		firstState: 'init'
	}).state('init', (ctx, i, o, next) => {
		// TODO: We cannot handle QOS 2 atm ...
		if (ctx.qos > 1) return next(new Error('Rejected: congestion'));

		// Handle given topic
		if (ctx.topicIdType === 'normal' && ctx.topics[ctx.topicId - 1]) {
			ctx.topic = ctx.topics[ctx.topicId - 1];
			delete ctx.topicIdType;
			delete ctx.topicId;
			next('publishToBroker');
		} else if (ctx.topicIdType === 'short topic') {
			ctx.topic = ctx.topicId;
			delete ctx.topicIdType;
			delete ctx.topicId;
			next('publishToBroker');
		} else {
			next(new Error('Rejected: invalid topic ID'));
		}
	}).state('publishToBroker', (ctx, i, o, next) => {
		// Send publish to broker
		o(['brokerPublishFromClient', ctx.clientKey, 'req'], {
			clientKey: ctx.clientKey,
			msgId: ctx.msgId,
			qos: ctx.qos,
			topic: ctx.topic,
			payload: ctx.payload,
			retain: ctx.retain
		});

		// Wait for response from broker
		i(['brokerPublishFromClient', ctx.clientKey, 'res'], (data) => {
			if (data.msgId !== ctx.msgId) return;
			if (data.error) return next(new Error('Rejected: congestion'));
			next(null);
		});
	}).final((ctx, i, o, end, err) => {
		// Send negative puback if something bad happend before
		if (err instanceof Error) {
			o(['snUnicastOutgress', ctx.clientKey, 'puback'], {
				clientKey: ctx.clientKey,
				cmd: 'puback',
				msgId: ctx.msgId,
				returnCode: err.message
			});
			return end();
		}

		// Otherwise send puback if qos is > 0
		if (ctx.qos > 0) {
			o(['snUnicastOutgress', ctx.clientKey, 'puback'], {
				clientKey: ctx.clientKey,
				cmd: 'puback',
				msgId: ctx.msgId,
				returnCode: 'Accepted'
			});
		}
		end();
	});
};

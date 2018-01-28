const FSM = require('edfsm');
module.exports = (bus, log) => {
	return FSM({
		fsmName: '[Core] Subscribe',
		log: log,
		input: bus,
		output: bus,
		firstState: 'init'
	}).state('init', (ctx, i, o, next) => {
		// Make sure qos is not larger than 1!
		if (ctx.qos > 1) ctx.qos = 1;

		// Handle given topic
		if (ctx.topicIdType === 'normal' || ctx.topicIdType === 'short topic') {
			ctx.topic = ctx.topicName;
			delete ctx.topicIdType;
			delete ctx.topicName;
			next('brokerSubscribe');
		} else {
			// TODO: Support for pre-defined topics
			next(new Error('Rejected: invalid topic ID'));
		}
	}).state('brokerSubscribe', (ctx, i, o, next) => {
		// Send subscribe request to broker
		o(['brokerSubscribe', ctx.clientKey, 'req'], {
			clientKey: ctx.clientKey,
			msgId: ctx.msgId,
			topic: ctx.topic
		});

		// Wait for the response from the broker
		i(['brokerSubscribe', ctx.clientKey, 'res'], (data) => {
			if (data.msgId !== ctx.msgId) return;
			if (data.error) return next(new Error('Rejected: congestion'));
			ctx.qos = data.qos;
			next(null);
		});
	}).final((ctx, i, o, end, err) => {
		// An error occured -> send negative SUBACK
		if (err instanceof Error) {
			o(['snUnicastOutgress', ctx.clientKey, 'suback'], {
				clientKey: ctx.clientKey,
				cmd: 'suback',
				msgId: ctx.msgId,
				returnCode: err.message
			});
			return end();
		}

		// Everthing went fine -> send positive SUBACK
		const SUBACK = {
			clientKey: ctx.clientKey,
			cmd: 'suback',
			msgId: ctx.msgId,
			topicId: 0,
			qos: ctx.qos,
			returnCode: 'Accepted'
		};

		// Check if the topic is worth to be saved in topic store:
		// Longer than 2 characters and no wild card symbols
		if (ctx.topic.length > 2 && ctx.topic.indexOf('+') === -1 && ctx.topic.indexOf('#') === -1) {
			// Check if subscribed topic is already contained in topics
			SUBACK.topicId = ctx.topics.indexOf(ctx.topic) + 1;
			// If it is not -> store it!
			if (SUBACK.topicId === 0) SUBACK.topicId = ctx.topics.push(ctx.topic);
		}
		o(['snUnicastOutgress', ctx.clientKey, 'suback'], SUBACK);
		end();
	});
};

const FSM = require('edfsm');
module.exports = (bus, log) => {
	return FSM({
		fsmName: '[Core] PublishToBroker',
		log: log,
		input: bus,
		output: bus,
		firstState: 'init'
	}).state('init', (ctx, i, o, next) => {
		// Make sure QoS is not 2 (TODO: Support it!)
		if (ctx.qos > 1) return next(new Error('QOS=2 is currently not supported'));

		// Short topics don't need to be looked up
		if (ctx.topic.length <= 2) {
			ctx.topicId = ctx.topic;
			ctx.topicIdType = 'short topic';
			return next('publishToClient');
		}

		// Otherwise try to find a topic id
		ctx.topicId = ctx.topics.indexOf(ctx.topic) + 1;
		ctx.topicIdType = 'normal';
		if (ctx.topicId === 0) {
			ctx.topicId = ctx.topics.push(ctx.topic);
			next('registerTopic');
		} else {
			next('publishToClient');
		}
	}).state('registerTopic', (ctx, i, o, next) => {
		// Install retry timeout for register topic request
		if (ctx.registerTry === undefined) ctx.registerTry = 0;
		if (ctx.registerTry++ >= 3) return next(new Error('Client has not answered register topic requests'));
		next.timeout(6000, 'registerTopic');

		// Send register request to client
		o(['snUnicastOutgress', ctx.clientKey, 'register'], {
			clientKey: ctx.clientKey,
			cmd: 'register',
			msgId: ctx.msgId,
			topicName: ctx.topic,
			topicId: ctx.topicId
		});

		// Wait for regack
		i(['snUnicastIngress', ctx.clientKey, 'regack'], (data) => {
			if (data.msgId !== ctx.msgId) return;
			if (data.returnCode !== 'Accepted') return next(new Error(data.returnCode));
			next('publishToClient');
		});
	}).state('publishToClient', (ctx, i, o, next) => {
		// Install retry timeout for publish
		if (ctx.publishTry === undefined) ctx.publishTry = 0;
		if (ctx.publishTry++ >= 3) return next(new Error('Client has not sent puback'));
		next.timeout(6000, 'publishToClient');

		// Send data to client
		o(['snUnicastOutgress', ctx.clientKey, 'publish'], {
			clientKey: ctx.clientKey,
			cmd: 'publish',
			msgId: ctx.msgId,
			topicIdType: ctx.topicIdType,
			topicId: ctx.topicId,
			payload: ctx.payload,
			qos: ctx.qos
		});

		// If qos = 0 we have do not have to wait for pub acks
		if (ctx.qos === 0) return next(null);

		// Wait for puback
		i(['snUnicastIngress', ctx.clientKey, 'puback'], (data) => {
			if (data.msgId !== ctx.msgId) return;
			if (data.returnCode !== 'Accepted') return next(new Error(data.returnCode));
			next(null);
		});
	}).final((ctx, i, o, end, err) => {
		// Forward errors to broker
		if (err instanceof Error) {
			o(['brokerPublishToClient', ctx.clientKey, 'res'], {
				clientKey: ctx.clientKey,
				msgId: ctx.msgId,
				error: err.message
			});
		} else {
			o(['brokerPublishToClient', ctx.clientKey, 'res'], {
				clientKey: ctx.clientKey,
				msgId: ctx.msgId,
				error: null
			});
		}
		end();
	});
};

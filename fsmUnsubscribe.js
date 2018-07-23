const FSM = require('edfsm');
module.exports = (bus, log) => {
	return FSM({
		fsmName: '[Core] Unsubscribe',
		log: log,
		input: bus,
		output: bus,
		firstState: 'init'
	}).state('init', (ctx, i, o, next) => {
		// Handle given topic
		if (ctx.topicIdType === 'normal' || ctx.topicIdType === 'short topic') {
			ctx.topic = ctx.topicName;
			delete ctx.topicIdType;
			delete ctx.topicName;
			next('brokerUnsubscribe');
		} else {
			// TODO: Support for pre-defined topics
			next(new Error('Rejected: invalid topic ID'));
		}
	}).state('brokerUnsubscribe', (ctx, i, o, next) => {
		// Send subscribe request to broker
		o(['brokerUnsubscribe', ctx.clientKey, 'req'], {
			clientKey: ctx.clientKey,
			msgId: ctx.msgId,
			topic: ctx.topic
		});

		// Wait for the response from the broker
		i(['brokerUnsubscribe', ctx.clientKey, 'res'], (data) => {
			if (data.msgId !== ctx.msgId) return;
			if (data.error) return next(new Error('Rejected: congestion'));
			next(null);
		});
	}).final((ctx, i, o, end, err) => {
		// An error occured -> send no UNSUBACK
		if (err instanceof Error) return end();

		// Everthing went fine -> send UNSUBACK
		o(['snUnicastOutgress', ctx.clientKey, 'unsuback'], {
			clientKey: ctx.clientKey,
			cmd: 'unsuback',
			msgId: ctx.msgId
		});
		end();
	});
};

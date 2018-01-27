const FSM = require('edfsm');
module.exports = (bus, log) => {
	return FSM({
		fsmName: 'Client',
		log: log,
		input: bus,
		output: bus
	}).state('init', (ctx, i, o, next) => {
		// Convert received packet into context
		delete ctx.cmd;
		ctx.connected = false;

		// Select next state depending on the will flag
		if (ctx.will) next('willTopic');
		else next('connectBroker');
	}).state('willTopic', (ctx, i, o, next) => {
		// TODO
		next(new Error('willTopic is not implemented'));
	}).state('willMessage', (ctx, i, o, next) => {
		// TODO
		next(new Error('willMessage is not implemented'));
	}).state('connectBroker', (ctx, i, o, next) => {
		// Ask broker module to conncet to broker
		o(['brokerConnect', ctx.clientKey, 'req'], Object.assign({}, ctx));

		// Wait for a result from the broker
		i(['brokerConnect', ctx.clientKey, 'res'], (res) => {
			// Broker module returned an error
			if (res.error) return next(new Error(res.error));

			// Connection was successfully established
			ctx.sessionResumed = res.sessionResumed;
			ctx.connected = true;
			o(['snUnicastOutgress', ctx.clientKey, 'connack'], {
				clientKey: ctx.clientKey,
				cmd: 'connack',
				returnCode: 'Accepted'
			});
			next('active');
		});

		// The broker module must return at least a timeout!
		// -> No next.timeout() in this state.
	}).state('active', (ctx, i, o, next) => {
		// TODO
		next(new Error('active is not implemented'));
	}).final((ctx, i, o, end, err) => {
		if (!ctx.connected) {
			// Send negative connack, since the error occured
			// while establishing connection
			o(['snUnicastOutgress', ctx.clientKey, 'connack'], {
				clientKey: ctx.clientKey,
				cmd: 'connack',
				returnCode: 'Rejected: congestion'
			});
		} else {
			// TODO
		}
		end();
	});
};

const FSM = require('edfsm');
module.exports = (bus, log) => {
	const subscribeFactory = require('./fsmSubscribe.js')(bus, log);
	return FSM({
		fsmName: 'Client',
		log: log,
		input: bus,
		output: bus
	}).state('init', (ctx, i, o, next) => {
		// Convert received packet into context
		delete ctx.cmd;
		ctx.connectedToClient = false;
		ctx.connectedToBroker = false;
		ctx.topics = [];

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
			ctx.connectedToBroker = true;
			o(['snUnicastOutgress', ctx.clientKey, 'connack'], {
				clientKey: ctx.clientKey,
				cmd: 'connack',
				returnCode: 'Accepted'
			});
			ctx.connectedToClient = true;
			next('active');
		});

		// The broker module must return at least a timeout!
		// -> No next.timeout() in this state.
	}).state('active', (ctx, i, o, next) => {
		// Listen for disconnects from client
		i(['snUnicastIngress', ctx.clientKey, 'disconnect'], (data) => {
			// TODO: duration? -> sleep instead of disconnect
			next(null);
		});

		// Listen for disconnects from broker
		i(['brokerDisconnect', ctx.clientKey, 'notify'], (data) => {
			ctx.connectedToBroker = false;
			next(null);
		});

		// React to register events
		i(['snUnicastIngress', ctx.clientKey, 'register'], (data) => {
			// TODO: Check if space in topic store is left
			const topicId = ctx.topics.push(data.topicName);
			o(['snUnicastOutgress', ctx.clientKey, 'regack'], {
				clientKey: ctx.clientKey,
				cmd: 'regack',
				msgId: data.msgId,
				topicId: topicId,
				returnCode: 'Accepted'
			});
		});

		// Handle subscribe
		i(['snUnicastIngress', ctx.clientKey, 'subscribe'], (data) => {
			// Kick-off new state machine to handle subscribe messages
			data.topics = ctx.topics;
			subscribeFactory.run(data);
		});
		// TODO: Handle publish from client
		// TODO: Handle publish from broker
		// TODO: Handle will updates

		// React to ping requests
		i(['snUnicastIngress', ctx.clientKey, 'pingreq'], () => {
			o(['snUnicastOutgress', ctx.clientKey, 'pingresp'], {
				clientKey: ctx.clientKey,
				cmd: 'pingresp'
			});
			// Reenter current state to reset all timeouts
			next('active');
		});

		// Timeout after given duration. This will be reset by ping requests.
		// TODO: Before just disconnecting, maybe try to send a ping request?
		next.timeout(ctx.duration * 1000, new Error('Received no ping requests within given connection duration'));
	}).final((ctx, i, o, end, err) => {
		if (!ctx.connectedToClient) {
			// Send negative connack, since the error occured
			// while establishing connection
			o(['snUnicastOutgress', ctx.clientKey, 'connack'], {
				clientKey: ctx.clientKey,
				cmd: 'connack',
				returnCode: 'Rejected: congestion'
			});
		} else {
			// TODO: Check if error is not null?
			//       -> Send last will

			// Send disconnect message to client
			o(['snUnicastOutgress', ctx.clientKey, 'disconnect'], {
				clientKey: ctx.clientKey,
				cmd: 'disconnect'
			});
		}

		if (ctx.connectedToBroker) {
			o(['brokerDisconnect', ctx.clientKey, 'call'], {
				clientKey: ctx.clientKey
			});
		}

		end();
	});
};

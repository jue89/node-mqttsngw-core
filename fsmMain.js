const FSM = require('edfsm');
module.exports = (bus, log) => {
	const clientFactory = require('./fsmClient.js')(bus, log);
	return FSM({
		fsmName: '[Core] Main',
		log: log,
		input: bus,
		output: bus,
		firstState: 'init'
	}).state('init', (ctx, i, o, next) => {
		ctx.clients = {};
		next('listening');
	}).state('listening', (ctx, i, o, next) => {
		const clientByClientId = {};

		// Listen for CONNECT messages from the sensor network
		i(['snUnicastIngress', '*', 'connect'], (packet) => {
			// Ignore CONNECT for existing connections.
			if (ctx.clients[packet.clientKey]) return;

			// New client
			// - Kill other instances with the same clientId
			if (clientByClientId[packet.clientId]) {
				clientByClientId[packet.clientId].next(null);
			}
			// - Kick-off new instance
			const client = clientFactory.run(packet, () => {
				delete ctx.clients[packet.clientKey];
				if (clientByClientId[packet.clientId] === client) {
					delete clientByClientId[packet.clientId];
				}
			});
			ctx.clients[packet.clientKey] = client;
			if (ctx.enforceUniqueClientIds) {
				clientByClientId[packet.clientId] = client;
			}
		});
		// TODO: SEARCHGW, ADVERTISE
	}).final((ctx, i, o, end) => {
		Object.keys(ctx.clients).forEach((key) => {
			ctx.clients[key].next(null);
		});
		end();
	});
};

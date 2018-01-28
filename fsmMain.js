const FSM = require('edfsm');
module.exports = (bus, log) => {
	const clientFactory = require('./fsmClient.js')(bus, log);
	return FSM({
		fsmName: 'Main',
		log: log,
		input: bus,
		output: bus
	}).state('init', (ctx, i, o, next) => {
		ctx.clients = {};
		next('listening');
	}).state('listening', (ctx, i, o, next) => {
		// Listen for CONNECT messages from the sensor network
		i(['snUnicastIngress', '*', 'connect'], (packet) => {
			ctx.clients[packet.clientKey] = clientFactory.run(packet, () => {
				delete ctx.clients[packet.clientKey];
			});
		});
		// TODO: SEARCHGW, ADVERTISE
	}).final((ctx, i, o, end) => {
		// TODO: Kill all clients
		end();
	});
};

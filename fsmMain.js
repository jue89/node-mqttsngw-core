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
		// Listen for CONNECT messages from the sensor network
		i(['snUnicastIngress', '*', 'connect'], (packet) => {
			ctx.clients[packet.clientKey] = clientFactory.run(packet, () => {
				delete ctx.clients[packet.clientKey];
			});
		});
		// TODO: SEARCHGW, ADVERTISE
	}).final((ctx, i, o, end) => {
		Object.keys(ctx.clients).forEach((key) => {
			ctx.clients[key].next(null);
		});
		end();
	});
};

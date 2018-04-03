module.exports = (opts) => (bus) => {
	const mainFactory = require('./fsmMain.js')(bus, opts.log);
	return () => {
		const main = mainFactory.run(opts);
		return () => main.next(null);
	};
};

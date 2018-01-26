function MockFSM (opts) {
	this.states = {};
	this.input = opts.input;
	this.output = opts.output;
}

MockFSM.prototype.state = function (name, handler) {
	this.states[name] = handler;
	return this;
};

MockFSM.prototype.testState = function (state, ctx) {
	this.next = jest.fn();
	this.next.timeout = jest.fn();
	const i = (name, handler) => this.input.on(name, handler);
	const o = (name, arg) => this.output.emit(name, arg);
	this.states[state](ctx, i, o, this.next);
	return this;
};

module.exports = (opts) => new MockFSM(opts);

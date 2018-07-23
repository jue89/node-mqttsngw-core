module.exports = jest.fn(() => ({run: module.exports._run}));
module.exports._run = jest.fn(() => ({next: module.exports._next}));
module.exports._next = jest.fn();

'use strict';

const chai = require('chai');
const sinon = require('sinon');
const righto = require('righto');

const vapic = require('./vapic.js');
const testUtil = require('./vapic.testutil.js');
const packageJson = require('./package.json');

const expect = chai.expect;

describe('[Express Middleware]', () => {
	const keys = [
		{
			id: 'vapic://vapic/mocha/tests/expressMiddleware/hasCurrentVersion',
			versions: ['0.0.0', '0.0.1', packageJson.version],
		},
		{
			id: 'vapic://vapic/mocha/tests/expressMiddleware/doesNotHaveCurrentVersion',
			versions: ['0.0.2', '0.0.4', '0.0.6'],
		},
		{
			id: 'custom-prefix://vapic/mocha/tests/expressMiddleware/overrideDefaults',
			versions: ['0.0.0', '0.0.1', '99.99.99'],
		},
	];

	before(testUtil.waitForRedis);
	before(testUtil.clearKeys(keys));
	before(testUtil.setUpKeys(keys));

	after(testUtil.clearKeys(keys));

	it('should return a function', () => {
		let middleware = vapic.expressMiddleware({
		});
		expect(middleware).to.be.a('function');
		expect(middleware.length).to.equal(3); // req, res, next
	});

	describe('[Exact version]',  () => {

		it('should obtain the appropriate value when URL + version are set', (done) => {
			const redisClient = testUtil.getRedisClient();
			let middleware = vapic.expressMiddleware({
				redisClient,
			});
			const req = {
				originalUrl: '/vapic/mocha/tests/expressMiddleware/hasCurrentVersion',
			};
			const res = {
				setHeader: sinon.spy(),
			};
			middleware(req, res, next);
			function next() {
				expect(req.vapicError).to.not.exist()
				expect(res.setHeader.callCount).to.equal(1);
				const spyCall = res.setHeader.getCall(0);
				const defaultPermittedAge = 60;
				expect(spyCall.args[0]).to.equal('Cache-Control');
				expect(spyCall.args[1]).to.equal(`public, max-age=${defaultPermittedAge}`);
				expect(req.vapicResult).to.equal(`value for ${packageJson.version}`);
				done();
			}
		});

		it('should obtain the appropriate value when URL + version are set, and default overridden', (done) => {
			const redisClient = testUtil.getRedisClient();
			const fakeLogger = {
				error: sinon.spy(),
			};
			const vapicCustomOptions = {
				prefix: 'custom-prefix:/',
				cacheVersion: '99.99.99',
				permittedAge: 120,
				logger: fakeLogger,
				redisClient,
			};
			let middleware = vapic.expressMiddleware(vapicCustomOptions);
			const req = {
				originalUrl: '/vapic/mocha/tests/expressMiddleware/overrideDefaults',
			};
			const res = {
				setHeader: sinon.spy(),
			};
			middleware(req, res, next);
			function next() {
				expect(req.vapicError).to.not.exist()
				expect(fakeLogger.error.callCount).to.equal(0);
				expect(res.setHeader.callCount).to.equal(1);
				const setHeaderSpyCall = res.setHeader.getCall(0);
				expect(setHeaderSpyCall.args[0]).to.equal('Cache-Control');
				expect(setHeaderSpyCall.args[1]).to.equal(`public, max-age=${vapicCustomOptions.permittedAge}`);
				expect(req.vapicResult).to.equal(`value for ${vapicCustomOptions.cacheVersion}`);
				done();
			}
		});

		it('should error when URL is set but version is not', (done) => {
			const redisClient = testUtil.getRedisClient();
			let middleware = vapic.expressMiddleware({
				redisClient,
			});
			const req = {
				originalUrl: '/vapic/mocha/tests/expressMiddleware/doesNotHaveCurrentVersion',
			};
			const res = {
				setHeader: sinon.spy(),
			};
			middleware(req, res, next);
			function next() {
				expect(req.vapicResult).to.not.exist()
				expect(res.setHeader.callCount).to.equal(0);
				expect(req.vapicError).to.be.an('object');
				expect(req.vapicError.cacheKey).to.equal(`vapic:/${req.originalUrl}`);
				expect(req.vapicError.cacheVersion).to.equal(packageJson.version);
				done();
			}
		});

		it('should error when version is set but URL is not', (done) => {
			const redisClient = testUtil.getRedisClient();
			let middleware = vapic.expressMiddleware({
				redisClient,
			});
			const req = {
				originalUrl: '/vapic/mocha/tests/expressMiddleware/doesNotExist',
			};
			const res = {
				setHeader: sinon.spy(),
			};
			middleware(req, res, next);
			function next() {
				expect(req.vapicResult).to.not.exist()
				expect(res.setHeader.callCount).to.equal(0);
				expect(req.vapicError).to.be.an('object');
				expect(req.vapicError.cacheKey).to.equal(`vapic:/${req.originalUrl}`);
				expect(req.vapicError.cacheVersion).to.equal(packageJson.version);
				done();
			}
		});

	});

	describe('[Latest version up to current]', () => {

		it('should match last version when current version after last', (done) => {
			const redisClient = testUtil.getRedisClient();
			const vapicCustomOptions= {
				redisClient,
				cacheVersion: '0.0.8',
				versionMatchType: 'latestUpToCurrent',
			};
			let middleware = vapic.expressMiddleware(vapicCustomOptions);
			const req = {
				originalUrl: '/vapic/mocha/tests/expressMiddleware/doesNotHaveCurrentVersion',
			};
			const res = {
				setHeader: sinon.spy(),
			};
			middleware(req, res, next);
			function next() {
				const defaultPermittedAge = 60;
				expect(req.vapicError).to.not.exist()
				expect(res.setHeader.callCount).to.equal(1);
				const setHeaderSpyCall = res.setHeader.getCall(0);
				expect(setHeaderSpyCall.args[0]).to.equal('Cache-Control');
				expect(setHeaderSpyCall.args[1]).to.equal(`public, max-age=${defaultPermittedAge}`);
				expect(req.vapicResult).to.equal(`value for 0.0.6`);
				done();
			}
		});

		it('should match 2nd last version when current version is between 2nd last and last', (done) => {
			const redisClient = testUtil.getRedisClient();
			const vapicCustomOptions= {
				redisClient,
				cacheVersion: '0.0.5',
				versionMatchType: 'latestUpToCurrent',
			};
			let middleware = vapic.expressMiddleware(vapicCustomOptions);
			const req = {
				originalUrl: '/vapic/mocha/tests/expressMiddleware/doesNotHaveCurrentVersion',
			};
			const res = {
				setHeader: sinon.spy(),
			};
			middleware(req, res, next);
			function next() {
				const defaultPermittedAge = 60;
				expect(req.vapicError).to.not.exist()
				expect(res.setHeader.callCount).to.equal(1);
				const setHeaderSpyCall = res.setHeader.getCall(0);
				expect(setHeaderSpyCall.args[0]).to.equal('Cache-Control');
				expect(setHeaderSpyCall.args[1]).to.equal(`public, max-age=${defaultPermittedAge}`);
				expect(req.vapicResult).to.equal(`value for 0.0.4`);
				done();
			}
		});

		it('should match 2nd last version when current version is exactly the same as 2nd last', (done) => {
			const redisClient = testUtil.getRedisClient();
			const vapicCustomOptions= {
				redisClient,
				cacheVersion: '0.0.4',
				versionMatchType: 'latestUpToCurrent',
			};
			let middleware = vapic.expressMiddleware(vapicCustomOptions);
			const req = {
				originalUrl: '/vapic/mocha/tests/expressMiddleware/doesNotHaveCurrentVersion',
			};
			const res = {
				setHeader: sinon.spy(),
			};
			middleware(req, res, next);
			function next() {
				const defaultPermittedAge = 60;
				expect(req.vapicError).to.not.exist()
				expect(res.setHeader.callCount).to.equal(1);
				const setHeaderSpyCall = res.setHeader.getCall(0);
				expect(setHeaderSpyCall.args[0]).to.equal('Cache-Control');
				expect(setHeaderSpyCall.args[1]).to.equal(`public, max-age=${defaultPermittedAge}`);
				expect(req.vapicResult).to.equal(`value for 0.0.4`);
				done();
			}
		});

		it('should match 3rd last version when current version is between 3rd last and 2nd last', (done) => {
			const redisClient = testUtil.getRedisClient();
			const vapicCustomOptions= {
				redisClient,
				cacheVersion: '0.0.3',
				versionMatchType: 'latestUpToCurrent',
			};
			let middleware = vapic.expressMiddleware(vapicCustomOptions);
			const req = {
				originalUrl: '/vapic/mocha/tests/expressMiddleware/doesNotHaveCurrentVersion',
			};
			const res = {
				setHeader: sinon.spy(),
			};
			middleware(req, res, next);
			function next() {
				const defaultPermittedAge = 60;
				expect(req.vapicError).to.not.exist()
				expect(res.setHeader.callCount).to.equal(1);
				const setHeaderSpyCall = res.setHeader.getCall(0);
				expect(setHeaderSpyCall.args[0]).to.equal('Cache-Control');
				expect(setHeaderSpyCall.args[1]).to.equal(`public, max-age=${defaultPermittedAge}`);
				expect(req.vapicResult).to.equal(`value for 0.0.2`);
				done();
			}
		});

		it('should match 3rd last version when current version is exactly the same as 3rd last', (done) => {
			const redisClient = testUtil.getRedisClient();
			const vapicCustomOptions= {
				redisClient,
				cacheVersion: '0.0.2',
				versionMatchType: 'latestUpToCurrent',
			};
			let middleware = vapic.expressMiddleware(vapicCustomOptions);
			const req = {
				originalUrl: '/vapic/mocha/tests/expressMiddleware/doesNotHaveCurrentVersion',
			};
			const res = {
				setHeader: sinon.spy(),
			};
			middleware(req, res, next);
			function next() {
				const defaultPermittedAge = 60;
				expect(req.vapicError).to.not.exist()
				expect(res.setHeader.callCount).to.equal(1);
				const setHeaderSpyCall = res.setHeader.getCall(0);
				expect(setHeaderSpyCall.args[0]).to.equal('Cache-Control');
				expect(setHeaderSpyCall.args[1]).to.equal(`public, max-age=${defaultPermittedAge}`);
				expect(req.vapicResult).to.equal(`value for 0.0.2`);
				done();
			}
		});

		it('should fail when current version is before any known version', (done) => {
			const redisClient = testUtil.getRedisClient();
			const vapicCustomOptions= {
				redisClient,
				cacheVersion: '0.0.1',
				versionMatchType: 'latestUpToCurrent',
			};
			let middleware = vapic.expressMiddleware(vapicCustomOptions);
			const req = {
				originalUrl: '/vapic/mocha/tests/expressMiddleware/doesNotHaveCurrentVersion',
			};
			const res = {
				setHeader: sinon.spy(),
			};
			middleware(req, res, next);
			function next() {
				expect(req.vapicResult).to.not.exist()
				expect(res.setHeader.callCount).to.equal(0);
				expect(req.vapicError).to.be.an('object');
				expect(req.vapicError.cacheKey).to.equal(`vapic:/${req.originalUrl}`);
				expect(req.vapicError.cacheVersion).to.equal(vapicCustomOptions.cacheVersion);
				expect(req.vapicError.availableVersions).to.deep.equal(['0.0.2', '0.0.4', '0.0.6']);
				done();
			}
		});

	});

});

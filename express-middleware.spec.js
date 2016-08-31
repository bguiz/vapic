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
			versions: ['0.0.0', '0.0.2', packageJson.version],
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
				expect(req.vapicError).to.not.exist();
				expect(req.vapicResult).to.equal(`{"version":"${packageJson.version}"}`);
				const defaultPermittedAge = 60;
				expect(res.setHeader.callCount).to.equal(2);
				expect(res.setHeader.getCall(0).args).to.deep.equal(
					['Cache-Control', `public, max-age=${defaultPermittedAge}`]);
				expect(res.setHeader.getCall(1).args).to.deep.equal(
					['vapic', vapic.util.objectToBase64Json({version:packageJson.version})]);
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
				permittedAge: 120,
				cacheVersion: '99.99.99',
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
				expect(req.vapicError).to.not.exist();
				expect(req.vapicResult).to.equal(`{"version":"${vapicCustomOptions.cacheVersion}"}`);
				expect(fakeLogger.error.callCount).to.equal(0);
				const defaultPermittedAge = 60;
				expect(res.setHeader.callCount).to.equal(2);
				expect(res.setHeader.getCall(0).args).to.deep.equal(
					['Cache-Control', `public, max-age=${vapicCustomOptions.permittedAge}`]);
				expect(res.setHeader.getCall(1).args).to.deep.equal(
					['vapic', vapic.util.objectToBase64Json({version:vapicCustomOptions.cacheVersion})]);
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
				expect(req.vapicResult).to.not.exist();
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
				expect(req.vapicResult).to.not.exist();
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
				expect(req.vapicError).to.not.exist();
				expect(req.vapicResult).to.equal('{"version":"0.0.6"}');
				const defaultPermittedAge = 60;
				expect(res.setHeader.callCount).to.equal(2);
				expect(res.setHeader.getCall(0).args).to.deep.equal(
					['Cache-Control', `public, max-age=${defaultPermittedAge}`]);
				expect(res.setHeader.getCall(1).args).to.deep.equal(
					['vapic', vapic.util.objectToBase64Json({version:'0.0.6'})]);
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
				expect(req.vapicError).to.not.exist();
				expect(req.vapicResult).to.equal('{"version":"0.0.4"}');
				const defaultPermittedAge = 60;
				expect(res.setHeader.callCount).to.equal(2);
				expect(res.setHeader.getCall(0).args).to.deep.equal(
					['Cache-Control', `public, max-age=${defaultPermittedAge}`]);
				expect(res.setHeader.getCall(1).args).to.deep.equal(
					['vapic', vapic.util.objectToBase64Json({version:'0.0.4'})]);
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
				expect(req.vapicError).to.not.exist();
				expect(req.vapicResult).to.equal('{"version":"0.0.4"}');
				const defaultPermittedAge = 60;
				expect(res.setHeader.callCount).to.equal(2);
				expect(res.setHeader.getCall(0).args).to.deep.equal(
					['Cache-Control', `public, max-age=${defaultPermittedAge}`]);
				expect(res.setHeader.getCall(1).args).to.deep.equal(
					['vapic', vapic.util.objectToBase64Json({version:'0.0.4'})]);
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
				expect(req.vapicError).to.not.exist();
				expect(req.vapicResult).to.equal('{"version":"0.0.2"}');
				expect(res.setHeader.callCount).to.equal(2);
				const setHeaderSpyCall = res.setHeader.getCall(0);
				expect(setHeaderSpyCall.args[0]).to.equal(
					'Cache-Control');
				expect(setHeaderSpyCall.args[1]).to.equal(
					`public, max-age=${defaultPermittedAge}`);
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
				expect(req.vapicError).to.not.exist();
				expect(req.vapicResult).to.equal('{"version":"0.0.2"}');
				const defaultPermittedAge = 60;
				expect(res.setHeader.callCount).to.equal(2);
				expect(res.setHeader.getCall(0).args).to.deep.equal(
					['Cache-Control', `public, max-age=${defaultPermittedAge}`]);
				expect(res.setHeader.getCall(1).args).to.deep.equal(
					['vapic', vapic.util.objectToBase64Json({version:'0.0.2'})]);
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

	describe('[Vapic HTTP request header specified version]', () => {

		function getStubbedReq(value) {
			const req = {
				originalUrl: '/vapic/mocha/tests/expressMiddleware/hasCurrentVersion',
				get: () => {},
			};
			sinon.stub(req, 'get', (key) => {
				switch (key.toLowerCase()) {
					case 'vapic':
						return value;
					default:
						return undefined;
				}
			});
			return req;
		}

		it('should passthrough and get default version with invalid header value', (done) => {
			const redisClient = testUtil.getRedisClient();
			const middleware = vapic.expressMiddleware({
				versionMatchType: 'latestUpToCurrent',
				readVersionFromHeader: true,
				redisClient,
			});
			const invalidBase64JsonString = 'foobar';
			const req = getStubbedReq(invalidBase64JsonString);
			const res = {
				setHeader: sinon.spy(),
			};
			middleware(req, res, next);
			function next() {
				const defaultPermittedAge = 60;
				expect(req.vapicError).to.not.exist();
				expect(req.vapicResult).to.be.a('string');
				expect(req.vapicResult).to.deep.equal(`{"version":"${packageJson.version}"}`);
				expect(res.setHeader.callCount).to.equal(3);
				expect(res.setHeader.getCall(0).args).to.deep.equal(
					['vapic-warning', `Unable to parse: ${invalidBase64JsonString}`]);
				expect(res.setHeader.getCall(1).args).to.deep.equal(
					['Cache-Control', `public, max-age=${defaultPermittedAge}`]);
				expect(res.setHeader.getCall(2).args).to.deep.equal(
					['vapic', vapic.util.objectToBase64Json({version:packageJson.version})]);
				done();
			}
		});

		it('should request an earlier version', (done) => {
			const redisClient = testUtil.getRedisClient();
			const middleware = vapic.expressMiddleware({
				versionMatchType: 'latestUpToCurrent',
				readVersionFromHeader: true,
				redisClient,
			});
			const req = getStubbedReq(vapic.util.objectToBase64Json({
				version: '0.0.1',
			}));
			const res = {
				setHeader: sinon.spy(),
			};
			middleware(req, res, next);
			function next() {
				const defaultPermittedAge = 60;
				expect(req.vapicError).to.not.exist();
				expect(req.vapicResult).to.be.a('string');
				expect(req.vapicResult).to.deep.equal('{"version":"0.0.0"}');
				expect(res.setHeader.callCount).to.equal(2);
				expect(res.setHeader.getCall(0).args).to.deep.equal(
					['Cache-Control', `public, max-age=${defaultPermittedAge}`]);
				expect(res.setHeader.getCall(1).args).to.deep.equal(
					['vapic', vapic.util.objectToBase64Json({version:'0.0.0'})]);
				done();
			}
		});

	});

});

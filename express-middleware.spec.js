'use strict';

const chai = require('chai');
const sinon = require('sinon');
const righto = require('righto');
const redis = require('redis');

const vapic = require('./vapic.js');
const packageJson = require('./package.json');

const expect = chai.expect;
let redisClient;

describe('[Express Middleware]', () => {
	const keys = [
		{
			id: 'vapic://vapic/mocha/tests/hasCurrentVersion',
			versions: ['0.0.0', '0.0.1', packageJson.version],
		},
		{
			id: 'vapic://vapic/mocha/tests/doesNotHaveCurrentVersion',
			versions: ['0.0.0', '0.0.1', '0.0.2'],
		},
		{
			id: 'custom-prefix://vapic/mocha/tests/overrideDefaults',
			versions: ['0.0.0', '0.0.1', '99.99.99'],
		},
	];

	function waitForRedis (done) {
		console.log('waitForRedis...');
		redisClient = redis.createClient();
		redisClient
			.on('error', () => {
				done('Redis connection error');
			})
			.on('ready', () => {
				console.log('Redis client is ready');
				done();
			});
	}

	function clearKeys (done) {
		console.log('clearKeys...');
		righto.iterate(function* (reject) {
			let err, result;

			let key;

			for (let keyIdx = 0; keyIdx < keys.length; ++keyIdx) {
				key = keys[keyIdx];
				//TODO find if there is a way to do this without `.bind()`
				[err, result] = yield righto.surely(redisClient.del.bind(redisClient), key.id);
				if (err) { reject(err); return; }
			}
		})(done);
	}

	function setUpKeys (done) {
		console.log('setUpKeys...');
		righto.iterate(function* (reject) {
			let err, result;

			let key;
			let version;

			for (let keyIdx = 0; keyIdx < keys.length; ++keyIdx) {
				key = keys[keyIdx];
				for (let versionIdx = 0; versionIdx < key.versions.length; ++ versionIdx) {
					version = key.versions[versionIdx];
					[err, result] = yield righto.surely(redisClient.hset.bind(redisClient), key.id, version, `value for ${version}`);
					if (err) { reject(err); return; }
				}
			}

		})(done);
	}

	before(waitForRedis);
	before(clearKeys);
	before(setUpKeys);

	after(clearKeys);

	it('should return a function', () => {
		let middleware = vapic.expressMiddleware({
			redisClient,
		});
		expect(middleware).to.be.a('function');
		expect(middleware.length).to.equal(3); // req, res, next
	});

	it('should obtain the appropriate value when URL + version are set', (done) => {
		let middleware = vapic.expressMiddleware({
			redisClient,
		});
		const req = {
			originalUrl: '/vapic/mocha/tests/hasCurrentVersion',
		};
		const res = {
			setHeader: sinon.spy(),
		};
		middleware(req, res, next);
		function next() {
			expect(req.vapicError).to.be.undefined;
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
			originalUrl: '/vapic/mocha/tests/overrideDefaults',
		};
		const res = {
			setHeader: sinon.spy(),
		};
		middleware(req, res, next);
		function next() {
			expect(req.vapicError).to.be.undefined;
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
		let middleware = vapic.expressMiddleware({
			redisClient,
		});
		const req = {
			originalUrl: '/vapic/mocha/tests/doesNotHaveCurrentVersion',
		};
		const res = {
			setHeader: sinon.spy(),
		};
		middleware(req, res, next);
		function next() {
			expect(req.vapicResult).to.be.undefined;
			expect(res.setHeader.callCount).to.equal(0);
			expect(req.vapicError).to.be.an('object');
			expect(req.vapicError.cacheKey).to.equal(`vapic:/${req.originalUrl}`);
			expect(req.vapicError.cacheVersion).to.equal(packageJson.version);
			done();
		}
	});

	it('should error when version is set but URL is not', (done) => {
		let middleware = vapic.expressMiddleware({
			redisClient,
		});
		const req = {
			originalUrl: '/vapic/mocha/tests/doesNotExist',
		};
		const res = {
			setHeader: sinon.spy(),
		};
		middleware(req, res, next);
		function next() {
			expect(req.vapicResult).to.be.undefined;
			expect(res.setHeader.callCount).to.equal(0);
			expect(req.vapicError).to.be.an('object');
			expect(req.vapicError.cacheKey).to.equal(`vapic:/${req.originalUrl}`);
			expect(req.vapicError.cacheVersion).to.equal(packageJson.version);
			done();
		}
	});
});

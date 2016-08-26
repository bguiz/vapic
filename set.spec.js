'use strict';

const chai = require('chai');
const sinon = require('sinon');
const righto = require('righto');

const vapic = require('./vapic.js');
const testUtil = require('./vapic.testutil.js');
const packageJson = require('./package.json');

const expect = chai.expect;

describe('[Set]', () => {
	const keys = [
		{
			id: 'vapic://vapic/mocha/tests/set/hasCurrentVersion',
			versions: ['0.0.0', '0.0.1', packageJson.version],
		},
		{
			id: 'vapic://vapic/mocha/tests/set/doesNotHaveCurrentVersion',
			versions: ['0.0.2', '0.0.4', '0.0.6'],
		},
	];

	before(testUtil.waitForRedis);
	before(testUtil.clearKeys(keys));
	before(testUtil.setUpKeys(keys));

	after(testUtil.clearKeys(keys));
	after(testUtil.clearKeys([
		{
			id: '/vapic/mocha/tests/set/newUrl',
		},
	]));

	describe('[Set Only]', () => {

		it('should set a value in a new URL, and new version', (done) => {
			const redisClient = testUtil.getRedisClient();
			const vapicOptions = {
				url: '/vapic/mocha/tests/set/newUrl',
				value: 'content for new url new version',
				cacheVersion: '0.0.1',
				redisClient,
			};
			vapic.set(vapicOptions, (err, result) => {
				expect(err).to.not.exist();
				expect(vapicOptions.cacheKey).to.equal(`vapic:/${vapicOptions.url}`);
				console.log('get  Cache', vapicOptions.cacheKey, vapicOptions.cacheVersion);
				redisClient.hget(vapicOptions.cacheKey, vapicOptions.cacheVersion, (err2, result2) => {
					expect(err2).to.not.exist();
					expect(result2).to.equal(vapicOptions.value);
					done();
				});
			});
		});

		it('should set a value in an existing URL, and new version', (done) => {
			const redisClient = testUtil.getRedisClient();
			const vapicOptions = {
				url: '/vapic/mocha/tests/set/hasCurrentVersion',
				value: 'content for existing url new version',
				cacheVersion: '0.0.3',
				redisClient,
			};
			vapic.set(vapicOptions, (err, result) => {
				expect(err).to.not.exist();
				expect(vapicOptions.cacheKey).to.equal(`vapic:/${vapicOptions.url}`);
				console.log('get  Cache', vapicOptions.cacheKey, vapicOptions.cacheVersion);
				redisClient.hget(vapicOptions.cacheKey, vapicOptions.cacheVersion, (err2, result2) => {
					expect(err2).to.not.exist();
					expect(result2).to.equal(vapicOptions.value);
					done();
				});
			});
		});

		it('should set a value in an existing URL, and existing version', (done) => {
			const redisClient = testUtil.getRedisClient();
			const vapicOptions = {
				url: '/vapic/mocha/tests/set/hasCurrentVersion',
				value: 'content for existing url existing version',
				cacheVersion: '0.0.1',
				redisClient,
			};
			vapic.set(vapicOptions, (err, result) => {
				expect(err).to.not.exist();
				expect(vapicOptions.cacheKey).to.equal(`vapic:/${vapicOptions.url}`);
				console.log('get  Cache', vapicOptions.cacheKey, vapicOptions.cacheVersion);
				redisClient.hget(vapicOptions.cacheKey, vapicOptions.cacheVersion, (err2, result2) => {
					expect(err2).to.not.exist();
					expect(result2).to.equal(vapicOptions.value);
					done();
				});
			});
		});

	});

	describe('[Set and cull old versions]', () => {

		it('should set oldest version and get culled immediately', (done) => {
			const redisClient = testUtil.getRedisClient();
			const vapicOptions = {
				url: '/vapic/mocha/tests/set/doesNotHaveCurrentVersion',
				value: 'content for existing url new version',
				cacheVersion: '0.0.1',
				maxVersions: 3,
				redisClient,
			};
			vapic.set(vapicOptions, (err, result) => {
				expect(err).to.not.exist();
				expect(result).to.deep.equal({
					versions: ['0.0.1', '0.0.2', '0.0.4', '0.0.6'],
					versionsToRemove: ['0.0.1'],
					removedCount: 1,
				});
				expect(vapicOptions.cacheKey).to.equal(`vapic:/${vapicOptions.url}`);
				console.log('get  Cache', vapicOptions.cacheKey, vapicOptions.cacheVersion);
				redisClient.hkeys(vapicOptions.cacheKey, (err2, result2) => {
					expect(err2).to.not.exist();
					expect(result2).to.deep.equal(['0.0.2', '0.0.4', '0.0.6']);
					done();
				});
			});
		});

		it('should replace an existing version and nothing gets culled', (done) => {
			const redisClient = testUtil.getRedisClient();
			const vapicOptions = {
				url: '/vapic/mocha/tests/set/doesNotHaveCurrentVersion',
				value: 'content for existing url new version',
				cacheVersion: '0.0.4',
				maxVersions: 3,
				redisClient,
			};
			vapic.set(vapicOptions, (err, result) => {
				expect(err).to.not.exist();
				expect(result).to.deep.equal({
					versions: ['0.0.2', '0.0.4', '0.0.6'],
					// versionsToRemove: [],
					// removedCount: 0,
				});
				expect(vapicOptions.cacheKey).to.equal(`vapic:/${vapicOptions.url}`);
				console.log('get  Cache', vapicOptions.cacheKey, vapicOptions.cacheVersion);
				redisClient.hkeys(vapicOptions.cacheKey, (err2, result2) => {
					expect(err2).to.not.exist();
					expect(result2).to.deep.equal(['0.0.2', '0.0.4', '0.0.6']);
					done();
				});
			});
		});

		it('should set newest version and oldest one gets culled', (done) => {
			const redisClient = testUtil.getRedisClient();
			const vapicOptions = {
				url: '/vapic/mocha/tests/set/doesNotHaveCurrentVersion',
				value: 'content for existing url new version',
				cacheVersion: '0.0.7',
				maxVersions: 3,
				redisClient,
			};
			vapic.set(vapicOptions, (err, result) => {
				expect(err).to.not.exist();
				expect(result).to.deep.equal({
					versions: ['0.0.2', '0.0.4', '0.0.6', '0.0.7'],
					versionsToRemove: ['0.0.2'],
					removedCount: 1,
				});
				expect(vapicOptions.cacheKey).to.equal(`vapic:/${vapicOptions.url}`);
				console.log('get  Cache', vapicOptions.cacheKey, vapicOptions.cacheVersion);
				redisClient.hkeys(vapicOptions.cacheKey, (err2, result2) => {
					expect(err2).to.not.exist();
					expect(result2).to.deep.equal(['0.0.4', '0.0.6', '0.0.7']);
					done();
				});
			});
		});

		it('should set newest version and oldest two gets culled', (done) => {
			const redisClient = testUtil.getRedisClient();
			const vapicOptions = {
				url: '/vapic/mocha/tests/set/doesNotHaveCurrentVersion',
				value: 'content for existing url new version',
				cacheVersion: '0.0.8',
				maxVersions: 2,
				redisClient,
			};
			vapic.set(vapicOptions, (err, result) => {
				expect(err).to.not.exist();
				expect(result).to.deep.equal({
					versions: ['0.0.4', '0.0.6', '0.0.7', '0.0.8'],
					versionsToRemove: ['0.0.4', '0.0.6'],
					removedCount: 2,
				});
				expect(vapicOptions.cacheKey).to.equal(`vapic:/${vapicOptions.url}`);
				console.log('get  Cache', vapicOptions.cacheKey, vapicOptions.cacheVersion);
				redisClient.hkeys(vapicOptions.cacheKey, (err2, result2) => {
					expect(err2).to.not.exist();
					expect(result2).to.deep.equal(['0.0.7', '0.0.8']);
					done();
				});
			});
		});

	});


});

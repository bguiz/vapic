'use strict';

const redis = require('redis');
const righto = require('righto');

const chai = require('chai');
const dirtyChai = require('dirty-chai');

//NOTE we use dirty-chai because chai itself trips up eslint's no-unused-expressions rule
chai.use(dirtyChai);

let redisConnectionSuccess;
let redisClient;

module.exports = {
	getRedisClient,
	waitForRedis,
	clearKeys,
	setUpKeys,
};

function getRedisClient () {
	return redisClient
}

function waitForRedis (done) {
	if (redisConnectionSuccess === true) {
		done();
	} else if (redisConnectionSuccess === false) {
		done('Redis connection error');
	} else {
		initRedisClient(done);
	}
}

function initRedisClient(done) {
	redisClient = redis.createClient();
	redisClient
		.on('error', () => {
			redisConnectionSuccess = false;
			done('Redis connection error');
		})
		.on('ready', () => {
			redisConnectionSuccess = true;
			console.log('Redis client is ready');
			done();
		});
}

function clearKeys(keys) {
	return function clearKeysImpl (done) {
		console.log('clearKeys...');
		righto.iterate(function* (reject) {
			let err, result;
			let key;
			for (let keyIdx = 0; keyIdx < keys.length; ++keyIdx) {
				key = keys[keyIdx];
				[err, result] = yield righto.surely(redisClient.del.bind(redisClient), key.id);
				if (err) { reject(err); return; }
			}
		})(done);
	}
}

function setUpKeys (keys) {
	return function setUpKeys (done) {
		console.log('setUpKeys...');
		righto.iterate(function* (reject) {
			let err, result;
			let key, version;
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
}

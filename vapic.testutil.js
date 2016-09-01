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
	return redisClient;
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

function clearKeys(keys, redisClient) {
	return function clearKeysImpl (done) {
		if (!redisClient) {
			redisClient = getRedisClient();
		}
		righto.iterate(function* (reject) {
			let errResult, err, result;
			let key;
			for (let keyIdx = 0; keyIdx < keys.length; ++keyIdx) {
				key = keys[keyIdx];
				errResult = yield righto.surely(redisClient.del.bind(redisClient), key.id);
				err = errResult[0]; result = errResult[1];
				if (err) { reject(err); return; }
			}
		})(done);
	}
}

function setUpKeys (keys, redisClient) {
	return function setUpKeys (done) {
		if (!redisClient) {
			redisClient = getRedisClient();
		}
		righto.iterate(function* (reject) {
			let errResult, err, result;
			let key, version;
			for (let keyIdx = 0; keyIdx < keys.length; ++keyIdx) {
				key = keys[keyIdx];
				for (let versionIdx = 0; versionIdx < key.versions.length; ++ versionIdx) {
					version = key.versions[versionIdx];
					errResult = yield righto.surely(redisClient.hset.bind(redisClient), key.id, version, JSON.stringify({version}));
					err = errResult[0]; result = errResult[1];
					if (err) { reject(err); return; }
				}
			}
		})(done);
	}
}

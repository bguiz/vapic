'use strict';

module.exports = {
	get: getFromCache,
	set: setInCache,
	cullOld: cullOldVersionsFromCache,
	expressMiddleware,
};

// Get version from 3 different possible places, falling back from each one to the next:
// 1. `npm run` inserted environment variable
// 2. `package.json` in the current working directory
// 3. This module's own `package.json`
let packageJsonVersion = process.env.npm_package_version;
if (!packageJsonVersion) {
	let packageJson;
	try {
		const path = require('path');
	  packageJson = require(path.resolve(process.cwd(), './package.json'));
	} catch (err) {
		packageJson = require('./package.json');
	}
	packageJsonVersion = packageJson.version;
}

const defaults = {
	prefix: 'vapic:/',
	cacheVersion: packageJsonVersion,
	permittedAge: 60, // One minute
	logger: console,
	redisClient: null,
};

function setInCache (options, errback) {
	defaultsForOptions(options);
	//TODO move away from url and toward cacheKey instead
	if (!options.url) {
		errback('url unspecified');
		return;
	}
	if (!options.value) {
		errback('value unspecified');
		return;
	}
	const hsetCallback = (options.maxVersions) ? ontoCull : errback;
	options.redisClient.hset(`${options.prefix}${options.url}`, options.cacheVersion, options.value, hsetCallback);

	function ontoCull(err, result) {
		if (err) {
			errback(err);
			return;
		}
		cullOldVersionsFromCache(options, errback);
	}
}

function cullOldVersionsFromCache (options, errback) {
	console.log('cullOldVersionsFomCache');
	defaultsForOptions(options);
	if (!options.url) {
		errback('url unspecified');
		return;
	}
	const maxVersions = options.maxVersions;
	if (typeof maxVersions !== 'number' || maxVersions < 1) {
		errback('invalid maxVersions');
		return;
	}

	const cacheKey = `${options.prefix}${options.url}`;

	options.redisClient.hkeys(cacheKey, (err, versions) => {
		if (err) {
			errback(err);
			return;
		}
		if (versions.length > maxVersions) {
			const semver = require('semver');
			versions = versions.sort(semver.compare);
			const versionsToRemove = versions.slice(0, versions.length - maxVersions);

			options.redisClient.hdel(cacheKey, versionsToRemove, (err, removedCount) => {
				errback(undefined, {
					versions,
					versionsToRemove: versionsToRemove,
					removedCount,
				});
			});
		}
		else {
			errback(undefined, {
				versions,
			});
		}
	});
}

function getFromCache (options, errback) {
	defaultsForOptions(options);
	if (!options.cacheKey) {
		errback('cacheKey unspecified');
		return;
	}
	const cacheKey = options.cacheKey || `${options.prefix}${options.url}`;
	options.redisClient.hget(cacheKey, options.cacheVersion, (err, result) => {
		if (err || !result) {
			let errToReturn = {
				cacheKey,
				cacheVersion: options.cacheVersion,
				err,
				result,
			};
			options.logger.error('Cache miss on redis', errToReturn);
			errback(errToReturn);
			return;
		} else {
			errback(undefined, result);
			return;
		}
	});
}

function expressMiddleware (options) {
	defaultsForOptions(options);

	return vapicExpressMiddleware;

	function vapicExpressMiddleware (req, res, next) {
		options.cacheKey = options.cacheKey || `${options.prefix}${options.url || req.originalUrl}`;
		getFromCache(options, (err, result) => {
			if (err) {
				req.vapicError = err;
				next();
				return;
			} else {
				req.vapicResult = result;
				res.setHeader('Cache-Control', `public, max-age=${options.permittedAge}`);
				next();
				return;
			}
		});
	}
}

function defaultsForOptions(options) {
	Object.keys(defaults)
		.forEach((optionKey) => {
			options[optionKey] = (typeof options[optionKey] !== 'undefined') ?
				options[optionKey] : defaults[optionKey];
		});
	if (!options.redisClient) {
		defaults.redisClient = defaults.redisClient ||
			require('redis').createClient();
		options.redisClient = defaults.redisClient;
	}
}

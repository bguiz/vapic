'use strict';

module.exports = {
	set: setVersionInCache,
	cullOld: cullOldVersionsFromCache,
	expressMiddleware,
};

let packageJsonVersion = process.env.npm_package_version;
if (!packageJsonVersion) {
	let packageJson;
	const path = require('path');
	try {
	  packageJson = require(path.resolve(process.cwd(), './package.json'));
	} catch (err) {
		packageJson = require('package.json').version;
	}
	packageJsonVersion = packageJson.version;
}

const defaults = {
	prefix: 'vapic:/',
	//TODO find a way to read this from package.json
	cacheVersion: packageJsonVersion,
	permittedAge: 60, // One minute
	logger: console,
	redisClient: null,
};

function setVersionInCache (options, errback) {
	defaultsForOptions(options);
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

	const vapicKey = `${options.prefix}${options.url}`;

	options.redisClient.hkeys(vapicKey, (err, versions) => {
		if (err) {
			errback(err);
			return;
		}
		if (versions.length > maxVersions) {
			const semver = require('semver');
			versions = versions.sort(semver.compare);
			const versionsToRemove = versions.slice(0, versions.length - maxVersions);

			options.redisClient.hdel(vapicKey, versionsToRemove, (err, removedCount) => {
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

function expressMiddleware (options) {
	defaultsForOptions(options);

	return vapicExpressMiddlware;

	function vapicExpressMiddlware (req, res, next) {
		const cacheVersion = options.cacheVersion;
		const cacheKey = `${options.prefix}${options.url || req.originalUrl}`;
		options.redisClient.hget(cacheKey, cacheVersion, (err, result) => {
			if (err || !result) {
				options.logger.error('Cache miss on redis', { cacheKey, cacheVersion, err, result });
				req.vapicError = {
					cacheKey,
					cacheVersion,
					err,
					result,
				};
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

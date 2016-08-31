'use strict';

const vapicUtil = require('./util.js');

module.exports = {
	get: getFromCache,
	set: setInCache,
	cullOld: cullOldVersionsFromCache,
	expressMiddleware,
	util: vapicUtil,
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
	versionMatchType: 'exact',
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
	options.cacheKey = options.cacheKey || `${options.prefix}${options.url}`;
	switch(options.versionMatchType) {
		case 'exact':
			setExactVersionInCache(options, errback);
			return;
		case 'skipWhenSameAsLatest':
			setSkipWhenSameAsLatestInCache(options, errback);
			return;
		default:
			errback(`Unrecognised version match type: ${options.versionMatchType}`);
			return;
	}
}

function setExactVersionInCache (options, errback) {
	const hsetCallback = (options.maxVersions) ? ontoCull : errback;
	options.redisClient.hset(options.cacheKey, options.cacheVersion, options.value, hsetCallback);

	function ontoCull(err, result) {
		if (err) {
			errback(err);
			return;
		}
		cullOldVersionsFromCache(options, errback);
	}
}

function setSkipWhenSameAsLatestInCache(options, errback) {
	getSortedVersionsFromCache(options, (err, versions) => {
		if (err) {
			errback(err);
			return;
		}
		if (versions.length < 1) {
			setExactVersionInCache(options, errback);
			return;
		}
		const latestCachedVersion = versions[versions.length - 1];
		getFromCache({
			versionMatchType: 'exact',
			redisClient: options.redisClient,
			cacheKey: options.cacheKey,
			cacheVersion: latestCachedVersion,
		}, (err, value) => {
			if (err) {
				errback(err);
				return;
			}
			if (value !== options.value) {
				setExactVersionInCache(options, errback);
				return;
			} else {
				errback(undefined, {
					versions,
					latestCachedVersion,
					equivalentVersion: options.cacheVersion,
				});
				return;
			}
		});
	});
}

function cullOldVersionsFromCache (options, errback) {
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
	switch (options.versionMatchType) {
		case 'exact':
			getExactVersionFromCache(options, errback);
			return;
		case 'latestUpToCurrent':
			getLatestUpToCurrentVersionFromCache(options, errback);
			return;
		default:
			errback(`Unrecognised version match type: ${options.versionMatchType}`);
		return;
	}
}

function getExactVersionFromCache (options, errback) {
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

function getSortedVersionsFromCache(options, errback) {
	options.redisClient.hkeys(options.cacheKey, (err, versions) => {
		if (err) {
			errback(err);
			return;
		}
		const semver = require('semver');
		versions = versions.sort(semver.compare);
		errback(undefined, versions);
		return;
	});
}

function getLatestUpToCurrentVersionFromCache(options, errback) {
	defaultsForOptions(options);
	options.cacheKey = options.cacheKey || `${options.prefix}${options.url}`;
	getSortedVersionsFromCache(options, (err, versions) => {
		if (err) {
			errback(err);
			return;
		}
		const semver = require('semver');
		let versionIdx, version, selectedVersion;
		for (versionIdx = 0; versionIdx < versions.length; ++versionIdx) {
			version = versions[versionIdx];
			if (semver.lte(version, options.cacheVersion)) {
				selectedVersion = version;
			}
		}
		if (!selectedVersion) {
			let errToReturn = {
				cacheKey: options.cacheKey,
				cacheVersion: options.cacheVersion,
				availableVersions: versions,
			};
			errback(errToReturn);
			return;
		}
		options.cacheVersion = selectedVersion;
		getExactVersionFromCache(options, errback);
	});
}

function expressMiddleware (options) {
	defaultsForOptions(options);

	return vapicExpressMiddleware;

	function vapicExpressMiddleware (req, res, next) {
		options.cacheKey = `${options.prefix}${options.url || req.originalUrl}`;
		options.cacheVersion = defaults.cacheVersion;
		if (options.readVersionFromHeader) {
			const vapicHeader = req.get('vapic');
			let vapicOptionsFromHeader;
			if (typeof vapicHeader === 'string' && vapicHeader.length > 0) {
				try {
					vapicOptionsFromHeader = vapicUtil.base64JsonToObject(vapicHeader);
				} catch (ex) {
					options.logger.error('failed to parse header vapic options', vapicHeader);
					res.setHeader('vapic-warning', `Unable to parse: ${vapicHeader}`);
				}
			}
			options.cacheVersion = (vapicOptionsFromHeader && vapicOptionsFromHeader.version) || options.cacheVersion;
			res.setHeader('vapic', vapicUtil.objectToBase64Json({
				version: options.cacheVersion,
			}));
		}

		getFromCache(options, (err, result) => {
			if (err) {
				req.vapicError = err;
				next();
				return;
			} else {
				req.vapicResult = result;
				res.setHeader('Cache-Control', `public, max-age=${options.permittedAge}`);
				res.setHeader('vapic', vapicUtil.objectToBase64Json({
					version: options.cacheVersion,
				}));
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

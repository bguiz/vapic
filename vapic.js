'use strict';

module.exports = {
	expressMiddleware,
};

const defaults = {
	prefix: 'vapic:/',
	//TODO find a way to read this from package.json
	cacheVersion: process.env.npm_package_version,
	permittedAge: 60, // One minute
	logger: console,
	redisClient: null,
};

function expressMiddleware (options) {
	Object.keys(defaults)
		.forEach((optionKey) => {
			options[optionKey] = (typeof options[optionKey] !== 'undefined') ? options[optionKey] : defaults[optionKey];
		});
	if (!options.redisClient) {
		defaults.redisClient = defaults.redisClient || require('redis').createClient();
		options.redisClient = defaults.redisClient;
	}

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

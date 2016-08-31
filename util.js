'use strict';

module.exports = {
	base64JsonToObject,
	objectToBase64Json,
};

function base64JsonToObject(str) {
	return JSON.parse(new Buffer(str, 'base64').toString('utf8'));
}

function objectToBase64Json(obj) {
	return (new Buffer(JSON.stringify(obj))).toString('base64');
}

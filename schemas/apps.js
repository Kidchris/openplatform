NEWSCHEMA('Meta', function(schema) {
	schema.define('url', 'Url', true);
	schema.addWorkflow('exec', function($) {
		RESTBuilder.make(function(builder) {
			builder.url($.model.url);
			builder.exec(function(err, response) {
				err && $.error.push(err);
				$.success(true, response);
			});
		});
	});
});

NEWSCHEMA('App', function(schema) {

	schema.define('id', 'UID');
	schema.define('url', 'Url', true);
	schema.define('title', 'String(30)', true);
	schema.define('settings', String);
	schema.define('accesstoken', 'String(50)');
	schema.define('allownotifications', Boolean);
	schema.define('allowreadusers', Number);        // 0: disabled, 1: basic info (name, photo, online), 2: all info (contact), 3: basic info only users which have this app, 4: all info only users which have this app
	schema.define('allowreadapps', Number);         // 0: disabled, 1: basic info, 2: all info
	schema.define('allowreadprofile', Number);      // 0: disabled, 1: basic info, 2: all info
	schema.define('allowreadmeta', Boolean);
	schema.define('serververify', Boolean);         // Enables server-side verification only
	schema.define('responsive', Boolean);
	schema.define('blocked', Boolean);

	schema.setQuery(function($) {
		OP.decodeAuthToken($.query.accesstoken || '', function(err, obj) {

			if (!obj) {
				$.invalid('error-invalid-accesstoken');
				return;
			}

			var user = obj.user;
			var app = obj.app;
			var ip = $.ip;

			if (app.origin) {
				if (!app.origin[ip] && app.hostname !== ip) {
					$.invalid('error-invalid-origin');
					return;
				}
			} else if (app.hostname !== ip && (!$.user || $.user.id !== user.id)) {
				$.invalid('error-invalid-origin');
				return;
			} else if (user.blocked || user.inactive) {
				$.invalid('error-permissions');
				return;
			} else if (!user.apps[app.id]) {
				$.invalid('error-permissions');
				return;
			}

			OP.apps(app, $.query, $.callback);
		});
	});

	schema.setSave(function($) {

		if (!$.user.sa) {
			$.invalid('error-permissions');
			return;
		}

		var model = $.model.$clean();

		model.search = (model.name + ' ' + model.title).toSearch();
		model.linker = model.title.slug();

		if (model.id) {
			FUNC.apps.get(model.id, function(err, item) {
				if (item) {
					FUNC.logger('apps', 'update: ' + item.id + ' - ' + item.name, '@' + $.user.name, $.ip);
					model.dateupdated = NOW;
					sync(item, model, true);
					OP.refresh(item, function() {
						FUNC.apps.set(model, null, function() {
							FUNC.emit('apps.update', item.id);
							FUNC.emit('apps.refresh', item.id);
							$.success();
						});
					});
				} else
					$.invalid('error-apps-404');
			});

		} else {
			model.datecreated = NOW;
			state(model, function() {
				FUNC.apps.set(model, null, function(err, id) {
					FUNC.emit('apps.create', id);
					FUNC.emit('apps.refresh', id);
					FUNC.logger('apps', 'create: ' + id + ' - ' + model.name, '@' + $.user.name, $.ip);
					$.success();
				});
			});
		}
	});

	schema.setRemove(function($) {

		if (!$.user.sa) {
			$.invalid('error-permissions');
			return;
		}

		var id = $.id;
		FUNC.apps.rem(id, function() {
			FUNC.logger('apps', 'remove: ' + id, '@' + $.user.name, $.ip);
			FUNC.emit('apps.remove', id);
			FUNC.emit('apps.refresh', id, true);
			$.success();
		});
	});

	schema.addWorkflow('refresh', function($) {
		RESTBuilder.make(function(builder) {
			builder.url($.model.url);
			builder.exec(function(err, response) {

				if (response === EMPTYOBJECT || err) {
					$.error.push(err ? err : 'error-invalid-url');
					$.callback();
					return;
				}

				if (response.origin && response.origin.length) {
					$.model.origin = {};
					for (var i = 0; i < response.origin.length; i++)
						$.model.origin[response.origin[i]] = true;
				} else
					$.model.origin = null;

				$.model.version = response.version;
				$.model.name = response.name;
				$.model.description = response.description;
				$.model.author = response.author;
				$.model.type = response.type;
				$.model.icon = response.icon;
				$.model.frame = response.url;
				$.model.email = response.email;
				$.model.roles = response.roles;
				$.model.groups = response.groups;
				$.model.custom = response.custom;
				$.model.online = true;
				$.model.daterefreshed = NOW;
				$.success();
			});
		});
	});
});

function sync(item, model, meta) {

	if (meta) {
		item.title = model.title;
		item.options = model.options;
		item.secret = model.secret;
		item.allowreadapps = model.allowreadapps;
		item.allowreadusers = model.allowreadusers;
		item.allowreadprofile = model.allowreadprofile;
		item.allownotifications = model.allownotifications;
		item.responsive = model.responsive;
		item.blocked = model.blocked;
		item.settings = model.settings;
		item.accesstoken = model.accesstoken;
		item.serververify = model.serververify;
	}

	item.linker = model.linker;
	item.version = model.version;
	item.name = model.name;
	item.description = model.description;
	item.author = model.author;
	item.icon = model.icon;
	item.screenshots = model.allowscreenshots === true;
	item.frame = model.frame;
	item.email = model.email;
	item.roles = model.roles;
	item.groups = model.groups;
	item.version = model.version;
	item.custom = model.custom;
	item.online = model.online === true;
	item.daterefreshed = NOW;
	item.origin = model.origin;
	item.width = model.width;
	item.height = model.height;
	item.resize = model.resize;
}

ON('service', function(counter) {
	counter % 2 === 0 && $WORKFLOW('App', 'state', NOOP);
});
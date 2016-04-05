/*
 * Copyright (C) 2015  Ben Ockmore
 *               2015  Sean Burke
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with this program; if not, write to the Free Software Foundation, Inc.,
 * 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
 */

'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../../helpers/auth');

const utils = require('../../helpers/utils');

const Work = require('bookbrainz-data').Work;
const WorkHeader = require('bookbrainz-data').WorkHeader;
const WorkRevision = require('bookbrainz-data').WorkRevision;
const bookshelf = require('bookbrainz-data').bookshelf;

/* Middleware loader functions. */
const makeEntityLoader = require('../../helpers/middleware').makeEntityLoader;

const React = require('react');
const ReactDOMServer = require('react-dom/server');
const EditForm =
	React.createFactory(require('../../../client/components/forms/work.jsx'));

const loadLanguages = require('../../helpers/middleware').loadLanguages;
const loadWorkTypes = require('../../helpers/middleware').loadWorkTypes;
const loadEntityRelationships =
	require('../../helpers/middleware').loadEntityRelationships;
const loadIdentifierTypes =
	require('../../helpers/middleware').loadIdentifierTypes;

const entityRoutes = require('./entity');

/* If the route specifies a BBID, load the Work for it. */
router.param(
	'bbid',
	makeEntityLoader(
		Work,
		['workType', 'revision.data.languages'],
		'Work not found'
	)
);

function _setWorkTitle(res) {
	res.locals.title = utils.createEntityPageTitle(
		res.locals.entity,
		'Work',
		utils.template`Work “${'name'}”`
	);
}

router.get('/:bbid', loadEntityRelationships, (req, res) => {
	_setWorkTitle(res);
	entityRoutes.displayEntity(req, res);
});

router.get('/:bbid/delete', auth.isAuthenticated, (req, res) => {
	_setWorkTitle(res);
	entityRoutes.displayDeleteEntity(req, res);
});

router.post('/:bbid/delete/confirm', (req, res) =>
	entityRoutes.handleDelete(req, res, WorkHeader, WorkRevision)
);

router.get('/:bbid/revisions', (req, res) => {
	_setWorkTitle(res);
	entityRoutes.displayRevisions(req, res, WorkRevision);
});

// Creation

router.get('/create', auth.isAuthenticated, loadIdentifierTypes,
	loadLanguages, loadWorkTypes,
	(req, res) => {
		const props = {
			languages: res.locals.languages,
			workTypes: res.locals.workTypes,
			identifierTypes: res.locals.identifierTypes,
			submissionUrl: '/work/create/handler'
		};

		const markup = ReactDOMServer.renderToString(EditForm(props));

		return res.render('entity/create/work', {
			title: 'Add Work',
			heading: 'Create Work',
			subheading: 'Add a new Work to BookBrainz',
			props,
			markup
		});
	}
);

router.get('/:bbid/edit', auth.isAuthenticated, loadIdentifierTypes,
	loadWorkTypes, loadLanguages,
	(req, res) => {
		const work = res.locals.entity;

		const props = {
			languages: res.locals.languages,
			workTypes: res.locals.workTypes,
			work,
			identifierTypes: res.locals.identifierTypes,
			submissionUrl: `/work/${work.bbid}/edit/handler`
		};

		const markup = ReactDOMServer.renderToString(EditForm(props));

		return res.render('entity/create/work', {
			title: 'Edit Work',
			heading: 'Edit Work',
			subheading: 'Edit an existing Work in BookBrainz',
			props,
			markup
		});
	}
);

function handleWorkChange(req, transacting, entityModel) {
	const revisionPromise = entityModel.related('revision')
		.fetch({withRelated: ['data.languages'], transacting});

	// Doing this with knex because bookshelf failed to set data_id.
	// Tried attach(), with ids and then with models, and also add()
	const workLanguagesPromise = revisionPromise.then((revision) =>
		bookshelf.knex('bookbrainz.work_data__language')
			.transacting(transacting)
			.insert(
				req.body.languages.map((id) => ({
					data_id: revision.related('data').get('id'),
					language_id: id
				}))
			)
	);

	return workLanguagesPromise;
}

router.post('/create/handler', auth.isAuthenticated, (req, res) =>
	entityRoutes.createEntity(
			req, res, Work, {typeId: req.body.typeId}, handleWorkChange
	)
);

router.post('/:bbid/edit/handler', auth.isAuthenticated, (req, res) =>
	entityRoutes.editEntity(
		req, res, Work, {typeId: req.body.typeId}, handleWorkChange
	)
);

module.exports = router;

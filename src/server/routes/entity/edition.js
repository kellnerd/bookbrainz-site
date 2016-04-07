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

const Edition = require('bookbrainz-data').Edition;
const EditionHeader = require('bookbrainz-data').EditionHeader;
const EditionRevision = require('bookbrainz-data').EditionRevision;
const Publication = require('bookbrainz-data').Publication;
const Publisher = require('bookbrainz-data').Publisher;

const React = require('react');
const ReactDOMServer = require('react-dom/server');
const EditForm = React.createFactory(
	require('../../../client/components/forms/edition.jsx')
);

/* Middleware loader functions. */
const makeEntityLoader = require('../../helpers/middleware').makeEntityLoader;

const loadEditionStatuses =
	require('../../helpers/middleware').loadEditionStatuses;
const loadEditionFormats =
	require('../../helpers/middleware').loadEditionFormats;
const loadLanguages =
	require('../../helpers/middleware').loadLanguages;
const loadEntityRelationships =
	require('../../helpers/middleware').loadEntityRelationships;
const loadIdentifierTypes =
	require('../../helpers/middleware').loadIdentifierTypes;

const Promise = require('bluebird');

const entityRoutes = require('./entity');
const _ = require('lodash');

/* If the route specifies a BBID, load the Edition for it. */
router.param(
	'bbid',
	makeEntityLoader(
		Edition,
		[
			'publication.defaultAlias',
			'revision.data.languages',
			'editionFormat',
			'editionStatus',
			'revision.data.releaseEvents',
			'revision.data.publishers.defaultAlias'
		],
		'Edition not found'
	)
);

function _setEditionTitle(res) {
	res.locals.title = utils.createEntityPageTitle(
		res.locals.entity,
		'Edition',
		utils.template`Edition “${'name'}”`
	);
}

router.get('/:bbid', loadEntityRelationships, (req, res) => {
	_setEditionTitle(res);
	entityRoutes.displayEntity(req, res);
});

router.get('/:bbid/revisions', (req, res) => {
	_setEditionTitle(res);
	entityRoutes.displayRevisions(req, res, EditionRevision);
});

router.get('/:bbid/delete', auth.isAuthenticated, (req, res) => {
	_setEditionTitle(res);
	entityRoutes.displayDeleteEntity(req, res);
});

router.post('/:bbid/delete/confirm', (req, res) =>
	entityRoutes.handleDelete(req, res, EditionHeader, EditionRevision)
);

// Creation

router.get('/create', auth.isAuthenticated, loadIdentifierTypes,
	loadEditionStatuses, loadEditionFormats, loadLanguages, (req, res) => {
		const propsPromise = {
			languages: res.locals.languages,
			editionStatuses: res.locals.editionStatuses,
			editionFormats: res.locals.editionFormats,
			identifierTypes: res.locals.identifierTypes,
			submissionUrl: '/edition/create/handler'
		};

		if (req.query.publication) {
			propsPromise.publication =
				Publication.forge({bbid: req.query.publication})
					.fetch({withRelated: 'defaultAlias'});
		}

		if (req.query.publisher) {
			propsPromise.publisher =
				Publisher.forge({bbid: req.query.publisher})
					.fetch({withRelated: 'defaultAlias'});
		}

		function render(props) {
			const markup = ReactDOMServer.renderToString(EditForm(props));

			res.render('entity/create/edition', {
				title: 'Add Edition',
				heading: 'Create Edition',
				subheading: 'Add a new Edition to BookBrainz',
				props,
				markup
			});
		}

		Promise.props(propsPromise).then(render);
	}
);

router.get('/:bbid/edit', auth.isAuthenticated, loadIdentifierTypes,
	loadEditionStatuses, loadEditionFormats, loadLanguages, (req, res) => {
		const edition = res.locals.entity;

		const props = {
			languages: res.locals.languages,
			editionStatuses: res.locals.editionStatuses,
			editionFormats: res.locals.editionFormats,
			identifierTypes: res.locals.identifierTypes,
			edition,
			submissionUrl: `/edition/${edition.bbid}/edit/handler`
		};

		const markup = ReactDOMServer.renderToString(EditForm(props));

		res.render('entity/create/edition', {
			title: 'Edit Edition',
			heading: 'Edit Edition',
			subheading: 'Edit an existing Edition in BookBrainz',
			props,
			markup
		});
	}
);

function handleEditionChange(req, transacting, entityModel) {
	const languageIds = req.body.languages;
	const publisher = req.body.publisherBbid;
	const releaseDate = req.body.releaseDate;

	const dataPromise = entityModel.related('revision').fetch({
		withRelated: [
			'data.languages',
			'data.releaseEvents',
			'data.publishers'
		],
		transacting
	});
	return dataPromise.then((revision) => {
		const data = revision.related('data');
		const languagesPromise = languageIds ? data.languages()
			.attach(
				_.map(languageIds, (id) => ({language_id: id})), {transacting}
			) : null;
		const publisherPromise = publisher ? data.publishers()
			.attach({publisher_bbid: publisher}, {transacting}) : null;
		const currentReleaseEvent = data.releaseEvents().at(0);
		let releaseEventPromise = null;
		if (currentReleaseEvent) {
			if (releaseDate !== currentReleaseEvent.get('date')) {
				releaseEventPromise = data.releaseEvents.create(
					{date: releaseDate}, {transacting}
				);
			}
		}

		return Promise.join(
			languagesPromise, publisherPromise, releaseEventPromise
		);
	});
}

const additionalEditionProps = [
	'publicationBbid', 'width', 'height', 'depth', 'weight', 'pages',
	'formatId', 'statusId'
];

router.post('/create/handler', auth.isAuthenticated, (req, res) =>
	entityRoutes.createEntity(
		req, res, 'Edition', _.pick(req.body, additionalEditionProps),
		handleEditionChange
	)
);

router.post('/:bbid/edit/handler', auth.isAuthenticated, (req, res) =>
	entityRoutes.editEntity(
		req, res, 'Edition', _.pick(req.body, additionalEditionProps),
		handleEditionChange
	)
);

module.exports = router;

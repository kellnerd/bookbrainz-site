import BookBrainzData from 'bookbrainz-data';
import {EventEmitter} from 'events';
import config from '../common/helpers/config';
import {kebabCase} from 'lodash';


const eventEmitter = new EventEmitter();


const orm = BookBrainzData(config.database);


async function addNotificationToDB(allSubscribersJSON, notificationRedirectLink, notificationText, editorId) {
	const {Notification} = orm;
	const notificationPromiseArray = [];
	allSubscribersJSON.forEach(async (subscriber) => {
		if (subscriber.subscriberId !== editorId) {
			let notification = await new Notification({
				notificationRedirectLink,
				subscriberId: subscriber.subscriberId
			}).fetch({require: false});
			let method = 'update';
			const isNew = !notification;
			if (isNew) {
				notification = await new Notification({
					notificationRedirectLink,
					subscriberId: subscriber.subscriberId
				});
				method = 'insert';
			}
			notification.set('read', false);
			notification.set('notification_text', notificationText);
			notification.set('timestamp', new Date());
			notificationPromiseArray.push(
				notification.save(null, {method})
			);
		}
	});
	await Promise.all(notificationPromiseArray);
}

eventEmitter.on('send-notifications-for-collection', async (collectionId, editorId, collectionName) => {
	const {CollectionSubscription, Editor} = orm;
	const allSubscribers = await new CollectionSubscription()
		.where('collection_id', collectionId)
		.fetchAll({
			required: false
		});
	if (allSubscribers.length) {
		const editor = await new Editor({id: editorId}).fetch();
		const editorJSON = editor.toJSON();
		const allSubscribersJSON = allSubscribers.toJSON();
		await addNotificationToDB(
			allSubscribersJSON,
			`/collection/${collectionId}`,
			`${editorJSON.name} edited Collection: ${collectionName}`,
			editorId
		);
	}
});

eventEmitter.on('send-notifications-for-entity', async (bbid, editorId, entityType, primaryName) => {
	const {EntitySubscription, Editor} = orm;
	const allSubscribers = await new EntitySubscription()
		.where('bbid', bbid)
		.fetchAll({
			required: false
		});
	if (allSubscribers.length) {
		const editor = await new Editor({id: editorId}).fetch();
		const editorJSON = editor.toJSON();
		const allSubscribersJSON = allSubscribers.toJSON();
		await addNotificationToDB(
			allSubscribersJSON,
			`/${kebabCase(entityType)}/${bbid}`,
			`${editorJSON.name} edited ${kebabCase(entityType)}: ${primaryName}`,
			editorId
		);
	}
});

export default eventEmitter;

import sample from 'lodash/sample';
import get from 'lodash/get';
import forEach from 'lodash/forEach';
import SensorService from '../services/SensorService';
import IssueService from '../services/IssueService';
import ModeService from '../services/ModeService';
import PushNotificationService from '../services/PushNotificationService';
import { MAIN_MODE_ID } from '../constants';
import { getOpenConnections } from '../controllers/IssueController';
import sendPushNotification from '../utils/SendPushNotification';

export default async function sensorAlarmGenerator() {
  try {
    const mode = await ModeService.getAMode(MAIN_MODE_ID);
    console.info(get(mode, 'dataValues'));
    // if system disarmed or no sensors do nothing
    if (!get(mode, 'dataValues.isActive')) return null;
    const sensorIds = await SensorService.getAllActiveSensorsIds();
    if (get(sensorIds, 'length') === 0) {
      console.info('no sensors');
      return null;
    }

    const eventSensorId = get(sample(sensorIds), 'id');
    const eventSensor = await SensorService.getACompleteSensorInfo(
      eventSensorId,
    );
    console.info(eventSensor);

    let isOpen = false;
    let isBroken = false;
    if (get(eventSensor, 'type') === 'open/close') {
      isOpen = !get(eventSensor, 'isOpen');
    } else {
      isBroken = true;
    }
    const createdIssue = await IssueService.addIssue({
      sensorDatabaseId: get(eventSensor, 'id'),
      sensorType: get(eventSensor, 'type'),
      isOpen,
      isActive: get(eventSensor, 'isActive'),
      isBroken,
    });
    // const createdIssue = {
    //   id: Date.now(),
    //   issueText: 'BURGLARY ALARM kitchenWindow1 (Zone kitchen) - Opened',
    //   isSilence: false,
    //   createdAt: '2020-04-17T19:27:00.215Z',
    //   updatedAt: '2020-04-17T19:27:00.215Z',
    //   SensorId: 102,
    // };
    if (createdIssue) {
      const openConnections = getOpenConnections();
      // console.info('------------------------------');
      // console.info(createdIssue);
      if (openConnections) {
        forEach(openConnections, async user => {
          await user.response.write(
            `event: issueOccured\ndata: ${JSON.stringify(createdIssue)}\n\n`,
          );
        });
      }
      const recivers = await PushNotificationService.getAllSubscription();
      const issuePayload = {
        title: 'Alarm!!!',
        text: get(createdIssue, 'issueText'),
        tag: 'alarm',
        icon: 'windows-protection-alert.png',
        badge: 'windows-protection-house-badge.png',
        timestamp: Date.now(),
        actions: [
          {
            action: 'Detail',
            title: 'View',
          },
        ],
        url: '/windows-protection',
      };
      forEach(recivers, async reciver => {
        try {
          await sendPushNotification(
            {
              endpoint: reciver.endpoint,
              p256dh: reciver.p256dh,
              auth: reciver.auth,
            },
            issuePayload,
          );
        } catch (error) {
          console.info(error);
        }
      });
    }
    return true;
  } catch (error) {
    console.info(error);
    return null;
  }
}